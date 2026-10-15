import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const KOTLIN_HOST_GLOBAL_NAMES: ReadonlyArray<string> = [
    "wasmversePrint",
    "wasmverseReadLine",
    "wasmverseProgramArguments",
    "wasmverseReadFile",
    "wasmverseListFiles",
];
const CONSOLE_METHOD_NAMES: ReadonlyArray<string> = ["log", "error", "info", "warn", "debug"];
interface KotlinLoaderModule {
    loadKotlinModule(baseUrl: string, attemptIdentifier: string): Promise<unknown>;
}
class KotlinBundleLoader {
    private readonly assetLocator: RuntimeAssetLocator;
    private loaderModule: KotlinLoaderModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
    }
    async loadLoaderModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Kotlin runtime.");
        this.loaderModule = (await import(
            /* @vite-ignore */ this.assetLocator.resolveAssetUrl("runtime/kotlin-loader.js")
        )) as KotlinLoaderModule;
    }
    async loadFreshBundle(attemptIdentifier: string): Promise<void> {
        if (!this.loaderModule) {
            throw new Error("Kotlin loader not loaded. Call loadLoaderModule first.");
        }
        await this.loaderModule.loadKotlinModule(
            this.assetLocator.resolveAssetUrl("runtime"),
            attemptIdentifier,
        );
    }
}
class KotlinJsPerformer implements TerminalPerformerContract {
    private readonly bundleLoader: KotlinBundleLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly attemptNamespace: string;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    private savedConsoleMethods: Array<[string, (...values: Array<unknown>) => void]> = [];
    constructor(sessionBaseUrl: string) {
        this.bundleLoader = new KotlinBundleLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
        this.attemptNamespace = Math.random().toString(36).slice(2);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.bundleLoader.loadLoaderModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Kotlin runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        stage.writeLine("Running Kotlin program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            this.installHostGlobals(fedLines);
            this.routeConsoleIntoOutput();
            let inputWasNeeded = false;
            try {
                await this.bundleLoader.loadFreshBundle(`${this.attemptNamespace}-${inputCount}`);
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeKotlinError(runError));
                }
                inputWasNeeded = true;
            } finally {
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
        for (const globalName of KOTLIN_HOST_GLOBAL_NAMES) {
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
    private describeKotlinError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { KotlinJsPerformer };
