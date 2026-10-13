import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
function buildContext(sourceDirectory: string, runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory,
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "main.as",
        programArguments: [],
        languageIdentifier: "assemblyscript",
    };
}
describe("AssemblyScriptCompilerStrategy", () => {
    test("loader wires env.read and env.write to the shared terminal hooks", async () => {
        const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-assemblyscript-"));
        try {
            const sourceDirectory = join(fixtureDirectory, "source");
            await mkdir(sourceDirectory);
            await writeFile(join(sourceDirectory, "main.as"), "export function main(): void {}");
            const processRunner = new FakeProcessRunner();
            const strategy = new AssemblyScriptCompilerStrategy(
                processRunner as unknown as ProcessRunner,
            );
            await strategy.compileSourceInto(buildContext(sourceDirectory, fixtureDirectory));
            const loaderText = await readFile(join(fixtureDirectory, "app.js"), "utf8");
            expect(loaderText).toContain("write: forwardedWrite, read: forwardedRead");
            expect(loaderText).toContain("globalThis.__wasmverseWriteLine");
            expect(loaderText).toContain("globalThis.__wasmverseReadLine");
            expect(processRunner.commands).toEqual([
                [
                    process.execPath,
                    resolve(process.cwd(), "node_modules/assemblyscript/bin/asc.js"),
                    "main.as.ts",
                    "--outFile",
                    `${fixtureDirectory}/app.wasm`,
                    "--optimize",
                ],
            ]);
            await expect(readFile(join(sourceDirectory, "main.as.ts"), "utf8")).rejects.toThrow();
        } finally {
            await rm(fixtureDirectory, { recursive: true, force: true });
        }
    });
});
