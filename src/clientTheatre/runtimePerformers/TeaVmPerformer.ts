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
type TeaVmExportedMain = (
    applicationArguments?: ReadonlyArray<string>,
) => Promise<unknown> | unknown;
interface TeaVmGlueModule {
    loadTeaVmModule(
        baseUrl: string,
        writeLine: (line: string) => void,
        writeText?: (text: string) => void,
        attempt?: number,
        readLine?: () => string,
    ): Promise<Record<string, unknown>>;
}
class TeaVmGlueModuleLoader {
    private readonly assetLocator: RuntimeAssetLocator;
    private glueModule: TeaVmGlueModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
    }
    async loadGlueModule(stage: TerminalStageController): Promise<TeaVmGlueModule> {
        if (!this.glueModule) {
            stage.writeLine("Loading TeaVM module.");
            this.glueModule = (await import(
                /* @vite-ignore */ this.assetLocator.resolveAssetUrl("runtime/teavm-loader.js")
            )) as TeaVmGlueModule;
        }
        return this.glueModule;
    }
    async importAttempt(
        glueModule: TeaVmGlueModule,
        attempt: number,
        outputTracker: ReplayOutputTracker,
        readLine?: () => string,
    ): Promise<Record<string, unknown>> {
        return glueModule.loadTeaVmModule(
            this.assetLocator.resolveAssetUrl("runtime"),
            (line) => outputTracker.appendText(line + "\n"),
            (text) => outputTracker.appendText(text),
            attempt,
            readLine,
        );
    }
}
class TeaVmExportedMainInvoker {
    async invokeMain(
        module: Record<string, unknown>,
        applicationArguments: ReadonlyArray<string>,
    ): Promise<void> {
        const mainFunction = module["main"] as TeaVmExportedMain | undefined;
        if (typeof mainFunction !== "function") {
            throw new Error("TeaVM module loaded. No main export found.");
        }
        await mainFunction(applicationArguments);
    }
}
class TeaVmPerformer implements TerminalPerformerContract {
    private readonly glueModuleLoader: TeaVmGlueModuleLoader;
    private readonly mainInvoker: TeaVmExportedMainInvoker;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly userFilesClient: SessionUserFilesClient;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    constructor(sessionBaseUrl: string) {
        this.glueModuleLoader = new TeaVmGlueModuleLoader(sessionBaseUrl);
        this.mainInvoker = new TeaVmExportedMainInvoker();
        this.outputTracker = new ReplayOutputTracker();
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.glueModuleLoader.loadGlueModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        stage.writeLine("TeaVM runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const entryFileName = this.entryRelativePath.split("/").pop() ?? this.entryRelativePath;
        const applicationArguments = [entryFileName, ...this.programArguments];
        const glueModule = await this.glueModuleLoader.loadGlueModule(stage);
        stage.writeLine("Running TeaVM main.");
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
            try {
                const module = await this.glueModuleLoader.importAttempt(
                    glueModule,
                    attempt,
                    this.outputTracker,
                    readLine,
                );
                await this.mainInvoker.invokeMain(module, applicationArguments);
                if (!this.attemptInputWasExhausted()) {
                    break;
                }
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (terminalInputRaised || isTerminalInputNeeded(runError)) {
                    const fedLine = await stage.readLine("");
                    fedLines.push(fedLine);
                    continue;
                }
                throw new Error(this.describeTeaVmError(runError));
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
        this.outputTracker.flushShownInto(stage);
    }
    private attemptInputWasExhausted(): boolean {
        const attemptState = (globalThis as Record<string, unknown>)["$wasmverseAttemptState"] as
            | { exhausted?: boolean }
            | undefined;
        return attemptState?.exhausted === true;
    }
    private describeTeaVmError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { TeaVmPerformer };
