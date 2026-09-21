type UploadCurtainListener = () => void;
class UploadCurtainController {
    selectedFile: File | undefined;
    entryFileName: string = "";
    isBuilding: boolean = false;
    errorMessage: string = "";
    private listeners: Set<UploadCurtainListener> = new Set();
    selectFile(file: File): void {
        this.selectedFile = file;
        this.errorMessage = "";
        this.notifyListeners();
    }
    setEntryFileName(entryFileName: string): void {
        this.entryFileName = entryFileName;
        this.notifyListeners();
    }
    beginBuild(): void {
        this.isBuilding = true;
        this.errorMessage = "";
        this.notifyListeners();
    }
    recordError(errorMessage: string): void {
        this.isBuilding = false;
        this.errorMessage = errorMessage;
        this.notifyListeners();
    }
    reset(): void {
        this.selectedFile = undefined;
        this.entryFileName = "";
        this.isBuilding = false;
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
export type { UploadCurtainListener };
