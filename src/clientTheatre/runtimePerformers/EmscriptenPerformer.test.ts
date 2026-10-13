import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import {
    EmscriptenFedBytesCursor,
    EmscriptenPerformer,
} from "@clientTheatre/runtimePerformers/EmscriptenPerformer.ts";
const FAKE_EMSCRIPTEN_LOADER_TEXT = [
    "export async function loadEmscriptenModule(baseUrl, overrides){",
    "    const state = globalThis.__emscriptenTestState;",
    "    state.factoryCalls.push(overrides);",
    "    return state.factory(overrides);",
    "}",
    "",
].join("\n");
const USER_SOURCE_TEXT = "int main(void) { return 0; }";
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
interface EmscriptenTestState {
    factoryCalls: Array<Record<string, unknown>>;
    factory: (overrides: Record<string, unknown>) => unknown;
}
interface EmscriptenFixture {
    performer: EmscriptenPerformer;
    stage: FakeTerminalStage;
    state: EmscriptenTestState;
    writtenFiles: Map<string, string>;
    createdDirectories: Array<string>;
    callMainArguments: Array<Array<string>>;
    dispose(): Promise<void>;
}
async function createFixture(): Promise<EmscriptenFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-emscripten-"));
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    await mkdir(runtimeDirectory);
    await writeFile(join(runtimeDirectory, "emscripten-loader.js"), FAKE_EMSCRIPTEN_LOADER_TEXT);
    const stage = new FakeTerminalStage();
    const state: EmscriptenTestState = {
        factoryCalls: [],
        factory: () => ({}),
    };
    (globalThis as Record<string, unknown>).__emscriptenTestState = state;
    const writtenFiles = new Map<string, string>();
    const createdDirectories: Array<string> = [];
    const callMainArguments: Array<Array<string>> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.c",
                    includedFileRelativePaths: ["main.c", "data.txt"],
                    programArguments: ["--verbose", "7"],
                }),
            } as Response;
        }
        if (url.endsWith("/user-code/main.c")) {
            return { ok: true, text: async () => USER_SOURCE_TEXT } as Response;
        }
        if (url.endsWith("/user-code/data.txt")) {
            return { ok: true, text: async () => "alpha" } as Response;
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new EmscriptenPerformer(pathToFileURL(fixtureDirectory).href);
    await performer.loadInto(stage as unknown as TerminalStageController);
    return {
        performer,
        stage,
        state,
        writtenFiles,
        createdDirectories,
        callMainArguments,
        dispose: async () => {
            globalThis.fetch = originalFetch;
            delete (globalThis as Record<string, unknown>).__emscriptenTestState;
            await rm(fixtureDirectory, { recursive: true, force: true });
        },
    };
}
function interactiveNameFactory(
    fixture: EmscriptenFixture,
): (overrides: Record<string, unknown>) => unknown {
    return (overrides) => ({
        FS: {
            mkdirTree: (directoryPath: string) => fixture.createdDirectories.push(directoryPath),
            writeFile: (filePath: string, fileContent: string) =>
                fixture.writtenFiles.set(filePath, fileContent),
        },
        callMain: (programArguments: Array<string>) => {
            fixture.callMainArguments.push(programArguments);
            const print = overrides.print as (text: string) => void;
            const stdin = overrides.stdin as () => number | null;
            print("Enter your name:");
            let name = "";
            let characterCode = stdin();
            while (characterCode !== null && characterCode !== 10) {
                name += String.fromCharCode(characterCode);
                characterCode = stdin();
            }
            if (characterCode === null) {
                print("Reached end of input");
                return 0;
            }
            print(`Hello ${name}`);
            return 0;
        },
    });
}
describe("EmscriptenFedBytesCursor", () => {
    test("feeds utf-8 bytes with a trailing newline per line", () => {
        const cursor = new EmscriptenFedBytesCursor(["aé"]);
        expect(cursor.nextByte()).toBe(97);
        expect(cursor.nextByte()).toBe(195);
        expect(cursor.nextByte()).toBe(169);
        expect(cursor.nextByte()).toBe(10);
        expect(cursor.nextByte()).toBeNull();
        expect(cursor.inputWasExhausted).toBe(true);
    });
    test("keeps line order and reports exhaustion only at the end", () => {
        const cursor = new EmscriptenFedBytesCursor(["one", "two"]);
        const bytes: Array<number> = [];
        for (;;) {
            const next = cursor.nextByte();
            if (next === null) {
                break;
            }
            bytes.push(next);
        }
        expect(new TextDecoder().decode(Uint8Array.from(bytes))).toBe("one\ntwo\n");
        expect(cursor.inputWasExhausted).toBe(true);
    });
    test("does not flag exhaustion while fed bytes remain", () => {
        const cursor = new EmscriptenFedBytesCursor(["x"]);
        expect(cursor.nextByte()).toBe(120);
        expect(cursor.inputWasExhausted).toBe(false);
    });
});
describe("EmscriptenPerformer", () => {
    test("replays with the typed line and deduplicates output across attempts", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = interactiveNameFactory(fixture);
            fixture.stage.inputAnswers.push("Ada");
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("Enter your name:\nHello Ada\n");
            expect(fixture.state.factoryCalls.length).toBe(2);
            expect(fixture.stage.prompts).toEqual([""]);
            expect(fixture.callMainArguments[0]).toEqual(["--verbose", "7"]);
            expect(fixture.writtenFiles.get("/main.c")).toBe(USER_SOURCE_TEXT);
            expect(fixture.writtenFiles.get("/data.txt")).toBe("alpha");
            expect(fixture.createdDirectories).toEqual(["/", "/", "/", "/"]);
        } finally {
            await fixture.dispose();
        }
    });
    test("runs a program that never reads input in a single attempt", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = () => ({
                callMain: () => {
                    const overrides = fixture.state.factoryCalls[0] as {
                        print: (text: string) => void;
                    };
                    overrides.print("done");
                    return 0;
                },
            });
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("done\n");
            expect(fixture.state.factoryCalls.length).toBe(1);
            expect(fixture.stage.prompts).toEqual([]);
        } finally {
            await fixture.dispose();
        }
    });
    test("surfaces the last readable line when the program fails before input", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = () => ({
                callMain: () => {
                    throw new Error("first line\nsecond line");
                },
            });
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("second line");
            expect(fixture.state.factoryCalls.length).toBe(1);
        } finally {
            await fixture.dispose();
        }
    });
    test("stops when the program keeps asking for input", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.factory = (overrides) => ({
                callMain: () => {
                    const stdin = overrides.stdin as () => number | null;
                    while (stdin() !== null) {
                        continue;
                    }
                    return 0;
                },
            });
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("Too many input prompts. Stopping to protect the session.");
            expect(fixture.state.factoryCalls.length).toBe(1001);
        } finally {
            await fixture.dispose();
        }
    });
});
