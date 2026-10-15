#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const childProcess = spawn(
    process.execPath,
    [
        join(repositoryRoot, "node_modules/tsx/dist/cli.mjs"),
        join(repositoryRoot, "scripts/WasmverseMcpServer.ts"),
        ...process.argv.slice(2),
    ],
    { cwd: repositoryRoot, stdio: "inherit" },
);
childProcess.on("exit", (exitCode, signalName) => {
    if (signalName) {
        process.kill(process.pid, signalName);
        return;
    }
    process.exit(exitCode ?? 1);
});
