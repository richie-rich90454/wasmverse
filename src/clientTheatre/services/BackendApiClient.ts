import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
class BackendApiClient {
    async submitProjectArchive(
        file: File,
        entryFileName: string,
    ): Promise<SessionDescriptorRecord> {
        const formData = new FormData();
        formData.append("archive", file);
        formData.append("entry", entryFileName);
        const response = await fetch("/api/session", { method: "POST", body: formData });
        if (!response.ok) {
            const errorPayload = await response
                .json()
                .catch(() => ({ errorMessage: response.statusText }));
            throw new Error(errorPayload.errorMessage ?? "Upload failed.");
        }
        return (await response.json()) as SessionDescriptorRecord;
    }
    constructSessionAssetUrl(sessionIdentifier: string, relativePath: string): string {
        return `/session/${sessionIdentifier}/dist/${relativePath}`;
    }
    constructSessionBaseUrl(sessionIdentifier: string): string {
        return `/session/${sessionIdentifier}/dist`;
    }
}
export { BackendApiClient };
