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
interface DartInstantiatedApp {
    invokeMain(...applicationArguments: Array<string>): Promise<unknown> | unknown;
}
interface DartRuntimeFactory {
    instantiateAttempt(): Promise<DartInstantiatedApp>;
}
interface DartHostBridgeOptions {
    readLine: () => string;
    writeText: (text: string) => void;
    applicationArguments: ReadonlyArray<string>;
    userFiles: Record<string, string>;
}
interface DartGlueModule {
    loadDartRuntime?(baseUrl: string): Promise<DartRuntimeFactory>;
    loadDartApp?(baseUrl: string): Promise<DartInstantiatedApp>;
    installDartWasmHostBridge?(bridge: DartHostBridgeOptions): void;
}
class DartWasmRuntimeLoader {
    private readonly assetLocator: RuntimeAssetLocator;
    private glueModule: DartGlueModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
    }
    async loadGlueModule(stage: TerminalStageController): Promise<DartGlueModule> {
        if (!this.glueModule) {
            stage.writeLine("Loading Dart WASM module.");
            this.glueModule = (await import(
                /* @vite-ignore */ this.assetLocator.resolveAssetUrl("runtime/dart-loader.js")
            )) as DartGlueModule;
        }
        return this.glueModule;
    }
}
class DartWasmPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: DartWasmRuntimeLoader;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly assetLocator: RuntimeAssetLocator;
    private glueModule: DartGlueModule | undefined;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
        this.runtimeLoader = new DartWasmRuntimeLoader(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.glueModule = await this.runtimeLoader.loadGlueModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Dart WASM runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const entryFileName = this.entryRelativePath.split("/").pop() ?? this.entryRelativePath;
        const applicationArguments = [entryFileName, ...this.programArguments];
        const userFiles = Object.fromEntries(this.userFiles);
        const runtimeFactory = await this.resolveRuntimeFactory();
        stage.writeLine("Running Dart main.");
        const fedLines: Array<string> = [];
        for (let attempt = 0; ; attempt++) {
            if (attempt > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let attemptLineIndex = 0;
            let terminalInputDetected = false;
            const printedTexts: Array<string> = [];
            const readLine = (): string => {
                if (attemptLineIndex >= fedLines.length) {
                    terminalInputDetected = true;
                    throw new TerminalInputNeededSignal();
                }
                const fedLine = fedLines[attemptLineIndex] as string;
                attemptLineIndex++;
                return fedLine;
            };
            const writeText = (text: string): void => {
                if (text.includes("TERMINAL_INPUT_NEEDED")) {
                    terminalInputDetected = true;
                    return;
                }
                printedTexts.push(text);
                this.outputTracker.appendText(text);
            };
            this.installHostBridge({
                readLine,
                writeText,
                applicationArguments,
                userFiles,
            });
            try {
                const instantiatedApp = await runtimeFactory.instantiateAttempt();
                await instantiatedApp.invokeMain(...applicationArguments);
                await this.settlePendingDartTasks();
                this.outputTracker.flushShownInto(stage);
                if (terminalInputDetected) {
                    throw new TerminalInputNeededSignal();
                }
                break;
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (terminalInputDetected || isTerminalInputNeeded(runError)) {
                    const fedLine = await stage.readLine("");
                    fedLines.push(fedLine);
                    continue;
                }
                throw new Error(this.describeDartError(runError, printedTexts));
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
        }
        this.outputTracker.flushShownInto(stage);
    }
    private async resolveRuntimeFactory(): Promise<DartRuntimeFactory> {
        const glueModule = this.glueModule;
        if (!glueModule) {
            throw new Error("Dart module not loaded. Call loadInto first.");
        }
        if (typeof glueModule.loadDartRuntime === "function") {
            return await glueModule.loadDartRuntime(this.assetLocator.resolveAssetUrl("runtime"));
        }
        if (typeof glueModule.loadDartApp === "function") {
            const legacyApp = await glueModule.loadDartApp(
                this.assetLocator.resolveAssetUrl("runtime"),
            );
            let legacyAppConsumed = false;
            return {
                instantiateAttempt: async () => {
                    if (legacyAppConsumed) {
                        throw new Error(
                            "This Dart session predates replay support. Rebuild the session to answer prompts.",
                        );
                    }
                    legacyAppConsumed = true;
                    return legacyApp;
                },
            };
        }
        throw new Error(
            "Dart runtime loader exposes no runnable entry point. Rebuild the session.",
        );
    }
    private installHostBridge(options: DartHostBridgeOptions): void {
        const installBridge = this.glueModule?.installDartWasmHostBridge;
        if (typeof installBridge === "function") {
            installBridge(options);
            return;
        }
        const sharedGlobals = globalThis as Record<string, unknown>;
        sharedGlobals["dartPrint"] = (value: unknown) => options.writeText(String(value) + "\n");
        sharedGlobals["WasmVerseHost"] = {
            readLine: () => options.readLine(),
            getArguments: () => [...options.applicationArguments],
            readFile: (path: unknown) =>
                Object.prototype.hasOwnProperty.call(options.userFiles, String(path))
                    ? options.userFiles[String(path)]
                    : null,
            listFiles: () => Object.keys(options.userFiles),
        };
    }
    private async settlePendingDartTasks(): Promise<void> {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0);
        });
    }
    private describeDartError(runError: unknown, printedTexts: ReadonlyArray<string>): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        if (rawMessage.trim().length > 0 && !rawMessage.startsWith("[object")) {
            const messageLines = rawMessage
                .split("\n")
                .map((line) => line.trimEnd())
                .filter((line) => line.trim().length > 0);
            const lastLine = messageLines[messageLines.length - 1] as string;
            return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
        }
        for (let index = printedTexts.length - 1; index >= 0; index--) {
            const printedText = printedTexts[index] as string;
            const readableLine = printedText
                .split("\n")
                .map((line) => line.trim())
                .find((line) => line.length > 0 && !line.startsWith("at "));
            if (readableLine) {
                return readableLine.length > 300 ? readableLine.slice(0, 300) : readableLine;
            }
        }
        return "Dart program stopped with an unhandled error.";
    }
}
export { DartWasmPerformer };
