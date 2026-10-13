import { describe, expect, test } from "vitest";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import {
    buildLuaPrelude,
    LuaFedLineReader,
    LuaWasmEntryExecutor,
    LuaWasmPerformer,
} from "@clientTheatre/runtimePerformers/LuaWasmPerformer.ts";
import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
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
interface FakeAttemptContext {
    fedLineReader: LuaFedLineReader;
    programArguments: ReadonlyArray<string>;
    outputTracker: ReplayOutputTracker;
    entryFileName: string;
}
class FakeLuaAttemptRuntime {
    readonly mountedFileSets: Array<ReadonlyMap<string, string>> = [];
    readonly attemptContexts: Array<FakeAttemptContext> = [];
    engineCount = 0;
    script: (context: FakeAttemptContext) => Promise<void> = async () => undefined;
    async mountUserFiles(userFiles: ReadonlyMap<string, string>): Promise<void> {
        this.mountedFileSets.push(userFiles);
    }
    async createAttemptEngine(
        fedLineReader: LuaFedLineReader,
        programArguments: ReadonlyArray<string>,
        outputTracker: ReplayOutputTracker,
        entryFileName: string,
    ): Promise<{
        global: { set(name: string, value: unknown): void };
        doString(code: string): Promise<unknown>;
        doFile(path: string): Promise<unknown>;
    }> {
        this.engineCount++;
        const context: FakeAttemptContext = {
            fedLineReader,
            programArguments,
            outputTracker,
            entryFileName,
        };
        this.attemptContexts.push(context);
        const script = this.script;
        return {
            global: { set: () => undefined },
            doString: async () => undefined,
            doFile: async () => {
                await script(context);
            },
        };
    }
}
interface LuaFixture {
    performer: LuaWasmPerformer;
    stage: FakeTerminalStage;
    dispose(): Promise<void>;
}
async function createLuaFixture(
    entrySource: string,
    programArguments: ReadonlyArray<string>,
): Promise<LuaFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-lua-"));
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    await mkdir(runtimeDirectory);
    await copyFile(
        join(import.meta.dirname, "..", "..", "..", "node_modules", "wasmoon", "dist", "glue.wasm"),
        join(runtimeDirectory, "glue.wasm"),
    );
    const stage = new FakeTerminalStage();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.lua",
                    includedFileRelativePaths: ["main.lua"],
                    programArguments,
                }),
            } as Response;
        }
        if (url.endsWith("/user-code/main.lua")) {
            return { ok: true, text: async () => entrySource } as Response;
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new LuaWasmPerformer(pathToFileURL(fixtureDirectory).href);
    return {
        performer,
        stage,
        dispose: async () => {
            globalThis.fetch = originalFetch;
            await rm(fixtureDirectory, { recursive: true, force: true });
        },
    };
}
describe("LuaFedLineReader", () => {
    test("returns fed lines in order and then throws the input-needed signal", () => {
        const reader = new LuaFedLineReader(["first", "second"]);
        expect(reader.readLine()).toBe("first");
        expect(reader.readLine()).toBe("second");
        expect(() => reader.readLine()).toThrow(TerminalInputNeededSignal);
    });
});
describe("buildLuaPrelude", () => {
    test("places the entry file name at arg zero and wires the reader and arguments", () => {
        const prelude = buildLuaPrelude("main.lua");
        expect(prelude).toContain('arg = { [0] = "main.lua" }');
        expect(prelude).toContain("__wasmverseReadLine");
        expect(prelude).toContain("__wasmverseProgramArguments()");
        expect(prelude).toContain("io.read = function(...)");
        expect(prelude).toContain("io.write = function(...)");
    });
    test("escapes quotes and backslashes in the entry file name", () => {
        const prelude = buildLuaPrelude('we"ird\\name');
        expect(prelude).toContain('arg = { [0] = "we\\"ird\\\\name" }');
    });
});
describe("LuaWasmEntryExecutor", () => {
    test("replays on the input-needed signal and suppresses repeated output", async () => {
        const runtime = new FakeLuaAttemptRuntime();
        const executor = new LuaWasmEntryExecutor(runtime, new ReplayOutputTracker());
        const stage = new FakeTerminalStage();
        runtime.script = async (context) => {
            context.outputTracker.appendText("waiting\n");
            const name = context.fedLineReader.readLine();
            context.outputTracker.appendText(`hello ${name}\n`);
        };
        stage.inputAnswers.push("Ada");
        await executor.executeEntry(
            "main.lua",
            new Map([["main.lua", ""]]),
            ["--flag"],
            stage as unknown as TerminalStageController,
        );
        expect(stage.shownText).toBe("waiting\nhello Ada\n");
        expect(stage.prompts).toEqual([""]);
        expect(runtime.engineCount).toBe(2);
        expect(runtime.mountedFileSets.length).toBe(1);
        expect(runtime.attemptContexts[0]?.programArguments).toEqual(["--flag"]);
        expect(runtime.attemptContexts[0]?.entryFileName).toBe("main.lua");
    });
    test("stops when the program keeps asking for input", async () => {
        const runtime = new FakeLuaAttemptRuntime();
        const executor = new LuaWasmEntryExecutor(runtime, new ReplayOutputTracker());
        const stage = new FakeTerminalStage();
        runtime.script = async (context) => {
            for (;;) {
                context.fedLineReader.readLine();
            }
        };
        await expect(
            executor.executeEntry(
                "main.lua",
                new Map([["main.lua", ""]]),
                [],
                stage as unknown as TerminalStageController,
            ),
        ).rejects.toThrow("Too many input prompts. Stopping to protect the session.");
        expect(runtime.engineCount).toBe(1001);
        expect(runtime.mountedFileSets.length).toBe(1);
    });
    test("surfaces one readable line for a program error", async () => {
        const runtime = new FakeLuaAttemptRuntime();
        const executor = new LuaWasmEntryExecutor(runtime, new ReplayOutputTracker());
        const stage = new FakeTerminalStage();
        runtime.script = async () => {
            throw new Error(
                "main.lua:2: attempt to index a nil value\nstack traceback:\n\tignored",
            );
        };
        let raisedMessage = "";
        try {
            await executor.executeEntry(
                "main.lua",
                new Map([["main.lua", ""]]),
                [],
                stage as unknown as TerminalStageController,
            );
        } catch (error) {
            raisedMessage = error instanceof Error ? error.message : String(error);
        }
        expect(raisedMessage).toBe("Lua error: main.lua:2: attempt to index a nil value");
        expect(runtime.engineCount).toBe(1);
    });
    test("reports a missing entry file through the lua error shape", async () => {
        const runtime = new FakeLuaAttemptRuntime();
        const executor = new LuaWasmEntryExecutor(runtime, new ReplayOutputTracker());
        const stage = new FakeTerminalStage();
        await expect(
            executor.executeEntry(
                "main.lua",
                new Map([["other.lua", ""]]),
                [],
                stage as unknown as TerminalStageController,
            ),
        ).rejects.toThrow("Lua error: Entry file main.lua is missing from the session.");
        expect(runtime.engineCount).toBe(0);
        expect(runtime.mountedFileSets.length).toBe(1);
    });
});
const LUA_REPLAY_SOURCE = [
    'print("lua ready")',
    "local name = io.read()",
    'print("hello " .. name)',
    'io.write("args: ", arg[0], " ", arg[1], " ", arg[2], "\\n")',
    'local count = io.read("*n")',
    'print("count doubled: " .. tostring(count * 2))',
    "",
].join("\n");
describe("LuaWasmPerformer", () => {
    test("replays with real wasmoon input until the program finishes", async () => {
        const fixture = await createLuaFixture(LUA_REPLAY_SOURCE, ["--flag", "7"]);
        try {
            await fixture.performer.loadInto(fixture.stage as unknown as TerminalStageController);
            fixture.stage.inputAnswers.push("Ada", "21");
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe(
                "lua ready\nhello Ada\nargs: main.lua --flag 7\ncount doubled: 42\n",
            );
            expect(fixture.stage.prompts).toEqual(["", ""]);
            expect(fixture.stage.writtenLines).toContain("Running Lua entry script.");
        } finally {
            await fixture.dispose();
        }
    });
    test("shapes a lua runtime failure into one readable line", async () => {
        const fixture = await createLuaFixture(
            ['print("before failure")', 'error("deliberate failure")', ""].join("\n"),
            [],
        );
        try {
            await fixture.performer.loadInto(fixture.stage as unknown as TerminalStageController);
            let raisedMessage = "";
            try {
                await fixture.performer.performOn(
                    fixture.stage as unknown as TerminalStageController,
                );
            } catch (error) {
                raisedMessage = error instanceof Error ? error.message : String(error);
            }
            expect(raisedMessage.startsWith("Lua error: ")).toBe(true);
            expect(raisedMessage).toContain("deliberate failure");
            expect(raisedMessage).not.toContain("\n");
            expect(fixture.stage.shownText).toBe("before failure\n");
            expect(fixture.stage.prompts).toEqual([]);
        } finally {
            await fixture.dispose();
        }
    });
});
