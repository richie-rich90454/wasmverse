import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
type GitHubImportPhase = "idle" | "importing";
type GitHubImportListener = () => void;
class GitHubImportController {
    repositoryReference: string = "";
    requestedReference: string = "";
    phase: GitHubImportPhase = "idle";
    errorMessage: string = "";
    private listeners: Set<GitHubImportListener> = new Set();
    get isImporting(): boolean {
        return this.phase === "importing";
    }
    setRepositoryReference(repositoryReference: string): void {
        this.repositoryReference = repositoryReference;
        this.notifyListeners();
    }
    setRequestedReference(requestedReference: string): void {
        this.requestedReference = requestedReference;
        this.notifyListeners();
    }
    async importRepository(): Promise<SessionDescriptorRecord | undefined> {
        const repositoryReference = this.repositoryReference.trim();
        if (repositoryReference.length === 0) {
            this.errorMessage = "Enter a repository as owner/repo or a full github.com URL.";
            this.notifyListeners();
            return undefined;
        }
        this.phase = "importing";
        this.errorMessage = "";
        this.notifyListeners();
        try {
            const requestPayload: { repositoryReference: string; ref?: string } = {
                repositoryReference,
            };
            const requestedReference = this.requestedReference.trim();
            if (requestedReference.length > 0) {
                requestPayload.ref = requestedReference;
            }
            const response = await fetch("/api/import-github", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestPayload),
            });
            if (!response.ok) {
                throw new Error(await extractErrorMessage(response));
            }
            return (await response.json()) as SessionDescriptorRecord;
        } catch (importError) {
            this.errorMessage =
                importError instanceof Error ? importError.message : String(importError);
            return undefined;
        } finally {
            this.phase = "idle";
            this.notifyListeners();
        }
    }
    subscribe(listener: GitHubImportListener): () => void {
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
async function extractErrorMessage(response: Response): Promise<string> {
    const fallbackMessage = `The repository could not be imported (HTTP ${response.status}).`;
    const errorPayload = (await response.json().catch(() => undefined)) as
        | { errorMessage?: string }
        | undefined;
    return errorPayload?.errorMessage ?? fallbackMessage;
}
export { GitHubImportController };
export type { GitHubImportListener, GitHubImportPhase };
