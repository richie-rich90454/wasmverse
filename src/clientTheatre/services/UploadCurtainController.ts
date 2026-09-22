type UploadCurtainPhase = "idle" | "uploading" | "building";
type UploadCurtainListener = () => void;
class UploadCurtainController {
    selectedFile: File | undefined;
    entryFileName: string = "";
    phase: UploadCurtainPhase = "idle";
    errorMessage: string = "";
    private listeners: Set<UploadCurtainListener> = new Set();
    get isBuilding(): boolean {
        return this.phase !== "idle";
    }
    selectFile(file: File): void {
        this.selectedFile = file;
        this.errorMessage = "";
        this.notifyListeners();
    }
    setEntryFileName(entryFileName: string): void {
        this.entryFileName = entryFileName;
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
    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
export { UploadCurtainController };
export type { UploadCurtainListener, UploadCurtainPhase };
