import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
interface DartInstantiatedApp {
    invokeMain: (...args: Array<string>) => Promise<unknown> | unknown;
}
class DartWasmModuleLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadInstance(stage: TerminalStageController): Promise<DartInstantiatedApp> {
        stage.writeLine("Loading Dart WASM module.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/dart-loader.js`
        )) as {
            loadDartApp: (baseUrl: string) => Promise<DartInstantiatedApp>;
        };
        return loaderModule.loadDartApp(`${this.sessionBaseUrl}/runtime`);
    }
}
class DartWasmEntryInvoker {
    async invokeMain(
        instantiatedApp: DartInstantiatedApp,
        stage: TerminalStageController,
    ): Promise<void> {
        stage.writeLine("Running Dart main.");
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...args: Array<unknown>) => {
            stage.writeLine(args.map((arg) => String(arg)).join(" "));
        };
        console.error = (...args: Array<unknown>) => {
            stage.writeLine(args.map((arg) => String(arg)).join(" "));
        };
        try {
            await instantiatedApp.invokeMain();
        } finally {
            console.log = originalLog;
            console.error = originalError;
        }
    }
}
class DartWasmPerformer implements TerminalPerformerContract {
    private readonly moduleLoader: DartWasmModuleLoader;
    private readonly entryInvoker: DartWasmEntryInvoker;
    private loadedInstance: DartInstantiatedApp | undefined;
    constructor(sessionBaseUrl: string) {
        this.moduleLoader = new DartWasmModuleLoader(sessionBaseUrl);
        this.entryInvoker = new DartWasmEntryInvoker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedInstance = await this.moduleLoader.loadInstance(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedInstance) {
            throw new Error("Dart module not loaded. Call loadInto first.");
        }
        await this.entryInvoker.invokeMain(this.loadedInstance, stage);
    }
}
export { DartWasmPerformer };
