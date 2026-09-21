import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { UserManifestRecord } from "@sharedKernel/UserManifestRecord.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class UserManifestWriter {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async writeInto(
        userCodeDirectory: string,
        entryFileRelativePath: string,
        languageIdentifier: LanguageIdentifier,
    ): Promise<UserManifestRecord> {
        const includedFileRelativePaths =
            await this.fileSystemOperations.listFilesRecursively(userCodeDirectory);
        const manifest: UserManifestRecord = {
            entryFileRelativePath,
            includedFileRelativePaths,
            runtimeType: languageIdentifier,
        };
        await this.fileSystemOperations.writeTextFile(
            `${userCodeDirectory}/manifest.json`,
            JSON.stringify(manifest, null, 4),
        );
        return manifest;
    }
}
export { UserManifestWriter };
