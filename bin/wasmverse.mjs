#!/usr/bin/env node
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const childProcess = spawn(
    process.execPath,
    [
        join(repositoryRoot, "node_modules/tsx/dist/cli.mjs"),
        "--tsconfig",
        join(repositoryRoot, "tsconfig.json"),
        join(repositoryRoot, "scripts/WasmverseCliScript.ts"),
        ...process.argv.slice(2),
    ],
    {
        stdio: "inherit",
        cwd: repositoryRoot,
        env: { ...process.env, WASMVERSE_INVOCATION_DIRECTORY: process.cwd() },
    },
);
childProcess.on("exit", (exitCode, signalName) => {
    if (signalName) {
        process.kill(process.pid, signalName);
        return;
    }
    process.exit(exitCode ?? 1);
});
