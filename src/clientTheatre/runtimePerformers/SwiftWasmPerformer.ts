import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
class SwiftWasmModuleLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadInstance(stage: TerminalStageController): Promise<unknown> {
        stage.writeLine("Loading Swift WASM module.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/swift-loader.mjs`
        )) as {
            instantiateSwiftModule(
                baseUrl: string,
                importObject: WebAssembly.Imports,
            ): Promise<unknown>;
        };
        return loaderModule.instantiateSwiftModule(`${this.sessionBaseUrl}/runtime`, {});
    }
}
class SwiftWasmEntryInvoker {
    async invokeMain(instance: unknown, stage: TerminalStageController): Promise<void> {
        const exports = (instance as { exports: Record<string, unknown> }).exports;
        const mainFunction = exports["main"] as (() => unknown) | undefined;
        if (!mainFunction) {
            stage.writeLine("Swift module loaded. No main export found.");
            return;
        }
        stage.writeLine("Running Swift main.");
        await mainFunction();
    }
}
class SwiftWasmPerformer implements TerminalPerformerContract {
    private readonly moduleLoader: SwiftWasmModuleLoader;
    private readonly entryInvoker: SwiftWasmEntryInvoker;
    private loadedInstance: unknown;
    constructor(sessionBaseUrl: string) {
        this.moduleLoader = new SwiftWasmModuleLoader(sessionBaseUrl);
        this.entryInvoker = new SwiftWasmEntryInvoker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedInstance = await this.moduleLoader.loadInstance(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        await this.entryInvoker.invokeMain(this.loadedInstance, stage);
    }
}
export { SwiftWasmPerformer };
