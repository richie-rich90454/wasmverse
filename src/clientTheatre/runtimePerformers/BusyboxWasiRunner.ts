import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
interface VendoredWasiShimInput {
    read(maximumBytes: number): Uint8Array;
    readBlocking(maximumBytes: number): Uint8Array;
    pollReadable(waitMilliseconds: number | null): boolean;
}
interface VendoredWasiShimInstance {
    imports(): WebAssembly.Imports;
    bindMemory(memory: WebAssembly.Memory): void;
}
interface VendoredWasiShimModule {
    WasiShim: new (options: {
        args: ReadonlyArray<string>;
        env: Record<string, string>;
        files: Record<string, string>;
        stdout: (bytes: Uint8Array) => void;
        stderr: (bytes: Uint8Array) => void;
        input: VendoredWasiShimInput;
    }) => VendoredWasiShimInstance;
    WasiExit: new (exitCode: number) => Error;
}
interface BusyboxWasiAttempt {
    instance: WebAssembly.Instance;
    wasiShim: VendoredWasiShimInstance;
}
type BusyboxWasiArgumentBuilder = (
    entryProgramPath: string,
    programArguments: ReadonlyArray<string>,
) => ReadonlyArray<string>;
class ReplayInputAdapter implements VendoredWasiShimInput {
    private readonly fedLines: ReadonlyArray<string>;
    private readonly encoder: TextEncoder = new TextEncoder();
    private pendingBytes: Uint8Array = new Uint8Array(0);
    private fedIndex: number = 0;
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = fedLines;
    }
    read(maximumBytes: number): Uint8Array {
        this.fillPendingBytes();
        const takeLength = Math.min(maximumBytes, this.pendingBytes.length);
        const result = this.pendingBytes.slice(0, takeLength);
        this.pendingBytes = this.pendingBytes.slice(takeLength);
        return result;
    }
    readBlocking(maximumBytes: number): Uint8Array {
        const result = this.read(maximumBytes);
        if (result.length === 0) {
            throw new TerminalInputNeededSignal();
        }
        return result;
    }
    pollReadable(_waitMilliseconds: number | null): boolean {
        this.fillPendingBytes();
        return this.pendingBytes.length > 0;
    }
    private fillPendingBytes(): void {
        while (this.pendingBytes.length === 0 && this.fedIndex < this.fedLines.length) {
            this.pendingBytes = this.encoder.encode(`${this.fedLines[this.fedIndex]}\n`);
            this.fedIndex++;
        }
    }
}
class BusyboxWasiRuntimeLoader {
    private readonly sessionBaseUrl: string;
    private shimModule: VendoredWasiShimModule | undefined;
    private compiledModule: WebAssembly.Module | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRuntime(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading busybox runtime.");
        this.shimModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/busybox/wasi-sh-shim.js`
        )) as VendoredWasiShimModule;
        const wasmResponse = await fetch(`${this.sessionBaseUrl}/runtime/busybox/busybox.wasm`);
        if (!wasmResponse.ok) {
            throw new Error(`busybox.wasm request failed with status ${wasmResponse.status}.`);
        }
        this.compiledModule = await WebAssembly.compile(await wasmResponse.arrayBuffer());
    }
    async instantiateAttempt(
        wasiArguments: ReadonlyArray<string>,
        fedLines: ReadonlyArray<string>,
        userFiles: ReadonlyMap<string, string>,
        outputTracker: ReplayOutputTracker,
    ): Promise<BusyboxWasiAttempt> {
        if (!this.shimModule || !this.compiledModule) {
            throw new Error("Busybox runtime not loaded. Call loadRuntime first.");
        }
        const mountedFiles: Record<string, string> = {};
        for (const [relativePath, fileContent] of userFiles) {
            mountedFiles[`/${relativePath}`] = fileContent;
        }
        const wasiShim = new this.shimModule.WasiShim({
            args: [...wasiArguments],
            env: { PATH: "/", HOME: "/", TERM: "xterm-256color", LANG: "C.UTF-8" },
            files: mountedFiles,
            stdout: (bytes) => outputTracker.appendBytes(bytes),
            stderr: (bytes) => outputTracker.appendBytes(bytes),
            input: new ReplayInputAdapter(fedLines),
        });
        const instance = (await WebAssembly.instantiate(
            this.compiledModule,
            wasiShim.imports(),
        )) as WebAssembly.Instance;
        wasiShim.bindMemory((instance.exports as { memory: WebAssembly.Memory }).memory);
        return { instance, wasiShim };
    }
    invokeEntryPoint(attempt: BusyboxWasiAttempt, stage: TerminalStageController): void {
        const startFunction = (attempt.instance.exports as { _start?: () => void })._start;
        if (typeof startFunction !== "function") {
            throw new Error("busybox module exports no _start entry point.");
        }
        stage.writeLine("Running busybox program.");
        try {
            startFunction();
        } catch (exitError) {
            const wasiExitConstructor = (this.shimModule as unknown as VendoredWasiShimModule)
                .WasiExit;
            if (!(exitError instanceof wasiExitConstructor)) {
                throw exitError;
            }
        }
    }
}
class BusyboxWasiRunner implements TerminalPerformerContract {
    private readonly runtimeLoader: BusyboxWasiRuntimeLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private readonly argumentBuilder: BusyboxWasiArgumentBuilder;
    private readonly programLabel: string;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(
        sessionBaseUrl: string,
        programLabel: string,
        argumentBuilder: BusyboxWasiArgumentBuilder,
    ) {
        this.runtimeLoader = new BusyboxWasiRuntimeLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
        this.programLabel = programLabel;
        this.argumentBuilder = argumentBuilder;
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        try {
            await this.runtimeLoader.loadRuntime(stage);
        } catch (loadError) {
            const loadMessage = loadError instanceof Error ? loadError.message : String(loadError);
            throw new Error(`Busybox ${this.programLabel} runtime failed to load: ${loadMessage}`);
        }
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine(`Busybox ${this.programLabel} runtime ready.`);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const wasiArguments = this.argumentBuilder(
            `/${this.entryRelativePath}`,
            this.programArguments,
        );
        const fedLines: Array<string> = [];
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            try {
                const attempt = await this.runtimeLoader.instantiateAttempt(
                    wasiArguments,
                    fedLines,
                    this.userFiles,
                    this.outputTracker,
                );
                this.runtimeLoader.invokeEntryPoint(attempt, stage);
                break;
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (isTerminalInputNeeded(runError)) {
                    const line = await stage.readLine("");
                    fedLines.push(line);
                    continue;
                }
                throw new Error(this.describeError(runError));
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
        }
        this.outputTracker.flushShownInto(stage);
    }
    private describeError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { BusyboxWasiRunner };
export type { BusyboxWasiArgumentBuilder };
