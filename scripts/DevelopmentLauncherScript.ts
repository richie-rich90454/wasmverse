import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
const scopedLogger = new ScopedLogger("DevelopmentLauncherScript");
const processRunner = new ProcessRunner();
const serverProcess = processRunner.runDetached([
    process.execPath,
    "node_modules/tsx/dist/cli.mjs",
    "watch",
    "src/serverAtelier/ServerEntryPoint.ts",
]) as {
    kill(): void;
};
const viteProcess = processRunner.runDetached([
    process.execPath,
    "node_modules/vite/bin/vite.js",
]) as { kill(): void };
scopedLogger.logSuccess("Development server and Vite launched. Press Ctrl+C to stop.");
const shutdownLauncher = () => {
    serverProcess.kill();
    viteProcess.kill();
    process.exit(0);
};
process.on("SIGINT", shutdownLauncher);
process.on("SIGTERM", shutdownLauncher);
await new Promise(() => {});
