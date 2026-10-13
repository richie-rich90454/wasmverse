import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { KotlinWasmCompilerStrategy } from "@serverAtelier/compilerStrategies/KotlinWasmCompilerStrategy.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import type { ProcessRunner, ProcessRunOptions } from "@serverAtelier/utilities/ProcessRunner.ts";
class FakeProcessRunner {
    readonly commands: Array<ReadonlyArray<string>> = [];
    readonly options: Array<ProcessRunOptions> = [];
    async runToCompletion(
        command: ReadonlyArray<string>,
        options: ProcessRunOptions = {},
    ): Promise<{ exitCode: number; standardOutput: string; standardError: string }> {
        this.commands.push(command);
        this.options.push(options);
        if (command.includes("-Xir-produce-js")) {
            const outputDirectory = command[command.indexOf("-ir-output-dir") + 1] as string;
            await mkdir(outputDirectory, { recursive: true });
            await writeFile(`${outputDirectory}/app.mjs`, "export const marker = 1;\n");
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
        entryFileRelativePath: "main.kt",
        programArguments: [],
        languageIdentifier: "kotlin",
    };
}
async function createFixture(): Promise<{
    fixtureDirectory: string;
    sourceDirectory: string;
    runtimeDirectory: string;
    compilerPath: string;
}> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-kotlin-"));
    const sourceDirectory = join(fixtureDirectory, "source");
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    await mkdir(sourceDirectory);
    await mkdir(runtimeDirectory);
    await writeFile(join(sourceDirectory, "main.kt"), 'fun main() { println("hi") }\n');
    await writeFile(join(sourceDirectory, "helper.kt"), 'fun helperLabel(): String = "helper"\n');
    await writeFile(join(sourceDirectory, "notes.txt"), "not kotlin\n");
    const compilerPath = join(fixtureDirectory, "kotlinc-js");
    await writeFile(compilerPath, "stub");
    return { fixtureDirectory, sourceDirectory, runtimeDirectory, compilerPath };
}
function compilerCommandPrefix(compilerPath: string, argumentsList: ReadonlyArray<string>) {
    return process.platform === "win32"
        ? ["cmd", "/c", compilerPath, ...argumentsList]
        : [compilerPath, ...argumentsList];
}
describe("KotlinWasmCompilerStrategy", () => {
    test("compiles every .kt file into an unpacked klib and links a browser ES module", async () => {
        const fixture = await createFixture();
        try {
            const processRunner = new FakeProcessRunner();
            const strategy = new KotlinWasmCompilerStrategy(
                processRunner as unknown as ProcessRunner,
                new FileSystemOperations(),
                fixture.compilerPath,
            );
            await strategy.compileSourceInto(
                buildContext(fixture.sourceDirectory, fixture.runtimeDirectory),
            );
            const absoluteKotlinDirectory = resolve(process.cwd(), "./.tools/kotlin-wasm");
            const absoluteJdkDirectory = resolve(process.cwd(), "./.tools/jdk");
            const stdlibKlibPath = `${absoluteKotlinDirectory}/lib/kotlin-stdlib-js.klib`;
            const intermediateKlibDirectory = `${fixture.runtimeDirectory}/kotlin-klib`;
            expect(processRunner.commands).toEqual([
                compilerCommandPrefix(fixture.compilerPath, [
                    "helper.kt",
                    "main.kt",
                    "-nopack",
                    "-libraries",
                    stdlibKlibPath,
                    "-ir-output-dir",
                    intermediateKlibDirectory,
                    "-ir-output-name",
                    "out",
                ]),
                compilerCommandPrefix(fixture.compilerPath, [
                    "-Xir-produce-js",
                    "-libraries",
                    stdlibKlibPath,
                    `-Xinclude=${intermediateKlibDirectory}`,
                    "-ir-output-dir",
                    fixture.runtimeDirectory,
                    "-ir-output-name",
                    "app",
                    "-module-kind",
                    "es",
                    "-main",
                    "call",
                ]),
            ]);
            for (const options of processRunner.options) {
                expect(options.workingDirectory).toBe(fixture.sourceDirectory);
                expect(options.environmentOverrides?.["JAVA_HOME"]).toBe(absoluteJdkDirectory);
                expect(
                    options.environmentOverrides?.["PATH"]?.startsWith(
                        resolve(absoluteJdkDirectory, "bin") + delimiter,
                    ),
                ).toBe(true);
            }
            expect(await readFile(`${fixture.runtimeDirectory}/app.js`, "utf8")).toBe(
                "export const marker = 1;\n",
            );
            const fileSystemOperations = new FileSystemOperations();
            expect(
                await fileSystemOperations.pathExists(`${fixture.runtimeDirectory}/app.mjs`),
            ).toBe(false);
            expect(await fileSystemOperations.pathExists(intermediateKlibDirectory)).toBe(false);
        } finally {
            await rm(fixture.fixtureDirectory, { recursive: true, force: true });
        }
    });
    test("fails fast when the toolchain is missing", async () => {
        const fixture = await createFixture();
        try {
            const strategy = new KotlinWasmCompilerStrategy(
                new FakeProcessRunner() as unknown as ProcessRunner,
                new FileSystemOperations(),
                join(fixture.fixtureDirectory, "missing-kotlinc-js"),
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
