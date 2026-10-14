import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
interface ZeroPerlRunResult {
    success: boolean;
    error?: string;
    exitCode: number;
}
interface ZeroPerlInstance {
    runFile(filePath: string, programArguments: ReadonlyArray<string>): Promise<ZeroPerlRunResult>;
    eval(sourceText: string, programArguments: ReadonlyArray<string>): Promise<ZeroPerlRunResult>;
    flush(): void;
    dispose(): void;
}
interface ZeroPerlFileSystem {
    addFile(filePath: string, fileContent: string): void;
}
interface ZeroPerlCreateOptions {
    fetch: (sourceUrl: string) => Promise<Response>;
    stdin: () => string;
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    fileSystem: ZeroPerlFileSystem;
}
interface ZeroPerlRuntimeModule {
    ZeroPerl: { create(options: ZeroPerlCreateOptions): Promise<ZeroPerlInstance> };
    MemoryFileSystem: new (preopenPaths: Record<string, string>) => ZeroPerlFileSystem;
}
class ZeroPerlStdinFeeder {
    private readonly fedLines: ReadonlyArray<string>;
    private lineIndex: number = 0;
    private awaitingContinuation: boolean = false;
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = [...fedLines];
    }
    nextChunk(): string {
        if (this.awaitingContinuation) {
            this.awaitingContinuation = false;
            return "";
        }
        if (this.lineIndex >= this.fedLines.length) {
            throw new TerminalInputNeededSignal();
        }
        this.awaitingContinuation = true;
        const fedLine = this.fedLines[this.lineIndex] as string;
        this.lineIndex += 1;
        return fedLine + "\n";
    }
}
class ZeroPerlRuntimeLoader {
    private readonly sessionBaseUrl: string;
    private runtimeModule: ZeroPerlRuntimeModule | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRuntimeModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading WebPerl runtime.");
        this.runtimeModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/webperl/perl-runtime.js`
        )) as ZeroPerlRuntimeModule;
    }
    async createInstance(
        fedLines: ReadonlyArray<string>,
        userFiles: ReadonlyMap<string, string>,
        outputTracker: ReplayOutputTracker,
    ): Promise<ZeroPerlInstance> {
        if (!this.runtimeModule) {
            throw new Error("WebPerl runtime not loaded. Call loadRuntimeModule first.");
        }
        const fileSystem = new this.runtimeModule.MemoryFileSystem({ "/": "" });
        for (const [relativePath, fileContent] of userFiles) {
            fileSystem.addFile(`/${relativePath}`, fileContent);
        }
        const stdinFeeder = new ZeroPerlStdinFeeder(fedLines);
        const wasmUrl = `${this.sessionBaseUrl}/runtime/webperl/zeroperl.wasm`;
        return await this.runtimeModule.ZeroPerl.create({
            fetch: () => fetch(wasmUrl),
            stdin: () => stdinFeeder.nextChunk(),
            stdout: (text) => outputTracker.appendText(text),
            stderr: (text) => outputTracker.appendText(text),
            fileSystem,
        });
    }
}
class ZeroPerlPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: ZeroPerlRuntimeLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new ZeroPerlRuntimeLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.runtimeLoader.loadRuntimeModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("WebPerl runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let perlInstance: ZeroPerlInstance | undefined;
            try {
                perlInstance = await this.runtimeLoader.createInstance(
                    fedLines,
                    this.userFiles,
                    this.outputTracker,
                );
                await perlInstance.eval('chdir "/";', []);
                const runResult = await perlInstance.runFile(`/${this.entryRelativePath}`, [
                    ...this.programArguments,
                ]);
                perlInstance.flush();
                if (!runResult.success) {
                    throw new Error(this.describeRunFailure(runResult));
                }
                break;
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (isTerminalInputNeeded(runError)) {
                    const fedLine = await stage.readLine("");
                    fedLines.push(fedLine);
                    continue;
                }
                throw new Error(this.describeZeroPerlError(runError));
            } finally {
                try {
                    perlInstance?.dispose();
                } catch {}
                this.outputTracker.flushShownInto(stage);
            }
        }
        this.outputTracker.flushShownInto(stage);
    }
    private describeRunFailure(runResult: ZeroPerlRunResult): string {
        const runMessage =
            runResult.error && runResult.error.trim().length > 0
                ? runResult.error
                : `Perl exited with code ${runResult.exitCode}.`;
        return this.describeZeroPerlError(new Error(runMessage));
    }
    private describeZeroPerlError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { ZeroPerlPerformer, ZeroPerlStdinFeeder };
