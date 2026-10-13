import { afterEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { TeaVmPerformer } from "@clientTheatre/runtimePerformers/TeaVmPerformer.ts";
import { TeaVmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/TeaVmGlueRuntimeAssembler.ts";
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
const FAKE_CLASSES_SOURCE = [
    "export function main(applicationArguments) {",
    "    globalThis.$teaVmAttemptCount = (globalThis.$teaVmAttemptCount ?? 0) + 1;",
    "    const writeOut = globalThis.$rt_putStdoutCustom;",
    "    writeOut('args:' + applicationArguments.join(',') + '\\n');",
    "    if (globalThis.$teaVmBoom === true) {",
    "        writeOut('before-error\\n');",
    "        throw new Error('boom-from-java');",
    "    }",
    "    if (globalThis.$teaVmNeedsInput === true && globalThis.$teaVmAttemptCount === 1) {",
    "        throw new Error('TERMINAL_INPUT_NEEDED');",
    "    }",
    "    if (globalThis.$teaVmReadsInput === true) {",
    "        writeOut('before-input\\n');",
    "        let typedText = '';",
    "        while (true) {",
    "            const byteValue = globalThis.$wasmverseReadByte();",
    "            if (byteValue === 10) { break; }",
    "            if (byteValue === -1) { throw new Error('unexpected-eof'); }",
    "            typedText += String.fromCharCode(byteValue);",
    "        }",
    "        writeOut('typed:' + typedText + '\\n');",
    "    }",
    "    writeOut('finished\\n');",
    "}",
    "",
].join("\n");
const temporaryDirectories: Array<string> = [];
interface SessionLayoutOptions {
    fedAnswers?: Array<string>;
    programArguments?: Array<string>;
}
async function createSessionLayout(options: SessionLayoutOptions = {}): Promise<{
    stage: RecordingStage;
    performer: TeaVmPerformer;
}> {
    const sessionRoot = await mkdtemp(join(tmpdir(), "wasmverse-teavm-performer-"));
    temporaryDirectories.push(sessionRoot);
    const runtimeDirectory = join(sessionRoot, "runtime");
    const userCodeDirectory = join(sessionRoot, "user-code");
    await mkdir(userCodeDirectory, { recursive: true });
    const context: BuildContextRecord = {
        sessionIdentifier: "test-session",
        sessionDirectory: sessionRoot,
        sourceDirectory: join(sessionRoot, "source"),
        runtimeDirectory,
        userCodeDirectory,
        entryFileRelativePath: "Program.java",
        programArguments: [],
        languageIdentifier: "java",
    };
    await new TeaVmGlueRuntimeAssembler(new FileSystemOperations()).assembleRuntimeInto(context);
    await writeFile(join(runtimeDirectory, "classes.js"), FAKE_CLASSES_SOURCE);
    await writeFile(
        join(userCodeDirectory, "manifest.json"),
        JSON.stringify({
            entryFileRelativePath: "Program.java",
            includedFileRelativePaths: ["Program.java"],
            programArguments: options.programArguments ?? ["alpha", "beta"],
        }),
    );
    await writeFile(join(userCodeDirectory, "Program.java"), "public class Program {}\n");
    return {
        stage: new RecordingStage(options.fedAnswers),
        performer: new TeaVmPerformer(pathToFileURL(sessionRoot).href),
    };
}
afterEach(async () => {
    delete (globalThis as Record<string, unknown>)["$teaVmAttemptCount"];
    delete (globalThis as Record<string, unknown>)["$teaVmBoom"];
    delete (globalThis as Record<string, unknown>)["$teaVmNeedsInput"];
    delete (globalThis as Record<string, unknown>)["$teaVmReadsInput"];
    delete (globalThis as Record<string, unknown>)["$wasmverseReadByte"];
    while (temporaryDirectories.length > 0) {
        await rm(temporaryDirectories.pop() as string, { recursive: true, force: true });
    }
});
describe("TeaVmPerformer", () => {
    test("passes the entry file name and program arguments to main and routes raw output", async () => {
        const { stage, performer } = await createSessionLayout();
        await performer.loadInto(stage as unknown as TerminalStageController);
        await performer.performOn(stage as unknown as TerminalStageController);
        expect(stage.shownLines).toContain("TeaVM runtime ready.");
        expect(stage.shownLines).toContain("Running TeaVM main.");
        expect(stage.shownOutput()).toBe("args:Program.java,alpha,beta\nfinished\n");
        expect(stage.readPrompts).toEqual([]);
        expect((globalThis as Record<string, unknown>)["$teaVmAttemptCount"]).toBe(1);
    });
    test("replays and dedupes output when the runtime signals a missing input line", async () => {
        (globalThis as Record<string, unknown>)["$teaVmNeedsInput"] = true;
        const { stage, performer } = await createSessionLayout({
            fedAnswers: ["typed-answer"],
            programArguments: [],
        });
        await performer.loadInto(stage as unknown as TerminalStageController);
        await performer.performOn(stage as unknown as TerminalStageController);
        expect(stage.readPrompts).toEqual([""]);
        expect((globalThis as Record<string, unknown>)["$teaVmAttemptCount"]).toBe(2);
        expect(stage.shownOutput()).toBe("args:Program.java\nfinished\n");
    });
    test("feeds the fed line through the stdin hook when the program reads input", async () => {
        (globalThis as Record<string, unknown>)["$teaVmReadsInput"] = true;
        const { stage, performer } = await createSessionLayout({
            fedAnswers: ["typed-answer"],
            programArguments: [],
        });
        await performer.loadInto(stage as unknown as TerminalStageController);
        await performer.performOn(stage as unknown as TerminalStageController);
        expect(stage.readPrompts).toEqual([""]);
        expect((globalThis as Record<string, unknown>)["$teaVmAttemptCount"]).toBe(2);
        expect(stage.shownOutput()).toBe(
            "args:Program.java\nbefore-input\ntyped:typed-answer\nfinished\n",
        );
    });
    test("surfaces a one line error for an uncaught runtime failure", async () => {
        (globalThis as Record<string, unknown>)["$teaVmBoom"] = true;
        const { stage, performer } = await createSessionLayout();
        await performer.loadInto(stage as unknown as TerminalStageController);
        const performPromise = performer.performOn(stage as unknown as TerminalStageController);
        await expect(performPromise).rejects.toThrow("boom-from-java");
        expect(stage.shownOutput()).toBe("args:Program.java,alpha,beta\nbefore-error\n");
    });
});
