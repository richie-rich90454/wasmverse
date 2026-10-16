import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import {
    WasmPackFedLineReader,
    WasmPackPerformer,
} from "@clientTheatre/runtimePerformers/WasmPackPerformer.ts";
import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
const FAKE_WASM_PACK_LOADER_TEXT = [
    "export async function loadWasmPackModule(baseUrl, attempt = 0){",
    "    const state = globalThis.__wasmPackTestState;",
    "    state.attempts.push(attempt);",
    "    return state.factory(attempt);",
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
interface WasmPackTestState {
    attempts: Array<number>;
    factory: (attempt: number) => Record<string, unknown>;
}
interface WasmPackFixture {
    performer: WasmPackPerformer;
    stage: FakeTerminalStage;
    state: WasmPackTestState;
    dispose(): Promise<void>;
}
async function createFixture(): Promise<WasmPackFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-wasmpack-"));
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    await mkdir(runtimeDirectory);
    await writeFile(join(runtimeDirectory, "wasm-pack-loader.js"), FAKE_WASM_PACK_LOADER_TEXT);
    const stage = new FakeTerminalStage();
    const state: WasmPackTestState = {
        attempts: [],
        factory: () => ({}),
    };
    (globalThis as Record<string, unknown>).__wasmPackTestState = state;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.rs",
                    includedFileRelativePaths: ["main.rs"],
                    programArguments: ["--verbose", "7"],
                }),
            } as Response;
        }
        if (url.endsWith("/user-code/main.rs")) {
            return { ok: true, text: async () => "pub fn run() {}" } as Response;
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new WasmPackPerformer(pathToFileURL(fixtureDirectory).href);
    await performer.loadInto(stage as unknown as TerminalStageController);
    return {
        performer,
        stage,
        state,
        dispose: async () => {
            globalThis.fetch = originalFetch;
            delete (globalThis as Record<string, unknown>).__wasmPackTestState;
            await rm(fixtureDirectory, { recursive: true, force: true });
        },
    };
}
describe("WasmPackFedLineReader", () => {
    test("returns fed lines in order and then throws the input-needed signal", () => {
        const reader = new WasmPackFedLineReader(["first", "second"]);
        expect(reader.readLine()).toBe("first");
        expect(reader.readLine()).toBe("second");
        expect(() => reader.readLine()).toThrow(TerminalInputNeededSignal);
    });
});
describe("WasmPackPerformer", () => {
    test("replays on the input-needed signal with a fresh module attempt", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = () => ({
                main: async () => {
                    const sharedGlobals = globalThis as Record<string, unknown>;
                    const writeLine = sharedGlobals.__wasmverseWriteLine as (text: string) => void;
                    const readLine = sharedGlobals.__wasmverseReadLine as () => string;
                    writeLine("waiting for input\n");
                    const name = readLine();
                    writeLine(`got ${name}\n`);
                    const argumentCount = sharedGlobals.__wasmverseProgramArgumentCount as number;
                    const programArgument = sharedGlobals.__wasmverseProgramArgument as (
                        index: number,
                    ) => string;
                    writeLine(
                        `args ${argumentCount} ${programArgument(0)} ${programArgument(9)}\n`,
                    );
                    return "returned\n";
                },
            });
            fixture.stage.inputAnswers.push("Ada");
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe(
                "waiting for input\ngot Ada\nargs 2 --verbose \nreturned\n",
            );
            expect(fixture.state.attempts).toEqual([0, 1]);
            expect(fixture.stage.prompts).toEqual([""]);
            expect("__wasmverseWriteLine" in globalThis).toBe(false);
            expect("__wasmverseReadLine" in globalThis).toBe(false);
            expect("__wasmverseProgramArgumentCount" in globalThis).toBe(false);
            expect("__wasmverseProgramArgument" in globalThis).toBe(false);
        } finally {
            await fixture.dispose();
        }
    });
    test("reports a module without a main export once", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = () => ({});
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.writtenLines).toContain(
                "WASM module loaded. No main export found.",
            );
            expect(fixture.stage.shownText).toBe("");
            expect(fixture.state.attempts).toEqual([0]);
        } finally {
            await fixture.dispose();
        }
    });
    test("surfaces the last readable line for a program error", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = () => ({
                main: async () => {
                    throw new Error("panic: first line\npanic: second line   \n\n");
                },
            });
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("panic: second line");
            expect(fixture.state.attempts).toEqual([0]);
        } finally {
            await fixture.dispose();
        }
    });
    test("stops when the program keeps asking for input", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = () => ({
                main: () => {
                    const sharedGlobals = globalThis as Record<string, unknown>;
                    const readLine = sharedGlobals.__wasmverseReadLine as () => string;
                    for (;;) {
                        readLine();
                    }
                },
            });
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("Too many input prompts. Stopping to protect the session.");
            expect(fixture.state.attempts.length).toBe(1001);
            expect("__wasmverseReadLine" in globalThis).toBe(false);
        } finally {
            await fixture.dispose();
        }
    });
});
