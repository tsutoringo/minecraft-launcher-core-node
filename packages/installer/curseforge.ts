import { MinecraftFolder, MinecraftLocation } from "@xmcl/core";
import { BaseTask, CancelledError, LoopedTask, State, task, Task, TaskContext } from "@xmcl/task";
import { CachedZipFile, open, openEntryReadStream } from "@xmcl/unzip";
import { createWriteStream } from "fs";
import { Agent as HttpsAgent } from "https";
import { basename, join } from "path";
import { Readable, Writable } from "stream";
import { Entry } from "yauzl";
import { DownloadTask, Segment } from "./downloader";
import { DownloaderOption } from "./minecraft";
import { createErr, fetchText, isNotNull, pipeline } from "./util";
import { all } from "./utils";

export interface Options extends DownloaderOption {
    /**
     * The function to query a curseforge project downloadable url.
     */
    queryFileUrl?: CurseforgeURLQuery;
    /**
     * Should it replace the override files if the file is existed.
     */
    replaceExisted?: boolean;
    /**
     * Overload the manifest for this installation.
     * It will use this manifest instead of the read manifest from modpack zip to install.
     */
    manifest?: Manifest;
    /**
     * The function to resolve the file path from url and other.
     *
     * By default this will install all the file
     */
    filePathResolver?: FilePathResolver;
}

export interface InstallFileOptions extends DownloaderOption {
    /**
     * The function to query a curseforge project downloadable url.
     */
    queryFileUrl?: CurseforgeURLQuery;
}

type InputType = string | Buffer | CachedZipFile;

export interface BadCurseforgeModpackError {
    error: "BadCurseforgeModpack";
    /**
     * What required entry is missing in modpack.
     */
    entry: string;
}

export interface Manifest {
    manifestType: string;
    manifestVersion: number;
    minecraft: {
        /**
         * Minecraft version
         */
        version: string;
        libraries?: string;
        /**
         * Can be forge
         */
        modLoaders: {
            id: string;
            primary: boolean;
        }[];
    };
    name: string;
    version: string;
    author: string;
    files: {
        projectID: number;
        fileID: number;
        required: boolean;
    }[];
    overrides: string;
}

export interface File {
    projectID: number;
    fileID: number;
}

/**
 * Read the mainifest data from modpack
 * @throws {@link BadCurseforgeModpackError}
 */
export function readManifestTask(zip: InputType) {
    return task("unpack", async () => {
        let zipFile = typeof zip === "string" || zip instanceof Buffer ? await open(zip) : zip;
        let mainfiestEntry = zipFile.entries["manifest.json"];
        if (!mainfiestEntry) {
            throw createErr({ error: "BadCurseforgeModpack", entry: "manifest.json" });
        }
        let buffer = await zipFile.readEntry(mainfiestEntry)
        let content: Manifest = JSON.parse(buffer.toString());
        return content;
    })
}

/**
 * Read the mainifest data from modpack
 * @throws {@link BadCurseforgeModpackError}
 */
export function readManifest(zip: InputType) {
    return readManifestTask(zip).startAndWait();
}

export type FilePathResolver = (projectId: number, fileId: number, minecraft: MinecraftFolder, url: string) => string | Promise<string>;
export type CurseforgeURLQuery = (projectId: number, fileId: number) => Promise<string>;
export type CurseforgeFileTypeQuery = (projectId: number) => Promise<"mods" | "resourcepacks">;

export function createDefaultCurseforgeQuery(): CurseforgeURLQuery {
    let agent = new HttpsAgent();
    return (projectId, fileId) => fetchText(`https://addons-ecs.forgesvc.net/api/v2/addon/${projectId}/file/${fileId}/download-url`, { https: agent });
}
/**
 * Install curseforge modpack to a specific Minecraft location.
 *
 * @param zip The curseforge modpack zip buffer or file path
 * @param minecraft The minecraft location
 * @param options The options for query curseforge
 */
export function installCurseforgeModpack(zip: InputType, minecraft: MinecraftLocation, options?: Options) {
    return installCurseforgeModpackTask(zip, minecraft, options).startAndWait();
}

class DownloadCurseforgeFileTask extends DownloadTask {
    name: string;
    param: object;

    constructor(url: string, to: string) {
        super({
            destination: to,
            url: url
        });

        this.name = ""
        this.param = {};
    }
}

export class DownloadCurseforgeFilesTask extends BaseTask<void> {
    name: string;
    param: object;

    constructor(readonly manifest: Manifest, readonly minecraft: MinecraftFolder, readonly options: Options) {
        super();
        this.name = "download";
        this.param = manifest;
    }

    private tasks: Task<Segment[]>[] = [];

