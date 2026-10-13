import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { ConsoleStdout, WASI } from "@bjorn3/browser_wasi_shim";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    ReplayableStdinFile,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import { buildPreopenDirectory } from "@clientTheatre/runtimePerformers/UserFileInodeTree.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
interface WasiInstanceHandle {
    instance: WebAssembly.Instance;
    wasiInstance: WASI;
}
class WasiWasmModuleLoader {
    private readonly sessionBaseUrl: string;
    private compiledModule: WebAssembly.Module | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading WASI module.");
        const response = await fetch(`${this.sessionBaseUrl}/runtime/app.wasm`);
        if (!response.ok) {
            throw new Error(`app.wasm request failed with status ${response.status}.`);
        }
        this.compiledModule = await WebAssembly.compile(await response.arrayBuffer());
    }
    async instantiateAttempt(
        wasiArguments: ReadonlyArray<string>,
        fedLines: ReadonlyArray<string>,
        userFiles: ReadonlyMap<string, string>,
        outputTracker: ReplayOutputTracker,
    ): Promise<WasiInstanceHandle> {
        if (!this.compiledModule) {
            throw new Error("WASI module not loaded. Call loadModule first.");
        }
        const stdinFile = new ReplayableStdinFile();
        for (const fedLine of fedLines) {
            stdinFile.feedLine(fedLine);
        }
        const stdoutFile = new ConsoleStdout((bytes: Uint8Array) =>
            outputTracker.appendBytes(bytes),
        );
        const stderrFile = new ConsoleStdout((bytes: Uint8Array) =>
            outputTracker.appendBytes(bytes),
        );
        const rootDirectory = buildPreopenDirectory(userFiles);
        const wasiInstance = new WASI(
            [...wasiArguments],
            [],
            [stdinFile, stdoutFile, stderrFile, rootDirectory],
            { debug: false },
        );
        const instance = (await WebAssembly.instantiate(
            this.compiledModule,
            wasiInstance.wasiImport as unknown as WebAssembly.Imports,
        )) as WebAssembly.Instance;
        return { instance, wasiInstance };
    }
}
class WasiEntryInvoker {
    invoke(instanceHandle: WasiInstanceHandle, stage: TerminalStageController): void {
        const instanceExports = instanceHandle.instance.exports as Record<string, unknown>;
        if (typeof instanceExports["_start"] === "function") {
            stage.writeLine("Running WASI entry point.");
            const exitCode = instanceHandle.wasiInstance.start(
                instanceHandle.instance as unknown as Parameters<WASI["start"]>[0],
            );
            if (exitCode !== 0) {
                throw new Error(`Program exited with code ${exitCode}.`);
            }
            return;
        }
        instanceHandle.wasiInstance.initialize(
            instanceHandle.instance as unknown as Parameters<WASI["initialize"]>[0],
        );
        const mainFunction = instanceExports["main"] as (() => unknown) | undefined;
        if (typeof mainFunction !== "function") {
            throw new Error("WASI module exposes neither a _start nor a main export.");
        }
        stage.writeLine("Running WASI main export.");
        mainFunction();
    }
}
class WasiWasmPerformer implements TerminalPerformerContract {
    private readonly moduleLoader: WasiWasmModuleLoader;
    private readonly entryInvoker: WasiEntryInvoker;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly userFilesClient: SessionUserFilesClient;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.moduleLoader = new WasiWasmModuleLoader(sessionBaseUrl);
        this.entryInvoker = new WasiEntryInvoker();
        this.outputTracker = new ReplayOutputTracker();
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.moduleLoader.loadModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("WASI runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const entryFileName = this.entryRelativePath.split("/").pop() ?? this.entryRelativePath;
        const wasiArguments = [entryFileName, ...this.programArguments];
        const fedLines: Array<string> = [];
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            try {
                const instanceHandle = await this.moduleLoader.instantiateAttempt(
                    wasiArguments,
                    fedLines,
                    this.userFiles,
                    this.outputTracker,
                );
                this.entryInvoker.invoke(instanceHandle, stage);
                break;
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (isTerminalInputNeeded(runError)) {
                    const line = await stage.readLine("");
                    fedLines.push(line);
                    continue;
                }
                throw new Error(this.describeWasiError(runError));
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
        }
        this.outputTracker.flushShownInto(stage);
    }
    private describeWasiError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { WasiWasmPerformer };
