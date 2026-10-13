import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
interface PhpWebModule {
    PhpWeb: new (args: Record<string, unknown>) => unknown;
}
interface PhpRuntime {
    onoutput: ((event: { detail: Array<string> }) => void) | undefined;
    onerror: ((event: { detail: Array<string> }) => void) | undefined;
    inputString(byteString: string): void;
    writeFile(path: string, data: string): Promise<void>;
    mkdir(path: string): Promise<void>;
    run(code: string): Promise<unknown>;
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
class PhpWasmLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRuntime(
        stage: TerminalStageController,
        outputTracker: ReplayOutputTracker,
    ): Promise<PhpRuntime> {
        stage.writeLine("Loading PHP runtime.");
        if (typeof navigator === "undefined" || !navigator.locks) {
            throw new Error(
                "PHP needs an HTTPS origin because the runtime serialises file writes with the Web Locks API.",
            );
        }
        try {
            const runtimeBaseUrl = `${this.sessionBaseUrl}/runtime`;
            const phpWebModule = (await import(
                /* @vite-ignore */ `${runtimeBaseUrl}/php-wasm/PhpWeb.js`
            )) as PhpWebModule;
            const phpRuntime = new phpWebModule.PhpWeb({
                version: "8.4",
                locateFile: (path: string) => {
                    if (String(path).endsWith(".wasm")) {
                        const fileName = String(path).split("/").pop() as string;
                        return `${runtimeBaseUrl}/php-wasm/${fileName}`;
                    }
                    return undefined;
                },
            }) as unknown as PhpRuntime;
            phpRuntime.onoutput = (event: { detail: Array<string> }) => {
                outputTracker.appendText(event.detail[0] ?? "");
            };
            phpRuntime.onerror = (event: { detail: Array<string> }) => {
                outputTracker.appendText(event.detail[0] ?? "");
            };
            return phpRuntime;
        } catch (loadError) {
            throw new Error(
                `PHP runtime failed to load: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
            );
        }
    }
}
class PhpWasmStdinFeeder {
    feedLines(phpRuntime: PhpRuntime, fedLines: ReadonlyArray<string>): void {
        for (const fedLine of fedLines) {
            phpRuntime.inputString(`${fedLine}\n`);
        }
    }
}
class PhpWasmEntryExecutor {
    private readonly outputTracker: ReplayOutputTracker;
    private readonly stdinFeeder: PhpWasmStdinFeeder;
    private readonly sourcePreparer: PhpEvalSourcePreparer;
    constructor(outputTracker: ReplayOutputTracker) {
        this.outputTracker = outputTracker;
        this.stdinFeeder = new PhpWasmStdinFeeder();
        this.sourcePreparer = new PhpEvalSourcePreparer();
    }
    async executeEntry(
        phpRuntime: PhpRuntime,
        entryRelativePath: string,
        programArguments: ReadonlyArray<string>,
        userFiles: ReadonlyMap<string, string>,
        fedLines: ReadonlyArray<string>,
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
            this.stdinFeeder.feedLines(phpRuntime, fedLines);
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
    private loadedRuntime: PhpRuntime | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.outputTracker = new ReplayOutputTracker();
        this.runtimeLoader = new PhpWasmLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.entryExecutor = new PhpWasmEntryExecutor(this.outputTracker);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedRuntime = await this.runtimeLoader.loadRuntime(stage, this.outputTracker);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("PHP runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedRuntime) {
            throw new Error("PHP runtime not loaded. Call loadInto first.");
        }
        await this.entryExecutor.executeEntry(
            this.loadedRuntime,
            this.entryRelativePath,
            this.programArguments,
            this.userFiles,
            [],
            stage,
        );
    }
}
export { PhpEvalSourcePreparer, PhpWasmEntryExecutor, PhpWasmPerformer };
