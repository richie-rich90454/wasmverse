import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
interface PhpWebModule {
    PhpWeb: new (args: Record<string, unknown>) => unknown;
}
interface PhpRuntime {
    onoutput: ((event: { detail: Array<string> }) => void) | undefined;
    onerror: ((event: { detail: Array<string> }) => void) | undefined;
    writeFile(path: string, data: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    run(code: string): Promise<unknown>;
    refresh(): Promise<void>;
    flush(): void;
}
const LEADING_STRICT_TYPES_DECLARE =
    /^[ \t]*declare[ \t]*\([ \t]*strict_types[ \t]*=[ \t]*1[ \t]*\)[ \t]*;[ \t]*\r?\n?/;
const OPENING_TAG = /^[ \t\r\n]*<\?php[ \t\r\n]*/;
function phpSingleQuotedString(value: string): string {
    return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function phpArrayLiteral(values: ReadonlyArray<string>): string {
    return `array(${values.map(phpSingleQuotedString).join(", ")})`;
}
function describePhpError(runError: unknown): string {
    const rawMessage = runError instanceof Error ? runError.message : String(runError);
    const messageLines = rawMessage
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
    const firstLine = messageLines[0] ?? rawMessage;
    return firstLine.length > 300 ? firstLine.slice(0, 300) : firstLine;
}
class PhpEvalSourcePreparer {
    prepare(
        sourceText: string,
        entryFileName: string,
        programArguments: ReadonlyArray<string>,
    ): string {
        const bootFragment = this.buildBootFragment(entryFileName, programArguments);
        const withoutByteOrderMark = sourceText.replace(/^\uFEFF/, "");
        const openingTag = withoutByteOrderMark.match(OPENING_TAG);
        if (!openingTag) {
            return `<?php\n${bootFragment}?>${withoutByteOrderMark}`;
        }
        const body = withoutByteOrderMark
            .slice(openingTag[0].length)
            .replace(LEADING_STRICT_TYPES_DECLARE, "");
        return `<?php\n${bootFragment}${body}`;
    }
    private buildBootFragment(
        entryFileName: string,
        programArguments: ReadonlyArray<string>,
    ): string {
        return [
            `$argv = ${phpArrayLiteral([entryFileName, ...programArguments])};`,
            `$argc = count($argv);`,
            `$_SERVER["argv"] = $argv;`,
            `if (!defined("STDIN")) { define("STDIN", fopen("php://stdin", "r")); }`,
            "",
        ].join("\n");
    }
}
class PhpStdinCursor {
    private pendingBytes: Array<number> = [];
    private byteIndex: number = 0;
    private servedByteSinceLastNull: boolean = false;
    exhausted: boolean = false;
    loadLines(fedLines: ReadonlyArray<string>): void {
        const textEncoder = new TextEncoder();
        this.pendingBytes = [];
        for (const fedLine of fedLines) {
            for (const byte of textEncoder.encode(`${fedLine}\n`)) {
                this.pendingBytes.push(byte);
            }
        }
        this.byteIndex = 0;
        this.servedByteSinceLastNull = false;
        this.exhausted = false;
    }
    nextByte(): number | null {
        if (this.byteIndex >= this.pendingBytes.length) {
            if (!this.servedByteSinceLastNull) {
                this.exhausted = true;
            }
            this.servedByteSinceLastNull = false;
            return null;
        }
        const nextByte = this.pendingBytes[this.byteIndex] as number;
        this.byteIndex += 1;
        this.servedByteSinceLastNull = true;
        return nextByte;
    }
}
class PhpWasmLoader {
    private readonly assetLocator: RuntimeAssetLocator;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
    }
    async loadRuntime(
        stage: TerminalStageController,
        outputTracker: ReplayOutputTracker,
        stdinCursor: PhpStdinCursor,
    ): Promise<PhpRuntime> {
        stage.writeLine("Loading PHP runtime.");
        if (typeof navigator === "undefined" || !navigator.locks) {
            throw new Error(
                "PHP needs an HTTPS origin because the runtime serialises file writes with the Web Locks API.",
            );
        }
        try {
            const runtimeBaseUrl = this.assetLocator.resolveAssetUrl("runtime");
            const phpWebModule = (await import(
                /* @vite-ignore */ this.assetLocator.resolveAssetUrl("runtime/php-wasm/PhpWeb.js")
            )) as PhpWebModule;
            const phpRuntime = new phpWebModule.PhpWeb({
                version: "8.4",
                stdin: () => stdinCursor.nextByte(),
                locateFile: (path: string) => {
                    if (String(path).endsWith(".wasm")) {
                        const fileName = String(path).split("/").pop() as string;
                        return `${runtimeBaseUrl}/php-wasm/${fileName}`;
                    }
                    return undefined;
                },
            }) as unknown as PhpRuntime;
            phpRuntime.onoutput = (event: { detail: Array<string> }) => {
                if (!stdinCursor.exhausted) {
                    outputTracker.appendText(event.detail[0] ?? "");
                }
            };
            phpRuntime.onerror = (event: { detail: Array<string> }) => {
                if (!stdinCursor.exhausted) {
                    outputTracker.appendText(event.detail[0] ?? "");
                }
            };
            return phpRuntime;
        } catch (loadError) {
            throw new Error(
                `PHP runtime failed to load: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
            );
        }
    }
}
class PhpWasmEntryExecutor {
    private readonly outputTracker: ReplayOutputTracker;
    private readonly sourcePreparer: PhpEvalSourcePreparer;
    constructor(outputTracker: ReplayOutputTracker) {
        this.outputTracker = outputTracker;
        this.sourcePreparer = new PhpEvalSourcePreparer();
    }
    async executeEntry(
        phpRuntime: PhpRuntime,
        entryRelativePath: string,
        programArguments: ReadonlyArray<string>,
        userFiles: ReadonlyMap<string, string>,
        stage: TerminalStageController,
    ): Promise<void> {
        stage.writeLine("Running PHP entry script.");
        const entryFileName = entryRelativePath.split("/").pop() ?? entryRelativePath;
        this.outputTracker.beginRun();
        try {
            for (const [relativePath, fileContent] of userFiles) {
                await this.ensureDirectoryFor(phpRuntime, relativePath);
                await phpRuntime.writeFile(`/${relativePath}`, fileContent);
            }
            const entrySource = userFiles.get(entryRelativePath);
            if (entrySource === undefined) {
                throw new Error(`Entry file ${entryRelativePath} is missing from the session.`);
            }
            await phpRuntime.run(
                this.sourcePreparer.prepare(entrySource, entryFileName, programArguments),
            );
            phpRuntime.flush();
        } catch (runError) {
            this.outputTracker.flushShownInto(stage);
            throw new Error(`PHP error: ${describePhpError(runError)}`);
        } finally {
            this.outputTracker.flushShownInto(stage);
        }
    }
    private async ensureDirectoryFor(phpRuntime: PhpRuntime, relativePath: string): Promise<void> {
        const segments = relativePath.split("/").slice(0, -1);
        let currentPath = "";
        for (const segment of segments) {
            currentPath += `/${segment}`;
            try {
                await phpRuntime.mkdir(currentPath);
            } catch {
                continue;
            }
        }
    }
}
class PhpWasmPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: PhpWasmLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly entryExecutor: PhpWasmEntryExecutor;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly stdinCursor: PhpStdinCursor;
    private loadedRuntime: PhpRuntime | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.outputTracker = new ReplayOutputTracker();
        this.stdinCursor = new PhpStdinCursor();
        this.runtimeLoader = new PhpWasmLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.entryExecutor = new PhpWasmEntryExecutor(this.outputTracker);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedRuntime = await this.runtimeLoader.loadRuntime(
            stage,
            this.outputTracker,
            this.stdinCursor,
        );
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("PHP runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const phpRuntime = this.loadedRuntime;
        if (!phpRuntime) {
            throw new Error("PHP runtime not loaded. Call loadInto first.");
        }
        const fedLines: Array<string> = [];
        for (let attempt = 0; ; attempt++) {
            if (attempt > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.stdinCursor.loadLines(fedLines);
            try {
                await this.entryExecutor.executeEntry(
                    phpRuntime,
                    this.entryRelativePath,
                    this.programArguments,
                    this.userFiles,
                    stage,
                );
            } catch (runError) {
                if (!this.stdinCursor.exhausted) {
                    throw runError;
                }
            }
            if (!this.stdinCursor.exhausted) {
                break;
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
            await phpRuntime.refresh();
        }
    }
}
export { PhpEvalSourcePreparer, PhpWasmEntryExecutor, PhpStdinCursor, PhpWasmPerformer };
