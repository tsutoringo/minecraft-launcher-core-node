import { MinecraftFolder, MinecraftLocation, ResolvedLibrary, ResolvedVersion, Version } from "@xmcl/core";
import { task } from "@xmcl/task";
import { InstallProfile, resolveProcessors } from "./minecraft";
import { checksum, exists, isNotNull, readFile } from "./util";

async function getSha1(file: string) {
    return checksum(file, "sha1");
}
type Processor = InstallProfile["processors"][number];

export interface Issue {
    /**
     * The type of the issue.
     */
    type: "missing" | "corrupted";
    /**
     * The role of the file in Minecraft.
     */
    role: "minecraftJar" | "versionJson" | "library" | "asset" | "assetIndex" | "processor";
    /**
     * The path of the problematic file.
     */
    file: string;
    /**
     * The useful hint to fix this issue. This should be a human readable string.
     */
    hint: string;
    /**
     * The expected checksum of the file. Can be an empty string if this file is missing or not check checksum at all!
     */
    expectedChecksum: string;
    /**
     * The actual checksum of the file. Can be an empty string if this file is missing or not check checksum at all!
     */
    receivedChecksum: string;
}

export type MinecraftIssues = LibraryIssue | MinecraftJarIssue | VersionJsonIssue | AssetIssue | AssetIndexIssue;
export type InstallIssues = ProcessorIssue | LibraryIssue;

/**
 * The processor issue
 */
export interface ProcessorIssue extends Issue {
    role: "processor";

    /**
     * The processor
     */
    processor: Processor;
}

/**
 * The library issue represents a corrupted or missing lib.
 * You can use `Installer.installResolvedLibraries` to fix this.
 */
export interface LibraryIssue extends Issue {
    role: "library";

    /**
     * The problematic library
     */
    library: ResolvedLibrary;
}
/**
 * The minecraft jar issue represents a corrupted or missing minecraft jar.
 * You can use `Installer.installVersion` to fix this.
 */
export interface MinecraftJarIssue extends Issue {
    role: "minecraftJar";

    /**
     * The minecraft version for that jar
     */
    version: string;
}
/**
 * The minecraft jar issue represents a corrupted or missing version jar.
 *
 * This means your version is totally broken, and you should reinstall this version.
 *
 * - If this is just a Minecraft version, you will need to use `Installer.install` to re-install Minecraft.
 * - If this is a Forge version, you will need to use `ForgeInstaller.install` to re-install.
 * - Others are the same, just re-install
 */
export interface VersionJsonIssue extends Issue {
    role: "versionJson";

    /**
     * The version of version json that has problem.
     */
    version: string;
}
/**
 * The asset issue represents a corrupted or missing minecraft asset file.
 * You can use `Installer.installResolvedAssets` to fix this.
 */
export interface AssetIssue extends Issue {
    role: "asset";

    /**
     * The problematic asset
     */
    asset: { name: string; hash: string; size: number; };
}
/**
 * The asset index issue represents a corrupted or missing minecraft asset index file.
 * You can use `Installer.installAssets` to fix this.
 */
export interface AssetIndexIssue extends Issue {
    role: "assetIndex";

    /**
     * The minecraft version of the asset index
     */
    version: string;
}

export interface MinecraftIssueReport {
    minecraftLocation: MinecraftFolder;
    version: string;
    issues: MinecraftIssues[];
}

export interface InstallProfileIssueReport {
    minecraftLocation: MinecraftFolder;
    installProfile: InstallProfile;
    issues: InstallIssues[];
}

async function diagnoseSingleFile(role: Issue["role"], file: string, expectedChecksum: string, hint: string) {
    let issue = false;
    let fileExisted = await exists(file);
    let receivedChecksum = "";
    if (!fileExisted) {
        issue = true;
    } else if (expectedChecksum !== "") {
        receivedChecksum = await getSha1(file);
        issue = receivedChecksum !== expectedChecksum;
    }
    if (issue) {
        return {
            type: fileExisted ? "corrupted" : "missing",
            role,
            file,
            expectedChecksum,
            receivedChecksum,
            hint,
        } as any;
    }
    return undefined;
}

/**
 * Diagnose the version. It will check the version json/jar, libraries and assets.
 *
 * @param version The version id string
 * @param minecraft The minecraft location
 * @beta
 */
export async function diagnose(version: string, minecraftLocation: MinecraftLocation): Promise<MinecraftIssueReport> {
    const minecraft = MinecraftFolder.from(minecraftLocation);
    let report: MinecraftIssueReport = {
        minecraftLocation: minecraft,
        version: version,
        issues: [],
    }
    let issues: Issue[] = report.issues;

    let resolvedVersion: ResolvedVersion;
    try {
        resolvedVersion = await Version.parse(minecraft, version);
    } catch (e) {
        if (e.error === "CorruptedVersionJson") {
            issues.push({ type: "corrupted", role: "versionJson", file: minecraft.getVersionJson(e.version), expectedChecksum: "", receivedChecksum: "", hint: "Re-install the minecraft!" });
        } else {
            issues.push({ type: "missing", role: "versionJson", file: minecraft.getVersionJson(e.version), expectedChecksum: "", receivedChecksum: "", hint: "Re-install the minecraft!" });
        }
        return report;
    }

    const jarIssue = await diagnoseJar(resolvedVersion, minecraft);

    if (jarIssue) {
        report.issues.push(jarIssue);
    }

    const assetIndexIssue = await diagnoseAssetIndex(resolvedVersion, minecraft);

    if (assetIndexIssue) {
        report.issues.push(assetIndexIssue);
    }

    const librariesIssues = await diagnoseLibraries(resolvedVersion, minecraft);

    if (librariesIssues.length > 0) {
        report.issues.push(...librariesIssues);
    }

    if (!assetIndexIssue) {
        const objects = (await readFile(minecraft.getAssetsIndex(resolvedVersion.assets), "utf-8").then((b) => JSON.parse(b.toString()))).objects;
        const assetsIssues = await diagnoseAssets(objects, minecraft);

        if (assetsIssues.length > 0) {
            report.issues.push(...assetsIssues);
        }
    }

    return report;
}

