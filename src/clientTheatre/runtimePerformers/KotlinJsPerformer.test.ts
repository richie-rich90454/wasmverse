import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { KotlinJsPerformer } from "@clientTheatre/runtimePerformers/KotlinJsPerformer.ts";
const FAKE_KOTLIN_LOADER_TEXT = [
    "export async function loadKotlinModule(baseUrl, attemptIdentifier){",
    "    const state = globalThis.__kotlinJsTestState;",
    "    state.attempts.push(attemptIdentifier);",
    "    return state.factory(attemptIdentifier);",
    "}",
    "",
].join("\n");
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
interface KotlinJsTestState {
    attempts: Array<string>;
    factory: (attemptIdentifier: string) => void;
}
interface KotlinJsFixture {
    performer: KotlinJsPerformer;
    stage: FakeTerminalStage;
    state: KotlinJsTestState;
    dispose(): Promise<void>;
}
async function createFixture(): Promise<KotlinJsFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-kotlinjs-"));
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    await mkdir(runtimeDirectory);
    await writeFile(join(runtimeDirectory, "kotlin-loader.js"), FAKE_KOTLIN_LOADER_TEXT);
    const stage = new FakeTerminalStage();
    const state: KotlinJsTestState = {
        attempts: [],
        factory: () => {},
    };
    (globalThis as Record<string, unknown>).__kotlinJsTestState = state;
    const originalFetch = globalThis.fetch;
    const userFiles: Record<string, string> = {
        "main.kt": "external fun wasmversePrint(text: String)\nfun main() {}\n",
        "data.txt": "probe-data",
    };
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.kt",
                    includedFileRelativePaths: Object.keys(userFiles),
                    programArguments: ["alpha", "beta"],
                }),
            } as Response;
        }
        const matchedPath = Object.keys(userFiles).find((relativePath) =>
            url.endsWith(`/user-code/${relativePath}`),
        );
        if (matchedPath) {
            return { ok: true, text: async () => userFiles[matchedPath] as string } as Response;
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new KotlinJsPerformer(pathToFileURL(fixtureDirectory).href);
    await performer.loadInto(stage as unknown as TerminalStageController);
    return {
        performer,
        stage,
        state,
        dispose: async () => {
            globalThis.fetch = originalFetch;
            delete (globalThis as Record<string, unknown>)["__kotlinJsTestState"];
            await rm(fixtureDirectory, { recursive: true, force: true });
        },
    };
}
describe("KotlinJsPerformer", () => {
    test("replays on the input-needed signal and exposes host globals per attempt", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = () => {
                const sharedGlobals = globalThis as Record<string, unknown>;
                const writeText = sharedGlobals["wasmversePrint"] as (text: string) => void;
                const readLine = sharedGlobals["wasmverseReadLine"] as () => string;
                const readFile = sharedGlobals["wasmverseReadFile"] as (path: string) => string;
                const listFiles = sharedGlobals["wasmverseListFiles"] as () => Array<string>;
                const programArguments = sharedGlobals[
                    "wasmverseProgramArguments"
                ] as Array<string>;
                const name = readLine();
                writeText(`greet:${name}`);
                writeText(`arg0:${programArguments[0]}`);
                writeText(`file:${readFile("data.txt")}`);
                writeText(`files:${listFiles().join(",")}`);
                console.log("console note");
            };
            fixture.stage.inputAnswers.push("Ada");
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe(
                "greet:Ada\narg0:alpha\nfile:probe-data\nfiles:data.txt,main.kt\nconsole note\n",
            );
            expect(fixture.state.attempts.length).toBe(2);
            expect(fixture.state.attempts[1]?.endsWith("-1")).toBe(true);
            expect(fixture.stage.prompts).toEqual([""]);
            expect("wasmversePrint" in globalThis).toBe(false);
            expect("wasmverseReadLine" in globalThis).toBe(false);
            expect("wasmverseProgramArguments" in globalThis).toBe(false);
            expect("wasmverseReadFile" in globalThis).toBe(false);
            expect("wasmverseListFiles" in globalThis).toBe(false);
        } finally {
            await fixture.dispose();
        }
    });
    test("surfaces the last readable line for a program error", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = () => {
                throw new Error("panic: first line\npanic: second line   \n\n");
            };
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("panic: second line");
            expect(fixture.state.attempts.length).toBe(1);
            expect("wasmversePrint" in globalThis).toBe(false);
        } finally {
            await fixture.dispose();
        }
    });
    test("stops when the program keeps asking for input", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = () => {
                const sharedGlobals = globalThis as Record<string, unknown>;
                const readLine = sharedGlobals["wasmverseReadLine"] as () => string;
                for (;;) {
                    readLine();
                }
            };
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("Too many input prompts. Stopping to protect the session.");
            expect(fixture.state.attempts.length).toBe(1001);
            expect("wasmverseReadLine" in globalThis).toBe(false);
        } finally {
            await fixture.dispose();
        }
    });
});
