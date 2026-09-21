import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
const scopedLogger = new ScopedLogger("ProductionBuildScript");
const processRunner = new ProcessRunner();
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
