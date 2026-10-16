import { afterEach, describe, expect, test } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import { DotNetBlazorCompilerStrategy } from "@serverAtelier/compilerStrategies/DotNetBlazorCompilerStrategy.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import type { ProcessOutcome, ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
interface RecordedCall {
    command: ReadonlyArray<string>;
    workingDirectory: string | undefined;
}
class RecordingProcessRunner {
    readonly calls: Array<RecordedCall> = [];
    constructor(
        private readonly responder: (command: ReadonlyArray<string>) => ProcessOutcome | Error,
    ) {}
    async runToCompletion(
        command: ReadonlyArray<string>,
        options: { workingDirectory?: string } = {},
    ): Promise<ProcessOutcome> {
        this.calls.push({ command, workingDirectory: options.workingDirectory });
        const outcome = this.responder(command);
        if (outcome instanceof Error) {
            throw outcome;
        }
        return outcome;
    }
}
const temporaryDirectories: Array<string> = [];
async function createTemporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "wasmverse-dotnet-strategy-"));
    temporaryDirectories.push(directory);
    return directory;
}
async function seedFakeDotNetBinary(directory: string): Promise<string> {
    const binaryPath = join(directory, "dotnet.exe");
    await writeFile(binaryPath, "");
    return binaryPath;
}
function buildContext(sourceDirectory: string, runtimeDirectory: string): BuildContextRecord {
    return {
        sessionIdentifier: "test-session",
        sessionDirectory: "sessions/test-session",
        sourceDirectory,
        runtimeDirectory,
        userCodeDirectory: "sessions/test-session/dist/user-code",
        entryFileRelativePath: "Program.cs",
        programArguments: [],
        languageIdentifier: "csharp",
    };
}
async function seedAppBundle(sourceDirectory: string, targetFramework: string): Promise<void> {
    const frameworkDirectory = join(
        sourceDirectory,
        "bin",
        "Release",
        targetFramework,
        "browser-wasm",
        "AppBundle",
        "_framework",
    );
    await mkdir(join(frameworkDirectory, "_nested"), { recursive: true });
    await writeFile(join(frameworkDirectory, "dotnet.js"), "export const dotnet = {};\n");
    await writeFile(join(frameworkDirectory, "dotnet.boot.js"), "export const boot = {};\n");
    await writeFile(join(frameworkDirectory, "_nested", "child.bin"), "child");
    await writeFile(join(frameworkDirectory, "..", ".stamp"), "stamp");
}
afterEach(async () => {
    while (temporaryDirectories.length > 0) {
        await rm(temporaryDirectories.pop() as string, { recursive: true, force: true });
    }
});
describe("DotNetBlazorCompilerStrategy", () => {
    test("scaffolds a browser-wasm project and publishes only the app bundle", async () => {
        const directory = await createTemporaryDirectory();
        const sourceDirectory = join(directory, "source");
        const runtimeDirectory = join(directory, "runtime");
        await mkdir(sourceDirectory, { recursive: true });
        await writeFile(
            join(sourceDirectory, "Program.cs"),
            "class Program { static void Main() {} }\n",
        );
        await seedAppBundle(sourceDirectory, "net10.0");
        const processRunner = new RecordingProcessRunner((command) =>
            command.includes("--version")
                ? { exitCode: 0, standardOutput: "10.0.302", standardError: "" }
                : { exitCode: 0, standardOutput: "published", standardError: "" },
        );
        const strategy = new DotNetBlazorCompilerStrategy(
            processRunner as unknown as ProcessRunner,
            new FileSystemOperations(),
            await seedFakeDotNetBinary(directory),
        );
        await strategy.compileSourceInto(buildContext(sourceDirectory, runtimeDirectory));
        const projectText = await readFile(
            join(sourceDirectory, "WasmVerseProgram.csproj"),
            "utf8",
        );
        expect(projectText).toContain("<TargetFramework>net10.0</TargetFramework>");
        expect(projectText).toContain("<RuntimeIdentifier>browser-wasm</RuntimeIdentifier>");
        expect(projectText).toContain("<AllowUnsafeBlocks>true</AllowUnsafeBlocks>");
        const hostText = await readFile(join(sourceDirectory, "WasmVerseHost.cs"), "utf8");
        expect(hostText).toContain("using System.Runtime.InteropServices.JavaScript;");
        expect(hostText).toContain("internal partial class WasmVerseHost");
        expect(hostText).toContain('[JSImport("readLine", "WasmVerseHost")]');
        expect(hostText).toContain("internal static partial string ReadLine();");
        expect(hostText).toContain('[JSImport("getArguments", "WasmVerseHost")]');
        expect(hostText).toContain('[JSImport("readFile", "WasmVerseHost")]');
        expect(hostText).toContain('[JSImport("listFiles", "WasmVerseHost")]');
        expect(await readFile(join(runtimeDirectory, "dotnet.js"), "utf8")).toContain("dotnet");
        expect(existsSync(join(runtimeDirectory, "dotnet.boot.js"))).toBe(true);
        expect(await readFile(join(runtimeDirectory, "_nested", "child.bin"), "utf8")).toBe(
            "child",
        );
        expect(existsSync(join(runtimeDirectory, ".stamp"))).toBe(false);
        const publishCall = processRunner.calls.find((call) => call.command.includes("publish"));
        expect(publishCall).toBeDefined();
        expect(publishCall?.workingDirectory).toBe(sourceDirectory);
        expect(publishCall?.command).toContain("browser-wasm");
    });
    test("keeps a user supplied project file untouched", async () => {
        const directory = await createTemporaryDirectory();
        const sourceDirectory = join(directory, "source");
        const runtimeDirectory = join(directory, "runtime");
        await mkdir(sourceDirectory, { recursive: true });
        await writeFile(join(sourceDirectory, "Custom.csproj"), "<Project></Project>\n");
        await seedAppBundle(sourceDirectory, "net9.0");
        const processRunner = new RecordingProcessRunner(() => ({
            exitCode: 0,
            standardOutput: "",
            standardError: "",
        }));
        const strategy = new DotNetBlazorCompilerStrategy(
            processRunner as unknown as ProcessRunner,
            new FileSystemOperations(),
            await seedFakeDotNetBinary(directory),
        );
        await strategy.compileSourceInto(buildContext(sourceDirectory, runtimeDirectory));
        expect(existsSync(join(sourceDirectory, "WasmVerseProgram.csproj"))).toBe(false);
        expect(existsSync(join(sourceDirectory, "WasmVerseHost.cs"))).toBe(false);
        expect(processRunner.calls.some((call) => call.command.includes("--version"))).toBe(false);
        expect(existsSync(join(runtimeDirectory, "dotnet.js"))).toBe(true);
    });
    test("falls back to the default target framework when version detection fails", async () => {
        const directory = await createTemporaryDirectory();
        const sourceDirectory = join(directory, "source");
        const runtimeDirectory = join(directory, "runtime");
        await mkdir(sourceDirectory, { recursive: true });
        await seedAppBundle(sourceDirectory, "net8.0");
        const processRunner = new RecordingProcessRunner((command) =>
            command.includes("--version")
                ? new Error("no dotnet")
                : { exitCode: 0, standardOutput: "", standardError: "" },
        );
        const strategy = new DotNetBlazorCompilerStrategy(
            processRunner as unknown as ProcessRunner,
            new FileSystemOperations(),
            await seedFakeDotNetBinary(directory),
        );
        await strategy.compileSourceInto(buildContext(sourceDirectory, runtimeDirectory));
        const projectText = await readFile(
            join(sourceDirectory, "WasmVerseProgram.csproj"),
            "utf8",
        );
        expect(projectText).toContain("<TargetFramework>net8.0</TargetFramework>");
    });
    test("fails readably when publish fails", async () => {
        const directory = await createTemporaryDirectory();
        const sourceDirectory = join(directory, "source");
        const runtimeDirectory = join(directory, "runtime");
        await mkdir(sourceDirectory, { recursive: true });
        const processRunner = new RecordingProcessRunner((command) =>
            command.includes("--version")
                ? { exitCode: 0, standardOutput: "10.0.302", standardError: "" }
                : { exitCode: 1, standardOutput: "", standardError: "MSB1003: project missing" },
        );
        const strategy = new DotNetBlazorCompilerStrategy(
            processRunner as unknown as ProcessRunner,
            new FileSystemOperations(),
            await seedFakeDotNetBinary(directory),
        );
        const compilePromise = strategy.compileSourceInto(
            buildContext(sourceDirectory, runtimeDirectory),
        );
        await expect(compilePromise).rejects.toThrow("MSB1003");
    });
    test("fails readably when the app bundle is missing", async () => {
        const directory = await createTemporaryDirectory();
        const sourceDirectory = join(directory, "source");
        const runtimeDirectory = join(directory, "runtime");
        await mkdir(sourceDirectory, { recursive: true });
        const processRunner = new RecordingProcessRunner((command) =>
            command.includes("--version")
                ? { exitCode: 0, standardOutput: "10.0.302", standardError: "" }
                : { exitCode: 0, standardOutput: "", standardError: "" },
        );
        const strategy = new DotNetBlazorCompilerStrategy(
            processRunner as unknown as ProcessRunner,
            new FileSystemOperations(),
            await seedFakeDotNetBinary(directory),
        );
        await expect(
            strategy.compileSourceInto(buildContext(sourceDirectory, runtimeDirectory)),
        ).rejects.toThrow("browser-wasm app bundle");
    });
});
