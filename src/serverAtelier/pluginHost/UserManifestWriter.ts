import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { UserManifestRecord } from "@sharedKernel/UserManifestRecord.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { isBuildOutputPath } from "@serverAtelier/utilities/BuildOutputFilter.ts";
class UserManifestWriter {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async writeInto(
        userCodeDirectory: string,
        entryFileRelativePath: string,
        languageIdentifier: LanguageIdentifier,
        programArguments: ReadonlyArray<string> = [],
    ): Promise<UserManifestRecord> {
        const everyFilePath =
            await this.fileSystemOperations.listFilesRecursively(userCodeDirectory);
        const includedFileRelativePaths = everyFilePath.filter(
            (relativePath) => !isBuildOutputPath(relativePath),
        );
        const manifest: UserManifestRecord = {
            entryFileRelativePath,
            includedFileRelativePaths,
            programArguments,
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
