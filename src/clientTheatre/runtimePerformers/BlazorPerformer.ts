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
const MAXIMUM_REPLAY_INPUTS = 1000;
interface BlazorAttemptOptions {
    baseUrl: string;
    attemptIndex: number;
    applicationArguments: ReadonlyArray<string>;
    userFiles: Record<string, string>;
    readLine: () => string;
}
interface BlazorAttemptRunner {
    runMain(): Promise<unknown>;
}
interface BlazorGlueModule {
    loadBlazorRuntime?(): Promise<unknown>;
    createBlazorRuntimeAttempt?(options: BlazorAttemptOptions): Promise<BlazorAttemptRunner>;
}
class BlazorRuntimeLoader {
    private readonly assetLocator: RuntimeAssetLocator;
    private glueModule: BlazorGlueModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
    }
    async loadGlueModule(stage: TerminalStageController): Promise<BlazorGlueModule> {
        if (!this.glueModule) {
            stage.writeLine("Loading Blazor runtime.");
            this.glueModule = (await import(
                /* @vite-ignore */ this.assetLocator.resolveAssetUrl("runtime/blazor-loader.js")
            )) as BlazorGlueModule;
        }
        return this.glueModule;
    }
}
class BlazorPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: BlazorRuntimeLoader;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly assetLocator: RuntimeAssetLocator;
    private glueModule: BlazorGlueModule | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
        this.runtimeLoader = new BlazorRuntimeLoader(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.glueModule = await this.runtimeLoader.loadGlueModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("C# runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const entryFileName = this.entryRelativePath.split("/").pop() ?? this.entryRelativePath;
        const applicationArguments = [entryFileName, ...this.programArguments];
        const userFiles = Object.fromEntries(this.userFiles);
        stage.writeLine("Running C# main.");
        const fedLines: Array<string> = [];
        for (let attempt = 0; ; attempt++) {
            if (attempt > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let attemptLineIndex = 0;
            let terminalInputRaised = false;
            const readLine = (): string => {
                if (attemptLineIndex >= fedLines.length) {
                    terminalInputRaised = true;
                    throw new TerminalInputNeededSignal();
                }
                const fedLine = fedLines[attemptLineIndex] as string;
                attemptLineIndex++;
                return fedLine;
            };
            const originalLog = console.log;
            const originalError = console.error;
            const captureInto = (...argumentsList: Array<unknown>): void => {
                this.outputTracker.appendText(
                    argumentsList.map((argument) => String(argument)).join(" ") + "\n",
                );
            };
            console.log = captureInto;
            console.error = captureInto;
            try {
                const attemptRunner = await this.createAttemptRunner({
                    baseUrl: this.assetLocator.resolveAssetUrl("runtime"),
                    attemptIndex: attempt,
                    applicationArguments,
                    userFiles,
                    readLine,
                });
                await attemptRunner.runMain();
                break;
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (terminalInputRaised || isTerminalInputNeeded(runError)) {
                    const fedLine = await stage.readLine("");
                    fedLines.push(fedLine);
                    continue;
                }
                throw new Error(this.describeBlazorError(runError));
            } finally {
                console.log = originalLog;
                console.error = originalError;
                this.outputTracker.flushShownInto(stage);
            }
        }
        this.outputTracker.flushShownInto(stage);
    }
    private async createAttemptRunner(options: BlazorAttemptOptions): Promise<BlazorAttemptRunner> {
        const glueModule = this.glueModule;
        if (!glueModule) {
            throw new Error("Blazor runtime not loaded. Call loadInto first.");
        }
        if (typeof glueModule.createBlazorRuntimeAttempt === "function") {
            return await glueModule.createBlazorRuntimeAttempt(options);
        }
        const legacyRuntime = (await glueModule.loadBlazorRuntime?.()) as
            | { start?: () => Promise<void> }
            | undefined;
        if (!legacyRuntime || typeof legacyRuntime.start !== "function") {
            throw new Error(
                "Blazor runtime loader exposes no runnable entry point. Rebuild the session.",
            );
        }
        return {
            runMain: async () => {
                await legacyRuntime.start?.();
            },
        };
    }
    private describeBlazorError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { BlazorPerformer };
