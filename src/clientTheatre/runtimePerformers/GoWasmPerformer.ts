import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { isTerminalInputNeeded } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import { GoWasmFileSystemShim } from "@clientTheatre/runtimePerformers/GoWasmFileSystemShim.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
interface GoRunnerHandle {
    argv: Array<string>;
    env: Record<string, string>;
    exit(code: number): void;
    importObject: WebAssembly.Imports;
    run(instance: WebAssembly.Instance): Promise<void>;
}
interface GoRunnerLoaderModule {
    createGoRunner(): GoRunnerHandle;
}
class GoWasmExecScriptLoader {
    private readonly sessionBaseUrl: string;
    private loaderModule: GoRunnerLoaderModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRunnerFactory(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Go WASM runner.");
        this.loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/go-loader.js`
        )) as GoRunnerLoaderModule;
    }
    createRunner(): GoRunnerHandle {
        if (!this.loaderModule) {
            throw new Error("Go runner not loaded. Call loadRunnerFactory first.");
        }
        return this.loaderModule.createGoRunner();
    }
}
class GoWasmModuleLoader {
    private readonly sessionBaseUrl: string;
    private compiledModule: WebAssembly.Module | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Go WASM module.");
        const response = await fetch(`${this.sessionBaseUrl}/runtime/app.wasm`);
        if (!response.ok) {
            throw new Error(`app.wasm request failed with status ${response.status}.`);
        }
        this.compiledModule = await WebAssembly.compile(await response.arrayBuffer());
    }
    async instantiateWith(importObject: WebAssembly.Imports): Promise<WebAssembly.Instance> {
        if (!this.compiledModule) {
            throw new Error("Go module not loaded. Call loadModule first.");
        }
        return await WebAssembly.instantiate(this.compiledModule, importObject);
    }
}
class GoWasmPerformer implements TerminalPerformerContract {
    private readonly execScriptLoader: GoWasmExecScriptLoader;
    private readonly moduleLoader: GoWasmModuleLoader;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly userFilesClient: SessionUserFilesClient;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.execScriptLoader = new GoWasmExecScriptLoader(sessionBaseUrl);
        this.moduleLoader = new GoWasmModuleLoader(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.execScriptLoader.loadRunnerFactory(stage);
        await this.moduleLoader.loadModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Go runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const entryFileName = this.entryRelativePath.split("/").pop() ?? this.entryRelativePath;
        const goArguments = [entryFileName, ...this.programArguments];
        const fedLines: Array<string> = [];
        stage.writeLine("Running Go WASM module.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            const fileSystemShim = new GoWasmFileSystemShim(this.outputTracker);
            fileSystemShim.seedUserFiles(this.userFiles);
            for (const fedLine of fedLines) {
                fileSystemShim.feedLine(fedLine);
            }
            fileSystemShim.installAsGlobalFileSystem();
            const goRunner = this.execScriptLoader.createRunner();
            goRunner.argv = goArguments;
            let exitCode = 0;
            goRunner.exit = (code: number) => {
                exitCode = code;
            };
            try {
                const instance = await this.moduleLoader.instantiateWith(goRunner.importObject);
                await goRunner.run(instance);
                if (!fileSystemShim.inputWasExhausted) {
                    if (exitCode !== 0) {
                        throw new Error(`Program exited with code ${exitCode}.`);
                    }
                    break;
                }
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (!fileSystemShim.inputWasExhausted && !isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeGoError(runError));
                }
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
        this.outputTracker.flushShownInto(stage);
    }
    private describeGoError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { GoWasmPerformer };
