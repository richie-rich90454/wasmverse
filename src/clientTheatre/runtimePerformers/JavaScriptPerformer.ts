import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import { isTerminalInputNeeded } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    BrowserProgramHost,
    COMMONJS_GLOBAL_NAMES,
} from "@clientTheatre/runtimePerformers/BrowserProgramHost.ts";
import type { HostModuleRecord } from "@clientTheatre/runtimePerformers/BrowserProgramHost.ts";
import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const MODULE_CANDIDATE_SUFFIXES: ReadonlyArray<string> = ["", ".js", ".mjs"];
class JavaScriptModuleEvaluator {
    private readonly userFiles: ReadonlyMap<string, string>;
    private readonly host: BrowserProgramHost;
    private readonly moduleRecords: Map<string, HostModuleRecord> = new Map();
    constructor(userFiles: ReadonlyMap<string, string>, host: BrowserProgramHost) {
        this.userFiles = userFiles;
        this.host = host;
    }
    evaluateModule(moduleRelativePath: string): unknown {
        const existingRecord = this.moduleRecords.get(moduleRelativePath);
        if (existingRecord) {
            return existingRecord.exports;
        }
        const sourceText = this.userFiles.get(moduleRelativePath);
        if (sourceText === undefined) {
            throw new Error(`Cannot find module '${moduleRelativePath}'.`);
        }
        const moduleRecord: HostModuleRecord = { exports: {} };
        this.moduleRecords.set(moduleRelativePath, moduleRecord);
        const requireFromModule = (request: string) =>
            this.requireFrom(moduleRelativePath, request);
        const moduleFunction = new Function(...COMMONJS_GLOBAL_NAMES, sourceText);
        moduleFunction(...this.host.createCommonJsGlobals(requireFromModule, moduleRecord));
        return moduleRecord.exports;
    }
    private requireFrom(requiringPath: string, request: string): unknown {
        if (!request.startsWith("./") && !request.startsWith("../")) {
            throw new Error(`Only relative requires are supported: '${request}'.`);
        }
        const basePath = normalizeWithinRoot(joinRelativePath(directoryOf(requiringPath), request));
        for (const candidateSuffix of MODULE_CANDIDATE_SUFFIXES) {
            const candidatePath = `${basePath}${candidateSuffix}`;
            if (this.userFiles.has(candidatePath)) {
                return this.evaluateModule(candidatePath);
            }
        }
        throw new Error(`Cannot find module '${request}' from ${requiringPath}.`);
    }
}
class JavaScriptPerformer implements TerminalPerformerContract {
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("JavaScript runtime ready. Programs run in this browser tab.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const host = new BrowserProgramHost(
            this.userFiles,
            this.entryRelativePath,
            this.programArguments,
            this.outputTracker,
        );
        const fedLines: Array<string> = [];
        stage.writeLine("Running JavaScript program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            host.beginAttempt(fedLines);
            let inputWasNeeded = false;
            try {
                const evaluator = new JavaScriptModuleEvaluator(this.userFiles, host);
                const programOutcome = evaluator.evaluateModule(this.entryRelativePath);
                const outcomeShape = programOutcome as { then?: unknown } | undefined;
                if (typeof outcomeShape?.then === "function") {
                    await (programOutcome as Promise<unknown>);
                }
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeJavaScriptError(runError));
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
    private describeJavaScriptError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { JavaScriptPerformer };
