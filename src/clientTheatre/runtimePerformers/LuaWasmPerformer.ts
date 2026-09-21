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
    async loadEngine(stage: TerminalStageController): Promise<{
        engine: LuaEngine;
        mountUserFile(path: string, content: string): Promise<void>;
    }> {
        stage.writeLine("Loading Lua runtime.");
        try {
            const factory = new LuaFactory(`${this.sessionBaseUrl}/runtime/glue.wasm`);
            const engine = (await factory.createEngine()) as LuaEngine;
            engine.global.set("print", (...args: Array<unknown>) => {
                stage.writeLine(args.map((arg) => String(arg)).join("\t"));
            });
            return {
                engine,
                mountUserFile: (path: string, content: string) => factory.mountFile(path, content),
            };
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
    async fetchUserFiles(): Promise<{
        entryRelativePath: string;
        userFiles: Map<string, string>;
    }> {
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
            userFiles.set(relativePath, await fileResponse.text());
        }
        return { entryRelativePath: manifest.entryFileRelativePath, userFiles };
    }
}
class LuaWasmEntryExecutor {
    async executeEntry(
        engine: LuaEngine,
        mountUserFile: (path: string, content: string) => Promise<void>,
        entryRelativePath: string,
        userFiles: ReadonlyMap<string, string>,
        stage: TerminalStageController,
    ): Promise<void> {
        stage.writeLine("Running Lua entry script.");
        try {
            for (const [relativePath, fileContent] of userFiles) {
                await mountUserFile(relativePath, fileContent);
            }
            if (!userFiles.has(entryRelativePath)) {
                throw new Error(`Entry file ${entryRelativePath} is missing from the session.`);
            }
            await engine.doFile(entryRelativePath);
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
    private loadedRuntime:
        | {
              engine: LuaEngine;
              mountUserFile(path: string, content: string): Promise<void>;
          }
        | undefined;
    private entryRelativePath: string = "";
    private userFiles: Map<string, string> = new Map();
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new LuaWasmLoader(sessionBaseUrl);
        this.fileSystemWriter = new LuaWasmFileSystemWriter(sessionBaseUrl);
        this.entryExecutor = new LuaWasmEntryExecutor();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedRuntime = await this.runtimeLoader.loadEngine(stage);
        const fetchedFiles = await this.fileSystemWriter.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        this.userFiles = fetchedFiles.userFiles;
        stage.writeLine("Lua runtime ready.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedRuntime) {
            throw new Error("Lua runtime not loaded. Call loadInto first.");
        }
        await this.entryExecutor.executeEntry(
            this.loadedRuntime.engine,
            this.loadedRuntime.mountUserFile,
            this.entryRelativePath,
            this.userFiles,
            stage,
        );
    }
}
export { LuaWasmPerformer };
