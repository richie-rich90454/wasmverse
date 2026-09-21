import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
class EmscriptenGlueScriptLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadModuleFactory(stage: TerminalStageController): Promise<unknown> {
        stage.writeLine("Loading Emscripten module.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/emscripten-loader.mjs`
        )) as { loadEmscriptenModule(baseUrl: string): Promise<unknown> };
        return loaderModule.loadEmscriptenModule(`${this.sessionBaseUrl}/runtime`);
    }
}
class EmscriptenModuleFactoryWrapper {
    wrapFactory(moduleFactory: unknown): { callMain(args: Array<string>): void } {
        return moduleFactory as { callMain(args: Array<string>): void };
    }
}
class EmscriptenModuleRunner {
    runModule(
        wrappedModule: { callMain(args: Array<string>): void },
        stage: TerminalStageController,
    ): void {
        stage.writeLine("Running Emscripten main.");
        wrappedModule.callMain([]);
    }
}
class EmscriptenPerformer implements TerminalPerformerContract {
    private readonly glueScriptLoader: EmscriptenGlueScriptLoader;
    private readonly moduleFactoryWrapper: EmscriptenModuleFactoryWrapper;
    private readonly moduleRunner: EmscriptenModuleRunner;
    private wrappedModule: { callMain(args: Array<string>): void } | undefined;
    constructor(sessionBaseUrl: string) {
        this.glueScriptLoader = new EmscriptenGlueScriptLoader(sessionBaseUrl);
        this.moduleFactoryWrapper = new EmscriptenModuleFactoryWrapper();
        this.moduleRunner = new EmscriptenModuleRunner();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        const moduleFactory = await this.glueScriptLoader.loadModuleFactory(stage);
        this.wrappedModule = this.moduleFactoryWrapper.wrapFactory(moduleFactory);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.wrappedModule) {
            throw new Error("Emscripten module not loaded. Call loadInto first.");
        }
        this.moduleRunner.runModule(this.wrappedModule, stage);
    }
}
export { EmscriptenPerformer };
