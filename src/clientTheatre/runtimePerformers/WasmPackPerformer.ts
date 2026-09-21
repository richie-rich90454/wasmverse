import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
class WasmPackGlueModuleLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadModule(stage: TerminalStageController): Promise<Record<string, unknown>> {
        stage.writeLine("Loading WASM module.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/wasm-pack-loader.mjs`
        )) as { loadWasmPackModule(baseUrl: string): Promise<Record<string, unknown>> };
        return loaderModule.loadWasmPackModule(`${this.sessionBaseUrl}/runtime`);
    }
}
class WasmPackExportedFunctionInvoker {
    async invokeMain(
        module: Record<string, unknown>,
        stage: TerminalStageController,
    ): Promise<void> {
        const mainFunction = module["main"] ?? module["run"];
        if (typeof mainFunction !== "function") {
            stage.writeLine("WASM module loaded. No main export found.");
            return;
        }
        stage.writeLine("Running WASM main export.");
        await (mainFunction as () => Promise<unknown> | unknown)();
    }
}
class WasmPackPerformer implements TerminalPerformerContract {
    private readonly glueModuleLoader: WasmPackGlueModuleLoader;
    private readonly functionInvoker: WasmPackExportedFunctionInvoker;
    private loadedModule: Record<string, unknown> | undefined;
    constructor(sessionBaseUrl: string) {
        this.glueModuleLoader = new WasmPackGlueModuleLoader(sessionBaseUrl);
        this.functionInvoker = new WasmPackExportedFunctionInvoker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedModule = await this.glueModuleLoader.loadModule(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedModule) {
            throw new Error("WASM module not loaded. Call loadInto first.");
        }
        await this.functionInvoker.invokeMain(this.loadedModule, stage);
    }
}
export { WasmPackPerformer };
