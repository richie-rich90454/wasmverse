import { describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { JavaScriptPerformer } from "@clientTheatre/runtimePerformers/JavaScriptPerformer.ts";
class FakeTerminalStage {
    readonly writtenText: Array<string> = [];
    readonly writtenLines: Array<string> = [];
    readonly prompts: Array<string> = [];
    readonly inputAnswers: Array<string> = [];
    writeText(text: string): void {
        this.writtenText.push(text);
    }
    writeLine(text: string): void {
        this.writtenLines.push(text);
    }
    async readLine(promptText: string): Promise<string> {
        this.prompts.push(promptText);
        return this.inputAnswers.shift() ?? "";
    }
    get shownText(): string {
        return this.writtenText.join("");
    }
}
interface JavaScriptFixtureOptions {
    sourceFiles: Record<string, string>;
    programArguments?: Array<string>;
}
interface JavaScriptFixture {
    performer: JavaScriptPerformer;
    stage: FakeTerminalStage;
    dispose(): Promise<void>;
}
async function createFixture(options: JavaScriptFixtureOptions): Promise<JavaScriptFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-javascript-"));
    const stage = new FakeTerminalStage();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.js",
                    includedFileRelativePaths: Object.keys(options.sourceFiles),
                    programArguments: options.programArguments ?? [],
                }),
            } as Response;
        }
        const matchedPath = Object.keys(options.sourceFiles).find((relativePath) =>
            url.endsWith(`/user-code/${relativePath}`),
        );
        if (matchedPath) {
            return {
                ok: true,
                text: async () => options.sourceFiles[matchedPath] as string,
            } as Response;
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new JavaScriptPerformer(pathToFileURL(fixtureDirectory).href);
    await performer.loadInto(stage as unknown as TerminalStageController);
    return {
        performer,
        stage,
        dispose: async () => {
            globalThis.fetch = originalFetch;
            await rm(fixtureDirectory, { recursive: true, force: true });
        },
    };
}
describe("JavaScriptPerformer", () => {
    test("replays the entry with a fresh module cache until input is satisfied", async () => {
        const fixture = await createFixture({
            sourceFiles: {
                "main.js":
                    'const { helperLabel } = require("./helper");\n' +
                    'const name = readLine("name? ");\n' +
                    'print("greet:" + helperLabel() + ":" + name);\n' +
                    'print("arg0:" + programArguments[0]);\n' +
                    'print("file:" + readFile("data.txt"));\n',
                "helper.js": 'exports.helperLabel = () => "helper";\n',
                "data.txt": "probe-data",
            },
            programArguments: ["alpha"],
        });
        try {
            fixture.stage.inputAnswers.push("Ada");
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe(
                "name? greet:helper:Ada\narg0:alpha\nfile:probe-data\n",
            );
            expect(fixture.stage.prompts).toEqual([""]);
        } finally {
            await fixture.dispose();
        }
    });
    test("lists user files and rejects paths that escape the project root", async () => {
        const fixture = await createFixture({
            sourceFiles: {
                "main.js":
                    "print(listFiles().join(','));\n" +
                    'try { readFile("../secret.txt"); } catch (error) { print("rejected:" + error.message); }\n',
                "data.txt": "probe-data",
            },
        });
        try {
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe(
                "data.txt,main.js\nrejected:Path escapes the project root: ../secret.txt\n",
            );
        } finally {
            await fixture.dispose();
        }
    });
    test("only accepts relative requires and reports missing modules", async () => {
        const fixture = await createFixture({
            sourceFiles: {
                "main.js":
                    'try { require("fs"); } catch (error) { print("bare:" + error.message); }\n' +
                    'try { require("./missing"); } catch (error) { print("missing:" + error.message); }\n',
            },
        });
        try {
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe(
                "bare:Only relative requires are supported: 'fs'.\n" +
                    "missing:Cannot find module './missing' from main.js.\n",
            );
        } finally {
            await fixture.dispose();
        }
    });
    test("routes console output into the tracker and restores console methods", async () => {
        const originalConsoleLog = console.log;
        const fixture = await createFixture({
            sourceFiles: {
                "main.js":
                    'console.log("via console");\nconsole.error("via error");\nprint("done");\n',
            },
        });
        try {
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("via console\nvia error\ndone\n");
            expect(console.log).toBe(originalConsoleLog);
        } finally {
            await fixture.dispose();
        }
    });
    test("surfaces the last readable line for a program error", async () => {
        const fixture = await createFixture({
            sourceFiles: {
                "main.js": 'throw new Error("first line\\nsecond line   \\n\\n");\n',
            },
        });
        try {
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("second line");
        } finally {
            await fixture.dispose();
        }
    });
    test("stops when the program keeps asking for input", async () => {
        const fixture = await createFixture({
            sourceFiles: {
                "main.js": "for (;;) {\n    readLine();\n}\n",
            },
        });
        try {
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("Too many input prompts. Stopping to protect the session.");
        } finally {
            await fixture.dispose();
        }
    });
});
