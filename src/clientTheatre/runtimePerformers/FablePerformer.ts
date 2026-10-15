import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
import { isTerminalInputNeeded } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import { WasmverseProgramGlobalsHost } from "@clientTheatre/runtimePerformers/WasmverseProgramGlobalsHost.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
interface FablePerformerLoaderModule {
    loadFableModule(baseUrl: string, attemptIdentifier: string): Promise<unknown>;
}
class FablePerformer implements TerminalPerformerContract {
    private readonly assetLocator: RuntimeAssetLocator;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly attemptNamespace: string;
    private loaderModule: FablePerformerLoaderModule | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
        this.attemptNamespace = Math.random().toString(36).slice(2);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading F# (Fable) runtime.");
        this.loaderModule = (await import(
            /* @vite-ignore */ this.assetLocator.resolveAssetUrl("runtime/fable-loader.js")
        )) as FablePerformerLoaderModule;
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("F# (Fable) runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const host = new WasmverseProgramGlobalsHost(
            this.userFiles,
            this.entryRelativePath,
            this.programArguments,
            this.outputTracker,
        );
        const fedLines: Array<string> = [];
        stage.writeLine("Running F# program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            host.beginAttempt(fedLines);
            let inputWasNeeded = false;
            try {
                if (!this.loaderModule) {
                    throw new Error("F# (Fable) loader not loaded. Call loadInto first.");
                }
                await this.loaderModule.loadFableModule(
                    this.assetLocator.resolveAssetUrl("runtime"),
                    `${this.attemptNamespace}-${inputCount}`,
                );
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeFableError(runError));
                }
                inputWasNeeded = true;
            } finally {
                host.endAttempt();
                this.outputTracker.flushShownInto(stage);
            }
            if (!inputWasNeeded) {
                break;
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
    }
    private describeFableError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { FablePerformer };
