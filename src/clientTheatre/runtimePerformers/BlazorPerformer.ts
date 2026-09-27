import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
class BlazorRuntimeLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadRuntime(stage: TerminalStageController): Promise<unknown> {
        stage.writeLine("Loading Blazor runtime.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/blazor-loader.js`
        )) as { loadBlazorRuntime(): Promise<unknown> };
        return loaderModule.loadBlazorRuntime();
    }
}
class BlazorApplicationStarter {
    async startApplication(runtime: unknown, stage: TerminalStageController): Promise<void> {
        stage.writeLine("Starting Blazor application.");
        const blazor = runtime as { start(): Promise<void> };
        await blazor.start();
    }
}
class BlazorPerformer implements TerminalPerformerContract {
    private readonly runtimeLoader: BlazorRuntimeLoader;
    private readonly applicationStarter: BlazorApplicationStarter;
    private loadedRuntime: unknown;
    constructor(sessionBaseUrl: string) {
        this.runtimeLoader = new BlazorRuntimeLoader(sessionBaseUrl);
        this.applicationStarter = new BlazorApplicationStarter();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedRuntime = await this.runtimeLoader.loadRuntime(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        await this.applicationStarter.startApplication(this.loadedRuntime, stage);
    }
}
export { BlazorPerformer };
