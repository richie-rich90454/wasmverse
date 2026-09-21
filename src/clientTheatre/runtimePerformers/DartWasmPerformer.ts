import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
class DartWasmModuleLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadInstance(stage: TerminalStageController): Promise<unknown> {
        stage.writeLine("Loading Dart WASM module.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/dart-loader.mjs`
        )) as {
            instantiateDartModule(
                baseUrl: string,
                importObject: WebAssembly.Imports,
            ): Promise<unknown>;
        };
        return loaderModule.instantiateDartModule(`${this.sessionBaseUrl}/runtime`, {});
    }
}
class DartWasmEntryInvoker {
    async invokeMain(instance: unknown, stage: TerminalStageController): Promise<void> {
        const exports = (instance as { exports: Record<string, unknown> }).exports;
        const mainFunction = exports["main"] as (() => unknown) | undefined;
        if (!mainFunction) {
            stage.writeLine("Dart module loaded. No main export found.");
            return;
        }
        stage.writeLine("Running Dart main.");
        await mainFunction();
    }
}
class DartWasmPerformer implements TerminalPerformerContract {
    private readonly moduleLoader: DartWasmModuleLoader;
    private readonly entryInvoker: DartWasmEntryInvoker;
    private loadedInstance: unknown;
    constructor(sessionBaseUrl: string) {
        this.moduleLoader = new DartWasmModuleLoader(sessionBaseUrl);
        this.entryInvoker = new DartWasmEntryInvoker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedInstance = await this.moduleLoader.loadInstance(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        await this.entryInvoker.invokeMain(this.loadedInstance, stage);
    }
}
export { DartWasmPerformer };
