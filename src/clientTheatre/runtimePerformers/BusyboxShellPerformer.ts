import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { BusyboxWasiRunner } from "@clientTheatre/runtimePerformers/BusyboxWasiRunner.ts";
class BusyboxShellPerformer implements TerminalPerformerContract {
    private readonly runner: BusyboxWasiRunner;
    constructor(sessionBaseUrl: string) {
        this.runner = new BusyboxWasiRunner(sessionBaseUrl, "shell", (entryProgramPath, args) => [
            "busybox",
            "sh",
            entryProgramPath,
            ...args,
        ]);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.runner.loadInto(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        await this.runner.performOn(stage);
    }
}
export { BusyboxShellPerformer };
