import type { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const WASMVERSE_GLOBAL_NAMES: ReadonlyArray<string> = [
    "wasmversePrint",
    "wasmverseReadLine",
    "wasmverseProgramArguments",
    "wasmverseReadFile",
    "wasmverseListFiles",
];
const CONSOLE_METHOD_NAMES: ReadonlyArray<string> = ["log", "error", "info", "warn", "debug"];
class WasmverseProgramGlobalsHost {
    private readonly userFiles: ReadonlyMap<string, string>;
    private readonly entryRelativePath: string;
    private readonly programArguments: ReadonlyArray<string>;
    private readonly outputTracker: ReplayOutputTracker;
    private fedLines: ReadonlyArray<string> = [];
    private fedIndex: number = 0;
    private savedConsoleMethods: Array<[string, (...values: Array<unknown>) => void]> = [];
    constructor(
        userFiles: ReadonlyMap<string, string>,
        entryRelativePath: string,
        programArguments: ReadonlyArray<string>,
        outputTracker: ReplayOutputTracker,
    ) {
        this.userFiles = userFiles;
        this.entryRelativePath = entryRelativePath;
        this.programArguments = programArguments;
        this.outputTracker = outputTracker;
    }
    beginAttempt(fedLines: ReadonlyArray<string>): void {
        this.fedLines = fedLines;
        this.fedIndex = 0;
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        globalRecord["wasmversePrint"] = (text: unknown) => {
            this.outputTracker.appendText(String(text) + "\n");
        };
        globalRecord["wasmverseReadLine"] = () => {
            if (this.fedIndex < this.fedLines.length) {
                const fedLine = this.fedLines[this.fedIndex] as string;
                this.fedIndex += 1;
                return fedLine;
            }
            throw new TerminalInputNeededSignal();
        };
        globalRecord["wasmverseProgramArguments"] = this.programArguments;
        globalRecord["wasmverseReadFile"] = (rawPath: unknown) => this.readFile(String(rawPath));
        globalRecord["wasmverseListFiles"] = () => [...this.userFiles.keys()].sort();
        this.routeConsoleIntoOutput();
    }
    endAttempt(): void {
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        for (const globalName of WASMVERSE_GLOBAL_NAMES) {
            delete globalRecord[globalName];
        }
        this.restoreConsole();
    }
    private readFile(rawPath: string): string {
        const normalizedPath = normalizeWithinRoot(rawPath);
        const entryDirectory = directoryOf(this.entryRelativePath);
        const candidatePaths =
            entryDirectory.length > 0
                ? [joinRelativePath(entryDirectory, normalizedPath), normalizedPath]
                : [normalizedPath];
        for (const candidatePath of candidatePaths) {
            const fileContent = this.userFiles.get(candidatePath);
            if (fileContent !== undefined) {
                return fileContent;
            }
        }
        throw new Error(`File not found: ${rawPath}`);
    }
    private routeConsoleIntoOutput(): void {
        const consoleRecord = console as unknown as Record<
            string,
            (...values: Array<unknown>) => void
        >;
        for (const methodName of CONSOLE_METHOD_NAMES) {
            const originalMethod = consoleRecord[methodName] as (...values: Array<unknown>) => void;
            this.savedConsoleMethods.push([methodName, originalMethod]);
            consoleRecord[methodName] = (...values: Array<unknown>) => {
                this.outputTracker.appendText(
                    values.map((value) => String(value)).join(" ") + "\n",
                );
            };
        }
    }
    private restoreConsole(): void {
        const consoleRecord = console as unknown as Record<
            string,
            (...values: Array<unknown>) => void
        >;
        for (const [methodName, originalMethod] of this.savedConsoleMethods) {
            consoleRecord[methodName] = originalMethod;
        }
        this.savedConsoleMethods = [];
    }
}
export { WasmverseProgramGlobalsHost };
