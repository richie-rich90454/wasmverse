import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { TerminalPerformerFactory } from "@clientTheatre/runtimePerformers/TerminalPerformerFactory.ts";
async function bootstrapStaticExport(): Promise<void> {
    const descriptorResponse = await fetch("./session.json");
    if (!descriptorResponse.ok) {
        throw new Error("Export descriptor session.json is missing.");
    }
    const descriptor = (await descriptorResponse.json()) as SessionDescriptorRecord;
    const container = document.getElementById("terminal");
    if (!container) {
        throw new Error("Export page is missing its terminal container.");
    }
    const stageController = new TerminalStageController();
    stageController.mountInto(container);
    const performerFactory = new TerminalPerformerFactory();
    const performer = performerFactory.createForLanguage(
        descriptor.languageIdentifier,
        ".",
        descriptor,
    );
    try {
        await performer.loadInto(stageController);
        await performer.performOn(stageController);
    } catch (exportError) {
        const errorMessage =
            exportError instanceof Error ? exportError.message : String(exportError);
        stageController.writeLine(`Error: ${errorMessage.split("\n")[0] as string}`);
    }
}
void bootstrapStaticExport();
