import { unzipSync } from "fflate";
import { detectEntryFile } from "@clientTheatre/services/EntryFileDetector.ts";
import { DroppedFolderReader } from "@clientTheatre/services/DroppedFolderReader.ts";
import { packProjectArchive } from "@clientTheatre/services/ProjectArchivePacker.ts";
type UploadCurtainPhase = "idle" | "uploading" | "building";
type UploadCurtainListener = () => void;
class UploadCurtainController {
    selectedFile: File | undefined;
    entryFileName: string = "";
    entryFileOptions: ReadonlyArray<string> = [];
    programArgumentsText: string = "";
    phase: UploadCurtainPhase = "idle";
    errorMessage: string = "";
    private readonly droppedFolderReader: DroppedFolderReader = new DroppedFolderReader();
    private listeners: Set<UploadCurtainListener> = new Set();
    get isBuilding(): boolean {
        return this.phase !== "idle";
    }
    async selectFile(file: File): Promise<void> {
        this.selectedFile = file;
        this.errorMessage = "";
        try {
            const archiveBytes = new Uint8Array(await file.arrayBuffer());
            const unzippedEntries = unzipSync(archiveBytes);
            const archiveFilePaths = Object.keys(unzippedEntries);
            this.entryFileOptions = archiveFilePaths;
            this.entryFileName = detectEntryFile(archiveFilePaths);
        } catch {
            this.entryFileOptions = [];
            this.entryFileName = "";
            this.errorMessage = "The archive could not be read. Confirm it is a valid zip file.";
        }
        this.notifyListeners();
    }
    selectDroppedDataTransfer(dataTransfer: DataTransfer): void {
        const droppedEntries = this.droppedFolderReader.collectEntries(dataTransfer.items);
        if (droppedEntries.some((entry) => entry.isDirectory)) {
            void this.selectDroppedFolderEntries(droppedEntries);
            return;
        }
        const droppedFile = dataTransfer.files[0];
        if (droppedFile) {
            void this.selectFile(droppedFile);
        }
    }
    setEntryFileName(entryFileName: string): void {
        this.entryFileName = entryFileName;
        this.notifyListeners();
    }
    setProgramArgumentsText(programArgumentsText: string): void {
        this.programArgumentsText = programArgumentsText;
        this.notifyListeners();
    }
    beginUpload(): void {
        this.phase = "uploading";
        this.errorMessage = "";
        this.notifyListeners();
    }
    markBuilding(): void {
        this.phase = "building";
        this.notifyListeners();
    }
    recordError(errorMessage: string): void {
        this.phase = "idle";
        this.errorMessage = errorMessage;
        this.notifyListeners();
    }
    reset(): void {
        this.selectedFile = undefined;
        this.entryFileName = "";
        this.entryFileOptions = [];
        this.phase = "idle";
        this.errorMessage = "";
        this.notifyListeners();
    }
    subscribe(listener: UploadCurtainListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    private async selectDroppedFolderEntries(
        entries: ReadonlyArray<FileSystemEntry>,
    ): Promise<void> {
        try {
            const droppedFiles = await this.droppedFolderReader.readEntries(entries);
            if (droppedFiles.size === 0) {
                this.errorMessage = "The dropped folder contained no readable files.";
                this.notifyListeners();
                return;
            }
            const archiveBytes = packProjectArchive(droppedFiles);
            const archiveFile = new File([archiveBytes], "project.zip", {
                type: "application/zip",
            });
            await this.selectFile(archiveFile);
        } catch {
            this.errorMessage = "The dropped folder could not be read.";
            this.notifyListeners();
        }
    }
    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
export { UploadCurtainController };
export type { UploadCurtainListener, UploadCurtainPhase };
