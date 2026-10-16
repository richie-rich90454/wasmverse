import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { ElmCompilerStrategy } from "@serverAtelier/compilerStrategies/ElmCompilerStrategy.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import type { ProcessRunner, ProcessRunOptions } from "@serverAtelier/utilities/ProcessRunner.ts";
const FAKE_ELM_BUILD_OUTPUT = "(function(scope){\n'use strict';\nscope['Elm'] = {};\n}(this));\n";
class FakeProcessRunner {
    readonly commands: Array<ReadonlyArray<string>> = [];
    readonly options: Array<ProcessRunOptions> = [];
    buildOutputText: string = FAKE_ELM_BUILD_OUTPUT;
    async runToCompletion(
        command: ReadonlyArray<string>,
        options: ProcessRunOptions = {},
    ): Promise<{ exitCode: number; standardOutput: string; standardError: string }> {
        this.commands.push(command);
        this.options.push(options);
        if (command.includes("make")) {
            await writeFile(
                join(options.workingDirectory as string, "elm-build-output.js"),
                this.buildOutputText,
            );
        }
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
        entryFileRelativePath: "Main.elm",
        programArguments: [],
        languageIdentifier: "elm",
    };
}
async function createFixture(): Promise<{
    fixtureDirectory: string;
    sourceDirectory: string;
    runtimeDirectory: string;
    elmPath: string;
}> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-elm-"));
    const sourceDirectory = join(fixtureDirectory, "source");
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    await mkdir(sourceDirectory);
    await mkdir(runtimeDirectory);
    await writeFile(join(sourceDirectory, "Main.elm"), "port module Main exposing (main)\n");
    await writeFile(join(sourceDirectory, "Helper.elm"), "module Helper exposing (label)\n");
    await writeFile(join(sourceDirectory, "notes.txt"), "not elm\n");
    const elmPath = join(fixtureDirectory, process.platform === "win32" ? "elm.exe" : "elm");
    await writeFile(elmPath, "stub");
    return { fixtureDirectory, sourceDirectory, runtimeDirectory, elmPath };
}
describe("ElmCompilerStrategy", () => {
    test("converts the compiled IIFE into an ES module that publishes Elm on globalThis", async () => {
        const fixture = await createFixture();
        try {
            const processRunner = new FakeProcessRunner();
            const strategy = new ElmCompilerStrategy(
                processRunner as unknown as ProcessRunner,
                new FileSystemOperations(),
                fixture.elmPath,
            );
            await strategy.compileSourceInto(
                buildContext(fixture.sourceDirectory, fixture.runtimeDirectory),
            );
            expect(processRunner.commands).toEqual([
                [
                    fixture.elmPath,
                    "make",
                    "Main.elm",
                    "--output=elm-build-output.js",
                    "--report=json",
                ],
            ]);
            expect(processRunner.options[0]?.workingDirectory).toBe(fixture.sourceDirectory);
            expect(processRunner.options[0]?.environmentOverrides?.["ELM_HOME"]).toContain(
                "elm-home",
            );
            const runtimeText = await readFile(`${fixture.runtimeDirectory}/app.js`, "utf8");
            expect(runtimeText).toBe(
                "(function(scope){\n'use strict';\nscope['Elm'] = {};\n}(globalThis));\n",
            );
            expect(runtimeText).not.toContain("}(this));");
            const fileSystemOperations = new FileSystemOperations();
            expect(
                await fileSystemOperations.pathExists(
                    `${fixture.sourceDirectory}/elm-build-output.js`,
                ),
            ).toBe(false);
        } finally {
            await rm(fixture.fixtureDirectory, { recursive: true, force: true });
        }
    });
    test("rejects an unexpected compiled output shape", async () => {
        const fixture = await createFixture();
        try {
            const processRunner = new FakeProcessRunner();
            processRunner.buildOutputText = "not an elm module\n";
            const strategy = new ElmCompilerStrategy(
                processRunner as unknown as ProcessRunner,
                new FileSystemOperations(),
                fixture.elmPath,
            );
            await expect(
                strategy.compileSourceInto(
                    buildContext(fixture.sourceDirectory, fixture.runtimeDirectory),
                ),
            ).rejects.toThrow("unexpected output shape");
        } finally {
            await rm(fixture.fixtureDirectory, { recursive: true, force: true });
        }
    });
    test("fails fast when the toolchain is missing", async () => {
        const fixture = await createFixture();
        try {
            const strategy = new ElmCompilerStrategy(
                new FakeProcessRunner() as unknown as ProcessRunner,
                new FileSystemOperations(),
                join(fixture.fixtureDirectory, "missing-elm"),
            );
            await expect(
                strategy.compileSourceInto(
                    buildContext(fixture.sourceDirectory, fixture.runtimeDirectory),
                ),
            ).rejects.toThrow("Run pnpm run setup");
        } finally {
            await rm(fixture.fixtureDirectory, { recursive: true, force: true });
        }
    });
});
