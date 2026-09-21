import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
class KotlinWasmModuleLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadInstance(stage: TerminalStageController): Promise<unknown> {
        stage.writeLine("Loading Kotlin WASM module.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/kotlin-loader.mjs`
        )) as {
            instantiateKotlinModule(
                baseUrl: string,
                importObject: WebAssembly.Imports,
            ): Promise<unknown>;
        };
        return loaderModule.instantiateKotlinModule(`${this.sessionBaseUrl}/runtime`, {});
    }
}
class KotlinWasmEntryInvoker {
    async invokeMain(instance: unknown, stage: TerminalStageController): Promise<void> {
        const exports = (instance as { exports: Record<string, unknown> }).exports;
        const mainFunction = exports["main"] as (() => unknown) | undefined;
        if (!mainFunction) {
            stage.writeLine("Kotlin module loaded. No main export found.");
            return;
        }
        stage.writeLine("Running Kotlin main.");
        await mainFunction();
    }
}
class KotlinWasmPerformer implements TerminalPerformerContract {
    private readonly moduleLoader: KotlinWasmModuleLoader;
    private readonly entryInvoker: KotlinWasmEntryInvoker;
    private loadedInstance: unknown;
    constructor(sessionBaseUrl: string) {
        this.moduleLoader = new KotlinWasmModuleLoader(sessionBaseUrl);
        this.entryInvoker = new KotlinWasmEntryInvoker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedInstance = await this.moduleLoader.loadInstance(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        await this.entryInvoker.invokeMain(this.loadedInstance, stage);
    }
}
export { KotlinWasmPerformer };
