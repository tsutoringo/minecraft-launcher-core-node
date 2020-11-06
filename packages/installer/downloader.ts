import { createWriteStream, WriteStream } from "fs";
import { Agent as HttpAgent, ClientRequest, IncomingMessage, request, RequestOptions } from "http";
import { Agent as HttpsAgent, request as requests } from "https";
import { format, parse, fileURLToPath } from "url";
import { LoopedTask, BaseTask, CancelledError } from "./task";
import { checksum, close, open, isValidProtocol, truncate, ensureFile, normalizeArray, copyFile, unlink } from "./utils";

export interface Agents {
    http?: HttpAgent;
    https?: HttpsAgent;
}

export interface Segment {
    start: number;
    end?: number;
}

export interface DownloadCommonOptions {
    destination: string;
    headers?: Record<string, any>;
    agents?: Agents;
    /**
     * The minimum bytes a segment should have.
     * @default 2MB
     */
    segmentThreshold?: number;
    /**
    * The checksum info of the file
    */
    checksum?: { algorithm: string; hash: string; };
}

export interface DownloadSingleUrlOptions extends DownloadCommonOptions {
    url: string;
}

export interface DownloadMultiUrlOptions extends DownloadCommonOptions {
    urls: string[];
}


export interface DownloadFromPathOptions extends DownloadCommonOptions {
    path: string;
}

/**
 * The options pass into the {@link Downloader}.
 */
export interface DownloaderOptions {
    /**
     * Decide should downloader redownload and overwrite existed file.
     *
     * It has such options:
     *
     * - `checksumNotMatch`: Only the file with checksum provided and not matched will be redownload.
     * - `checksumNotMatchOrEmpty`: Not only when the file checksum is not matched, but also when the file has no checksum, the file will be redownloaded.
     * - `always`: Always redownload files.
     *
     * @default "checksumNotMatch"
     */
    overwriteWhen?: "checksumNotMatchOrEmpty" | "checksumNotMatch" | "always";
    /**
     * Should hault the donwload process immediately after ANY resource download failed.
     */
    throwErrorImmediately?: boolean;
    /**
     * The suggested max concurrency of the download. This is not a strict criteria.
     */
    maxConcurrency?: number;
    /**
     * The suggested minimum bytes a segment should have.
     * @default 2MB
     */
    segmentThreshold?: number;
}

interface Connections {
    request: ClientRequest;
    response: IncomingMessage;
}
interface DownloadMetadata {
    url: string;
    acceptRanges: boolean;
    contentLength: number;
    lastModified?: string;
    eTag?: string;
}
function computeSegmenets(total: number, chunkSize: number, concurrency: number) {
    let partSize = Math.max(chunkSize, Math.floor(total / concurrency));
    let segments: Segment[] = [];
    for (let cur = 0, chunkSize = 0; cur < total; cur += chunkSize) {
        let remain = total - cur;
        if (remain >= partSize) {
            chunkSize = partSize;
            segments.push({ start: cur, end: cur + chunkSize - 1 });
        } else {
            let last = segments[segments.length - 1];
            if (!last) {
                segments.push({ start: 0, end: remain - 1 });
            } else {
                last.end = last.end! + remain;
            }
            cur = total;
        }
    }
    return segments;
}
function mergeRequestOptions(original: RequestOptions, newOptions: RequestOptions) {
    let options = { ...original } as any;
    for (let [key, value] of Object.entries(newOptions)) {
        if (value !== null) {
            options[key] = value;
        }
    }
    return options as RequestOptions;
}
function fetch(options: RequestOptions, agents: { http?: HttpAgent, https?: HttpsAgent } = {}) {
    return new Promise<{ request: ClientRequest, message: IncomingMessage }>((resolve, reject) => {
        function follow(options: RequestOptions) {
            if (!isValidProtocol(options.protocol)) {
                reject(new Error(`Invalid URL: ${format(options)}`));
            } else {
                let [req, agent] = options.protocol === "http:" ? [request, agents.http] : [requests, agents.https];
                let clientReq = req({ ...options, agent }, (m) => {
                    if (m.statusCode === 302 || m.statusCode === 301 || m.statusCode === 303) {
                        m.resume();
                        follow(mergeRequestOptions(options, parse(m.headers.location!)));
                    } else {
                        m.url = m.url || format(options);
                        clientReq.removeListener("error", reject);
                        resolve({ request: clientReq, message: m });
                    }
                });
                clientReq.addListener("error", reject);
                clientReq.end();
            }
        }
        follow(options);
    });
}
async function startSegmentDownload(url: string, agents: Agents, headers: Record<string, any>,
    seg: Segment, output: WriteStream) {
    if (seg.end && seg.start >= seg.end) {
        return [Promise.resolve(true)] as const;
    }
    const options: RequestOptions = {
        ...parse(url),
        method: "GET",
        headers: {
            ...headers,
            Range: `bytes=${seg.start}-${seg.end ?? ""}`,
        },
    };

    const { message: input, request } = await fetch(options, agents);
    input.on("data", (chunk) => { seg.start += chunk.length; });
    input.pipe(output);

    const requestPromise = new Promise<boolean>((resolve, reject) => {
        request.on("error", reject);
        request.on("abort", () => resolve(false));
        input.on("end", () => resolve(true));
    });
    const outputFinishPromise = new Promise((resolve, reject) => {
        output.on("error", reject);
        output.on("finish", () => resolve());
    });
    const done = Promise.all([requestPromise, outputFinishPromise]).then(([done]) => done);
    return [done, request, input] as const;
}

