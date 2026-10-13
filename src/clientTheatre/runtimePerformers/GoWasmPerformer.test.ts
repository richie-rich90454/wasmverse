import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { GoWasmPerformer } from "@clientTheatre/runtimePerformers/GoWasmPerformer.ts";
const FAKE_GO_LOADER_TEXT = [
    "export function createGoRunner(){",
    "    const state = globalThis.__goWasmTestState;",
    "    const runner = {",
    "        argv: [],",
    "        env: {},",
    "        exit() {},",
    "        importObject: {},",
    "        run(instance){",
    "            state.argvSnapshots.push([...runner.argv]);",
    "            return state.run(globalThis.fs);",
    "        },",
    "    };",
    "    state.runnerCount++;",
    "    state.lastRunner = runner;",
    "    return runner;",
    "}",
    "",
].join("\n");
const EMPTY_WASM_MODULE_BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
interface GoTestFileSystem {
    write(
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null,
        callback: (error: unknown, value?: unknown) => void,
    ): void;
    read(
        fd: number,
        buffer: Uint8Array,
        offset: number,
        length: number,
        position: number | null,
        callback: (error: unknown, value?: unknown) => void,
    ): void;
    writeSync(fd: number, buffer: Uint8Array): number;
    open(
        path: string,
        flags: number,
        mode: number,
        callback: (error: unknown, value?: unknown) => void,
    ): void;
    close(fd: number, callback: (error: unknown, value?: unknown) => void): void;
}
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
interface GoWasmTestState {
    runnerCount: number;
    argvSnapshots: Array<Array<string>>;
    lastRunner: { exit(code: number): void } | undefined;
    run: (fileSystem: unknown) => unknown;
}
interface GoWasmFixture {
    performer: GoWasmPerformer;
    stage: FakeTerminalStage;
    state: GoWasmTestState;
    dispose(): Promise<void>;
}
function appendOutput(fileSystem: GoTestFileSystem, text: string): void {
    const bytes = new TextEncoder().encode(text);
    fileSystem.write(1, bytes, 0, bytes.length, null, () => {});
}
function readStdinOnce(fileSystem: GoTestFileSystem, buffer: Uint8Array): number {
    let bytesRead = 0;
    fileSystem.read(0, buffer, 0, buffer.length, null, (_error, value) => {
        bytesRead = value as number;
    });
    return bytesRead;
}
function readNamedFile(fileSystem: GoTestFileSystem, path: string): string {
    let descriptor = -1;
    let openError: unknown = null;
    fileSystem.open(path, 0, 0, (error, value) => {
        openError = error;
        descriptor = value as number;
    });
    if (openError) {
        throw openError as Error;
    }
    const collected: Array<string> = [];
    for (;;) {
        const buffer = new Uint8Array(64);
        let bytesRead = 0;
        fileSystem.read(descriptor, buffer, 0, buffer.length, null, (_error, value) => {
            bytesRead = value as number;
        });
        if (bytesRead === 0) {
            break;
        }
        collected.push(new TextDecoder().decode(buffer.subarray(0, bytesRead)));
    }
    fileSystem.close(descriptor, () => {});
    return collected.join("");
}
async function createFixture(): Promise<GoWasmFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-go-"));
    const runtimeDirectory = join(fixtureDirectory, "runtime");
    await mkdir(runtimeDirectory);
    await writeFile(join(runtimeDirectory, "go-loader.js"), FAKE_GO_LOADER_TEXT);
    const stage = new FakeTerminalStage();
    const state: GoWasmTestState = {
        runnerCount: 0,
        argvSnapshots: [],
        lastRunner: undefined,
        run: () => {},
    };
    (globalThis as Record<string, unknown>).__goWasmTestState = state;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/runtime/app.wasm")) {
            return {
                ok: true,
                arrayBuffer: async () => EMPTY_WASM_MODULE_BYTES.buffer,
            } as Response;
        }
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.go",
                    includedFileRelativePaths: ["main.go", "config/notes.txt"],
                    programArguments: ["--verbose", "7"],
                }),
            } as Response;
        }
        if (url.endsWith("/user-code/main.go")) {
            return { ok: true, text: async () => "package main" } as Response;
        }
        if (url.endsWith("/user-code/config/notes.txt")) {
            return { ok: true, text: async () => "alpha" } as Response;
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new GoWasmPerformer(pathToFileURL(fixtureDirectory).href);
    await performer.loadInto(stage as unknown as TerminalStageController);
    return {
        performer,
        stage,
        state,
        dispose: async () => {
            globalThis.fetch = originalFetch;
            delete (globalThis as Record<string, unknown>).__goWasmTestState;
            delete (globalThis as Record<string, unknown>).fs;
            await rm(fixtureDirectory, { recursive: true, force: true });
        },
    };
}
function interactiveRun(fileSystem: unknown): void {
    const goFileSystem = fileSystem as GoTestFileSystem;
    appendOutput(goFileSystem, "prompt> ");
    appendOutput(goFileSystem, `notes: ${readNamedFile(goFileSystem, "/config/notes.txt")}\n`);
    const inputBuffer = new Uint8Array(64);
    const bytesRead = readStdinOnce(goFileSystem, inputBuffer);
    const name = new TextDecoder().decode(inputBuffer.subarray(0, bytesRead)).trim();
    appendOutput(goFileSystem, `Hello ${name}\n`);
}
describe("GoWasmPerformer", () => {
    test("replays with a fresh runner, shim and user files until input is satisfied", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.run = interactiveRun;
            fixture.stage.inputAnswers.push("Ada");
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("prompt> notes: alpha\nHello Ada\n");
            expect(fixture.state.runnerCount).toBe(2);
            expect(fixture.stage.prompts).toEqual([""]);
            expect(fixture.state.argvSnapshots).toEqual([
                ["main.go", "--verbose", "7"],
                ["main.go", "--verbose", "7"],
            ]);
        } finally {
            await fixture.dispose();
        }
    });
    test("replays even when the runner swallows the input signal", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.run = (fileSystem) => {
                const goFileSystem = fileSystem as GoTestFileSystem;
                appendOutput(goFileSystem, "prompt> ");
                try {
                    const inputBuffer = new Uint8Array(64);
                    const bytesRead = readStdinOnce(goFileSystem, inputBuffer);
                    const name = new TextDecoder()
                        .decode(inputBuffer.subarray(0, bytesRead))
                        .trim();
                    appendOutput(goFileSystem, `Hello ${name}\n`);
                } catch {
                    return;
                }
            };
            fixture.stage.inputAnswers.push("Ada");
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("prompt> Hello Ada\n");
            expect(fixture.state.runnerCount).toBe(2);
            expect(fixture.stage.prompts).toEqual([""]);
        } finally {
            await fixture.dispose();
        }
    });
    test("runs a program that never reads input in a single attempt", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.run = (fileSystem) => {
                const goFileSystem = fileSystem as GoTestFileSystem;
                const stdoutBytes = new TextEncoder().encode("done\n");
                goFileSystem.write(1, stdoutBytes, 0, stdoutBytes.length, null, () => {});
                goFileSystem.writeSync(2, new TextEncoder().encode("trace\n"));
            };
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("done\ntrace\n");
            expect(fixture.state.runnerCount).toBe(1);
            expect(fixture.stage.prompts).toEqual([]);
        } finally {
            await fixture.dispose();
        }
    });
    test("reports a nonzero exit code in one readable line", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.run = () => {
                fixture.state.lastRunner?.exit(3);
            };
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("Program exited with code 3.");
            expect(fixture.state.runnerCount).toBe(1);
        } finally {
            await fixture.dispose();
        }
    });
    test("surfaces the last readable line for a program error", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.run = () => {
                throw new Error("panic: first line\npanic: second line   \n\n");
            };
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("panic: second line");
            expect(fixture.state.runnerCount).toBe(1);
        } finally {
            await fixture.dispose();
        }
    });
    test("stops when the program keeps asking for input", async () => {
        const fixture = await createFixture();
        try {
            fixture.state.run = (fileSystem) => {
                const goFileSystem = fileSystem as GoTestFileSystem;
                try {
                    for (;;) {
                        readStdinOnce(goFileSystem, new Uint8Array(4));
                    }
                } catch {
                    return;
                }
            };
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("Too many input prompts. Stopping to protect the session.");
            expect(fixture.state.runnerCount).toBe(1001);
        } finally {
            await fixture.dispose();
        }
    });
});
