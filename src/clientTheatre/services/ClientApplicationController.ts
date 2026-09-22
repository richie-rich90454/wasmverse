import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import { BackendApiClient } from "@clientTheatre/services/BackendApiClient.ts";
import { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { UploadCurtainController } from "@clientTheatre/services/UploadCurtainController.ts";
import { StatusRibbonController } from "@clientTheatre/services/StatusRibbonController.ts";
import { TerminalPerformerFactory } from "@clientTheatre/runtimePerformers/TerminalPerformerFactory.ts";
type ClientApplicationState = "idle" | "uploading" | "building" | "performing" | "finished";
type ClientApplicationListener = () => void;
class ClientApplicationController {
    readonly backendApiClient: BackendApiClient;
    readonly terminalStageController: TerminalStageController;
    readonly uploadCurtainController: UploadCurtainController;
    readonly statusRibbonController: StatusRibbonController;
    readonly terminalPerformerFactory: TerminalPerformerFactory;
    currentState: ClientApplicationState = "idle";
    activeSession: SessionDescriptorRecord | undefined;
    private listeners: Set<ClientApplicationListener> = new Set();
    constructor() {
        this.backendApiClient = new BackendApiClient();
        this.terminalStageController = new TerminalStageController();
        this.uploadCurtainController = new UploadCurtainController();
        this.statusRibbonController = new StatusRibbonController();
        this.terminalPerformerFactory = new TerminalPerformerFactory();
    }
    initializeUploadFlow(): void {
        this.currentState = "idle";
        this.notifyListeners();
    }
    async handleArchiveSubmission(file: File, entryFileName: string): Promise<void> {
        this.uploadCurtainController.beginUpload();
        this.transitionToState("uploading");
        this.statusRibbonController.setMessage("Uploading the archive.", "info");
        try {
            const descriptor = await this.backendApiClient.submitProjectArchive(
                file,
                entryFileName,
                () => {
                    if (this.currentState === "uploading") {
                        this.uploadCurtainController.markBuilding();
                        this.transitionToState("building");
                        this.statusRibbonController.setMessage("Building the session.", "info");
                    }
                },
            );
            if (this.currentState === "uploading") {
                this.uploadCurtainController.markBuilding();
                this.transitionToState("building");
                this.statusRibbonController.setMessage("Building the session.", "info");
            }
            this.activeSession = descriptor;
            this.transitionToState("performing");
            this.statusRibbonController.setMessage("Program running.", "info");
            const performer = this.terminalPerformerFactory.createForLanguage(
                descriptor.languageIdentifier,
                this.backendApiClient.constructSessionBaseUrl(descriptor.sessionIdentifier),
                descriptor,
            );
            await this.terminalStageController.whenMounted();
            await performer.loadInto(this.terminalStageController);
            await performer.performOn(this.terminalStageController);
            this.transitionToState("finished");
            this.statusRibbonController.setMessage("Program finished.", "ok");
        } catch (submissionError) {
            const errorMessage =
                submissionError instanceof Error
                    ? submissionError.message
                    : String(submissionError);
            const firstErrorLine = errorMessage.split("\n")[0] as string;
            this.uploadCurtainController.recordError(firstErrorLine);
            this.statusRibbonController.setMessage(firstErrorLine, "err");
            if (this.currentState === "performing" || this.currentState === "finished") {
                this.terminalStageController.writeLine(`Error: ${firstErrorLine}`);
                this.transitionToState("finished");
            } else {
                this.transitionToState("idle");
            }
        }
    }
    beginAnotherRun(): void {
        this.terminalStageController.dispose();
        this.activeSession = undefined;
        this.uploadCurtainController.reset();
        this.statusRibbonController.setMessage("", "info");
        this.transitionToState("idle");
    }
    subscribe(listener: ClientApplicationListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    private transitionToState(nextState: ClientApplicationState): void {
        this.currentState = nextState;
        this.notifyListeners();
    }
    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
export { ClientApplicationController };
export type { ClientApplicationState, ClientApplicationListener };
