import { describe, expect, test } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import {
    PhpEvalSourcePreparer,
    PhpWasmEntryExecutor,
    PhpWasmPerformer,
} from "@clientTheatre/runtimePerformers/PhpWasmPerformer.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const FAKE_PHP_WEB_TEXT = [
    "export class PhpWeb {",
    "    constructor(args) {",
    "        this.args = args;",
    "        this.onoutput = undefined;",
    "        this.onerror = undefined;",
    "        globalThis.__phpTestState.constructorArguments = args;",
    "    }",
    "    inputString(byteString) {",
    "        globalThis.__phpTestState.stdin.push(byteString);",
    "    }",
    "    async writeFile(path, data) {",
    "        globalThis.__phpTestState.writtenFiles.push([path, data]);",
    "    }",
    "    async mkdir(path) {",
    "        globalThis.__phpTestState.madeDirectories.push(path);",
    "    }",
    "    async run(code) {",
    "        globalThis.__phpTestState.ranSources.push(code);",
    '        this.onoutput?.({ detail: ["php says hi\\n"] });',
    "        return 0;",
    "    }",
    "    flush() {",
    "        globalThis.__phpTestState.flushCount += 1;",
    "    }",
    "}",
    "",
].join("\n");
const PHP_USER_SOURCE = '<?php\ndeclare(strict_types=1);\n\necho "php says hi\\n";\n';
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
class FakePhpRuntime {
    onoutput: ((event: { detail: Array<string> }) => void) | undefined = undefined;
    onerror: ((event: { detail: Array<string> }) => void) | undefined = undefined;
    readonly eventLog: Array<string> = [];
    readonly stdinBytes: Array<string> = [];
    ranSource = "";
    runFailure: Error | undefined = undefined;
    inputString(byteString: string): void {
        this.eventLog.push(`stdin:${byteString}`);
        this.stdinBytes.push(byteString);
    }
    async writeFile(path: string, _data: string): Promise<void> {
        this.eventLog.push(`writeFile:${path}`);
    }
    async mkdir(path: string): Promise<void> {
        this.eventLog.push(`mkdir:${path}`);
    }
    async run(code: string): Promise<unknown> {
        this.eventLog.push("run");
        this.ranSource = code;
        if (this.runFailure) {
            throw this.runFailure;
        }
        this.onoutput?.({ detail: ["out line\n"] });
        this.onerror?.({ detail: ["err line\n"] });
        return 0;
    }
    flush(): void {
        this.eventLog.push("flush");
    }
}
interface PhpTestState {
    stdin: Array<string>;
    writtenFiles: Array<[string, string]>;
    madeDirectories: Array<string>;
    ranSources: Array<string>;
    flushCount: number;
    constructorArguments: Record<string, unknown> | undefined;
}
interface PhpFixture {
    performer: PhpWasmPerformer;
    stage: FakeTerminalStage;
    state: PhpTestState;
    dispose(): Promise<void>;
}
function installWebLocksStub(): () => void {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", {
        value: { locks: {} },
        configurable: true,
        writable: true,
    });
    return () => {
        if (originalDescriptor) {
            Object.defineProperty(globalThis, "navigator", originalDescriptor);
            return;
        }
        delete (globalThis as Record<string, unknown>).navigator;
    };
}
async function createPhpFixture(): Promise<PhpFixture> {
    const fixtureDirectory = await mkdtemp(join(tmpdir(), "wasmverse-php-"));
    const phpWebDirectory = join(fixtureDirectory, "runtime", "php-wasm");
    await mkdir(phpWebDirectory, { recursive: true });
    await writeFile(join(phpWebDirectory, "PhpWeb.js"), FAKE_PHP_WEB_TEXT);
    const stage = new FakeTerminalStage();
    const state: PhpTestState = {
        stdin: [],
        writtenFiles: [],
        madeDirectories: [],
        ranSources: [],
        flushCount: 0,
        constructorArguments: undefined,
    };
    (globalThis as Record<string, unknown>).__phpTestState = state;
    const restoreNavigator = installWebLocksStub();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.php",
                    includedFileRelativePaths: ["main.php"],
                    programArguments: ["--verbose", "7"],
                }),
            } as Response;
        }
        if (url.endsWith("/user-code/main.php")) {
            return { ok: true, text: async () => PHP_USER_SOURCE } as Response;
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new PhpWasmPerformer(pathToFileURL(fixtureDirectory).href);
    return {
        performer,
        stage,
        state,
        dispose: async () => {
            globalThis.fetch = originalFetch;
            restoreNavigator();
            delete (globalThis as Record<string, unknown>).__phpTestState;
            await rm(fixtureDirectory, { recursive: true, force: true });
        },
    };
}
describe("PhpEvalSourcePreparer", () => {
    test("strips the leading strict_types declaration and keeps php normalization", () => {
        const preparer = new PhpEvalSourcePreparer();
        const prepared = preparer.prepare(
            "<?php\n\ndeclare(strict_types=1);\n\necho 1;\n",
            "main.php",
            [],
        );
        expect(prepared.startsWith("<?php\n")).toBe(true);
        expect(prepared).not.toContain("strict_types");
        expect(prepared).toContain("echo 1;");
    });
    test("defines argv, argc and the server argv entry", () => {
        const preparer = new PhpEvalSourcePreparer();
        const prepared = preparer.prepare("<?php echo 1;", "main.php", ["--verbose", "7"]);
        expect(prepared).toContain("$argv = array('main.php', '--verbose', '7');");
        expect(prepared).toContain("$argc = count($argv);");
        expect(prepared).toContain('$_SERVER["argv"] = $argv;');
        expect(prepared).toContain('define("STDIN", fopen("php://stdin", "r"));');
    });
    test("escapes single quotes and backslashes in arguments", () => {
        const preparer = new PhpEvalSourcePreparer();
        const prepared = preparer.prepare("<?php", "main.php", ["it's", "c:\\path"]);
        expect(prepared).toContain("'it\\'s'");
        expect(prepared).toContain("'c:\\\\path'");
    });
    test("wraps a source without an opening php tag behind the boot fragment", () => {
        const preparer = new PhpEvalSourcePreparer();
        const prepared = preparer.prepare("<p>Hello <?php echo 1; ?></p>", "main.php", []);
        expect(prepared.startsWith("<?php\n")).toBe(true);
        expect(prepared).toContain("$argv = array('main.php');");
        expect(prepared.endsWith("?><p>Hello <?php echo 1; ?></p>")).toBe(true);
    });
});
describe("PhpWasmEntryExecutor", () => {
    test("feeds stdin bytes before running and routes output through the tracker", async () => {
        const runtime = new FakePhpRuntime();
        const outputTracker = new ReplayOutputTracker();
        runtime.onoutput = (event) => outputTracker.appendText(event.detail[0] ?? "");
        runtime.onerror = (event) => outputTracker.appendText(event.detail[0] ?? "");
        const executor = new PhpWasmEntryExecutor(outputTracker);
        const stage = new FakeTerminalStage();
        await executor.executeEntry(
            runtime,
            "main.php",
            ["--verbose"],
            new Map([
                ["main.php", "<?php echo 1;"],
                ["lib/util.php", "<?php"],
            ]),
            ["alpha", "beta"],
            stage as unknown as TerminalStageController,
        );
        expect(runtime.eventLog).toEqual([
            "writeFile:/main.php",
            "mkdir:/lib",
            "writeFile:/lib/util.php",
            "stdin:alpha\n",
            "stdin:beta\n",
            "run",
            "flush",
        ]);
        expect(stage.shownText).toBe("out line\nerr line\n");
        expect(runtime.ranSource).toContain("$argv = array('main.php', '--verbose');");
    });
    test("surfaces one readable line for a runtime failure", async () => {
        const runtime = new FakePhpRuntime();
        runtime.runFailure = new Error("boom first line\nstack line two");
        const executor = new PhpWasmEntryExecutor(new ReplayOutputTracker());
        const stage = new FakeTerminalStage();
        await expect(
            executor.executeEntry(
                runtime,
                "main.php",
                [],
                new Map([["main.php", "<?php"]]),
                [],
                stage as unknown as TerminalStageController,
            ),
        ).rejects.toThrow("PHP error: boom first line");
    });
    test("reports a missing entry file through the php error shape", async () => {
        const runtime = new FakePhpRuntime();
        const executor = new PhpWasmEntryExecutor(new ReplayOutputTracker());
        const stage = new FakeTerminalStage();
        await expect(
            executor.executeEntry(
                runtime,
                "main.php",
                [],
                new Map([["other.php", "<?php"]]),
                [],
                stage as unknown as TerminalStageController,
            ),
        ).rejects.toThrow("PHP error: Entry file main.php is missing from the session.");
    });
});
describe("PhpWasmPerformer", () => {
    test("runs the prepared entry source with program arguments through the runtime", async () => {
        const fixture = await createPhpFixture();
        try {
            await fixture.performer.loadInto(fixture.stage as unknown as TerminalStageController);
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("php says hi\n");
            expect(fixture.stage.writtenLines).toContain("Running PHP entry script.");
            const ranSource = fixture.state.ranSources[0] as string;
            expect(ranSource.startsWith("<?php\n")).toBe(true);
            expect(ranSource).toContain("$argv = array('main.php', '--verbose', '7');");
            expect(ranSource).toContain("$argc = count($argv);");
            expect(ranSource).toContain('$_SERVER["argv"] = $argv;');
            expect(ranSource).toContain('define("STDIN", fopen("php://stdin", "r"));');
            expect(ranSource).not.toContain("strict_types");
            expect(ranSource).toContain("echo");
            expect(fixture.state.writtenFiles).toEqual([["/main.php", PHP_USER_SOURCE]]);
            expect(fixture.state.stdin).toEqual([]);
            expect(fixture.state.flushCount).toBeGreaterThan(0);
            expect(fixture.state.constructorArguments?.version).toBe("8.4");
        } finally {
            await fixture.dispose();
        }
    });
    test("refuses to load without the Web Locks API", async () => {
        const fixture = await createPhpFixture();
        try {
            Object.defineProperty(globalThis, "navigator", {
                value: undefined,
                configurable: true,
                writable: true,
            });
            await expect(
                fixture.performer.loadInto(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow(
                "PHP needs an HTTPS origin because the runtime serialises file writes with the Web Locks API.",
            );
        } finally {
            await fixture.dispose();
        }
    });
});
