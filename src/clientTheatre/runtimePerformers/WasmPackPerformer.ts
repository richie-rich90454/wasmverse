import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
interface WasmPackLoaderModule {
    loadWasmPackModule(baseUrl: string, attempt?: number): Promise<Record<string, unknown>>;
}
class WasmPackFedLineReader {
    private readonly fedLines: ReadonlyArray<string>;
    private lineIndex: number = 0;
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = fedLines;
    }
    readLine(): string {
        if (this.lineIndex >= this.fedLines.length) {
            throw new TerminalInputNeededSignal();
        }
        const fedLine = this.fedLines[this.lineIndex] as string;
        this.lineIndex++;
        return fedLine;
    }
}
class WasmPackRunGlobals {
    install(
        fedLineReader: WasmPackFedLineReader,
        programArguments: ReadonlyArray<string>,
        outputTracker: ReplayOutputTracker,
    ): void {
        const sharedGlobals = globalThis as Record<string, unknown>;
        sharedGlobals.__wasmverseWriteLine = (text: string) => {
            outputTracker.appendText(text);
        };
        sharedGlobals.__wasmverseReadLine = () => fedLineReader.readLine();
        sharedGlobals.__wasmverseProgramArgumentCount = programArguments.length;
        sharedGlobals.__wasmverseProgramArgument = (index: number) => programArguments[index] ?? "";
    }
    remove(): void {
        const sharedGlobals = globalThis as Record<string, unknown>;
        delete sharedGlobals.__wasmverseWriteLine;
        delete sharedGlobals.__wasmverseReadLine;
        delete sharedGlobals.__wasmverseProgramArgumentCount;
        delete sharedGlobals.__wasmverseProgramArgument;
    }
}
class WasmPackGlueModuleLoader {
    private readonly sessionBaseUrl: string;
    private loaderModule: WasmPackLoaderModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadModuleForAttempt(
        stage: TerminalStageController,
        attempt: number,
    ): Promise<Record<string, unknown>> {
        if (!this.loaderModule) {
            stage.writeLine("Loading WASM module.");
            this.loaderModule = (await import(
                /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/wasm-pack-loader.js`
            )) as WasmPackLoaderModule;
        }
        return this.loaderModule.loadWasmPackModule(`${this.sessionBaseUrl}/runtime`, attempt);
    }
}
class WasmPackExportedFunctionInvoker {
    async invokeMain(
        module: Record<string, unknown>,
        outputTracker: ReplayOutputTracker,
        stage: TerminalStageController,
    ): Promise<void> {
        const mainFunction = module["main"] ?? module["run"];
        if (typeof mainFunction !== "function") {
            stage.writeLine("WASM module loaded. No main export found.");
            return;
        }
        stage.writeLine("Running WASM main export.");
        const returnedValue = await (mainFunction as () => Promise<unknown> | unknown)();
        if (typeof returnedValue === "string" && returnedValue.length > 0) {
            outputTracker.appendText(returnedValue);
        }
    }
}
class WasmPackPerformer implements TerminalPerformerContract {
    private readonly glueModuleLoader: WasmPackGlueModuleLoader;
    private readonly functionInvoker: WasmPackExportedFunctionInvoker;
    private readonly runGlobals: WasmPackRunGlobals;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly userFilesClient: SessionUserFilesClient;
    private programArguments: ReadonlyArray<string> = [];
    constructor(sessionBaseUrl: string) {
        this.glueModuleLoader = new WasmPackGlueModuleLoader(sessionBaseUrl);
        this.functionInvoker = new WasmPackExportedFunctionInvoker();
        this.runGlobals = new WasmPackRunGlobals();
        this.outputTracker = new ReplayOutputTracker();
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.programArguments = fetchedFiles.programArguments;
        stage.writeLine("WASM runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            const fedLineReader = new WasmPackFedLineReader(fedLines);
            this.runGlobals.install(fedLineReader, this.programArguments, this.outputTracker);
            try {
                const module = await this.glueModuleLoader.loadModuleForAttempt(stage, inputCount);
                await this.functionInvoker.invokeMain(module, this.outputTracker, stage);
                break;
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (isTerminalInputNeeded(runError)) {
                    const fedLine = await stage.readLine("");
                    fedLines.push(fedLine);
                    continue;
                }
                throw new Error(this.describeWasmPackError(runError));
            } finally {
                this.runGlobals.remove();
                this.outputTracker.flushShownInto(stage);
            }
        }
        this.outputTracker.flushShownInto(stage);
    }
    private describeWasmPackError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { WasmPackFedLineReader, WasmPackPerformer };
