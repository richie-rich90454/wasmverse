import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import { CherryModuleLinker } from "@clientTheatre/runtimePerformers/CherryModuleLinker.ts";
import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const CLOJURESCRIPT_RUNTIME_DIRECTORY_NAME = "clojurescript";
const CLJS_HOST_GLOBAL_NAMES: ReadonlyArray<string> = [
    "wasmversePrint",
    "wasmverseReadLine",
    "wasmverseProgramArguments",
    "wasmverseReadFile",
    "wasmverseListFiles",
];
const CONSOLE_METHOD_NAMES: ReadonlyArray<string> = ["log", "error", "info", "warn", "debug"];
interface CherryCompilerModule {
    compileString(sourceText: string): string;
}
class CherryCompilerLoader {
    private readonly sessionBaseUrl: string;
    private compilerModule: CherryCompilerModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl.replace(/\/+$/, "");
    }
    get runtimeBaseUrl(): string {
        return `${this.sessionBaseUrl}/runtime/${CLOJURESCRIPT_RUNTIME_DIRECTORY_NAME}`;
    }
    async loadCompilerModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading ClojureScript compiler.");
        this.compilerModule = (await import(
            /* @vite-ignore */ `${this.runtimeBaseUrl}/lib/compiler.js`
        )) as CherryCompilerModule;
    }
    compileModule(sourceText: string): string {
        if (!this.compilerModule) {
            throw new Error("Cherry compiler not loaded. Call loadCompilerModule first.");
        }
        return this.compilerModule.compileString(sourceText);
    }
}
class CherryCljsPerformer implements TerminalPerformerContract {
    private readonly compilerLoader: CherryCompilerLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    private compiledModules: Map<string, string> = new Map();
    private savedConsoleMethods: Array<[string, (...values: Array<unknown>) => void]> = [];
    constructor(sessionBaseUrl: string) {
        this.compilerLoader = new CherryCompilerLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.compilerLoader.loadCompilerModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        const entrySourceText = this.userFiles.get(this.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(`Entry script ${this.entryRelativePath} is missing from the session.`);
        }
        this.compiledModules = new Map();
        for (const [relativePath, sourceText] of this.userFiles) {
            if (relativePath.endsWith(".cljs")) {
                this.compiledModules.set(
                    relativePath,
                    this.compilerLoader.compileModule(sourceText),
                );
            }
        }
        stage.writeLine("ClojureScript runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        stage.writeLine("Running ClojureScript program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            this.installHostGlobals(fedLines);
            this.routeConsoleIntoOutput();
            const activeBlobUrls: Array<string> = [];
            let inputWasNeeded = false;
            try {
                const entryModuleUrl = this.assembleModuleBlobUrl(
                    this.entryRelativePath,
                    activeBlobUrls,
                );
                await import(/* @vite-ignore */ entryModuleUrl);
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeCljsError(runError));
                }
                inputWasNeeded = true;
            } finally {
                for (const blobUrl of activeBlobUrls) {
                    URL.revokeObjectURL(blobUrl);
                }
                this.restoreConsole();
                this.removeHostGlobals();
                this.outputTracker.flushShownInto(stage);
            }
            if (!inputWasNeeded) {
                break;
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
    }
    private assembleModuleBlobUrl(
        relativePath: string,
        activeBlobUrls: Array<string>,
        resolvedBlobUrls: Map<string, string> = new Map(),
    ): string {
        const existingBlobUrl = resolvedBlobUrls.get(relativePath);
        if (existingBlobUrl !== undefined) {
            return existingBlobUrl;
        }
        const linker = new CherryModuleLinker(
            this.compiledModules,
            this.entryRelativePath,
            this.compilerLoader.runtimeBaseUrl,
        );
        const rewrittenSource = linker.rewriteModule(relativePath, (specifier) => {
            if (linker.isRuntimeSpecifier(specifier)) {
                return linker.runtimeSpecifierFor(specifier);
            }
            if (linker.isLocalSpecifier(specifier)) {
                const dependencyPath = linker.resolveLocalModule(specifier, relativePath);
                return this.assembleModuleBlobUrl(dependencyPath, activeBlobUrls, resolvedBlobUrls);
            }
            return specifier;
        });
        const blobUrl = URL.createObjectURL(
            new Blob([rewrittenSource], { type: "text/javascript" }),
        );
        activeBlobUrls.push(blobUrl);
        resolvedBlobUrls.set(relativePath, blobUrl);
        return blobUrl;
    }
    private installHostGlobals(fedLines: ReadonlyArray<string>): void {
        let fedIndex = 0;
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        globalRecord["wasmversePrint"] = (text: unknown) => {
            this.outputTracker.appendText(String(text) + "\n");
        };
        globalRecord["wasmverseReadLine"] = () => {
            if (fedIndex < fedLines.length) {
                const fedLine = fedLines[fedIndex] as string;
                fedIndex += 1;
                return fedLine;
            }
            throw new TerminalInputNeededSignal();
        };
        globalRecord["wasmverseProgramArguments"] = this.programArguments;
        globalRecord["wasmverseReadFile"] = (rawPath: unknown) => this.readFile(String(rawPath));
        globalRecord["wasmverseListFiles"] = () => [...this.userFiles.keys()].sort();
    }
    private removeHostGlobals(): void {
        const globalRecord = globalThis as unknown as Record<string, unknown>;
        for (const globalName of CLJS_HOST_GLOBAL_NAMES) {
            delete globalRecord[globalName];
        }
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
    private describeCljsError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { CherryCljsPerformer };
