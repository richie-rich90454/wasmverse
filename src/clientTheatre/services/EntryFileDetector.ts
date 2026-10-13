const PREFERRED_ENTRY_STEMS: ReadonlyArray<string> = ["main", "program", "app", "index"];
const CODE_FILE_EXTENSIONS: ReadonlyArray<string> = [
    ".py",
    ".rb",
    ".lua",
    ".php",
    ".rs",
    ".c",
    ".h",
    ".cpp",
    ".cc",
    ".hpp",
    ".go",
    ".zig",
    ".swift",
    ".kt",
    ".kts",
    ".dart",
    ".java",
    ".cs",
    ".js",
    ".mjs",
    ".ts",
    ".mts",
    ".as",
    ".sql",
    ".ml",
    ".mli",
    ".hs",
];
function isCodeFile(relativePath: string): boolean {
    const lowercasedPath = relativePath.toLowerCase();
    return CODE_FILE_EXTENSIONS.some((extension) => lowercasedPath.endsWith(extension));
}
function stemOf(relativePath: string): string {
    const baseName = relativePath.split("/").pop() ?? relativePath;
    const lastDotIndex = baseName.lastIndexOf(".");
    return lastDotIndex > 0 ? baseName.slice(0, lastDotIndex) : baseName;
}
function detectEntryFile(archiveFilePaths: ReadonlyArray<string>): string {
    const normalizedPaths = archiveFilePaths
        .map((path) => path.replace(/\\/g, "/"))
        .filter((path) => path.length > 0 && !path.endsWith("/"));
    const codeFiles = normalizedPaths.filter((path) => isCodeFile(path));
    const rootCodeFiles = codeFiles.filter((path) => !path.includes("/"));
    for (const preferredStem of PREFERRED_ENTRY_STEMS) {
        const rootMatch = rootCodeFiles.find(
            (path) => stemOf(path).toLowerCase() === preferredStem,
        );
        if (rootMatch) {
            return rootMatch;
        }
    }
    for (const preferredStem of PREFERRED_ENTRY_STEMS) {
        const nestedMatch = codeFiles.find((path) => stemOf(path).toLowerCase() === preferredStem);
        if (nestedMatch) {
            return nestedMatch;
        }
    }
    if (rootCodeFiles.length > 0) {
        return rootCodeFiles[0] as string;
    }
    if (codeFiles.length > 0) {
        return codeFiles[0] as string;
    }
    if (normalizedPaths.length > 0) {
        return normalizedPaths[0] as string;
    }
    return "";
}
export { detectEntryFile, isCodeFile, stemOf };
