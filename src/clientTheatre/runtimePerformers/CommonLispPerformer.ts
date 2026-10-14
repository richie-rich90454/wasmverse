import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const COMMON_LISP_RUNTIME_DIRECTORY_NAME = "commonlisp";
const JSCL_EXPORT_FILE_NAME = "jscl.js";
interface JsclSymbol {
    value?: unknown;
    fvalue?: unknown;
}
interface JsclInternals {
    intern(name: string, packageName?: string): JsclSymbol;
    symbolValue(symbol: JsclSymbol): unknown;
    pv(value?: unknown): unknown;
    js_to_lisp(value: unknown): unknown;
}
interface JsclNamespace {
    evaluateString(sourceText: string): unknown;
    internals: JsclInternals;
}
type JsclCallable = (values: unknown, ...parameters: Array<unknown>) => unknown;
class JsclRuntimeLoader {
    private readonly sessionBaseUrl: string;
    private runtimeNamespace: JsclNamespace | undefined;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl.replace(/\/+$/, "");
    }
    async loadRuntimeModule(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Common Lisp runtime.");
        await new Promise<void>((resolveLoad, rejectLoad) => {
            const scriptElement = document.createElement("script");
            scriptElement.src = `${this.sessionBaseUrl}/runtime/${COMMON_LISP_RUNTIME_DIRECTORY_NAME}/${JSCL_EXPORT_FILE_NAME}`;
            scriptElement.addEventListener("load", () => resolveLoad(), { once: true });
            scriptElement.addEventListener(
                "error",
                () => rejectLoad(new Error("Common Lisp runtime file failed to load.")),
                { once: true },
            );
            document.head.appendChild(scriptElement);
        });
        const runtimeNamespace = (window as unknown as { jscl?: JsclNamespace }).jscl;
        if (!runtimeNamespace) {
            throw new Error("Common Lisp runtime did not expose the jscl namespace.");
        }
        this.runtimeNamespace = runtimeNamespace;
    }
    get namespace(): JsclNamespace {
        if (!this.runtimeNamespace) {
            throw new Error("Common Lisp runtime not loaded. Call loadRuntimeModule first.");
        }
        return this.runtimeNamespace;
    }
}
class JsclFedCharacterReader {
    private readonly fedLines: ReadonlyArray<string>;
    private fedIndex = 0;
    private readonly characterQueue: Array<string> = [];
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = fedLines;
    }
    readCharacter(): string {
        while (this.characterQueue.length === 0) {
            const fedLine = this.fedLines[this.fedIndex];
            if (fedLine === undefined) {
                throw new TerminalInputNeededSignal();
            }
            this.fedIndex += 1;
            this.characterQueue.push(...fedLine, "\n");
        }
        return this.characterQueue.shift() as string;
    }
}
class CommonLispPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: JsclRuntimeLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new JsclRuntimeLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.runtimeLoader.loadRuntimeModule(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        const entrySourceText = this.userFiles.get(this.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(`Entry program ${this.entryRelativePath} is missing from the session.`);
        }
        this.defineProgramArguments();
        stage.writeLine("Common Lisp runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        stage.writeLine("Running Common Lisp program.");
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            try {
                this.installHostStreams(fedLines);
                const runtimeError = this.evaluateProgram();
                if (runtimeError !== undefined) {
                    if (!isTerminalInputNeeded(runtimeError)) {
                        throw new Error(this.describeCommonLispError(runtimeError));
                    }
                    inputWasNeeded = true;
                }
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
            if (!inputWasNeeded) {
                break;
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
    }
    private defineProgramArguments(): void {
        const namespace = this.runtimeLoader.namespace;
        const argumentList = this.programArguments
            .map((argument) => this.escapeLispString(argument))
            .join(" ");
        namespace.evaluateString(
            `(defparameter *wasmverse-arguments* (list ${argumentList}))`,
        );
    }
    private installHostStreams(fedLines: ReadonlyArray<string>): void {
        const namespace = this.runtimeLoader.namespace;
        const internals = namespace.internals;
        const keyword = (name: string) => internals.intern(name, "KEYWORD");
        const makeStream = internals.intern("MAKE-STREAM", "JSCL").fvalue as JsclCallable;
        const outputStream = makeStream(
            internals.pv,
            keyword("WRITE-FN"),
            (_values: unknown, text: unknown) => {
                this.outputTracker.appendText(String(text));
                return internals.pv();
            },
        );
        internals.intern("*STANDARD-OUTPUT*").value = outputStream;
        internals.intern("*ERROR-OUTPUT*").value = outputStream;
        internals.intern("*TRACE-OUTPUT*").value = outputStream;
        const fedCharacterReader = new JsclFedCharacterReader(fedLines);
        const inputStream = makeStream(
            internals.pv,
            keyword("READ-CHAR-FN"),
            (_values: unknown, _eofError: unknown) => fedCharacterReader.readCharacter(),
        );
        internals.intern("*STANDARD-INPUT*").value = inputStream;
        internals.intern("LOAD").fvalue = (_values: unknown, requestedPath: unknown) => {
            this.evaluateSourceText(this.readUserFile(String(requestedPath)));
            return internals.pv();
        };
        internals.intern("WASMVERSE-READ-FILE").fvalue = (
            _values: unknown,
            requestedPath: unknown,
        ) => {
            return internals.js_to_lisp(this.readUserFile(String(requestedPath)));
        };
    }
    private evaluateProgram(): unknown {
        const entrySourceText = this.userFiles.get(this.entryRelativePath) as string;
        return this.evaluateSourceText(entrySourceText);
    }
    private evaluateSourceText(sourceText: string): unknown {
        const namespace = this.runtimeLoader.namespace;
        try {
            namespace.evaluateString(`(progn\n${sourceText}\n)`);
            return undefined;
        } catch (runtimeError) {
            return runtimeError;
        }
    }
    private readUserFile(rawPath: string): string {
        const normalizedPath = normalizeWithinRoot(rawPath);
        const entryDirectory = directoryOf(this.entryRelativePath);
        const candidatePaths =
            entryDirectory.length > 0
                ? [joinRelativePath(entryDirectory, normalizedPath), normalizedPath]
                : [normalizedPath];
        for (const candidatePath of candidatePaths) {
            const fileContent = this.userFiles.get(candidatePath);
            if (fileContent !== undefined) {
                return fileContent;
            }
        }
        throw new Error(`File not found: ${rawPath}`);
    }
    private escapeLispString(value: string): string {
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    private describeCommonLispError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        const shapedLine = lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
        return `Common Lisp error: ${shapedLine}`;
    }
}
export { CommonLispPerformer, JsclFedCharacterReader };
