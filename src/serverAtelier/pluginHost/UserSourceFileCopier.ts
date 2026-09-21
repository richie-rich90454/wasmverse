import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
class UserSourceFileCopier {
    private readonly fileSystemOperations: FileSystemOperations;
    constructor(fileSystemOperations: FileSystemOperations) {
        this.fileSystemOperations = fileSystemOperations;
    }
    async copyInto(sourceDirectory: string, targetDirectory: string): Promise<void> {
        await this.fileSystemOperations.copyDirectoryInto(sourceDirectory, targetDirectory);
    }
}
export { UserSourceFileCopier };