export class DownloadTask extends LoopedTask<Segment[]> {
    protected options: DownloadSingleUrlOptions;
    protected metadata: DownloadMetadata;
    protected segments: Segment[];
    protected outputs: WriteStream[];
    protected connections: Connections[];

    /**
     * current fd
     */
    protected fd: number = -1;
    /**
     * Current progress
     */
    protected progress: number;

    constructor(options: DownloadSingleUrlOptions) {
        super();
        this.options = options;
    }

    protected async updateMetadata() {
        const parsedUrl = parse(this.options.url);
        let { message: msg } = await fetch({ ...parsedUrl, method: "HEAD", ...this.options.headers }, this.options.agents);

        msg.resume();
        let { headers, url: resultUrl, statusCode } = msg;
        if (statusCode !== 200 && statusCode !== 201) {
            throw new Error(`HTTP Error: Status code ${statusCode} on ${resultUrl}`);
        }
        const newMetadata = {
            url: resultUrl ?? this.options.url,
            acceptRanges: headers["accept-ranges"] === "bytes",
            contentLength: headers["content-length"] ? Number.parseInt(headers["content-length"]) : -1,
            lastModified: headers["last-modified"],
            eTag: headers.etag as string | undefined,
        };

        let unmatched = newMetadata.eTag !== this.metadata.eTag;
        if (unmatched || newMetadata.eTag === undefined) {
            this.metadata = newMetadata;
            await truncate(this.fd, this.metadata.contentLength);
            this.reset();
        }
    }
    protected async download() {
        const url = this.metadata.url;
        const agents = this.options.agents;
        const headers = this.options.headers;
        const total = this.metadata.contentLength;

        let results = await Promise.all(this.segments.map(async (seg, index) => {
            const [done, req, res] = await startSegmentDownload(url, agents, headers, seg, this.outputs[index]);
            if (req) {
                res.on("data", (chunk) => {
                    this.progress += chunk.length;
                    this.emit({
                        type: "update",
                        chunkSize: chunk.length as number,
                        progress: this.progress,
                        total,
                        from: url,
                        to: this.options.destination,
                    })
                });
                this.connections[index] = { request: req, response: res };
            }
            return done;
        }));
        return results.every((r) => r);
    }

