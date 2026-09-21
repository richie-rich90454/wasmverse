import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
interface TerminalPerformerContract {
    loadInto(stage: TerminalStageController): Promise<void>;
    performOn(stage: TerminalStageController): Promise<void>;
}
export type { TerminalPerformerContract };
