import type { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const PROGRAM_GLOBAL_NAMES: ReadonlyArray<string> = [
    "print",
    "readLine",
    "programArguments",
    "readFile",
    "listFiles",
];
const COMMONJS_GLOBAL_NAMES: ReadonlyArray<string> = [
    ...PROGRAM_GLOBAL_NAMES,
    "require",
    "module",
    "exports",
];
const CONSOLE_METHOD_NAMES: ReadonlyArray<string> = ["log", "error", "info", "warn", "debug"];
interface HostModuleRecord {
    exports: unknown;
}
class BrowserProgramHost {
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
        this.routeConsoleIntoOutput();
    }
    endAttempt(): void {
        this.restoreConsole();
    }
    createCommonJsGlobals(
        requireFunction: (request: string) => unknown,
        moduleRecord: HostModuleRecord,
    ): Array<unknown> {
        return [
            (...values: Array<unknown>) => this.print(...values),
            (promptText: string = "") => this.readLine(promptText),
            this.programArguments,
            (rawPath: string) => this.readFile(rawPath),
            () => this.listFiles(),
            requireFunction,
            moduleRecord,
            moduleRecord.exports,
        ];
    }
    installAsGlobalProperties(): void {
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        globalRecord["print"] = (...values: Array<unknown>) => this.print(...values);
        globalRecord["readLine"] = (promptText: string = "") => this.readLine(promptText);
        globalRecord["programArguments"] = this.programArguments;
        globalRecord["readFile"] = (rawPath: string) => this.readFile(rawPath);
        globalRecord["listFiles"] = () => this.listFiles();
    }
    removeFromGlobalProperties(): void {
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        for (const globalName of PROGRAM_GLOBAL_NAMES) {
            delete globalRecord[globalName];
        }
    }
    private print(...values: Array<unknown>): void {
        this.outputTracker.appendText(values.map((value) => String(value)).join(" ") + "\n");
    }
    private readLine(promptText: string = ""): string {
        if (this.fedIndex < this.fedLines.length) {
            const fedLine = this.fedLines[this.fedIndex] as string;
            this.fedIndex += 1;
            return fedLine;
        }
        if (promptText.length > 0) {
            this.outputTracker.appendText(promptText);
        }
        throw new TerminalInputNeededSignal();
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
    private listFiles(): Array<string> {
        return [...this.userFiles.keys()].sort();
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
export { BrowserProgramHost, COMMONJS_GLOBAL_NAMES, PROGRAM_GLOBAL_NAMES };
export type { HostModuleRecord };
