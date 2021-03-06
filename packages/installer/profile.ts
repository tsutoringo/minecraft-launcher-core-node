import { LibraryInfo, MinecraftFolder, MinecraftLocation, Version as VersionJson } from "@xmcl/core";
import { CancelledError, task, TaskLooped } from "@xmcl/task";
import { open, readEntry, walkEntriesGenerator } from "@xmcl/unzip";
import { delimiter } from "path";
import { ZipFile } from "yauzl";
import { checksum, errorFrom, readFile, spawnProcess } from "./utils";
import { installResolvedLibrariesTask, LibraryOptions, InstallSideOption } from "./minecraft";

export interface PostProcessor {
    /**
     * The executable jar path
     */
    jar: string;
    /**
     * The classpath to run
     */
    classpath: string[];
    args: string[];
    outputs?: { [key: string]: string; };
}

export interface InstallProfile {
    spec?: number;
    /**
     * The type of this installation, like "forge"
     */
    profile: string;
    /**
     * The version of this installation
     */
    version: string;
    /**
     * The version json path
     */
    json: string;
    /**
     * The maven artifact name: <org>:<artifact-id>:<version>
     */
    path: string;
    /**
     * The minecraft version
     */
    minecraft: string;
    /**
     * The processor shared variables. The key is the name of variable to replace.
     *
     * The value of client/server is the value of the variable.
     */
    data?: { [key: string]: { client: string; server: string; }; };
    /**
     * The post processor. Which require java to run.
     */
    processors?: Array<PostProcessor>;
    /**
     * The required install profile libraries
     */
    libraries: VersionJson.NormalLibrary[];
    /**
     * Legacy format
     */
    versionInfo?: VersionJson;
}

export interface InstallProfileOption extends LibraryOptions, InstallSideOption {
    /**
     * New forge (>=1.13) require java to install. Can be a executor or java executable path.
     */
    java?: string;
}

/**
 * Resolve processors in install profile
 */
export function resolveProcessors(side: "client" | "server", installProfile: InstallProfile, minecraft: MinecraftFolder) {
    function normalizePath(val: string) {
        if (val && val.match(/^\[.+\]$/g)) { // match sth like [net.minecraft:client:1.15.2:slim]
            const name = val.substring(1, val.length - 1);
            return minecraft.getLibraryByPath(LibraryInfo.resolve(name).path);
        }
        return val;
    }
    function normalizeVariable(val: string) {
        if (val && val.match(/^{.+}$/g)) { // match sth like {MAPPINGS}
            const key = val.substring(1, val.length - 1);
            return variables[key][side];
        }
        return val;
    }
    // store the mapping of {VARIABLE_NAME} -> real path in disk
    const variables: Record<string, { client: string; server: string }> = {
        MINECRAFT_JAR: {
            client: minecraft.getVersionJar(installProfile.minecraft),
            server: minecraft.getVersionJar(installProfile.minecraft, "server"),
        },
    };
    if (installProfile.data) {
        for (const key in installProfile.data) {
            const { client, server } = installProfile.data[key];
            variables[key] = {
                client: normalizePath(client),
                server: normalizePath(server),
            };
        }
    }
    const processors = (installProfile.processors || []).map((proc) => ({
        ...proc,
        args: proc.args.map(normalizePath).map(normalizeVariable),
        outputs: proc.outputs
            ? Object.entries(proc.outputs).map(([k, v]) => ({ [normalizeVariable(k)]: normalizeVariable(v) })).reduce((a, b) => Object.assign(a, b), {})
            : {},
    }));
    return processors;
}

/**
 * Post process the post processors from `InstallProfile`.
 *
 * @param processors The processor info
 * @param minecraft The minecraft location
 * @param java The java executable path
 * @throws {@link PostProcessError}
 */
export function postProcess(processors: PostProcessor[], minecraft: MinecraftFolder, java: string) {
    return new PostProcessingTask(processors, minecraft, java).startAndWait();
}


/**
 * Install by install profile. The install profile usually contains some preprocess should run before installing dependencies.
 *
 * @param installProfile The install profile
 * @param minecraft The minecraft location
 * @param options The options to install
 * @throws {@link PostProcessError}
 */
export function installByProfile(installProfile: InstallProfile, minecraft: MinecraftLocation, options: InstallProfileOption = {}) {
    return installByProfileTask(installProfile, minecraft, options).startAndWait();
}

/**
 * Install by install profile. The install profile usually contains some preprocess should run before installing dependencies.
 *
 * @param installProfile The install profile
 * @param minecraft The minecraft location
 * @param options The options to install
 */
