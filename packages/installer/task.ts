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

export interface Event extends UpdateData {
    type: "update" | "start" | "success" | "fail" | "pause" | "cancel" | "resume";
    paths: string[];
}

export interface TaskContext {
    (event: Event): void;
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

    protected resolve!: (value: T) => void;
    protected reject!: (err: any) => void;

    protected data = {
        from: "",
        to: "",
        progress: 0,
        total: 0,
    }

    protected context: TaskContext | undefined;

    readonly abstract name: string;

    get isCancelled() { return this._isCancelled; }
    get isPaused() { return this._isPaused; }
    get isDone() { return this._isDone; }
    get isStarted() { return this._isStarted; }

    pause() {
        if (this._isDone || this._isCancelled || !this._isStarted) { return; }
        if (!this._isPaused) {
            this._isPaused = true;
            this.onPause();
            this.fire("pause")
        }
    }
    resume() {
        if (this._isDone || this._isCancelled || !this._isStarted) { return; }
        if (this._isPaused) {
            this._isPaused = false;
            this.onResume();
            this.fire("resume")
        }
    }
    cancel() {
        if (this._isDone) { return; }
        if (!this._isCancelled) {
            this._isCancelled = true;
            this.onCancel();
            this.fire("cancel")
        }
    }
    wait() {
        return this._promise;
    }
    start(context?: TaskContext) {
        if (this._isStarted) {
            return;
        }
        if (this._isCancelled) {
            throw new CancelledError(undefined);
        }
        this.context = context;
        this._isStarted = true;
        this.run().then((value) => {
            this.resolve(value);
            this.fire("success");
        }, (error) => {
            this.reject(error);
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
            this.context({ type, ...this.data, chunkSize: 0, paths: [this.name] });
        }
    }
    protected update(data: UpdateData) {
        Object.assign(this.data, data);
        if (this.context) {
            this.context({
                type: "update",
                paths: [this.name],
                ...data,
            });
        }
    }
    protected abstract run(): Promise<T>;
    protected abstract onCancel(): void;
    protected abstract onPause(): void;
    protected abstract onResume(): void;
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
        return result!;
    }
}

export interface TaskRuntime {
    yield<T>(task: BaseTask<T>): Promise<T>;
}

export type TaskExecutor<T> = (this: TaskRuntime) => Promise<T> | T;

export class TaskRoutine<T> extends BaseTask<T> {
    protected progress: number = 0;
    protected total: number = 0;

    protected routines: { progress: number, total: number, task: BaseTask<any> }[] = [];

    constructor(readonly name: string, readonly executor: TaskExecutor<T>) {
        super();
    }

    private recompute() {
        let progress = 0;
        let total = 0;
        for (const sub of this.routines) {
            progress += sub.progress;
            total += sub.total;
        }
        this.progress = progress;
        this.total = total;
    }

    /**
     * Yield a new child task to this routine
     */
    yield<T>(task: BaseTask<T>): Promise<T> {
        const current = { progress: 0, total: 0, task };
        const emit = (event: Event) => {
            if (event.type === "update" && event.paths.length === 1) {
                current.progress = event.progress;
                current.total = event.total;
                this.recompute();
                this.update({
                    chunkSize: event.chunkSize,
                    from: event.from,
                    to: event.to,
                    progress: this.progress,
                    total: this.total,
                });
            } else {
                this.context?.(event);
                // event.path = this.metadata.name + '.' + event.path;
            }
        }

        this.routines.push(current);
        return task.startAndWait(emit);
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
        this.routines.forEach((r) => r.task.cancel());
    }
    protected onPause(): void {
        this.routines.forEach((r) => r.task.pause());
    }
    protected onResume(): void {
        this.routines.forEach((r) => r.task.resume());
    }
}

export function task<E, T>(name: string, executor: TaskExecutor<T>) {
    return new TaskRoutine<T>(name, executor);
}
