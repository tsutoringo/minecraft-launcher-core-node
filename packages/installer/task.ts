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

export enum State {
    Idel,
    Running,
    Cancelled,
    Paused,
    Successed,
    Failed
}

export abstract class BaseTask<T> {
    protected _state: State = State.Idel
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

    get isCancelled() { return this._state === State.Cancelled; }
    get isPaused() { return this._state === State.Paused; }
    get isDone() { return this._state === State.Successed; }
    get isRunning() { return this._state === State.Running; }

    get state() { return this._state }

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
