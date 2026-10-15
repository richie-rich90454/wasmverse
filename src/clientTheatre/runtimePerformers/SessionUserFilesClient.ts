import { encodeUserCodePath } from "@clientTheatre/runtimePerformers/UserCodeUrl.ts";
import {
    createRuntimeAssetLocator,
    type RuntimeAssetLocator,
} from "@clientTheatre/runtimePerformers/RuntimeAssetLocator.ts";
interface SessionUserFiles {
    entryRelativePath: string;
    programArguments: ReadonlyArray<string>;
    userFiles: Map<string, string>;
}
class SessionUserFilesClient {
    private readonly assetLocator: RuntimeAssetLocator;
    constructor(sessionBaseUrl: string) {
        this.assetLocator = createRuntimeAssetLocator(sessionBaseUrl);
    }
    async fetchUserFiles(): Promise<SessionUserFiles> {
        const manifestResponse = await fetch(
            this.assetLocator.resolveAssetUrl("user-code/manifest.json"),
        );
        if (!manifestResponse.ok) {
            throw new Error("Session manifest is missing. Rebuild the session and retry.");
        }
        const manifest = (await manifestResponse.json()) as {
            entryFileRelativePath: string;
            includedFileRelativePaths: Array<string>;
            programArguments?: Array<string>;
        };
        const userFiles = new Map<string, string>();
        for (const relativePath of manifest.includedFileRelativePaths) {
            if (relativePath === "manifest.json") {
                continue;
            }
            const fileResponse = await fetch(
                this.assetLocator.resolveAssetUrl(
                    `user-code/${encodeUserCodePath(relativePath)}`,
                ),
            );
            if (!fileResponse.ok) {
                throw new Error(`User file ${relativePath} is missing from the session.`);
            }
            userFiles.set(relativePath, await fileResponse.text());
        }
        return {
            entryRelativePath: manifest.entryFileRelativePath,
            programArguments: manifest.programArguments ?? [],
            userFiles,
        };
    }
}
export { SessionUserFilesClient };
export type { SessionUserFiles };
