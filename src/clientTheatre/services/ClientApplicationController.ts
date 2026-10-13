import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import { BackendApiClient } from "@clientTheatre/services/BackendApiClient.ts";
import { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { UploadCurtainController } from "@clientTheatre/services/UploadCurtainController.ts";
import { StatusRibbonController } from "@clientTheatre/services/StatusRibbonController.ts";
import { CodeProjectEditorController } from "@clientTheatre/services/CodeProjectEditorController.ts";
import { GitHubImportController } from "@clientTheatre/services/GitHubImportController.ts";
import { parseProgramArgumentText } from "@clientTheatre/services/ProgramArgumentSerializer.ts";
import { packProjectArchive } from "@clientTheatre/services/ProjectArchivePacker.ts";
import { TerminalPerformerFactory } from "@clientTheatre/runtimePerformers/TerminalPerformerFactory.ts";
type ClientApplicationState = "idle" | "uploading" | "building" | "performing" | "finished";
type ClientApplicationListener = () => void;
class ClientApplicationController {
    readonly backendApiClient: BackendApiClient;
    readonly terminalStageController: TerminalStageController;
    readonly uploadCurtainController: UploadCurtainController;
    readonly statusRibbonController: StatusRibbonController;
    readonly codeProjectEditorController: CodeProjectEditorController;
    readonly githubImportController: GitHubImportController;
    readonly terminalPerformerFactory: TerminalPerformerFactory;
    currentState: ClientApplicationState = "idle";
    activeSession: SessionDescriptorRecord | undefined;
    private listeners: Set<ClientApplicationListener> = new Set();
    constructor() {
        this.backendApiClient = new BackendApiClient();
        this.terminalStageController = new TerminalStageController();
        this.uploadCurtainController = new UploadCurtainController();
        this.statusRibbonController = new StatusRibbonController();
        this.codeProjectEditorController = new CodeProjectEditorController();
        this.githubImportController = new GitHubImportController();
        this.terminalPerformerFactory = new TerminalPerformerFactory();
    }
    initializeUploadFlow(): void {
        this.currentState = "idle";
        this.notifyListeners();
    }
    async handleArchiveSubmission(
        archive: File | Blob,
        entryFileName: string,
        programArguments?: ReadonlyArray<string>,
    ): Promise<void> {
        if (this.currentState === "uploading" || this.currentState === "building") {
            return;
        }
        const resolvedProgramArguments = programArguments ?? this.currentProgramArguments();
        this.uploadCurtainController.beginUpload();
        this.transitionToState("uploading");
        this.statusRibbonController.setMessage("Uploading the archive.", "info");
        try {
            const descriptor = await this.backendApiClient.submitProjectArchive(
                archive,
                entryFileName,
                () => {
                    if (this.currentState === "uploading") {
                        this.uploadCurtainController.markBuilding();
                        this.transitionToState("building");
                        this.statusRibbonController.setMessage("Building the session.", "info");
                    }
                },
                resolvedProgramArguments,
            );
            await this.runSubmittedSession(descriptor);
        } catch (submissionError) {
            const firstErrorLine = this.firstErrorLineOf(submissionError);
            this.uploadCurtainController.recordError(firstErrorLine);
            this.reportSubmissionError(firstErrorLine);
        }
    }
    async handlePastedSourceSubmission(fileName: string, sourceText: string): Promise<void> {
        const trimmedFileName = fileName.trim();
        if (trimmedFileName.length === 0) {
            this.statusRibbonController.setMessage(
                "Name the single source file before running.",
                "err",
            );
            return;
        }
        const archiveBytes = packProjectArchive(new Map([[trimmedFileName, sourceText]]));
        const archiveBlob = new Blob([archiveBytes], { type: "application/zip" });
        await this.handleArchiveSubmission(archiveBlob, trimmedFileName);
    }
    async handleEditorProjectSubmission(): Promise<void> {
        const editorController = this.codeProjectEditorController;
        if (editorController.fileCount === 0) {
            this.statusRibbonController.setMessage("Add at least one file to the project.", "err");
            return;
        }
        if (editorController.entryFilePath.length === 0) {
            this.statusRibbonController.setMessage("Select the entry file before building.", "err");
            return;
        }
        const archiveBytes = editorController.packSourceArchive();
        const archiveBlob = new Blob([archiveBytes], { type: "application/zip" });
        await this.handleArchiveSubmission(archiveBlob, editorController.entryFilePath);
    }
    async handleGitHubImport(): Promise<void> {
        if (this.currentState === "uploading" || this.currentState === "building") {
            return;
        }
        this.transitionToState("uploading");
        this.statusRibbonController.setMessage("Importing the repository from GitHub.", "info");
        const descriptor = await this.githubImportController.importRepository();
        if (!descriptor) {
            const importErrorMessage =
                this.githubImportController.errorMessage || "The repository could not be imported.";
            this.statusRibbonController.setMessage(importErrorMessage, "err");
            this.transitionToState("idle");
            return;
        }
        try {
            await this.runSubmittedSession(descriptor);
        } catch (submissionError) {
            this.reportSubmissionError(this.firstErrorLineOf(submissionError));
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
    private currentProgramArguments(): Array<string> {
        return parseProgramArgumentText(this.uploadCurtainController.programArgumentsText);
    }
    private async runSubmittedSession(descriptor: SessionDescriptorRecord): Promise<void> {
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
    }
    private firstErrorLineOf(submissionError: unknown): string {
        const errorMessage =
            submissionError instanceof Error ? submissionError.message : String(submissionError);
        return errorMessage.split("\n")[0] as string;
    }
    private reportSubmissionError(firstErrorLine: string): void {
        this.statusRibbonController.setMessage(firstErrorLine, "err");
        if (this.currentState === "performing" || this.currentState === "finished") {
            this.terminalStageController.writeLine(`Error: ${firstErrorLine}`);
            this.transitionToState("finished");
        } else {
            this.transitionToState("idle");
        }
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