export async function diagnoseAssets(assetObjects: Record<string, { hash: string; size: number }>, minecraft: MinecraftFolder) {
    const filenames = Object.keys(assetObjects);
    const issues = await Promise.all(filenames.map(async (filename) => {
        let { hash, size } = assetObjects[filename];
        let assetPath = minecraft.getAsset(hash);

        let issue: AssetIssue | undefined = await diagnoseSingleFile("asset", assetPath, hash,
            "Problem on asset! Please consider to use Installer.installAssets to fix.");
        if (issue) {
            issue.asset = { name: filename, hash, size };
        }

        return issue;
    }));
    return issues.filter(isNotNull);
}

export async function diagnoseLibraries(resolvedVersion: ResolvedVersion, minecraft: MinecraftFolder): Promise<Array<LibraryIssue>> {
    const issues = await Promise.all(resolvedVersion.libraries.map(async (lib) => {
        const libPath = minecraft.getLibraryByPath(lib.download.path);
        const issue: LibraryIssue | undefined = await diagnoseSingleFile("library", libPath, lib.download.sha1,
            "Problem on library! Please consider to use Installer.installLibraries to fix.");
        if (issue) {
            issue.library = lib;
        }
        return issue;
    }));
    return issues.filter(isNotNull);
}

export async function diagnoseAssetIndex(resolvedVersion: ResolvedVersion, minecraft: MinecraftFolder): Promise<AssetIndexIssue | undefined> {
    const assetsIndexPath = minecraft.getAssetsIndex(resolvedVersion.assets);
    const issue: AssetIndexIssue | undefined = await diagnoseSingleFile("assetIndex",
        assetsIndexPath,
        resolvedVersion.assetIndex.sha1,
        "Problem on assets index file! Please consider to use Installer.installAssets to fix.");
    if (issue) {
        issue.version = resolvedVersion.minecraftVersion;
    }
    return issue;
}

export async function diagnoseJar(resolvedVersion: ResolvedVersion, minecraft: MinecraftFolder): Promise<MinecraftJarIssue | undefined> {
    const jarPath = minecraft.getVersionJar(resolvedVersion.minecraftVersion);
    const issue: MinecraftJarIssue | undefined = await diagnoseSingleFile("minecraftJar",
        jarPath,
        resolvedVersion.downloads.client.sha1,
        "Problem on Minecraft jar! Please consider to use Installer.instalVersion to fix.");
    if (issue) {
        issue.version = resolvedVersion.minecraftVersion;
    }
    return issue;
}

/**
 * Diagnose a install profile status. Check if it processor output correctly processed.
 *
 * This can be used for check if forge correctly installed when minecraft >= 1.13
 * @beta
 *
 * @param installProfile The install profile.
 * @param minecraftLocation The minecraft location
 */
export function diagnoseInstallTask(installProfile: InstallProfile, minecraftLocation: MinecraftLocation) {
    const mc = MinecraftFolder.from(minecraftLocation);
    return task("diagnoseInstallProfile", async (c) => {
        let report: InstallProfileIssueReport = {
            minecraftLocation: mc,
            installProfile,
            issues: [],
        };
        let issues = report.issues;
        let processors: Processor[] = resolveProcessors("client", installProfile, mc);

        let done = 0;
        let total = installProfile.libraries.length + processors.length;
        c.update(done, total);

        await Promise.all(Version.resolveLibraries(installProfile.libraries).map(async (lib) => {
            let libPath = mc.getLibraryByPath(lib.download.path);
            let issue: LibraryIssue | undefined = await diagnoseSingleFile("library", libPath, lib.download.sha1,
                "Problem on install_profile! Please consider to use Installer.installByProfile to fix.");
            if (issue) {
                issue.library = lib;
                issues.push(issue);
            }
            c.update(done += 1, total, lib.name);
        }));

        for (let proc of processors) {
            if (proc.outputs) {
                for (let file in proc.outputs) {
                    let issue: ProcessorIssue = await diagnoseSingleFile("processor", file, proc.outputs[file].replace(/'/g, ""), "Re-install this installer profile!");
                    if (issue) {
                        issue.processor = proc;
                        issues.push(issue);
                    }
                }
            }
            c.update(done += 1, total, proc.jar);
        }

        return report;
    });
}

/**
 * Diagnose a install profile status. Check if it processor output correctly processed.
 *
 * This can be used for check if forge correctly installed when minecraft >= 1.13
 * @beta
 *
 * @param installProfile The install profile.
 * @param minecraftLocation The minecraft location
 */
export function diagnoseInstall(installProfile: InstallProfile, minecraftLocation: MinecraftLocation) {
    return Task.execute(diagnoseInstallTask(installProfile, minecraftLocation)).wait();
}

