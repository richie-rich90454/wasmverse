import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
class FileSystemOperations {
    async ensureDirectoryExists(directoryPath: string): Promise<void> {
        await mkdir(directoryPath, { recursive: true });
    }
    async removeRecursively(targetPath: string): Promise<void> {
        await rm(targetPath, { recursive: true, force: true });
    }
    async copyFileInto(sourcePath: string, targetPath: string): Promise<void> {
        await mkdir(dirname(targetPath), { recursive: true });
        await cp(sourcePath, targetPath);
    }
    async copyDirectoryInto(sourcePath: string, targetPath: string): Promise<void> {
        await mkdir(targetPath, { recursive: true });
        await cp(sourcePath, targetPath, { recursive: true });
    }
    async listFilesRecursively(directoryPath: string): Promise<Array<string>> {
        const collected: Array<string> = [];
        const walkDirectory = async (currentDirectory: string): Promise<void> => {
            const entries = await readdir(currentDirectory, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(currentDirectory, entry.name);
                if (entry.isDirectory()) {
                    await walkDirectory(fullPath);
                } else {
                    collected.push(relative(directoryPath, fullPath).split(sep).join("/"));
                }
            }
        };
        await walkDirectory(directoryPath);
        return collected.sort();
    }
    async pathExists(targetPath: string): Promise<boolean> {
        try {
            await stat(targetPath);
            return true;
        } catch {
            return false;
        }
    }
    async readTextFile(sourcePath: string): Promise<string> {
        return readFile(sourcePath, "utf8");
    }
    async readBinaryFile(sourcePath: string): Promise<Uint8Array> {
        return new Uint8Array(await readFile(sourcePath));
    }
    async writeTextFile(targetPath: string, content: string): Promise<void> {
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, content, "utf8");
    }
    async writeBinaryFile(targetPath: string, content: Uint8Array): Promise<void> {
        await mkdir(dirname(targetPath), { recursive: true });
        await writeFile(targetPath, content);
    }
    convertToPosixPath(filePath: string): string {
        return filePath.split(sep).join("/");
    }
}
export { FileSystemOperations };
