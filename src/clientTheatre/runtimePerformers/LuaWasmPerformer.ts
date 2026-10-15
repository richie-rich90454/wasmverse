import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { LuaFactory } from "wasmoon";
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
interface LuaEngine {
    global: { set(name: string, value: unknown): void };
    doString(code: string): Promise<unknown>;
    doFile(path: string): Promise<unknown>;
}
interface LuaAttemptRuntime {
    mountUserFiles(userFiles: ReadonlyMap<string, string>): Promise<void>;
    createAttemptEngine(
        fedLineReader: LuaFedLineReader,
        programArguments: ReadonlyArray<string>,
        outputTracker: ReplayOutputTracker,
        entryFileName: string,
    ): Promise<LuaEngine>;
}
class LuaFedLineReader {
    private readonly fedLines: ReadonlyArray<string>;
    private lineIndex: number = 0;
    constructor(fedLines: ReadonlyArray<string>) {
        this.fedLines = fedLines;
    }
    readLine(): string {
        if (this.lineIndex >= this.fedLines.length) {
            throw new TerminalInputNeededSignal();
        }
        const fedLine = this.fedLines[this.lineIndex] as string;
        this.lineIndex++;
        return fedLine;
    }
}
function toLuaStringLiteral(value: string): string {
    const escapedValue = value
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r");
    return `"${escapedValue}"`;
}
function buildLuaPrelude(entryFileName: string): string {
    return `local __wasmverse_read_line = __wasmverseReadLine
local __wasmverse_write = __wasmverseWrite
local __wasmverse_number_patterns = {
    "^%s*[-+]?%d+%.?%d*[eE][-+]?%d+",
    "^%s*[-+]?%d+%.?%d*",
    "^%s*[-+]?%.%d+",
}
io.read = function(...)
    local formats = { ... }
    local format_count = select("#", ...)
    if format_count == 0 then
        formats = { "*l" }
        format_count = 1
    end
    local results = {}
    for index = 1, format_count do
        local format = formats[index]
        if format == "*l" or format == "l" then
            results[index] = __wasmverse_read_line()
        elseif format == "*n" or format == "n" then
            local line = __wasmverse_read_line()
            local number_text = nil
            for pattern_index = 1, #__wasmverse_number_patterns do
                number_text = string.match(line, __wasmverse_number_patterns[pattern_index])
                if number_text then
                    break
                end
            end
            results[index] = tonumber(number_text)
        else
            error("io.read: unsupported format " .. tostring(format), 2)
        end
    end
    return table.unpack(results, 1, format_count)
end
local __wasmverse_write_sink = {}
__wasmverse_write_sink.write = function(self, ...)
    local parts = {}
    for index = 1, select("#", ...) do
        parts[index] = tostring(select(index, ...))
    end
    __wasmverse_write(table.concat(parts))
    return self
end
__wasmverse_write_sink.__index = __wasmverse_write_sink
io.write = function(...)
    local parts = {}
    for index = 1, select("#", ...) do
        parts[index] = tostring(select(index, ...))
    end
    __wasmverse_write(table.concat(parts))
    return __wasmverse_write_sink
end
arg = { [0] = ${toLuaStringLiteral(entryFileName)} }
local __wasmverse_arguments = __wasmverseProgramArguments()
for index = 1, #__wasmverse_arguments do
    arg[index] = __wasmverse_arguments[index]
end
`;
}
function describeLuaError(runError: unknown): string {
    const rawMessage = runError instanceof Error ? runError.message : String(runError);
    const messageLines = rawMessage
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.trim().length > 0);
    const firstLine = messageLines[0] ?? rawMessage;
    return firstLine.length > 300 ? firstLine.slice(0, 300) : firstLine;
}
class LuaWasmLoader implements LuaAttemptRuntime {
    private readonly assetLocator: RuntimeAssetLocator;
    private loadedFactory: LuaFactory | undefined;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
    }
    async loadFactory(stage: TerminalStageController): Promise<void> {
        stage.writeLine("Loading Lua runtime.");
        try {
            const factory = new LuaFactory(this.assetLocator.resolveAssetUrl("runtime/glue.wasm"));
            await factory.getLuaModule();
            this.loadedFactory = factory;
        } catch (loadError) {
            throw new Error(
                `Lua runtime failed to load: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
            );
        }
    }
    async mountUserFiles(userFiles: ReadonlyMap<string, string>): Promise<void> {
        const factory = this.loadedFactory;
        if (!factory) {
            throw new Error("Lua runtime not loaded. Call loadInto first.");
        }
        for (const [relativePath, fileContent] of userFiles) {
            await factory.mountFile(relativePath, fileContent);
        }
    }
    async createAttemptEngine(
        fedLineReader: LuaFedLineReader,
        programArguments: ReadonlyArray<string>,
        outputTracker: ReplayOutputTracker,
        entryFileName: string,
    ): Promise<LuaEngine> {
        const factory = this.loadedFactory;
        if (!factory) {
            throw new Error("Lua runtime not loaded. Call loadInto first.");
        }
        const engine = (await factory.createEngine()) as LuaEngine;
        engine.global.set("print", (...args: Array<unknown>) => {
            outputTracker.appendText(`${args.map((arg) => String(arg)).join("\t")}\n`);
        });
        engine.global.set("__wasmverseReadLine", () => fedLineReader.readLine());
        engine.global.set("__wasmverseWrite", (text: string) => {
            outputTracker.appendText(text);
        });
        engine.global.set("__wasmverseProgramArguments", () => [...programArguments]);
        await engine.doString(buildLuaPrelude(entryFileName));
        return engine;
    }
}
class LuaWasmEntryExecutor {
    private readonly attemptRuntime: LuaAttemptRuntime;
    private readonly outputTracker: ReplayOutputTracker;
    constructor(attemptRuntime: LuaAttemptRuntime, outputTracker: ReplayOutputTracker) {
        this.attemptRuntime = attemptRuntime;
        this.outputTracker = outputTracker;
    }
    async executeEntry(
        entryRelativePath: string,
        userFiles: ReadonlyMap<string, string>,
        programArguments: ReadonlyArray<string>,
        stage: TerminalStageController,
    ): Promise<void> {
        stage.writeLine("Running Lua entry script.");
        const entryFileName = entryRelativePath.split("/").pop() ?? entryRelativePath;
        const fedLines: Array<string> = [];
        let userFilesMounted = false;
        for (let inputCount = 0; ; inputCount++) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            try {
                if (!userFilesMounted) {
                    await this.attemptRuntime.mountUserFiles(userFiles);
                    userFilesMounted = true;
                }
                if (!userFiles.has(entryRelativePath)) {
                    throw new Error(`Entry file ${entryRelativePath} is missing from the session.`);
                }
                const fedLineReader = new LuaFedLineReader(fedLines);
                const engine = await this.attemptRuntime.createAttemptEngine(
                    fedLineReader,
                    programArguments,
                    this.outputTracker,
                    entryFileName,
                );
                await engine.doFile(entryRelativePath);
                break;
            } catch (runError) {
                this.outputTracker.flushShownInto(stage);
                if (isTerminalInputNeeded(runError)) {
                    const line = await stage.readLine("");
                    fedLines.push(line);
                    continue;
                }
                throw new Error(`Lua error: ${describeLuaError(runError)}`);
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
        }
        this.outputTracker.flushShownInto(stage);
    }
}
class LuaWasmPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: LuaWasmLoader;
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly entryExecutor: LuaWasmEntryExecutor;
    private entryRelativePath: string = "";
    private programArguments: ReadonlyArray<string> = [];
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new LuaWasmLoader(sessionBaseUrl);
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.entryExecutor = new LuaWasmEntryExecutor(
            this.runtimeLoader,
            new ReplayOutputTracker(),
        );
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.runtimeLoader.loadFactory(stage);
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.programArguments = fetchedFiles.programArguments;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Lua runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        await this.entryExecutor.executeEntry(
            this.entryRelativePath,
            this.userFiles,
            this.programArguments,
            stage,
        );
    }
}
export { buildLuaPrelude, LuaFedLineReader, LuaWasmEntryExecutor, LuaWasmPerformer };
