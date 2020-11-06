import { EventEmitter } from "events";

export type TaskNode = Task.State;

function runTask<T>(context: Task.Context, task: Task<T>): Promise<T> {
    try {
        const result = task.run(context);
        return result instanceof Promise ? result : Promise.resolve(result);
    } catch (e) {
        return Promise.reject(e);
    }
}

export interface TaskListener<N extends Task.State = Task.State> extends EventEmitter {
    /**
     * Emitted when the some task starts to execute. The listener will get both this task state and parent task state.
     *
     * If there is no parent, it will be undefined.
     */
    on(event: "execute", listener: (node: N, parent?: N) => void): this;
    /**
     * Emitted when the some task failed.
     */
    on(event: "fail", listener: (error: any, node: N) => void): this;
    /**
     * Emitted when the task has update.
     *
     * The progress and total are arbitary number which designed by task creator.
     * You might want to convert them to percentage by yourself by directly dividing them.
     *
     * The message is a totally optional and arbitary string for hint.
     */
    on(event: "update", listener: (update: { progress: number, total?: number, message?: string }, node: N) => void): this;
    /**
     * Emitted the when some task is finished
     */
    on(event: "finish", listener: (result: any, node: N) => void): this;
    /**
     * Emitted the pause event after user toggle the `pause` in handle
     */
    on(event: "pause", listener: (node: N) => void): this;
    /**
     * Emitted the resume event after use toggle the `resume` in handle
     */
    on(event: "resume", listener: (node: N) => void): this;
    /**
     * Emitted the cancel event after some task is cancelled.
     */
    on(event: "cancel", listener: (node: N) => void): this;

    once(event: "execute", listener: (node: N, parent?: N) => void): this;
    once(event: "fail", listener: (error: any, node: N) => void): this;
    once(event: "update", listener: (update: { progress: number, total?: number, message?: string }, node: N) => void): this;
    once(event: "finish", listener: (result: any, node: N) => void): this;
    once(event: "pause", listener: (node: N) => void): this;
    once(event: "resume", listener: (node: N) => void): this;
    once(event: "cancel", listener: (node: N) => void): this;
}

/**
 * An intergrated environment to run the task. If you want to manage all your tasks together, you should use this.
 */
export class TaskRuntime<N extends Task.State = Task.State> extends EventEmitter implements TaskListener<N> {
    protected bridge: TaskBridge<N>;

    constructor(readonly factory: Task.StateFactory<N>, schedular: Task.Schedualer) {
        super();
        this.bridge = new TaskBridge(this, factory, schedular);
    }
    /**
     * Emitted when the some task starts to execute. The listener will get both this task state and parent task state.
     *
     * If there is no parent, it will be undefined.
     */
    on(event: "execute", listener: (node: N, parent?: N) => void): this;
    /**
     * Emitted when the task has update.
     *
     * The progress and total are arbitary number which designed by task creator.
     * You might want to convert them to percentage by yourself by directly dividing them.
     *
     * The message is a totally optional and arbitary string for hint.
     */
    on(event: "update", listener: (update: { progress: number, total?: number, message?: string }, node: N) => void): this;
    /**
     * Emitted the when some task is finished
     */
    on(event: "finish", listener: (result: any, node: N) => void): this;
    /**
     * Emitted when the some task failed.
     */
    on(event: "fail", listener: (error: any, node: N) => void): this;
    /**
     * Emitted the pause event after user toggle the `pause` in handle
     */
    on(event: "pause", listener: (node: N) => void): this;
    /**
     * Emitted the resume event after use toggle the `resume` in handle
     */
    on(event: "resume", listener: (node: N) => void): this;
    /**
     * Emitted the cancel event after some task is cancelled.
     */
    on(event: "cancel", listener: (node: N) => void): this;
    on(event: string, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    once(event: "execute", listener: (node: N, parent?: N) => void): this;
    once(event: "fail", listener: (error: any, node: N) => void): this;
    once(event: "update", listener: (update: { progress: number, total?: number, message?: string }, node: N) => void): this;
    once(event: "finish", listener: (result: any, node: N) => void): this;
    once(event: "pause", listener: (node: N) => void): this;
    once(event: "resume", listener: (node: N) => void): this;
    once(event: "cancel", listener: (node: N) => void): this;
    once(event: string, listener: (...args: any[]) => void): this {
        return super.once(event, listener);
    }

    submit<T>(task: Task<T>): TaskHandle<T, N> {
        return this.bridge.submit(task);
    }
}

export class TaskSignal {
    _paused: boolean = false;
    _cancelled = false;
    _started: boolean = false;

