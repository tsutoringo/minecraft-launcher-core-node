import { Task } from "@xmcl/task";
import { ExecOptions, spawn } from "child_process";
import { createHash } from "crypto";
import { EventEmitter } from "events";
import { access as faccess, close as fclose, constants, copyFile as fcopyFile, createReadStream, createWriteStream, ftruncate, mkdir as fmkdir, open as fopen, readFile as freadFile, stat as fstat, unlink as funlink, writeFile as fwriteFile, WriteStream } from "fs";
import { Agent as HttpAgent, AgentOptions, ClientRequest, IncomingMessage, request, RequestOptions } from "http";
import { Agent as HttpsAgent, request as requests } from "https";
import { cpus } from "os";
import { dirname } from "path";
import { pipeline as pip } from "stream";
import { fileURLToPath, format, parse, UrlWithStringQuery } from "url";
import { promisify } from "util";
import { MinecraftDownloadEventEmitter } from "./minecraft";

const access = promisify(faccess);
const open = promisify(fopen);
const close = promisify(fclose);
const copyFile = promisify(fcopyFile);
const truncate = promisify(ftruncate);

export const pipeline = promisify(pip);
export const unlink = promisify(funlink);
export const stat = promisify(fstat);
export const readFile = promisify(freadFile);
export const writeFile = promisify(fwriteFile);
export const mkdir = promisify(fmkdir);

export interface UpdatedObject {
    timestamp: string;
}

export interface Agents {
    http?: HttpAgent;
    https?: HttpsAgent;
}

export async function fetchText(url: string, agent?: Agents) {
    let parsed = parse(url);
    if (!isValidProtocol(parsed.protocol)) {
        throw new Error(`Invalid protocol ${parsed.protocol}`);
    }
    let { message: msg } = await fetch({
        method: "GET",
        ...parsed,
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36 Edg/80.0.361.48",
        },
    }, agent);
    let buf = await new Promise<Buffer>((resolve, reject) => {
        let contents: any[] = [];
        msg.on("data", (chunk) => { contents.push(chunk); });
        msg.on("end", () => { resolve(Buffer.concat(contents)); });
        msg.on("error", reject)
    });
    return buf.toString();
}

export async function fetchJson(url: string, agent?: Agents) {
    return JSON.parse(await fetchText(url, agent));
}

export async function getIfUpdate(url: string, timestamp?: string, agent: Agents = {}): Promise<{ timestamp: string; content: string | undefined }> {
    let parsed = parse(url);
    if (!isValidProtocol(parsed.protocol)) {
        throw new Error(`Invalid protocol ${parsed.protocol}`);
    }
    let { message: msg } = await fetch({
        method: "GET",
        ...parsed,
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36 Edg/80.0.361.48",
            "If-Modified-Since": timestamp ?? "",
        },
    }, agent);
    let buf = await new Promise<Buffer>((resolve, reject) => {
        let contents: any[] = [];
        msg.on("data", (chunk) => { contents.push(chunk); });
        msg.on("end", () => { resolve(Buffer.concat(contents)); });
        msg.on("error", reject)
    })
    let { statusCode, headers } = msg;
    if (statusCode === 304) {
        return {
            timestamp: headers["last-modified"]!,
            content: undefined,
        };
    } else if (statusCode === 200 || statusCode === 204) {
        return {
            timestamp: headers["last-modified"]!,
            content: buf.toString(),
        }
    }
    throw new Error(`Failure on response status code: ${statusCode}.`);
}

export async function getAndParseIfUpdate<T extends UpdatedObject>(url: string, parser: (s: string) => any, lastObject: T | undefined): Promise<T> {
    let { content, timestamp } = await getIfUpdate(url, lastObject?.timestamp);
    if (content) { return { ...parser(content), timestamp, }; }
    return lastObject!; // this cannot be undefined as the content be null only and only if the lastObject is presented.
}

