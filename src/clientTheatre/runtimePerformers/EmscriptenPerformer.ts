import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
import { isTerminalInputNeeded } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
interface EmscriptenFileSystemHandle {
    mkdirTree(directoryPath: string): unknown;
    writeFile(filePath: string, fileContent: string): unknown;
}
interface EmscriptenModuleHandle {
    callMain(programArguments: Array<string>): unknown;
    FS?: unknown;
}
interface EmscriptenLoaderModule {
    loadEmscriptenModule(baseUrl: string, overrides?: Record<string, unknown>): Promise<unknown>;
}
class EmscriptenFedLineCursor {
    private readonly fedLines: Array<string>;
    private lineIndex: number = 0;
    private exhausted: boolean = false;
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = [...fedLines];
    }
    get inputWasExhausted(): boolean {
        return this.exhausted;
    }
    nextLine(): string | null {
        if (this.lineIndex >= this.fedLines.length) {
            this.exhausted = true;
            return null;
        }
        const nextLine = this.fedLines[this.lineIndex] as string;
        this.lineIndex += 1;
        return nextLine;
    }
}
class EmscriptenGlueScriptLoader {
    private readonly assetLocator: RuntimeAssetLocator;
    private loaderModule: EmscriptenLoaderModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
    }
    async loadGlue(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Emscripten module.");
        this.loaderModule = (await import(
            /* @vite-ignore */ this.assetLocator.resolveAssetUrl("runtime/emscripten-loader.js")
        )) as EmscriptenLoaderModule;
    }
    async instantiateAttempt(overrides: Record<string, unknown>): Promise<EmscriptenModuleHandle> {
        if (!this.loaderModule) {
            throw new Error("Emscripten module not loaded. Call loadGlue first.");
        }
        const moduleHandle = await this.loaderModule.loadEmscriptenModule(
            this.assetLocator.resolveAssetUrl("runtime"),
            overrides,
        );
        return moduleHandle as EmscriptenModuleHandle;
    }
}
class EmscriptenUserFileWriter {
    writeUserFilesInto(
        moduleHandle: EmscriptenModuleHandle,
        userFiles: ReadonlyMap<string, string>,
    ): void {
        const fileSystem = moduleHandle.FS as Partial<EmscriptenFileSystemHandle> | undefined;
        if (
            !fileSystem ||
            typeof fileSystem.mkdirTree !== "function" ||
            typeof fileSystem.writeFile !== "function"
        ) {
            return;
        }
        for (const [relativePath, fileContent] of userFiles) {
            const directorySegments = relativePath.split("/").slice(0, -1);
            const directoryPath =
                directorySegments.length > 0 ? `/${directorySegments.join("/")}` : "/";
            fileSystem.mkdirTree(directoryPath);
            fileSystem.writeFile(`/${relativePath}`, fileContent);
        }
    }
}
class EmscriptenEntryInvoker {
    invokeEntry(
        moduleHandle: EmscriptenModuleHandle,
        programArguments: ReadonlyArray<string>,
    ): number | undefined {
        const exitCode = moduleHandle.callMain([...programArguments]);
        return typeof exitCode === "number" ? exitCode : undefined;
    }
}
class EmscriptenPerformer implements TerminalPerformerContract {
    private readonly glueScriptLoader: EmscriptenGlueScriptLoader;
    private readonly userFileWriter: EmscriptenUserFileWriter;
    private readonly entryInvoker: EmscriptenEntryInvoker;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly assetLocator: RuntimeAssetLocator;
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
        this.glueScriptLoader = new EmscriptenGlueScriptLoader(sessionBaseUrl);
        this.userFileWriter = new EmscriptenUserFileWriter();
        this.entryInvoker = new EmscriptenEntryInvoker();
        this.outputTracker = new ReplayOutputTracker();
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.glueScriptLoader.loadGlue(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Emscripten runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            const inputCursor = new EmscriptenFedLineCursor(fedLines);
            try {
                const moduleHandle = await this.glueScriptLoader.instantiateAttempt(
                    this.buildFactoryOverrides(inputCursor),
                );
                this.userFileWriter.writeUserFilesInto(moduleHandle, this.userFiles);
                const exitCode = this.invokeWithPromptOverride(moduleHandle, inputCursor);
                if (typeof exitCode === "number" && exitCode !== 0) {
                    throw new Error(`Program exited with code ${exitCode}.`);
                }
                if (!inputCursor.inputWasExhausted) {
                    break;
                }
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (!isTerminalInputNeeded(runError) && !inputCursor.inputWasExhausted) {
                    throw new Error(this.describeEmscriptenError(runError));
                }
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
        this.outputTracker.flushShownInto(stage);
    }
    private invokeWithPromptOverride(
        moduleHandle: EmscriptenModuleHandle,
        inputCursor: EmscriptenFedLineCursor,
    ): number | undefined {
        const sharedGlobals = globalThis as Record<string, unknown>;
        const previousPrompt = sharedGlobals["prompt"];
        sharedGlobals["prompt"] = () => inputCursor.nextLine();
        try {
            return this.entryInvoker.invokeEntry(moduleHandle, this.programArguments);
        } finally {
            if (previousPrompt === undefined) {
                delete sharedGlobals["prompt"];
            } else {
                sharedGlobals["prompt"] = previousPrompt;
            }
        }
    }
    private buildFactoryOverrides(inputCursor: EmscriptenFedLineCursor): Record<string, unknown> {
        return {
            print: (text: unknown) => this.appendShownText(inputCursor, text),
            printErr: (text: unknown) => this.appendShownText(inputCursor, text),
            instantiateWasm: (
                importObject: WebAssembly.Imports,
                successCallback: (
                    instance: WebAssembly.Instance,
                    module: WebAssembly.Module,
                ) => void,
            ) => {
                void fetch(this.assetLocator.resolveAssetUrl("runtime/app.wasm"))
                    .then((wasmResponse) => wasmResponse.arrayBuffer())
                    .then((wasmBytes) => WebAssembly.instantiate(wasmBytes, importObject))
                    .then(({ instance, module }) => successCallback(instance, module));
                return {};
            },
        };
    }
    private appendShownText(inputCursor: EmscriptenFedLineCursor, text: unknown): void {
        if (!inputCursor.inputWasExhausted) {
            this.outputTracker.appendText(`${text}\n`);
        }
    }
    private describeEmscriptenError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { EmscriptenFedLineCursor, EmscriptenPerformer };
