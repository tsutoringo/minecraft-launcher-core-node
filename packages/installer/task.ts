export class CancelledError<T> extends Error {
    constructor(readonly partialResult: T | undefined) {
        super("Cancelled");
    }
}

export interface Listener {
    (event: Event): void;
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