    protected async process(): Promise<[boolean, Segment[]]> {
        if (this.fd === -1) {
            this.fd = await open(this.options.destination, "w");
        }
        await this.updateMetadata();
        const done = await this.download();
        if (done) {
            await close(this.fd).catch(() => { });
        }
        return [done, this.segments];
    }
    protected shouldTolerant(e: any): boolean {
        return e.code === "ECONNRESET"
            || e.code === "ETIMEDOUT"
            || e.code === "EPROTO"
            || e.code === "ECANCELED"
            || e.message === "ChecksumNotMatch";
    }
    protected async validate() {
        if (this.options.checksum) {
            let actual = await checksum(this.options.destination, this.options.checksum.algorithm)
            let expect = this.options.checksum.hash;
            if (actual !== expect) {
                throw new Error("ChecksumNotMatch");
            }
        }
    }
    protected abort() {
        this.connections.forEach((c) => {
            c.response.unpipe();
            c.request.abort();
        });
        this.connections = [];
    }
    protected reset() {
        const contentLength = this.metadata.contentLength;
        this.segments = contentLength && this.metadata.acceptRanges
            ? computeSegmenets(contentLength, this.options.segmentThreshold ?? 2 * 1024 * 1024, 4)
            : [{ start: 0, end: contentLength }];
        this.outputs = this.segments.map((seg) => createWriteStream(this.options.destination, {
            fd: this.fd,
            start: seg.start,
            autoClose: false,
        }));
        this.progress = 0;
    }
}

export class DownloadBatchTask extends BaseTask<void> {
    constructor(private targets: DownloadFromPathOptions[], private hosts: string[]) {
        super();
    }
    protected run(): Promise<void> {
        this.targets.map(target => {
        });
        throw new Error("Method not implemented.");
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

export class DownloadMultipleSourceFallbackTask extends BaseTask<Segment[]> {
    private activeTask: DownloadTask | undefined;

    constructor(private options: DownloadMultiUrlOptions) {
        super();
    }

    protected onCancel(): void {
        this.activeTask.cancel();
    }
    protected onPause(): void {
        this.activeTask.pause();
    }
    protected onResume(): void {
        this.activeTask.resume();
    }

    async run() {
        const errors: unknown[] = [];
        const options = this.options;
        await ensureFile(options.destination);
        try {
            let segments: Segment[] = [];
            await normalizeArray(options.urls).reduce(async (memo, u) => memo.catch(async (e: Error | undefined) => {
                if (e instanceof CancelledError) {
                    throw e;
                } else if (e) {
                    errors.push(e);
                }
                const parsedURL = parse(u);
                if (parsedURL.protocol === "file:") {
                    await copyFile(fileURLToPath(u), options.destination);
                } else {
                    this.activeTask = new DownloadTask({
                        ...this.options,
                        url: u,
                    });
                    segments = await this.activeTask.startAndWait();
                }
            }), Promise.reject<void>());
            return segments;
        } catch (e) {
            await unlink(options.destination).catch(() => { });
            e.errors = errors;
            throw e;
        }
    }
}
// {
//     http: new HttpAgent({
//         maxSockets: cpus().length * 4,
//         maxFreeSockets: 64,
//         keepAlive: true,
//     }),
//     https: new HttpsAgent({
//         maxSockets: cpus().length * 4,
//         maxFreeSockets: 64,
//         keepAlive: true,
//     }


// export function resolveDownloader<O extends DownloaderOptions, T>(options: O, closure: (options: HasDownloader<O>) => Promise<T>) {
//     if (hasDownloader(options)) {
//         return closure(options);
//     }
//     let maxSockets = options.maxConcurrency ?? cpus().length * 4;
//     let agentOptions: AgentOptions = {
//         maxSockets,
//         maxFreeSockets: 64,
//         keepAlive: true,
//     };
//     let downloader = new HttpDownloader({
//         http: new HttpAgent(agentOptions),
//         https: new HttpsAgent(agentOptions),
//     });
//     return closure({
//         ...options,
//         downloader,
//     }).finally(() => downloader.destroy());
// }
