import { describe, expect, test } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { AssemblyScriptCompilerStrategy } from "@serverAtelier/compilerStrategies/AssemblyScriptCompilerStrategy.ts";
import type { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
class FakeProcessRunner {
    readonly commands: Array<ReadonlyArray<string>> = [];
    async runToCompletion(command: ReadonlyArray<string>): Promise<{
        exitCode: number;
        standardOutput: string;
        standardError: string;
    }> {
        this.commands.push(command);
        return { exitCode: 0, standardOutput: "", standardError: "" };
    }
}
function buildContext(runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory: "sessions/test-session/source",
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "main.ts",
        programArguments: [],
        languageIdentifier: "assemblyscript",
    };
}
describe("AssemblyScriptCompilerStrategy", () => {
    test("loader wires env.read and env.write to the shared terminal hooks", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-assemblyscript-"));
        try {
            const processRunner = new FakeProcessRunner();
            const strategy = new AssemblyScriptCompilerStrategy(
                processRunner as unknown as ProcessRunner,
            );
            await strategy.compileSourceInto(buildContext(fixtureDirectory));
            const loaderText = await readFile(join(fixtureDirectory, "app.js"), "utf8");
            expect(loaderText).toContain("write: forwardedWrite, read: forwardedRead");
            expect(loaderText).toContain("globalThis.__wasmverseWriteLine");
            expect(loaderText).toContain("globalThis.__wasmverseReadLine");
            expect(processRunner.commands).toEqual([
                [
                    process.execPath,
                    resolve(process.cwd(), "node_modules/assemblyscript/bin/asc.js"),
                    "main.ts",
                    "--outFile",
                    `${fixtureDirectory}/app.wasm`,
                    "--optimize",
                ],
            ]);
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
