import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { forceBufferBasedWasmCompilation } from "@clientTheatre/runtimePerformers/PortableWasmCompilation.ts";
import { installEmbeddedAssetRuntime } from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
import { installTerminalConsoleBridge } from "@clientTheatre/services/TerminalConsoleBridge.ts";
type PerformerCreator = (sessionBaseUrl: string) => TerminalPerformerContract;
let mountedStage: TerminalStageController | undefined;
function reportFailure(reason: unknown): void {
    const rawMessage = reason instanceof Error ? reason.message : String(reason);
    if (mountedStage) {
        mountedStage.writeLine("Error:");
        mountedStage.writeLine(rawMessage);
        return;
    }
    document.body.textContent = `WASMVERSE export failed: ${rawMessage}`;
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
    forceBufferBasedWasmCompilation();
    installTerminalConsoleBridge();
    const sessionBaseUrl = new URL(".", import.meta.url).href;
    installEmbeddedAssetRuntime(sessionBaseUrl);
    const stage = mountStage();
    stage.focusStage();
    stage.writeLine(`WASMVERSE export ready: ${languageIdentifier}`);
    stage.writeLine("Type a value and press Enter when the program asks for input.");
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
