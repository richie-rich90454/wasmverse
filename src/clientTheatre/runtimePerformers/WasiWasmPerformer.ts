import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { WASI } from "@bjorn3/browser_wasi_shim";
type WasiExportedEntry = () => Promise<unknown> | unknown;
class WasiWasmModuleLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadInstance(stage: TerminalStageController): Promise<WebAssembly.Instance> {
        stage.writeLine("Loading WASI module.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/wasi-loader.js`
        )) as {
            instantiateWasiModule(
                baseUrl: string,
                importObject: WebAssembly.Imports,
            ): Promise<WebAssembly.Instance>;
        };
        const wasiInstance = new WASI([], [], []);
        const instance = await loaderModule.instantiateWasiModule(
            `${this.sessionBaseUrl}/runtime`,
            wasiInstance.wasiImport as unknown as WebAssembly.Imports,
        );
        const instanceExports = instance.exports as Record<string, unknown>;
        if (typeof instanceExports["_initialize"] === "function") {
            wasiInstance.initialize(
                instance as unknown as Parameters<typeof wasiInstance.initialize>[0],
            );
        }
        return instance;
    }
}
class WasiEntryInvoker {
    async invokeEntry(
        instance: WebAssembly.Instance,
        stage: TerminalStageController,
    ): Promise<void> {
        const exports = instance.exports as Record<string, unknown>;
        const entryFunction = (exports["main"] ?? exports["_start"]) as
            | WasiExportedEntry
            | undefined;
        if (typeof entryFunction !== "function") {
            throw new Error("WASI module exposes neither a main nor a _start export.");
        }
        stage.writeLine("Running WASI entry point.");
        await entryFunction();
    }
}
class WasiWasmPerformer implements TerminalPerformerContract {
    private readonly moduleLoader: WasiWasmModuleLoader;
    private readonly entryInvoker: WasiEntryInvoker;
    private loadedInstance: WebAssembly.Instance | undefined;
    constructor(sessionBaseUrl: string) {
        this.moduleLoader = new WasiWasmModuleLoader(sessionBaseUrl);
        this.entryInvoker = new WasiEntryInvoker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedInstance = await this.moduleLoader.loadInstance(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedInstance) {
            throw new Error("WASI module not loaded. Call loadInto first.");
        }
        await this.entryInvoker.invokeEntry(this.loadedInstance, stage);
    }
}
export { WasiWasmPerformer };