    _onPause: Array<() => void> = [];
    _onResume: Array<() => void> = [];
    _onCancel: Array<() => void> = [];
}

export class TaskBridge<X extends Task.State = Task.State> {
    constructor(
        readonly emitter: EventEmitter,
        readonly factory: Task.StateFactory<X>,
        readonly scheduler: <N>(r: () => Promise<N>) => Promise<N>) {
    }

    submit<T>(task: Task<T>): TaskHandle<T, X> {
        const signal = new TaskSignal();
        const { node, promise } = this.enqueueTask(signal, task);
        const handle: TaskHandle<T, X> = {
            pause() {
                if (!signal._paused) {
                    signal._paused = true;
                    signal._onPause.forEach((f) => f());
                }
            },
            resume() {
                if (signal._paused) {
                    signal._paused = false;
                    signal._onResume.forEach((f) => f());
                }
            },
            cancel() {
                if (!signal._cancelled) {
                    signal._cancelled = true;
                    signal._onCancel.forEach((f) => f());
                }
            },
            get isCancelled() { return signal._cancelled; },
            get isPaused() { return signal._paused; },
            get isStarted() { return signal._started; },

            wait() { return promise; },
            get root() { return node },
        }
        return handle;
    }

    protected enqueueTask<T>(signal: TaskSignal, task: Task<T>, parent?: { node: X; progressUpdate: (progress: number, total: number, message?: string) => void }): { node: X, promise: Promise<T> } {
        const bridge = this;
        const emitter = bridge.emitter;

        const name = task.name;
        const args: object | undefined = task.parameters;
        const node: X = bridge.factory({
            name,
            arguments: parent ? Object.assign({}, parent.node.arguments, args || {}) : args,
            path: parent ? parent.node.path + "." + name : name,
        }, parent?.node);

        let knownTotal = -1;
        let subTotals: number[] = [];
        let subProgress: number[] = [];
        let pauseFunc: (() => void) | undefined;
        let resumeFunc: (() => void) | undefined;
        let cancelFunc: (() => void) | undefined;
        let resumeCb = () => { };

        const pause = () => {
            if (pauseFunc) {
                pauseFunc();
            }
            emitter.emit("pause", node);
        };
        const resume = () => {
            if (resumeFunc) {
                resumeFunc();
            }
            emitter.emit("resume", node);
            resumeCb();
        };
        const cancel = () => {
            if (cancelFunc) {
                cancelFunc();
            }
            emitter.emit("cancel", node);
        };
        const checkCancel = () => {
            if (signal._cancelled) {
                emitter.emit("cancel", node);
                throw new Task.CancelledError();
            }
        };
        const waitPause = async () => {
            if (signal._paused) {
                emitter.emit("pause", node);
                await new Promise<void>((resolve) => {
                    resumeCb = () => {
                        resumeCb = () => { };
                        emitter.emit("resume", node);
                        resolve();
                    }
                });
            }
        };
        const setup = (onPause: (() => void) | undefined, onResume: (() => void) | undefined, onCancel: (() => void) | undefined) => {
            if (pauseFunc !== onPause) {
                pauseFunc = onPause;
            }
            if (resumeFunc !== onResume) {
                resumeFunc = onResume;
            }
            if (cancelFunc !== onCancel) {
                cancelFunc = onCancel;
            }
        };
        const update = (progress: number, total: number, message?: string) => {
            knownTotal = total || knownTotal;

            emitter.emit("update", { progress, total, message }, node);

            parent?.progressUpdate(progress, total, message);

            checkCancel();
        };
        const subUpdate = (message?: string) => {
            let progress = subProgress.reduce((a, b) => a + b);
            let total = knownTotal === -1 ? subTotals.reduce((a, b) => a + b, 0) : knownTotal;
            emitter.emit("update", { progress, total, message }, node);
            parent?.progressUpdate(progress, total, message);
        };
        const execute = <Y>(task: Task<Y>, total?: number) => {
            let index = subProgress.length;
            subProgress.push(0);
            let { promise } = bridge.enqueueTask(signal, task, {
                node,
                progressUpdate(progress: number, subTotal, message) {
                    if (total) {
                        subTotals[index] = total;
                        subProgress[index] = total * (progress / subTotal);
                        subUpdate(message);
                    }
                }
            });
            promise = promise.then((r) => {
                subProgress[index] = total || 0;
                subUpdate();
                return r;
            });
            return promise;
        }
        const run = async () => {
            await new Promise((resolve) => setImmediate(resolve));

            checkCancel();
            await waitPause();

            signal._started = true;

            emitter.emit("execute", node, parent?.node);

            try {
                let result = await runTask({ update, yield: execute, setup: setup, waitPause }, task);
                emitter.emit("finish", result, node);
                return result;
            } catch (e) {
                if (e instanceof Task.CancelledError) {
                    emitter.emit("cancel", node);
                    throw e;
                }
                emitter.emit("fail", e, node);
                throw e;
            } finally {
                signal._onPause.splice(signal._onPause.indexOf(pause));
                signal._onResume.splice(signal._onResume.indexOf(resume));
                signal._onCancel.splice(signal._onCancel.indexOf(cancel));
            }
        };

        signal._onPause.push(pause);
        signal._onResume.push(resume);
        signal._onCancel.push(cancel);
        checkCancel();
        return { node, promise: bridge.scheduler(run) };
    }
}

export interface TaskHandle<T, N extends Task.State> {
    /**
     * Wait the task to complete
     */
    wait(): Promise<T>;
    /**
     * Cancel the task.
     */
    cancel(): void;
    /**
     * Pause the task if possible.
     */
    pause(): void;
    resume(): void;
    readonly root: N;
    readonly isCancelled: boolean;
    readonly isPaused: boolean;
    readonly isStarted: boolean;
}

export class Task<T> {
    constructor(readonly name: string,
        readonly parameters: object | undefined,
        readonly run: (context: Task.Context) => (Promise<T> | T)) {
    }

