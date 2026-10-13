import { Directory, File, Inode, PreopenDirectory } from "@bjorn3/browser_wasi_shim";
function buildPreopenDirectory(userFiles: ReadonlyMap<string, string>): PreopenDirectory {
    const textEncoder = new TextEncoder();
    const rootEntries = new Map<string, Inode>();
    const directoryMaps = new Map<string, Map<string, Inode>>([["", rootEntries]]);
    const ensureDirectory = (directoryPath: string): Map<string, Inode> => {
        const existingDirectory = directoryMaps.get(directoryPath);
        if (existingDirectory) {
            return existingDirectory;
        }
        const parentPath = directoryPath.split("/").slice(0, -1).join("/");
        const parentEntries = ensureDirectory(parentPath);
        const childEntries = new Map<string, Inode>();
        parentEntries.set(directoryPath.split("/").pop() as string, new Directory(childEntries));
        directoryMaps.set(directoryPath, childEntries);
        return childEntries;
    };
    for (const [relativePath, fileContent] of userFiles) {
        const pathSegments = relativePath.split("/");
        const fileName = pathSegments.pop() as string;
        const containingDirectory = ensureDirectory(pathSegments.join("/"));
        containingDirectory.set(fileName, new File(textEncoder.encode(fileContent)));
    }
    return new PreopenDirectory("/", new Map<string, Inode>(rootEntries));
}
export { buildPreopenDirectory };
