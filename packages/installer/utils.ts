import { access as faccess, close as fclose, constants, copyFile as fcopyFile, createReadStream, createWriteStream, ftruncate, mkdir as fmkdir, open as fopen, readFile as freadFile, stat as fstat, unlink as funlink, writeFile as fwriteFile, WriteStream } from "fs";
import { pipeline as pip } from "stream";
import { promisify } from "util";
import { createHash } from "crypto";
import { dirname } from "path";
import { CancelledError } from "@xmcl/task";

export const access = promisify(faccess);
export const open = promisify(fopen);
export const close = promisify(fclose);
export const copyFile = promisify(fcopyFile);
export const truncate = promisify(ftruncate);

export const pipeline = promisify(pip);
export const unlink = promisify(funlink);
export const stat = promisify(fstat);
export const readFile = promisify(freadFile);
export const writeFile = promisify(fwriteFile);
export const mkdir = promisify(fmkdir);

export function isValidProtocol(protocol: string | undefined | null): protocol is "http:" | "https:" {
    return protocol === "http:" || protocol === "https:";
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
    return hash.read();
}

/**
 * The collection of errors happened during a parallel process
 */
export class MultipleError extends Error {
    constructor(public errors: unknown[], message?: string) { super(message); };
}

export async function all(promises: Promise<any>[], throwErrorImmediately?: boolean, getErrorMessage?: (errors: unknown[]) => string): Promise<any[]> {
    const errors: unknown[] = [];
    const result = await Promise.all(promises.map(async (promise) => {
        try {
            return promise;
        } catch (error) {
            if (throwErrorImmediately || error instanceof CancelledError) {
                throw error;
            }
            errors.push(error);
        }
    }));
    if (errors.length > 0) {
        throw new MultipleError(errors, getErrorMessage?.(errors));
    }
    return result;
}
