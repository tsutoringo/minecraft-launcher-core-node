// export type TaskNode = Task.State;

// function runTask<T>(context: Task.Context, task: Task<T>): Promise<T> {
//     try {
//         const result = task.run(context);
//         return result instanceof Promise ? result : Promise.resolve(result);
//     } catch (e) {
//         return Promise.reject(e);
//     }
// }

// export interface TaskListener<N extends Task.State = Task.State> extends EventEmitter {
//     /**
//      * Emitted when the some task starts to execute. The listener will get both this task state and parent task state.
//      *
//      * If there is no parent, it will be undefined.
//      */
//     on(event: "execute", listener: (node: N, parent?: N) => void): this;
//     /**
//      * Emitted when the some task failed.
//      */
//     on(event: "fail", listener: (error: any, node: N) => void): this;
//     /**
//      * Emitted when the task has update.
//      *
//      * The progress and total are arbitary number which designed by task creator.
//      * You might want to convert them to percentage by yourself by directly dividing them.
//      *
//      * The message is a totally optional and arbitary string for hint.
//      */
//     on(event: "update", listener: (update: { progress: number, total?: number, message?: string }, node: N) => void): this;
//     /**
//      * Emitted the when some task is finished
//      */
//     on(event: "finish", listener: (result: any, node: N) => void): this;
//     /**
//      * Emitted the pause event after user toggle the `pause` in handle
//      */
//     on(event: "pause", listener: (node: N) => void): this;
//     /**
//      * Emitted the resume event after use toggle the `resume` in handle
//      */
//     on(event: "resume", listener: (node: N) => void): this;
//     /**
//      * Emitted the cancel event after some task is cancelled.
//      */
//     on(event: "cancel", listener: (node: N) => void): this;

//     once(event: "execute", listener: (node: N, parent?: N) => void): this;
//     once(event: "fail", listener: (error: any, node: N) => void): this;
//     once(event: "update", listener: (update: { progress: number, total?: number, message?: string }, node: N) => void): this;
//     once(event: "finish", listener: (result: any, node: N) => void): this;
//     once(event: "pause", listener: (node: N) => void): this;
//     once(event: "resume", listener: (node: N) => void): this;
//     once(event: "cancel", listener: (node: N) => void): this;
// }

// /**
//  * An intergrated environment to run the task. If you want to manage all your tasks together, you should use this.
//  */
// export class TaskRuntime<N extends Task.State = Task.State> extends EventEmitter implements TaskListener<N> {
//     protected bridge: TaskBridge<N>;

//     constructor(readonly factory: Task.StateFactory<N>, schedular: Task.Schedualer) {
//         super();
//         this.bridge = new TaskBridge(this, factory, schedular);
//     }
//     /**
//      * Emitted when the some task starts to execute. The listener will get both this task state and parent task state.
//      *
//      * If there is no parent, it will be undefined.
//      */
//     on(event: "execute", listener: (node: N, parent?: N) => void): this;
//     /**
//      * Emitted when the task has update.
//      *
//      * The progress and total are arbitary number which designed by task creator.
//      * You might want to convert them to percentage by yourself by directly dividing them.
//      *
//      * The message is a totally optional and arbitary string for hint.
//      */
//     on(event: "update", listener: (update: { progress: number, total?: number, message?: string }, node: N) => void): this;
//     /**
//      * Emitted the when some task is finished
//      */
//     on(event: "finish", listener: (result: any, node: N) => void): this;
//     /**
//      * Emitted when the some task failed.
//      */
//     on(event: "fail", listener: (error: any, node: N) => void): this;
//     /**
//      * Emitted the pause event after user toggle the `pause` in handle
//      */
//     on(event: "pause", listener: (node: N) => void): this;
//     /**
//      * Emitted the resume event after use toggle the `resume` in handle
//      */
//     on(event: "resume", listener: (node: N) => void): this;
//     /**
//      * Emitted the cancel event after some task is cancelled.
//      */
//     on(event: "cancel", listener: (node: N) => void): this;
//     on(event: string, listener: (...args: any[]) => void): this {
//         return super.on(event, listener);
//     }

