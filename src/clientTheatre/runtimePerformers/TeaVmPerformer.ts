import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
class TeaVmModuleLoader {
    private readonly sessionBaseUrl: string;
    constructor(sessionBaseUrl: string) {
        this.sessionBaseUrl = sessionBaseUrl;
    }
    async loadModule(stage: TerminalStageController): Promise<Record<string, unknown>> {
        stage.writeLine("Loading TeaVM module.");
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...args: Array<unknown>) => {
            stage.writeLine(args.map((arg) => String(arg)).join(" "));
        };
        console.error = (...args: Array<unknown>) => {
            stage.writeLine(args.map((arg) => String(arg)).join(" "));
        };
        try {
            const loaderModule = (await import(
                /* @vite-ignore */ `${this.sessionBaseUrl}/runtime/teavm-loader.mjs`
            )) as { loadTeaVmModule(baseUrl: string): Promise<Record<string, unknown>> };
            return loaderModule.loadTeaVmModule(`${this.sessionBaseUrl}/runtime`);
        } finally {
            console.log = originalLog;
            console.error = originalError;
        }
    }
}
class TeaVmMainInvoker {
    async invokeMain(
        module: Record<string, unknown>,
        stage: TerminalStageController,
    ): Promise<void> {
        const mainFunction = module["main"];
        if (typeof mainFunction !== "function") {
            stage.writeLine("TeaVM module loaded.");
            return;
        }
        stage.writeLine("Running TeaVM main.");
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...args: Array<unknown>) => {
            stage.writeLine(args.map((arg) => String(arg)).join(" "));
        };
        console.error = (...args: Array<unknown>) => {
            stage.writeLine(args.map((arg) => String(arg)).join(" "));
        };
        try {
            await (mainFunction as () => Promise<unknown> | unknown)();
        } finally {
            console.log = originalLog;
            console.error = originalError;
        }
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
