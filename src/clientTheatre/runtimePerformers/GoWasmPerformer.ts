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
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/go-loader.js`
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
        const moduleBytes = await this.fetchWasmBytes();
        const { instance } = await WebAssembly.instantiate(
            moduleBytes,
            runner.importObject as WebAssembly.Imports,
        );
        stage.writeLine("Running Go WASM module.");
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...args: Array<unknown>) => {
            stage.writeLine(args.map((arg) => String(arg)).join(" "));
        };
        console.error = (...args: Array<unknown>) => {
            stage.writeLine(args.map((arg) => String(arg)).join(" "));
        };
        try {
            await runner.run(instance);
        } finally {
            console.log = originalLog;
            console.error = originalError;
        }
    }
    private async fetchWasmBytes(): Promise<ArrayBuffer> {
        const response = await fetch(`${this.sessionBaseUrl}/runtime/app.wasm`);
        if (!response.ok) {
            throw new Error(`app.wasm request failed with status ${response.status}.`);
        }
        return await response.arrayBuffer();
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
