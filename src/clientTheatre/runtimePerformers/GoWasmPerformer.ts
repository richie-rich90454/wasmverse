import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
class GoWasmExecScriptLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadGoRunner(stage: TerminalStageController): Promise<unknown> {
        stage.writeLine("Loading Go WASM runner.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/go-loader.mjs`
        )) as { createGoRunner(): unknown };
        return loaderModule.createGoRunner();
    }
}
class GoWasmInstanceRunner {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async runInstance(goRunner: unknown, stage: TerminalStageController): Promise<void> {
        const runner = goRunner as { importObject: unknown; run(instance: unknown): void };
        const response = await fetch(`${this.sessionBaseUrl}/runtime/app.wasm`);
        const { instance } = await WebAssembly.instantiateStreaming(
            response,
            runner.importObject as WebAssembly.Imports,
        );
        stage.writeLine("Running Go WASM module.");
        runner.run(instance);
    }
}
class GoWasmPerformer implements TerminalPerformerContract {
    private readonly execScriptLoader: GoWasmExecScriptLoader;
    private readonly instanceRunner: GoWasmInstanceRunner;
    private loadedRunner: unknown;
    constructor(sessionBaseUrl: string) {
        this.execScriptLoader = new GoWasmExecScriptLoader(sessionBaseUrl);
        this.instanceRunner = new GoWasmInstanceRunner(sessionBaseUrl);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedRunner = await this.execScriptLoader.loadGoRunner(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        await this.instanceRunner.runInstance(this.loadedRunner, stage);
    }
}
export { GoWasmPerformer };