    protected async run(): Promise<void> {
        const requestor = this.options?.queryFileUrl || createDefaultCurseforgeQuery();
        const resolver = this.options?.filePathResolver || ((p, f, m, u) => m.getMod(basename(u)));
        const minecraft = this.minecraft;
        const tasks = await Promise.all(this.manifest.files.map(async (f) => {
            const from = await requestor(f.projectID, f.fileID);

            let to = resolver(f.projectID, f.fileID, minecraft, from);
            if (typeof to !== "string") {
                to = await to;
            }
            return new DownloadCurseforgeFileTask(from, to);
        }));
        this.tasks = tasks;
        const context: TaskContext = (e) => {
            if (e.type === "update") {
                const progress = tasks.map((t) => t.progress).reduce((a, b) => a + b);
                const total = tasks.map((t) => t.total).reduce((a, b) => a + b);
                this.update({
                    chunkSize: e.chunkSize,
                    from: e.from,
                    to: e.to,
                    progress,
                    total,
                })
            }
        };
        await all(tasks.map((t) => t.startAndWait(context)), this.options.throwErrorImmediately,
            (errs) => `Fail to install curseforge modpack to ${minecraft.root}: ${errs.map((x: any) => x.message).join("\n")}`);
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

export class DeployTask extends LoopedTask<void> {
    name: string;
    param: object;

    private streams: [Readable, Writable][] = []

    constructor(private zipFile: CachedZipFile, private manifest: Manifest, minecraft: MinecraftFolder) {
        super();
        this._to = minecraft.root;
        this.name = "deploy";
        this.param = manifest;
    }

    protected async handleEntry(entry: Entry, relativePath: string) {
        const file = join(this.to!, relativePath);
        if (this._state === State.Cancelled) {
            throw new CancelledError(undefined);
        }
        if (this.isPaused) {
            await this._pausing;
        }
        const readStream = await openEntryReadStream((this.zipFile as any).delegate, entry);
        if (this.isCancelled) {
            throw new CancelledError(undefined);
        }
        if (this.isPaused) {
            await this._pausing;
        }
        const writeStream = createWriteStream(file);
        readStream.on("data", (buf: Buffer) => {
            this.update({
                chunkSize: buf.length,
                progress: this._progress + buf.length,
                total: this._total
            })
        });
        await pipeline(readStream, writeStream);
    }

    protected async process(): Promise<[boolean, void | undefined]> {
        const zipFile = this.zipFile;

        const entries = Object.values(zipFile.entries)
            .filter(isNotNull)
            .filter((e) => !e.fileName.endsWith("/"))
            .filter((e) => e.fileName.startsWith(this.manifest.overrides));

        const total = entries.map((e) => e.uncompressedSize).reduce((a, b) => a + b);

        this.update({
            total,
            progress: 0,
            chunkSize: 0,
        });

        await Promise.all(entries.map((e) => this.handleEntry(e, e.fileName)));

        return [true, undefined];
    }
    protected validate(): Promise<void> {
        return Promise.resolve();
    }
    protected shouldTolerant(e: any): boolean {
        return false;
    }
    protected abort(isCancelled: boolean): void {
        if (isCancelled) {
            for (const [read, write] of this.streams) {
                read.unpipe();
                read.destroy(new CancelledError(undefined));
                this.zipFile.close();
                write.destroy(new CancelledError(undefined));
            }
        } else {
            for (const [read] of this.streams) {
                read.pause();
            }
        }
    }
    protected reset(): void { }
}

/**
 * Install curseforge modpack to a specific Minecraft location.
 *
 * This will NOT install the Minecraft version in the modpack, and will NOT install the forge or other modload listed in modpack!
 * Please resolve them by yourself.
 *
 * @param zip The curseforge modpack zip buffer or file path
 * @param minecraft The minecraft location
 * @param options The options for query curseforge
 * @throws {@link BadCurseforgeModpackError}
 */
export function installCurseforgeModpackTask(zip: InputType, minecraft: MinecraftLocation, options: Options = {}) {
    return task("installCurseforgeModpack", async function () {
        const folder = MinecraftFolder.from(minecraft);
        const zipFile = typeof zip === "string" || zip instanceof Buffer ? await open(zip) : zip;

        const mainfest = options?.manifest ?? await this.yield(readManifestTask(zipFile));
        await this.yield(new DownloadCurseforgeFilesTask(mainfest, folder, options));
        await this.yield(new DeployTask(zipFile, mainfest, folder));

        return mainfest;
    });
}

/**
 * Install a cureseforge xml file to a specific locations
 */
export function installCurseforgeFile(file: File, destination: string, options?: InstallFileOptions) {
    return installCurseforgeFileTask(file, destination, options).startAndWait();
}

/**
 * Install a cureseforge xml file to a specific locations
 */
export function installCurseforgeFileTask(file: File, destination: string, options: InstallFileOptions = {}) {
    return task("installCurseforgeFile", async function () {
        let requestor = options.queryFileUrl || createDefaultCurseforgeQuery();
        let url = await requestor(file.projectID, file.fileID);
        const context: TaskContext = (event) => {
            this.context?.(event);
        }
        await new DownloadCurseforgeFileTask(url, join(destination, basename(url))).startAndWait(context);
    });
}