export function installByProfileTask(installProfile: InstallProfile, minecraft: MinecraftLocation, options: InstallProfileOption = {}) {
    return task("installByProfile", async function () {
        const minecraftFolder = MinecraftFolder.from(minecraft);
        const java = options.java || "java";

        const processor = resolveProcessors(options.side || "client", installProfile, minecraftFolder);

        const versionJson: VersionJson = await readFile(minecraftFolder.getVersionJson(installProfile.version)).then((b) => b.toString()).then(JSON.parse);
        const libraries = VersionJson.resolveLibraries([...installProfile.libraries, ...versionJson.libraries]);

        await this.yield(installResolvedLibrariesTask(libraries, minecraft, options));
        await this.yield(new PostProcessingTask(processor, minecraftFolder, java));
    });
}

/**
 * Post process the post processors from `InstallProfile`.
 *
 * @param processors The processor info
 * @param minecraft The minecraft location
 * @param java The java executable path
 * @throws {@link PostProcessError}
 */
export class PostProcessingTask extends TaskLooped<void> {
    readonly name: string = "postProcessing";

    private pointer: number = 0;

    constructor(private processors: PostProcessor[], private minecraft: MinecraftFolder, private java: string) {
        super();
        this.param = processors
        this._total = processors.length;
    }

    protected async shouldProcess(proc: PostProcessor, shouldProcessDefault: boolean) {
        let shouldProcess = false;
        if (proc.outputs) {
            for (const file in proc.outputs) {
                let sha1 = await checksum(file, "sha1").catch((e) => "");
                let expected = proc.outputs[file].replace(/'/g, "");
                if (expected !== sha1) {
                    shouldProcess = true;
                    break;
                }
            }
        } else {
            shouldProcess = shouldProcessDefault;
        }
        return shouldProcess;
    }

    protected async findMainClass(lib: string) {
        let zip: ZipFile | undefined;
        let mainClass: string | undefined;
        try {
            zip = await open(lib, { lazyEntries: true });
            for await (const entry of walkEntriesGenerator(zip)) {
                if (entry.fileName === "META-INF/MANIFEST.MF") {
                    const content = await readEntry(zip, entry).then((b) => b.toString());
                    mainClass = content.split("\n")
                        .map((l) => l.split(": "))
                        .find((arr) => arr[0] === "Main-Class")?.[1].trim();
                    break;
                }
            }
        } catch (e) {
            throw errorFrom({ error: "PostProcessBadJar", jarPath: lib, causeBy: e });
        } finally {
            zip?.close();
        }
        if (!mainClass) {
            throw errorFrom({ error: "PostProcessNoMainClass", jarPath: lib })
        }
        return mainClass;
    }

    protected async postProcess(mc: MinecraftFolder, proc: PostProcessor, java: string) {
        let jarRealPath = mc.getLibraryByPath(LibraryInfo.resolve(proc.jar).path);
        let mainClass = await this.findMainClass(jarRealPath);
        let cp = [...proc.classpath, proc.jar].map(LibraryInfo.resolve).map((p) => mc.getLibraryByPath(p.path)).join(delimiter);
        let cmd = ["-cp", cp, mainClass, ...proc.args];
        try {
            await spawnProcess(java, cmd);
        } catch (e) {
            if (typeof e === "string") {
                throw errorFrom({ error: "PostProcessFailed", jar: proc.jar, commands: [java, ...cmd] }, e);
            }
            throw e;
        }
    }

    protected async process(): Promise<[boolean, void | undefined]> {
        for (this.pointer = 0; this.pointer < this.processors.length; this.pointer++) {
            const proc = this.processors[this.pointer];
            if (this.shouldProcess(proc, true)) {
                await this.postProcess(this.minecraft, proc, this.java);
            }
            if (this.isCancelled) {
                throw new CancelledError(undefined);
            }
            if (this.isPaused) {
                return [false, undefined];
            }
            this._progress = this.pointer;
            this.update(1);
        }
        return [true, undefined];
    }
    protected async validate(): Promise<void> {
        const result = await Promise.all(this.processors.map((p) => this.shouldProcess(p, false)));
        if (result.some((r) => r)) {
            throw new Error("Invalid");
        }
        return Promise.resolve();
    }
    protected shouldTolerant(e: any): boolean {
        return e.message === "Invalid";
    }
    protected async abort(isCancelled: boolean): Promise<void> {
    }
    protected reset(): void {
        this.pointer = 0;
    }
}