//     once(event: "execute", listener: (node: N, parent?: N) => void): this;
//     once(event: "fail", listener: (error: any, node: N) => void): this;
//     once(event: "update", listener: (update: { progress: number, total?: number, message?: string }, node: N) => void): this;
//     once(event: "finish", listener: (result: any, node: N) => void): this;
//     once(event: "pause", listener: (node: N) => void): this;
//     once(event: "resume", listener: (node: N) => void): this;
//     once(event: "cancel", listener: (node: N) => void): this;
//     once(event: string, listener: (...args: any[]) => void): this {
//         return super.once(event, listener);
//     }

//     submit<T>(task: Task<T>): TaskHandle<T, N> {
//         return this.bridge.submit(task);
//     }
// }

export class CancelledError<T> extends Error {
    constructor(readonly partialResult: T | undefined) {
        super("Cancelled");
    }
}

export interface UpdateData {
    /**
    * The chunk size of this update event process
    */
    chunkSize: number;
    /**
     * The progress already processed by current task
     */
    progress: number;
    /**
     * The total number need to be done of this task
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

export interface Event extends UpdateData {
    type: "update" | "start" | "success" | "fail" | "pause" | "cancel" | "resume";
    paths: string[];
    name: string;
    param: object;
}

export interface TaskContext {
    (event: Event): void;
}

export enum State {
    Idel,
    Running,
    Cancelled,
    Paused,
    Successed,
    Failed
}

export abstract class BaseTask<T> implements Task<T> {
    protected _state: State = State.Idel
    protected _promise: Promise<T> = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
    });

    protected resolve!: (value: T) => void;
    protected reject!: (err: any) => void;

    protected _from: string | undefined
    protected _to: string | undefined
    protected _progress = -1
    protected _total = -1

    protected context: TaskContext | undefined;

    readonly abstract name: string;
    readonly abstract param: object;

    get progress() { return this._progress }
    get total() { return this._total }
    get to() { return this._to }
    get from() { return this._from }
    get state() { return this._state }

    get isCancelled() { return this._state === State.Cancelled; }
    get isPaused() { return this._state === State.Paused; }
    get isDone() { return this._state === State.Successed; }
    get isRunning() { return this._state === State.Running; }

    pause() {
        if (this._state !== State.Running) { return; }
        this._state = State.Paused;
        this.onPause();
        this.fire("pause")
    }
    resume() {
        if (this._state !== State.Paused) { return; }
        this._state = State.Running;
        this.onResume();
        this.fire("resume")
    }
    cancel() {
        if (this.state !== State.Running && this.state !== State.Idel) { return; }
        this._state = State.Cancelled;
        this.onCancel();
        this.fire("cancel")
    }
    wait() {
        return this._promise;
    }
    start(context?: TaskContext) {
        if (this._state === State.Cancelled) {
            throw new CancelledError(undefined);
        }
        if (this._state !== State.Idel) {
            return;
        }
        this.context = context;
        this._state = State.Running;
        this.run().then((value) => {
            this.resolve(value);
            this._state = State.Successed
            this.fire("success");
        }, (error) => {
            this.reject(error);
            this._state = State.Failed
            this.fire("fail");
        });
        this.fire("start")
    }
    startAndWait(context?: TaskContext) {
        this.start(context);
        return this.wait();
    }

    private fire(type: Event["type"]) {
        if (this.context) {
            this.context({
                type,
                progress: this._progress,
                total: this._total,
                from: this._from,
                to: this._to,
                chunkSize: 0,
                paths: [this.name],
                name: this.name,
                param: this.param,
            });
        }
    }
    protected update(data: UpdateData) {
        this._progress = data.progress ?? this._progress;
        this._total = data.total ?? this._total;
        this._from = data.from ?? this._from;
        this._to = data.to ?? this._to;
        if (this.context) {
            this.context({
                type: "update",
                progress: this._progress,
                total: this._total,
                from: this._from,
                to: this._to,
                chunkSize: data.chunkSize,
                paths: [this.name],
                name: this.name,
                param: this.param,
            });
        }
    }
    protected abstract run(): Promise<T>;
    protected abstract onCancel(): void;
    protected abstract onPause(): void;
    protected abstract onResume(): void;

    map<N>(tranform: Transform<this, N>): Task<N> {
        return new MappedTask(this, tranform);
    }
}

export interface Task<T> {
    readonly progress: number;
    readonly total: number;
    readonly from: string | undefined;
    readonly to: string | undefined;

    readonly isCancelled: boolean;
    readonly isPaused: boolean;
    readonly isDone: boolean;
    readonly isRunning: boolean;

    pause(): void;
    resume(): void;
    cancel(): void;
    start(): void;
    wait(): Promise<T>;
    startAndWait(context?: TaskContext): Promise<T>;

    map<N>(transform: Transform<this, N>): Task<N>;
}

export interface Transform<T, N> {
    (this: T, value: T): N
}
class MappedTask<T, N> implements Task<N> {
    get progress(): number { return this.base.progress }
    get total(): number { return this.base.total }
    get from(): string | undefined { return this.base.from }
    get to(): string | undefined { return this.base.to }
    get isCancelled(): boolean { return this.base.isCancelled }
    get isPaused(): boolean { return this.base.isPaused }
    get isDone(): boolean { return this.base.isDone }
    get isRunning(): boolean { return this.base.isRunning }

    constructor(private base: Task<T>, private transform: Transform<any, N>) { }

    pause(): void {
        this.base.pause();
    }
    resume(): void {
        this.base.resume();
    }
    cancel(): void {
        this.base.cancel();
    }
    start(): void {
        this.base.start();
    }
    wait(): Promise<N> {
        return this.base.wait().then((r) => this.transform(r));
    }
    startAndWait(): Promise<N> {
        return this.base.startAndWait().then((r) => this.transform(r));
    }
    map<NN>(transform: Transform<this, NN>): Task<NN> {
        return new MappedTask(this, transform);
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
        })
        this.abort(false);
    }
    protected onResume(): void {
        this._unpause();
    }

    protected async run() {
        let result: T | undefined;
        let isDone = false;
        while (!isDone) {
            try {
                [isDone, result] = await this.process();
                if (this.state === State.Cancelled) {
                    throw new CancelledError<T>(result);
                }
                await this._pausing;
                if (!isDone) {
                    continue;
                }
                await this.validate();
            } catch (e) {
                if (!this.shouldTolerant(e)) {
                    throw e;
                }
                // if not throw, reset the state and retry
                isDone = false;
                this.reset();
            }
        }
        return result!;
    }
}

export interface TaskRuntime {
    yield<T>(task: Task<T>): Promise<T>;

    concat<T>(task: TaskRoutine<T>): Promise<T>;
}

export type TaskExecutor<T> = (this: TaskRoutine<any>) => Promise<T> | T;

export class TaskRoutine<T> extends BaseTask<T> implements TaskRuntime {
    protected routines: Task<any>[] = [];

    constructor(readonly name: string, readonly executor: TaskExecutor<T>, readonly param: object = {}) {
        super();
    }

    readonly context: TaskContext | undefined;

    concat<T>(task: TaskRoutine<T>): Promise<T> {
        try {
            const result = task.executor.bind(this)();
            if (result instanceof Promise) {
                return result;
            }
            return Promise.resolve(result);
        } catch (e) {
            return Promise.reject(e);
        }
    }

    /**
     * Yield a new child task to this routine
     */
    yield<T>(task: Task<T>): Promise<T> {
        if (this.state !== State.Running) {
            throw new Error("IllegalState")
        }
        const context = (event: Event) => {
            if (this.context) {
                event.paths.unshift(this.name);
                this.context(event);
                if (event.type === "update" && event.paths.length === 1) {
                    let progress = 0;
                    let total = 0;
                    for (const sub of this.routines) {
                        progress += sub.progress;
                        total += sub.total;
                    }
                    this.update({
                        chunkSize: event.chunkSize,
                        from: event.from,
                        to: event.to,
                        progress: progress,
                        total: total,
                    });
                }
            }
        }

        this.routines.push(task);
        return task.startAndWait(context);
    }

    protected run(): Promise<T> {
        try {
            const result = this.executor.bind(this)();
            if (result instanceof Promise) {
                return result;
            }
            return Promise.resolve(result);
        } catch (e) {
            return Promise.reject(e);
        }
    }
    protected onCancel(): void {
        this.routines.forEach((task) => task.cancel());
    }
    protected onPause(): void {
        this.routines.forEach((task) => task.pause());
    }
    protected onResume(): void {
        this.routines.forEach((task) => task.resume());
    }
}

export function task<E, T>(name: string, executor: TaskExecutor<T>, param: object = {}) {
    return new TaskRoutine<T>(name, executor, param);
}
