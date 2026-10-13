function directoryOf(relativePath: string): string {
    const separatorIndex = relativePath.lastIndexOf("/");
    return separatorIndex >= 0 ? relativePath.slice(0, separatorIndex) : "";
}
function joinRelativePath(directory: string, relativePath: string): string {
    return directory.length > 0 ? `${directory}/${relativePath}` : relativePath;
}
function normalizeWithinRoot(rawPath: string): string {
    const normalizedSegments: Array<string> = [];
    for (const rawSegment of rawPath.replace(/\\/g, "/").split("/")) {
        if (rawSegment.length === 0 || rawSegment === ".") {
            continue;
        }
        if (rawSegment === "..") {
            if (normalizedSegments.length === 0) {
                throw new Error(`Path escapes the project root: ${rawPath}`);
            }
            normalizedSegments.pop();
            continue;
        }
        normalizedSegments.push(rawSegment);
    }
    return normalizedSegments.join("/");
}
export { directoryOf, joinRelativePath, normalizeWithinRoot };
