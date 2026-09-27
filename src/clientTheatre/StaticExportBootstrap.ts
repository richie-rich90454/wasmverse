import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
type PerformerCreator = (sessionBaseUrl: string) => TerminalPerformerContract;
let mountedStage: TerminalStageController | undefined;
function reportFailure(reason: unknown): void {
    const rawMessage = reason instanceof Error ? reason.message : String(reason);
    const firstLine = rawMessage.split("\n")[0] ?? rawMessage;
    if (mountedStage) {
        mountedStage.writeLine(`Error: ${firstLine}`);
        return;
    }
    document.body.textContent = `WASMVERSE export failed: ${firstLine}`;
}
function mountStage(): TerminalStageController {
    const container = document.getElementById("terminal");
    if (!container) {
        throw new Error("Export page is missing its terminal container.");
    }
    const stage = new TerminalStageController();
    stage.mountInto(container);
    mountedStage = stage;
    return stage;
}
async function startStaticExport(
    languageIdentifier: LanguageIdentifier,
    createPerformer: PerformerCreator,
): Promise<void> {
    const stage = mountStage();
    stage.writeLine(`WASMVERSE export ready: ${languageIdentifier}`);
    const sessionBaseUrl = new URL(".", import.meta.url).href;
    const performer = createPerformer(sessionBaseUrl);
    await performer.loadInto(stage);
    await performer.performOn(stage);
}
function runStaticExport(
    languageIdentifier: LanguageIdentifier,
    createPerformer: PerformerCreator,
): void {
    window.addEventListener("error", (event) => {
        reportFailure(event.error ?? event.message);
    });
    window.addEventListener("unhandledrejection", (event) => {
        reportFailure(event.reason);
    });
    void startStaticExport(languageIdentifier, createPerformer).catch(reportFailure);
}
export { runStaticExport };
