import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { BlazorPerformer } from "@clientTheatre/runtimePerformers/BlazorPerformer.ts";
import { BlazorGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/BlazorGlueRuntimeAssembler.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL) => {
    const requestUrl = String(input);
    if (requestUrl.startsWith("file:")) {
        return new Response(await readFile(fileURLToPath(requestUrl)));
    }
    return originalFetch(input);
}) as typeof fetch;
class RecordingStage {
    readonly shownLines: Array<string> = [];
    readonly writtenText: Array<string> = [];
    readonly readPrompts: Array<string> = [];
    private readonly fedAnswers: Array<string>;
    constructor(fedAnswers: Array<string> = []) {
        this.fedAnswers = [...fedAnswers];
    }
    writeLine(line: string): void {
        this.shownLines.push(line);
    }
    writeText(text: string): void {
        this.writtenText.push(text);
    }
    async readLine(promptText: string): Promise<string> {
        this.readPrompts.push(promptText);
        const answer = this.fedAnswers.shift();
        if (answer === undefined) {
            throw new Error("The test stage has no fed answer left.");
        }
        return answer;
    }
    shownOutput(): string {
        return this.writtenText.join("");
    }
}
const FAKE_DOTNET_SOURCE = [
    "export const dotnet = {",
    "    withApplicationArguments: (...applicationArguments) => ({",
    "        create: async () => {",
    "            globalThis.$blazorAttemptCount = (globalThis.$blazorAttemptCount ?? 0) + 1;",
    "            globalThis.$blazorApplicationArguments = applicationArguments;",
    "            globalThis.$blazorInjectedFiles = [];",
    "            return {",
    "                Module: {",
    "                    FS_createPath: (parent, path) => {",
    "                        globalThis.$blazorCreatedPaths = [...(globalThis.$blazorCreatedPaths ?? []), parent + path];",
    "                    },",
    "                    FS_createDataFile: (parent, name, data) => {",
    "                        globalThis.$blazorInjectedFiles.push((parent === '/' ? '/' : parent + '/') + name + ':' + new TextDecoder().decode(data));",
    "                    },",
    "                },",
    "                setModuleImports: (moduleName, imports) => {",
    "                    globalThis.$blazorModuleName = moduleName;",
    "                    globalThis.$blazorHost = imports;",
    "                },",
    "                runMain: async () => {",
    "                    console.log('args:' + globalThis.$blazorApplicationArguments.join(','));",
    "                    console.error('stderr-line');",
    "                    if (globalThis.$blazorReadsLine === true) {",
    "                        console.log('line:' + globalThis.$blazorHost.readLine());",
    "                    }",
    "                    if (globalThis.$blazorBoom === true) {",
    "                        throw new Error('boom-from-dotnet');",
    "                    }",
    "                    console.log('done');",
    "                    return 0;",
    "                },",
    "            };",
    "        },",
    "    }),",
    "};",
    "",
].join("\n");
const MANIFEST = JSON.stringify({
    entryFileRelativePath: "Program.cs",
    includedFileRelativePaths: ["Program.cs", "lib/data.txt"],
    programArguments: ["alpha", "one"],
});
const temporaryDirectories: Array<string> = [];
async function createSessionLayout(fedAnswers: Array<string> = []): Promise<{
    stage: RecordingStage;
    performer: BlazorPerformer;
}> {
    const sessionRoot = await mkdtemp(join(tmpdir(), "wasmverse-blazor-performer-"));
    temporaryDirectories.push(sessionRoot);
    const runtimeDirectory = join(sessionRoot, "runtime");
    const userCodeDirectory = join(sessionRoot, "user-code");
    await mkdir(join(userCodeDirectory, "lib"), { recursive: true });
    const context: BuildContextRecord = {
        sessionIdentifier: "test-session",
        sessionDirectory: sessionRoot,
        sourceDirectory: join(sessionRoot, "source"),
        runtimeDirectory,
        userCodeDirectory,
        entryFileRelativePath: "Program.cs",
        programArguments: [],
        languageIdentifier: "csharp",
    };
    await new BlazorGlueRuntimeAssembler(new FileSystemOperations()).assembleRuntimeInto(context);
    await writeFile(join(runtimeDirectory, "dotnet.js"), FAKE_DOTNET_SOURCE);
    await writeFile(join(userCodeDirectory, "manifest.json"), MANIFEST);
    await writeFile(join(userCodeDirectory, "Program.cs"), "class Program {}\n");
    await writeFile(join(userCodeDirectory, "lib", "data.txt"), "data-content");
    return {
        stage: new RecordingStage(fedAnswers),
        performer: new BlazorPerformer(pathToFileURL(sessionRoot).href),
    };
}
afterEach(async () => {
    delete (globalThis as Record<string, unknown>)["$blazorAttemptCount"];
    delete (globalThis as Record<string, unknown>)["$blazorApplicationArguments"];
    delete (globalThis as Record<string, unknown>)["$blazorInjectedFiles"];
    delete (globalThis as Record<string, unknown>)["$blazorCreatedPaths"];
    delete (globalThis as Record<string, unknown>)["$blazorModuleName"];
    delete (globalThis as Record<string, unknown>)["$blazorHost"];
    delete (globalThis as Record<string, unknown>)["$blazorReadsLine"];
    delete (globalThis as Record<string, unknown>)["$blazorBoom"];
    while (temporaryDirectories.length > 0) {
        await rm(temporaryDirectories.pop() as string, { recursive: true, force: true });
    }
});
describe("BlazorPerformer", () => {
    test("passes arguments, injects user files into the runtime filesystem, and captures console output", async () => {
        const { stage, performer } = await createSessionLayout();
        await performer.loadInto(stage as unknown as TerminalStageController);
        await performer.performOn(stage as unknown as TerminalStageController);
        expect(stage.shownLines).toContain("C# runtime ready.");
        expect(stage.shownLines).toContain("Running C# main.");
        expect(stage.shownOutput()).toBe("args:Program.cs,alpha,one\nstderr-line\ndone\n");
        expect(stage.readPrompts).toEqual([]);
        expect((globalThis as Record<string, unknown>)["$blazorAttemptCount"]).toBe(1);
        expect((globalThis as Record<string, unknown>)["$blazorApplicationArguments"]).toEqual([
            "Program.cs",
            "alpha",
            "one",
        ]);
        expect((globalThis as Record<string, unknown>)["$blazorModuleName"]).toBe("WasmVerseHost");
        expect((globalThis as Record<string, unknown>)["$blazorCreatedPaths"]).toEqual(["/lib"]);
        expect((globalThis as Record<string, unknown>)["$blazorInjectedFiles"]).toEqual([
            "/Program.cs:class Program {}\n",
            "/lib/data.txt:data-content",
        ]);
    });
    test("prompts, replays on a fresh runtime, and reads the fed line without duplicating output", async () => {
        (globalThis as Record<string, unknown>)["$blazorReadsLine"] = true;
        const { stage, performer } = await createSessionLayout(["first-answer"]);
        await performer.loadInto(stage as unknown as TerminalStageController);
        await performer.performOn(stage as unknown as TerminalStageController);
        expect(stage.readPrompts).toEqual([""]);
        expect((globalThis as Record<string, unknown>)["$blazorAttemptCount"]).toBe(2);
        expect(stage.shownOutput()).toBe(
            "args:Program.cs,alpha,one\nstderr-line\nline:first-answer\ndone\n",
        );
    });
    test("restores the console and surfaces a one line error for an uncaught C# failure", async () => {
        (globalThis as Record<string, unknown>)["$blazorBoom"] = true;
        const { stage, performer } = await createSessionLayout();
        const originalLog = console.log;
        await performer.loadInto(stage as unknown as TerminalStageController);
        const performPromise = performer.performOn(stage as unknown as TerminalStageController);
        await expect(performPromise).rejects.toThrow("boom-from-dotnet");
        expect(console.log).toBe(originalLog);
        expect(stage.shownOutput()).toBe("args:Program.cs,alpha,one\nstderr-line\n");
    });
});