export async function getLastModified(url: string, timestamp: string | undefined, agent: Agents = {}) {
    let parsed = parse(url);
    if (!isValidProtocol(parsed.protocol)) {
        throw new Error(`Invalid protocol ${parsed.protocol}`);
    }
    let { message: msg } = await fetch({
        method: "HEAD",
        ...parsed,
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.87 Safari/537.36 Edg/80.0.361.48",
            "If-Modified-Since": timestamp ?? "",
        },
    }, agent);
    msg.resume();
    let { headers, statusCode } = msg;
    if (statusCode === 304) {
        return [true, headers["last-modified"]] as const;
    } else if (statusCode === 200 || statusCode === 204) {
        return [false, headers["last-modified"]] as const;
    }
    throw new Error(`Failure on response status code: ${statusCode}.`);
}

/**
 * The options pass into the {@link Downloader}.
 */
export interface DownloadOptions {
    eventHandler?: MinecraftDownloadEventEmitter<any>;
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

function isValidProtocol(protocol: string | undefined | null): protocol is "http:" | "https:" {
    return protocol === "http:" || protocol === "https:";
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

export class ChecksumNotMatchError extends Error {
    constructor(readonly algorithm: string, readonly expect: string, readonly actual: string, readonly file: string) {
        super(`File ${file} ${algorithm} checksum not match. Expect: ${expect}. Actual: ${actual}`);
    }
}

/**
 * Shared install options
 */
export interface InstallOptions {
    /**
     * When you want to install a version over another one.
     *
     * Like, you want to install liteloader over a forge version.
     * You should fill this with that forge version id.
     */
    inheritsFrom?: string;

    /**
     * Override the newly installed version id.
     *
     * If this is absent, the installed version id will be either generated or provided by installer.
     */
    versionId?: string;
}

export function spawnProcess(javaPath: string, args: string[], options?: ExecOptions) {
    return new Promise<void>((resolve, reject) => {
        let process = spawn(javaPath, args, options);
        let errorMsg: string[] = [];
        process.on("error", reject);
        process.on("close", (code) => {
            if (code !== 0) { reject(errorMsg.join("")); } else { resolve(); }
        });
        process.on("exit", (code) => {
            if (code !== 0) { reject(errorMsg.join("")); } else { resolve(); }
        });
        process.stdout.setEncoding("utf-8");
        process.stdout.on("data", (buf) => { });
        process.stderr.setEncoding("utf-8");
        process.stderr.on("data", (buf) => { errorMsg.push(buf.toString()) });
    });
}

export function normalizeArray<T>(arr: T | T[] = []): T[] {
    return arr instanceof Array ? arr : [arr];
}

export function joinUrl(a: string, b: string) {
    if (a.endsWith("/") && b.startsWith("/")) {
        return a + b.substring(1);
    }
    if (!a.endsWith("/") && !b.startsWith("/")) {
        return a + "/" + b;
    }
    return a + b;
}

export function createErr<T>(error: T, message?: string): T & Error {
    let err = new Error(message);
    return Object.assign(err, error);
}

export function exists(target: string) {
    return access(target, constants.F_OK).then(() => true).catch(() => false);
}
export function missing(target: string) {
    return access(target, constants.F_OK).then(() => false).catch(() => true);
}
export async function ensureDir(target: string) {
    try {
        await mkdir(target);
    } catch (e) {
        if (await stat(target).then((s) => s.isDirectory()).catch((e) => false)) { return; }
        if (e.code === "EEXIST") { return; }
        if (e.code === "ENOENT") {
            if (dirname(target) === target) {
                throw e;
            }
            try {
                await ensureDir(dirname(target));
                await mkdir(target);
            } catch {
                if (await stat(target).then((s) => s.isDirectory()).catch((e) => false)) { return; }
                throw e;
            }
            return;
        }
        throw e;
    }
}
export function ensureFile(target: string) {
    return ensureDir(dirname(target));
}
export async function checksum(path: string, algorithm: string = "sha1"): Promise<string> {
    let hash = createHash(algorithm).setEncoding("hex");
    await pipeline(createReadStream(path), hash);
    return hash.read() as string;
}

export function isNotNull<T>(v: T | undefined): v is T {
    return v !== undefined
}
