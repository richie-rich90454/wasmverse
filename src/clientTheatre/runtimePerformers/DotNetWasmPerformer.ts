import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
interface DotNetWasmRuntime {
    run(): Promise<void>;
}
class DotNetRuntimeLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRuntime(stage: TerminalStageController): Promise<DotNetWasmRuntime> {
        stage.writeLine("Loading .NET WASM runtime.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/dotnet-appbundle-loader.js`
        )) as { loadDotNetRuntime(baseUrl: string): Promise<DotNetWasmRuntime> };
        return loaderModule.loadDotNetRuntime(`${this.sessionBaseUrl}/runtime`);
    }
}
class DotNetEntryPointRunner {
    async runEntryPoint(runtime: DotNetWasmRuntime, stage: TerminalStageController): Promise<void> {
        stage.writeLine("Running .NET entry point.");
        await runtime.run();
    }
}
class DotNetWasmPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: DotNetRuntimeLoader;
    private readonly entryPointRunner: DotNetEntryPointRunner;
    private loadedRuntime: DotNetWasmRuntime | undefined;
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new DotNetRuntimeLoader(sessionBaseUrl);
        this.entryPointRunner = new DotNetEntryPointRunner();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedRuntime = await this.runtimeLoader.loadRuntime(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedRuntime) {
            throw new Error(".NET runtime not loaded. Call loadInto first.");
        }
        await this.entryPointRunner.runEntryPoint(this.loadedRuntime, stage);
    }
}
export { DotNetWasmPerformer };
