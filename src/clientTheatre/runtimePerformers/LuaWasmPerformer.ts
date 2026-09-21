import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { LuaFactory } from "wasmoon";
interface LuaEngine {
    global: { set(name: string, value: unknown): void };
    doString(code: string): Promise<unknown>;
    doFile(path: string): Promise<unknown>;
}
class LuaWasmLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadEngine(stage: TerminalStageController): Promise<LuaEngine> {
        stage.writeLine("Loading Lua runtime.");
        try {
            const factory = new LuaFactory(`${this.sessionBaseUrl}/runtime/glue.wasm`);
            const engine = (await factory.createEngine()) as LuaEngine;
            engine.global.set("print", (...args: Array<unknown>) => {
                stage.writeLine(args.map((arg) => String(arg)).join("\t"));
            });
            return engine;
        } catch (loadError) {
            throw new Error(
                `Lua runtime failed to load: ${loadError instanceof Error ? loadError.message : String(loadError)}`,
            );
        }
    }
}
class LuaWasmFileSystemWriter {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async fetchUserFiles(): Promise<{ entryFileName: string; userFiles: Map<string, string> }> {
        const manifestResponse = await fetch(`${this.sessionBaseUrl}/user-code/manifest.json`);
        if (!manifestResponse.ok) {
            throw new Error("Session manifest is missing. Rebuild the session and retry.");
        }
        const manifest = (await manifestResponse.json()) as {
            entryFileRelativePath: string;
            includedFileRelativePaths: Array<string>;
        };
        const userFiles = new Map<string, string>();
        for (const relativePath of manifest.includedFileRelativePaths) {
            if (relativePath === "manifest.json") {
                continue;
            }
            const fileResponse = await fetch(`${this.sessionBaseUrl}/user-code/${relativePath}`);
            if (!fileResponse.ok) {
                throw new Error(`User file ${relativePath} is missing from the session.`);
            }
            const fileName = relativePath.split("/").pop() as string;
            userFiles.set(fileName, await fileResponse.text());
        }
        const entryFileName = manifest.entryFileRelativePath.split("/").pop() as string;
        return { entryFileName, userFiles };
    }
}
class LuaWasmEntryExecutor {
    async executeEntry(
        engine: LuaEngine,
        entryFileName: string,
        userFiles: ReadonlyMap<string, string>,
        stage: TerminalStageController,
    ): Promise<void> {
        stage.writeLine("Running Lua entry script.");
        try {
            const entrySource = userFiles.get(entryFileName);
            if (entrySource === undefined) {
                throw new Error(`Entry file ${entryFileName} is missing from the session.`);
            }
            await engine.doString(entrySource);
        } catch (runError) {
            throw new Error(
                `Lua error: ${runError instanceof Error ? runError.message : String(runError)}`,
            );
        }
    }
}
class LuaWasmPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: LuaWasmLoader;
    private readonly fileSystemWriter: LuaWasmFileSystemWriter;
    private readonly entryExecutor: LuaWasmEntryExecutor;
    private loadedEngine: LuaEngine | undefined;
    private entryFileName: string = "";
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new LuaWasmLoader(sessionBaseUrl);
        this.fileSystemWriter = new LuaWasmFileSystemWriter(sessionBaseUrl);
        this.entryExecutor = new LuaWasmEntryExecutor();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedEngine = await this.runtimeLoader.loadEngine(stage);
        const fetchedFiles = await this.fileSystemWriter.fetchUserFiles();
        this.entryFileName = fetchedFiles.entryFileName;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Lua runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedEngine) {
            throw new Error("Lua runtime not loaded. Call loadInto first.");
        }
        await this.entryExecutor.executeEntry(
            this.loadedEngine,
            this.entryFileName,
            this.userFiles,
            stage,
        );
    }
}
export { LuaWasmPerformer };
