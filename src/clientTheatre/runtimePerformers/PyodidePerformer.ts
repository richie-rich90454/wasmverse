import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
interface PyodideInstance {
    setStdout(options: { batched(output: string): void }): void;
    setStderr(options: { batched(output: string): void }): void;
    globals: { set(name: string, value: unknown): void };
    toPy(value: unknown): unknown;
    runPythonAsync(code: string): Promise<unknown>;
}
interface PyodideModule {
    loadPyodide(options: { indexURL: string }): Promise<PyodideInstance>;
}
interface PythonErrorShape {
    type?: string;
    message?: string;
}
const MAXIMUM_REPLAY_INPUTS = 1000;
const PYTHON_PRELUDE = `
import builtins as _builtins
import sys as _sys
import ast as _ast
class _NeedTerminalInput(Exception):
    pass
try:
    _terminal_fed_lines
except NameError:
    _terminal_fed_lines = []
def _terminal_sync_input(prompt=""):
    if _terminal_fed_lines:
        return _terminal_fed_lines.pop(0)
    raise _NeedTerminalInput(str(prompt))
_builtins.input = _terminal_sync_input
def _entry_calls_main_at_top_level(source_text):
    try:
        tree = _ast.parse(source_text)
    except SyntaxError:
        return False
    def _scans(node):
        for child in _ast.iter_child_nodes(node):
            if isinstance(child, _ast.Call):
                func = child.func
                if isinstance(func, _ast.Name) and func.id == "main":
                    return True
                if isinstance(func, _ast.Attribute) and func.attr == "run":
                    for arg in child.args:
                        if isinstance(arg, _ast.Call) and isinstance(arg.func, _ast.Name) and arg.func.id == "main":
                            return True
            if isinstance(child, (_ast.FunctionDef, _ast.AsyncFunctionDef, _ast.ClassDef)):
                continue
            if _scans(child):
                return True
        return False
    return any(_scans(node) for node in tree.body)
_entry_should_auto_call_main = not _entry_calls_main_at_top_level(_entry_source_text)
`;
const PYTHON_EPILOGUE = `
import asyncio as _asyncio
if _entry_should_auto_call_main:
    _entry_main = globals().get("main", None)
    if callable(_entry_main):
        _entry_result = _entry_main()
        if _asyncio.iscoroutine(_entry_result):
            await _entry_result
`;
class PyodideRuntimeLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRuntime(): Promise<PyodideInstance> {
        const pyodideModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/pyodide.mjs`
        )) as PyodideModule;
        return pyodideModule.loadPyodide({ indexURL: `${this.sessionBaseUrl}/runtime/` });
    }
}
class PyodideStandardStreamRedirector {
    private outputBuffer: string = "";
    private flushedLength: number = 0;
    redirectStreams(pyodide: PyodideInstance): void {
        pyodide.setStdout({ batched: (output: string) => this.appendOutput(output) });
        pyodide.setStderr({ batched: (output: string) => this.appendOutput(output) });
    }
    flushDeltaInto(stage: TerminalStageController): void {
        const delta = this.outputBuffer.slice(this.flushedLength);
        this.flushedLength = this.outputBuffer.length;
        if (delta) {
            stage.writeText(delta);
        }
    }
    private appendOutput(output: string): void {
        this.outputBuffer += output + "\n";
    }
}
class PyodideInputBridge {
    private readonly fedLines: Array<string> = [];
    private asyncConsumed: number = 0;
    installBridge(pyodide: PyodideInstance, stage: TerminalStageController): void {
        pyodide.globals.set("async_input", (promptText: string) => {
            if (this.asyncConsumed < this.fedLines.length) {
                return this.fedLines[this.asyncConsumed++] as string;
            }
            return stage.readLine(promptText ?? "").then((line: string) => {
                this.fedLines.push(line);
                this.asyncConsumed++;
                return line;
            });
        });
    }
    resetForRun(pyodide: PyodideInstance): void {
        this.asyncConsumed = 0;
        pyodide.globals.set("_terminal_fed_lines", pyodide.toPy(this.fedLines));
    }
    recordLine(line: string): void {
        this.fedLines.push(line);
    }
    fedLineCount(): number {
        return this.fedLines.length;
    }
}
class PyodideUserFileFetcher {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async fetchEntrySource(): Promise<string> {
        const manifestResponse = await fetch(`${this.sessionBaseUrl}/user-code/manifest.json`);
        if (!manifestResponse.ok) {
            throw new Error("Session manifest is missing. Rebuild the session and retry.");
        }
        const manifest = (await manifestResponse.json()) as {
            entryFileRelativePath: string;
        };
        const entryResponse = await fetch(
            `${this.sessionBaseUrl}/user-code/${manifest.entryFileRelativePath}`,
        );
        if (!entryResponse.ok) {
            throw new Error(`Entry file ${manifest.entryFileRelativePath} is missing.`);
        }
        return entryResponse.text();
    }
}
class PyodideEntryScriptExecutor {
    private readonly streamRedirector: PyodideStandardStreamRedirector;
    private readonly inputBridge: PyodideInputBridge;
    constructor(
        streamRedirector: PyodideStandardStreamRedirector,
        inputBridge: PyodideInputBridge,
    ) {
        this.streamRedirector = streamRedirector;
        this.inputBridge = inputBridge;
    }
    async executeEntry(
        pyodide: PyodideInstance,
        entrySource: string,
        stage: TerminalStageController,
    ): Promise<void> {
        const executorSource = PYTHON_PRELUDE + entrySource + PYTHON_EPILOGUE;
        pyodide.globals.set("_entry_source_text", entrySource);
        for (;;) {
            this.inputBridge.resetForRun(pyodide);
            try {
                await pyodide.runPythonAsync(executorSource);
                break;
            } catch (runError) {
                this.streamRedirector.flushDeltaInto(stage);
                const errorShape = runError as PythonErrorShape;
                if (errorShape?.type === "_NeedTerminalInput") {
                    if (this.inputBridge.fedLineCount() >= MAXIMUM_REPLAY_INPUTS) {
                        throw new Error("Too many input prompts. Stopping to protect the session.");
                    }
                    const promptText = this.extractPrompt(errorShape.message ?? "");
                    const line = await stage.readLine(promptText);
                    this.inputBridge.recordLine(line);
                    continue;
                }
                if (errorShape?.type === "SystemExit") {
                    break;
                }
                throw new Error(this.describePythonError(errorShape));
            } finally {
                this.streamRedirector.flushDeltaInto(stage);
            }
        }
        this.streamRedirector.flushDeltaInto(stage);
    }
    private extractPrompt(fullMessage: string): string {
        const promptMarker = "_NeedTerminalInput: ";
        const markerIndex = fullMessage.lastIndexOf(promptMarker);
        if (markerIndex < 0) {
            return "";
        }
        return fullMessage.slice(markerIndex + promptMarker.length);
    }
    private describePythonError(errorShape: PythonErrorShape): string {
        const rawMessage = String(errorShape?.message ?? "Unknown Python error.");
        const markerIndex = rawMessage.lastIndexOf("_NeedTerminalInput: ");
        const trimmedMessage = markerIndex >= 0 ? rawMessage.slice(0, markerIndex) : rawMessage;
        const messageLines = trimmedMessage.split("\n").filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
class PyodidePerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: PyodideRuntimeLoader;
    private readonly streamRedirector: PyodideStandardStreamRedirector;
    private readonly inputBridge: PyodideInputBridge;
    private readonly userFileFetcher: PyodideUserFileFetcher;
    private readonly entryExecutor: PyodideEntryScriptExecutor;
    private loadedRuntime: PyodideInstance | undefined;
    private entrySource: string = "";
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new PyodideRuntimeLoader(sessionBaseUrl);
        this.streamRedirector = new PyodideStandardStreamRedirector();
        this.inputBridge = new PyodideInputBridge();
        this.userFileFetcher = new PyodideUserFileFetcher(sessionBaseUrl);
        this.entryExecutor = new PyodideEntryScriptExecutor(
            this.streamRedirector,
            this.inputBridge,
        );
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Python runtime.");
        try {
            this.loadedRuntime = await this.runtimeLoader.loadRuntime();
        } catch (loadError) {
            throw new Error(
                `Python runtime failed to load: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
            );
        }
        this.streamRedirector.redirectStreams(this.loadedRuntime);
        this.inputBridge.installBridge(this.loadedRuntime, stage);
        this.entrySource = await this.userFileFetcher.fetchEntrySource();
        stage.writeLine("Python runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedRuntime) {
            throw new Error("Pyodide runtime not loaded. Call loadInto first.");
        }
        await this.entryExecutor.executeEntry(this.loadedRuntime, this.entrySource, stage);
    }
}
export { PyodidePerformer };
