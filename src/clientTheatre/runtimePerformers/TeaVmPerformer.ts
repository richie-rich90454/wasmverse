import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
type TeaVmExportedMain = () => Promise<unknown> | unknown;
class TeaVmModuleLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadModule(stage: TerminalStageController): Promise<Record<string, unknown>> {
        stage.writeLine("Loading TeaVM module.");
        const loaderModule = (await import(
            /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/teavm-loader.js`
        )) as {
            loadTeaVmModule(
                baseUrl: string,
                writeLine: (line: string) => void,
            ): Promise<Record<string, unknown>>;
        };
        return loaderModule.loadTeaVmModule(`${this.sessionBaseUrl}/runtime`, (line) => {
            stage.writeLine(line);
        });
    }
}
class TeaVmMainInvoker {
    async invokeMain(
        module: Record<string, unknown>,
        stage: TerminalStageController,
    ): Promise<void> {
        const mainFunction = module["main"] as TeaVmExportedMain | undefined;
        if (typeof mainFunction !== "function") {
            stage.writeLine("TeaVM module loaded. No main export found.");
            return;
        }
        stage.writeLine("Running TeaVM main.");
        await mainFunction();
    }
}
class TeaVmPerformer implements TerminalPerformerContract {
    private readonly moduleLoader: TeaVmModuleLoader;
    private readonly mainInvoker: TeaVmMainInvoker;
    private loadedModule: Record<string, unknown> | undefined;
    constructor(sessionBaseUrl: string) {
        this.moduleLoader = new TeaVmModuleLoader(sessionBaseUrl);
        this.mainInvoker = new TeaVmMainInvoker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        this.loadedModule = await this.moduleLoader.loadModule(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        if (!this.loadedModule) {
            throw new Error("TeaVM module not loaded. Call loadInto first.");
        }
        await this.mainInvoker.invokeMain(this.loadedModule, stage);
    }
}
export { TeaVmPerformer };