    /**
     * Execute this task immediately (not in runtime).
     * This will have the same behavior like `Task.execute`.
     *
     * @see Task.execute
     */
    execute() { return Task.execute<T>(this); }
}

export interface TaskWrapper<T> {
    readonly name: string;
    readonly parameters?: object;
    readonly run: (context: Task.Context) => (Promise<T> | T);
}

export class TaskBase {
    protected paused = false
    protected started = false
    protected cancelled = false
}

export namespace Task {
    export interface Function<T> {
        (context: Task.Context): (Promise<T> | T);
    }
    export interface Object<T> {
        readonly name: string;
        readonly parameters?: object;
        readonly run: (context: Task.Context) => (Promise<T> | T);
    }

    /**
     * You'll recive this if the task is cancelled.
     */
    export class CancelledError extends Error {
        constructor() { super("Cancelled"); }
    }

    export type Schedualer = <N>(r: () => Promise<N>) => Promise<N>

    export interface Context {
        setup(onPause?: () => void, onResume?: () => void, onCancel?: () => void): void;
        update(progress: number, total?: number, message?: string): void | boolean;
        yield<T>(task: Task<T>, pushProgress?: number): Promise<T>;

        waitPause(): Promise<void>;
    }

    export type StateFactory<X extends Task.State = Task.State> = (node: Task.State, parent?: X) => X;

    export const DEFAULT_STATE_FACTORY: StateFactory = (n) => n;

    /**
     * Run the task immediately without a integrated runtime
     * @param task The task will be run
     */
    export function execute<T>(task: Task<T>): TaskHandle<T, Task.State> & TaskListener {
        const listener = new EventEmitter();
        const handle = new TaskBridge(listener, DEFAULT_STATE_FACTORY, (r) => r()).submit(task);
        for (const [k, v] of Object.entries(handle)) {
            (listener as any)[k] = v;
        }
        return listener as any;
    }

    /**
     * Create a central managed runtime for task execution. You can listen the tasks status at one place.
     * @param factory The state factory. It's used to customize your task state.
     * @param schedular The task schedular provided
     */
    export function createRuntime<X extends Task.State = Task.State>(factory: StateFactory<X> = DEFAULT_STATE_FACTORY as any, schedular: Schedualer = (t) => t()): TaskRuntime<X> {
        return new TaskRuntime(factory, schedular);
    }

    export interface State {
        name: string;
        arguments?: { [key: string]: any };
        path: string;
    }

