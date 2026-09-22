import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
class BackendApiClient {
    async submitProjectArchive(
        file: File,
        entryFileName: string,
        onArchiveTransferred?: () => void,
    ): Promise<SessionDescriptorRecord> {
        const formData = new FormData();
        formData.append("archive", file);
        formData.append("entry", entryFileName);
        return new Promise<SessionDescriptorRecord>((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.open("POST", "/api/session");
            request.upload.addEventListener("progress", (progressEvent) => {
                if (
                    progressEvent.lengthComputable &&
                    progressEvent.loaded >= progressEvent.total &&
                    onArchiveTransferred
                ) {
                    onArchiveTransferred();
                }
            });
            request.addEventListener("load", () => {
                if (request.status >= 200 && request.status < 300) {
                    resolve(JSON.parse(request.responseText) as SessionDescriptorRecord);
                    return;
                }
                try {
                    const errorPayload = JSON.parse(request.responseText) as {
                        errorMessage?: string;
                    };
                    reject(new Error(errorPayload.errorMessage ?? "Upload failed."));
                } catch {
                    reject(new Error(request.statusText || "Upload failed."));
                }
            });
            request.addEventListener("error", () => {
                reject(new Error("Upload failed. The server could not be reached."));
            });
            request.send(formData);
        });
    }
    constructSessionAssetUrl(sessionIdentifier: string, relativePath: string): string {
        return `/session/${sessionIdentifier}/dist/${relativePath}`;
    }
    constructSessionBaseUrl(sessionIdentifier: string): string {
        return `/session/${sessionIdentifier}/dist`;
    }
    constructStaticExportUrl(sessionIdentifier: string): string {
        return `/api/export/${sessionIdentifier}`;
    }
}
export { BackendApiClient };
