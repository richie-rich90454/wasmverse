import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { BusyboxWasiRunner } from "@clientTheatre/runtimePerformers/BusyboxWasiRunner.ts";
class BusyboxAwkPerformer implements TerminalPerformerContract {
    private readonly runner: BusyboxWasiRunner;
    constructor(sessionBaseUrl: string) {
        this.runner = new BusyboxWasiRunner(sessionBaseUrl, "awk", (entryProgramPath, args) => [
            "busybox",
            "awk",
            ...args.flatMap((argumentValue, argumentIndex) => [
                "-v",
                `arg${argumentIndex}=${argumentValue}`,
            ]),
            "-f",
            entryProgramPath,
        ]);
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        await this.runner.loadInto(stage);
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        await this.runner.performOn(stage);
    }
}
export { BusyboxAwkPerformer };