    export function create<T>(name: string, task: Task.Function<T>, parameters?: any): Task<T> {
        return new Task(name, parameters, task);
    }
}

/**
 * Create new task
 */
export function task<T>(name: string, task: Task.Function<T>, parameters?: any): Task<T> {
    return new Task(name, parameters, task);
}


export class CancelledError<T> extends Error {
    constructor(readonly partialResult: T | undefined) {
        super("Cancelled");
    }
}
export interface Event {
    type: "child" | "update"
}
export interface UpdateEvent extends Event {
    type: "update";
    /**
     * The chunk size of this update event process
     */
    chunkSize: number;
    /**
     * The byte already processed by current task
     */
    progress: number;
    /**
     * The total bytes need to be done of this task
     */
    total: number;
    /**
     * Source path or url of the task
     */
    from?: string;
    /**
     * Destination path or url of the task
     */
    to?: string;
}

export interface Task<T> {
}

export abstract class BaseTask<T> {
    protected _isPaused = false;
    protected _isCancelled = false;
    protected _isDone = false;
    protected _isStarted = false;
    protected _promise: Promise<T> = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });
    protected resolve: (value: T) => void;
    protected reject: (err: any) => void;

    public parent: BaseTask<any> | undefined;

    get isCancelled() { return this._isCancelled; }
    get isPaused() { return this._isPaused; }
    get isDone() { return this._isDone; }
    get isStarted() { return this._isStarted; }

    pause() {
        if (!this._isPaused) {
            this._isPaused = true;
            this.onPause();
        }
    }
    resume() {
        if (this._isPaused) {
            this._isPaused = false;
            this.onResume();
        }
    }
    cancel() {
        if (!this._isCancelled) {
            this._isCancelled = true;
            this.onCancel();
        }
    }
    wait() {
        return this._promise;
    }
    start() {
        if (this._isStarted) {
            return;
        }
        this._isStarted = true;
        this.run().then(this.resolve, this.reject);
    }
    startAndWait() {
        this.start();
        return this.wait();
    }
    protected emit(event: UpdateEvent) {
        if (this.parent) { this.parent.emit(event); }
    }
    protected abstract run(): Promise<T>;
    protected abstract onCancel(): void;
    protected abstract onPause(): void;
    protected abstract onResume(): void;
}

export class TaskGroup<T> extends BaseTask<T[]> {
    constructor(readonly tasks: BaseTask<T>[]) {
        super();
    }
    protected run(): Promise<T[]> {
        return Promise.all(this.tasks.map((t) => t.startAndWait()));
    }
    protected onCancel(): void {
        this.tasks.forEach((t) => t.cancel());
    }
    protected onPause(): void {
        this.tasks.forEach((t) => t.pause());
    }
    protected onResume(): void {
        this.tasks.forEach((t) => t.resume());
    }
}

export interface TaskContext {
    yield<T>(task: BaseTask<T>, division: number): Promise<T>;
}

export type TaskChainRoutine<T> = (context: TaskContext) => Promise<T> | T;

function exec<T>(context: TaskContext, exec: TaskChainRoutine<T>): Promise<T> {
    try {
        const result = exec(context);
        if (result instanceof Promise) {
            return result;
        }
        return Promise.resolve(result);
    } catch (e) {
        return Promise.reject(e);
    }
}

export class TaskChain<T> extends BaseTask<T> {
    protected context: TaskContext;

    protected progress: number = 0;
    protected total: number = 0;

    constructor(readonly executor: TaskChainRoutine<T>) {
        super();
        const self = this;
        this.context = {
            async yield() { },
        };
    }
    protected run(): Promise<T> {
        return exec(this.context, this.executor);
    }
    protected onCancel(): void {
        throw new Error("Method not implemented.");
    }
    protected onPause(): void {
        throw new Error("Method not implemented.");
    }
    protected onResume(): void {
        throw new Error("Method not implemented.");
    }
}

export abstract class LoopedTask<T> extends BaseTask<T> {
    protected _pausing: Promise<void> = Promise.resolve();
    protected _unpause = () => { };

    protected abstract process(): Promise<[boolean, T | undefined]>;
    protected abstract validate(): Promise<void>;
    protected abstract shouldTolerant(e: any): boolean;
    protected abstract abort(isCancelled: boolean): void;
    protected abstract reset(): void;

    protected onCancel(): void {
        this.abort(true);
    }
    protected onPause(): void {
        this._pausing = new Promise((resolve) => {
            this._unpause = resolve;
        });
        this.abort(false);
    }
    protected onResume(): void {
        this._unpause();
    }

    protected async run() {
        let result: T;
        while (!this._isDone) {
            try {
                [this._isDone, result] = await this.process();
                if (this._isCancelled) {
                    throw new CancelledError<T>(result);
                }
                await this._pausing;
                if (!this._isDone) {
                    continue;
                }
                await this.validate();
            } catch (e) {
                if (!this.shouldTolerant(e)) {
                    throw e;
                }
                // if not throw, reset the state and retry
                this._isDone = false;
                this.reset();
            }
        }
        return result;
    }
}
