class DroppedFolderReader {
    collectEntries(dataTransferItemList: DataTransferItemList): ReadonlyArray<FileSystemEntry> {
        const collectedEntries: Array<FileSystemEntry> = [];
        for (let itemIndex = 0; itemIndex < dataTransferItemList.length; itemIndex += 1) {
            const dataTransferItem = dataTransferItemList[itemIndex];
            const fileSystemEntry = dataTransferItem.webkitGetAsEntry();
            if (fileSystemEntry) {
                collectedEntries.push(fileSystemEntry);
            }
        }
        return collectedEntries;
    }
    async readEntries(entries: ReadonlyArray<FileSystemEntry>): Promise<Map<string, Uint8Array>> {
        const filesByPath = new Map<string, Uint8Array>();
        for (const entry of entries) {
            await readEntryIntoMap(entry, "", filesByPath);
        }
        return filesByPath;
    }
}
async function readEntryIntoMap(
    entry: FileSystemEntry,
    parentPath: string,
    filesByPath: Map<string, Uint8Array>,
): Promise<void> {
    const entryPath = parentPath.length > 0 ? `${parentPath}/${entry.name}` : entry.name;
    if (entry.isFile) {
        const file = await fileFromEntry(entry as FileSystemFileEntry);
        filesByPath.set(entryPath, new Uint8Array(await file.arrayBuffer()));
        return;
    }
    if (entry.isDirectory) {
        const childEntries = await readAllDirectoryEntries(entry as FileSystemDirectoryEntry);
        for (const childEntry of childEntries) {
            await readEntryIntoMap(childEntry, entryPath, filesByPath);
        }
    }
}
function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
    return new Promise<File>((resolve, reject) => {
        entry.file(resolve, reject);
    });
}
function readAllDirectoryEntries(entry: FileSystemDirectoryEntry): Promise<Array<FileSystemEntry>> {
    const directoryReader = entry.createReader();
    return new Promise<Array<FileSystemEntry>>((resolve, reject) => {
        const collectedEntries: Array<FileSystemEntry> = [];
        const readNextBatch = (): void => {
            directoryReader.readEntries((batchEntries) => {
                if (batchEntries.length === 0) {
                    resolve(collectedEntries);
                    return;
                }
                collectedEntries.push(...batchEntries);
                readNextBatch();
            }, reject);
        };
        readNextBatch();
    });
}
export { DroppedFolderReader };
