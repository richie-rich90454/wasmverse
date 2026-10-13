import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { build } from "esbuild";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import {
    findRemoteAssetOrigins,
    scrubRemoteAssetOrigins,
} from "@serverAtelier/utilities/RemoteAssetScrubber.ts";
const scopedLogger = new ScopedLogger("ProductionBuildScript");
const processRunner = new ProcessRunner();
const SCRUBBABLE_FILE_PATTERN = /\.(js|mjs|css|html|json)$/;
const DIST_ROOTS = ["./dist/client", "./dist/server"];
async function listRelativeFiles(distRoot: string): Promise<Array<string>> {
    const directoryEntries = await readdir(distRoot, { withFileTypes: true, recursive: true });
    return directoryEntries
        .filter((entry) => entry.isFile())
        .map((entry) =>
            relative(distRoot, join(entry.parentPath, entry.name)).split(sep).join("/"),
        );
}
async function enforceLocalOnlyDist(): Promise<void> {
    let scrubbedFileCount = 0;
    for (const distRoot of DIST_ROOTS) {
        const distFiles = (await listRelativeFiles(distRoot)).filter((relativePath) =>
            SCRUBBABLE_FILE_PATTERN.test(relativePath),
        );
        for (const relativePath of distFiles) {
            const absolutePath = `${distRoot}/${relativePath}`;
            const originalText = await readFile(absolutePath, "utf8");
            const scrubbedText = scrubRemoteAssetOrigins(originalText);
            if (scrubbedText !== originalText) {
                await writeFile(absolutePath, scrubbedText);
                scrubbedFileCount += 1;
                scopedLogger.logSuccess(`Rewrote remote asset origin in ${relativePath}.`);
            }
            const remainingOrigins = findRemoteAssetOrigins(scrubbedText);
            if (remainingOrigins.length > 0) {
                scopedLogger.logError(
                    `${relativePath} still references ${remainingOrigins[0]}. Builds must stay local only.`,
                );
                process.exit(1);
            }
        }
    }
    scopedLogger.logSuccess(
        `Local only check passed. Rewrote ${scrubbedFileCount} file(s) with remote asset origins.`,
    );
}
const viteOutcome = await processRunner.runToCompletion([
    process.execPath,
    "node_modules/vite/bin/vite.js",
    "build",
]);
if (viteOutcome.exitCode !== 0) {
    scopedLogger.logError(`vite build failed: ${viteOutcome.standardError}`);
    process.exit(1);
}
scopedLogger.logSuccess("Client build complete.");
try {
    await build({
        entryPoints: ["./src/serverAtelier/ServerEntryPoint.ts"],
        outfile: "./dist/server/ServerEntryPoint.js",
        bundle: true,
        platform: "node",
        target: "node22",
        format: "esm",
        external: ["esbuild"],
        tsconfig: "./tsconfig.json",
        logLevel: "silent",
    });
} catch (serverBuildError) {
    const serverBuildMessage =
        serverBuildError instanceof Error ? serverBuildError.message : String(serverBuildError);
    scopedLogger.logError(`Server build failed: ${serverBuildMessage}`);
    process.exit(1);
}
scopedLogger.logSuccess("Server build complete. Client in dist/client/, server in dist/server/.");
await enforceLocalOnlyDist();
