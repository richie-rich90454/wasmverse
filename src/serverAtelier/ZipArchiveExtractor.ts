import { unzipSync } from "fflate";
import { PathGuard } from "@serverAtelier/utilities/PathGuard.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
interface ExtractionOutcome {
    rootDirectory: string;
    includedFileRelativePaths: Array<string>;
}
class ZipArchiveExtractor {
    private readonly fileSystemOperations: FileSystemOperations;
    private readonly pathGuard: PathGuard;
    constructor(fileSystemOperations: FileSystemOperations, pathGuard: PathGuard) {
        this.fileSystemOperations = fileSystemOperations;
        this.pathGuard = pathGuard;
    }
    async extractInto(zipBuffer: Uint8Array, sourceDirectory: string): Promise<ExtractionOutcome> {
        await this.fileSystemOperations.ensureDirectoryExists(sourceDirectory);
        const entries = unzipSync(zipBuffer);
        const writtenPaths: Array<string> = [];
        for (const [entryName, entryData] of Object.entries(entries)) {
            if (entryName.endsWith("/")) {
                continue;
            }
            const normalizedName = entryName.replace(/\\/g, "/");
            if (this.isPackagingNoise(normalizedName)) {
                continue;
            }
            this.pathGuard.assertInsideBaseDirectory(normalizedName, sourceDirectory);
            const targetPath = this.pathGuard.resolveInsideBaseDirectory(
                normalizedName,
                sourceDirectory,
            );
            await this.fileSystemOperations.writeBinaryFile(targetPath, entryData as Uint8Array);
            writtenPaths.push(normalizedName);
        }
        const unwrappedPaths = this.stripSingleWrappingDirectory(writtenPaths);
        if (unwrappedPaths !== writtenPaths) {
            await this.liftWrappedDirectory(sourceDirectory, writtenPaths);
        }
        return { rootDirectory: sourceDirectory, includedFileRelativePaths: unwrappedPaths };
    }
    private isPackagingNoise(normalizedName: string): boolean {
        const baseName = normalizedName.split("/").pop() as string;
        return (
            normalizedName.startsWith("__MACOSX/") ||
            normalizedName.includes("/__MACOSX/") ||
            baseName === ".DS_Store" ||
            baseName === "Thumbs.db" ||
            baseName === ".gitkeep"
        );
    }
    private stripSingleWrappingDirectory(writtenPaths: Array<string>): Array<string> {
        if (writtenPaths.length === 0) {
            return writtenPaths;
        }
        const firstSegments = writtenPaths.map((path) => path.split("/")[0] as string);
        const sharedRoot = firstSegments[0] as string;
        const sharesSingleRoot = firstSegments.every((segment) => segment === sharedRoot);
        const everyPathNested = writtenPaths.every((path) => path.includes("/"));
        if (sharesSingleRoot && everyPathNested) {
            return writtenPaths.map((path) => path.slice(sharedRoot.length + 1));
        }
        return writtenPaths;
    }
    private async liftWrappedDirectory(
        sourceDirectory: string,
        writtenPaths: Array<string>,
    ): Promise<void> {
        const sharedRoot = (writtenPaths[0] as string).split("/")[0] as string;
        const wrappedDirectory = `${sourceDirectory}/${sharedRoot}`;
        const stagingDirectory = `${sourceDirectory}.staging`;
        await this.fileSystemOperations.removeRecursively(stagingDirectory);
        await this.fileSystemOperations.moveInto(wrappedDirectory, stagingDirectory);
        const stagedFiles = await this.fileSystemOperations.listFilesRecursively(stagingDirectory);
        for (const stagedFile of stagedFiles) {
            await this.fileSystemOperations.moveInto(
                `${stagingDirectory}/${stagedFile}`,
                `${sourceDirectory}/${stagedFile}`,
            );
        }
        await this.fileSystemOperations.removeRecursively(stagingDirectory);
    }
}
export { ZipArchiveExtractor };
export type { ExtractionOutcome };
