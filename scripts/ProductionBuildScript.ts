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
async function enforceLocalOnlyDist(): Promise<void> {
    let scrubbedFileCount = 0;
    for (const distRoot of DIST_ROOTS) {
        const distFiles = [...new Bun.Glob("**/*").scanSync({ cwd: distRoot })].filter(
            (relativePath) => SCRUBBABLE_FILE_PATTERN.test(relativePath),
        );
        for (const relativePath of distFiles) {
            const absolutePath = `${distRoot}/${relativePath}`;
            const originalText = await Bun.file(absolutePath).text();
            const scrubbedText = scrubRemoteAssetOrigins(originalText);
            if (scrubbedText !== originalText) {
                await Bun.write(absolutePath, scrubbedText);
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
const viteOutcome = await processRunner.runToCompletion(["bunx", "vite", "build"]);
if (viteOutcome.exitCode !== 0) {
    scopedLogger.logError(`vite build failed: ${viteOutcome.standardError}`);
    process.exit(1);
}
scopedLogger.logSuccess("Client build complete.");
const serverBuildOutcome = await Bun.build({
    entrypoints: ["./src/serverAtelier/ServerEntryPoint.ts"],
    outdir: "./dist/server",
    target: "bun",
    format: "esm",
});
if (!serverBuildOutcome.success) {
    for (const buildMessage of serverBuildOutcome.logs) {
        scopedLogger.logError(buildMessage.message);
    }
    process.exit(1);
}
scopedLogger.logSuccess("Server build complete. Client in dist/client/, server in dist/server/.");
await enforceLocalOnlyDist();
