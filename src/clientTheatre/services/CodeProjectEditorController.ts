import type { Extension } from "@codemirror/state";
import type { StreamParser } from "@codemirror/language";
import { detectEntryFile } from "@clientTheatre/services/EntryFileDetector.ts";
import { packProjectArchive } from "@clientTheatre/services/ProjectArchivePacker.ts";
type CodeEditorLanguageLoader = () => Promise<Extension>;
type CodeEditorLanguageEntry = {
    extensions: ReadonlyArray<string>;
    languageLabel: string;
    loadLanguageSupport?: CodeEditorLanguageLoader;
};
type CodeProjectTreeEntry = {
    relativePath: string;
    displayName: string;
    entryKind: "file" | "folder";
    depth: number;
    languageLabel: string;
};
type CodeProjectEditorListener = () => void;
const ZIG_STREAM_LANGUAGE_CONFIGURATION = {
    name: "zig",
    keywords: {
        and: true,
        asm: true,
        break: true,
        catch: true,
        comptime: true,
        continue: true,
        defer: true,
        else: true,
        enum: true,
        errdefer: true,
        error: true,
        export: true,
        extern: true,
        fn: true,
        for: true,
        if: true,
        inline: true,
        linksection: true,
        noalias: true,
        nosuspend: true,
        orelse: true,
        packed: true,
        pub: true,
        resume: true,
        return: true,
        struct: true,
        suspend: true,
        switch: true,
        test: true,
        try: true,
        union: true,
        unreachable: true,
        usingnamespace: true,
        var: true,
        while: true,
    },
    types: {
        anyerror: true,
        anyframe: true,
        anytype: true,
        bool: true,
        comptime_float: true,
        comptime_int: true,
        f16: true,
        f32: true,
        f64: true,
        f80: true,
        f128: true,
        i8: true,
        i16: true,
        i32: true,
        i64: true,
        i128: true,
        isize: true,
        noreturn: true,
        type: true,
        u8: true,
        u16: true,
        u32: true,
        u64: true,
        u128: true,
        usize: true,
        void: true,
    },
    atoms: { true: true, false: true, null: true, undefined: true },
    blockKeywords: {
        catch: true,
        else: true,
        enum: true,
        fn: true,
        for: true,
        if: true,
        struct: true,
        switch: true,
        union: true,
        while: true,
    },
};
function loadStreamLanguageFrom(
    loadStreamParser: () => Promise<StreamParser<unknown>>,
): CodeEditorLanguageLoader {
    return async () => {
        const { StreamLanguage } = await import("@codemirror/language");
        return StreamLanguage.define(await loadStreamParser());
    };
}
const CODE_EDITOR_LANGUAGE_TABLE: ReadonlyArray<CodeEditorLanguageEntry> = [
    {
        extensions: [".py"],
        languageLabel: "Python",
        loadLanguageSupport: async () => (await import("@codemirror/lang-python")).python(),
    },
    {
        extensions: [".r"],
        languageLabel: "R",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/r")).r,
        ),
    },
    {
        extensions: [".cljs"],
        languageLabel: "ClojureScript",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/clojure")).clojure,
        ),
    },
    {
        extensions: [".scm"],
        languageLabel: "Scheme",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/scheme")).scheme,
        ),
    },
    {
        extensions: [".pl"],
        languageLabel: "Prolog",
    },
    {
        extensions: [".rb"],
        languageLabel: "Ruby",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/ruby")).ruby,
        ),
    },
    {
        extensions: [".pl", ".pm"],
        languageLabel: "Perl",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/perl")).perl,
        ),
    },
    {
        extensions: [".pas"],
        languageLabel: "Pascal",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/pascal")).pascal,
        ),
    },
    {
        extensions: [".cob"],
        languageLabel: "COBOL",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/cobol")).cobol,
        ),
    },
    {
        extensions: [".f90"],
        languageLabel: "Fortran",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/fortran")).fortran,
        ),
    },
    {
        extensions: [".lua"],
        languageLabel: "Lua",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/lua")).lua,
        ),
    },
    {
        extensions: [".php"],
        languageLabel: "PHP",
        loadLanguageSupport: async () => (await import("@codemirror/lang-php")).php(),
    },
    {
        extensions: [".rs"],
        languageLabel: "Rust",
        loadLanguageSupport: async () => (await import("@codemirror/lang-rust")).rust(),
    },
    {
        extensions: [".c", ".h"],
        languageLabel: "C",
        loadLanguageSupport: async () => (await import("@codemirror/lang-cpp")).cpp(),
    },
    {
        extensions: [".cpp", ".cc", ".hpp"],
        languageLabel: "C++",
        loadLanguageSupport: async () => (await import("@codemirror/lang-cpp")).cpp(),
    },
    {
        extensions: [".go"],
        languageLabel: "Go",
        loadLanguageSupport: async () => (await import("@codemirror/lang-go")).go(),
    },
    {
        extensions: [".zig"],
        languageLabel: "Zig",
        loadLanguageSupport: loadStreamLanguageFrom(async () =>
            (await import("@codemirror/legacy-modes/mode/clike")).clike(
                ZIG_STREAM_LANGUAGE_CONFIGURATION,
            ),
        ),
    },
    {
        extensions: [".swift"],
        languageLabel: "Swift",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/swift")).swift,
        ),
    },
    {
        extensions: [".kt", ".kts"],
        languageLabel: "Kotlin",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/clike")).kotlin,
        ),
    },
    {
        extensions: [".dart"],
        languageLabel: "Dart",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/clike")).dart,
        ),
    },
    {
        extensions: [".java"],
        languageLabel: "Java",
        loadLanguageSupport: async () => (await import("@codemirror/lang-java")).java(),
    },
    {
        extensions: [".cs"],
        languageLabel: "C#",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/clike")).csharp,
        ),
    },
    {
        extensions: [".js", ".mjs"],
        languageLabel: "JavaScript",
        loadLanguageSupport: async () => (await import("@codemirror/lang-javascript")).javascript(),
    },
    {
        extensions: [".ts", ".mts"],
        languageLabel: "TypeScript",
        loadLanguageSupport: async () =>
            (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
    },
    {
        extensions: [".as"],
        languageLabel: "AssemblyScript",
        loadLanguageSupport: async () =>
            (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
    },
    {
        extensions: [".ml", ".mli"],
        languageLabel: "OCaml",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/mllike")).oCaml,
        ),
    },
    {
        extensions: [".hs"],
        languageLabel: "Haskell",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/haskell")).haskell,
        ),
    },
    {
        extensions: [".duckdb.sql"],
        languageLabel: "DuckDB",
        loadLanguageSupport: async () => (await import("@codemirror/lang-sql")).sql(),
    },
    {
        extensions: [".pglite.sql"],
        languageLabel: "PGlite",
        loadLanguageSupport: async () => (await import("@codemirror/lang-sql")).sql(),
    },
    {
        extensions: [".sql"],
        languageLabel: "SQL",
        loadLanguageSupport: async () => (await import("@codemirror/lang-sql")).sql(),
    },
    {
        extensions: [".awk"],
        languageLabel: "AWK",
    },
    {
        extensions: [".jq"],
        languageLabel: "jq",
    },
    {
        extensions: [".sh"],
        languageLabel: "Bash",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/shell")).shell,
        ),
    },
    {
        extensions: [".scala"],
        languageLabel: "Scala",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/clike")).scala,
        ),
    },
    {
        extensions: [".fs", ".fsx"],
        languageLabel: "F#",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/mllike")).fSharp,
        ),
    },
    {
        extensions: [".elm"],
        languageLabel: "Elm",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/elm")).elm,
        ),
    },
    {
        extensions: [".res", ".resi"],
        languageLabel: "ReScript",
        loadLanguageSupport: async () =>
            (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
    },
    {
        extensions: [".purs"],
        languageLabel: "PureScript",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/haskell")).haskell,
        ),
    },
    {
        extensions: [".gleam"],
        languageLabel: "Gleam",
        loadLanguageSupport: loadStreamLanguageFrom(
            async () => (await import("@codemirror/legacy-modes/mode/erlang")).erlang,
        ),
    },
    {
        extensions: [".hx"],
        languageLabel: "Haxe",
        loadLanguageSupport: async () =>
            (await import("@codemirror/lang-javascript")).javascript({ typescript: true }),
    },
];
function codeEditorLanguageEntryForPath(relativePath: string): CodeEditorLanguageEntry | undefined {
    const lowercasedPath = relativePath.toLowerCase();
    return CODE_EDITOR_LANGUAGE_TABLE.find((languageEntry) =>
        languageEntry.extensions.some((extension) => lowercasedPath.endsWith(extension)),
    );
}
function codeEditorLanguageLabelForPath(relativePath: string): string {
    return codeEditorLanguageEntryForPath(relativePath)?.languageLabel ?? "Plain Text";
}
function normalizeProjectPath(rawPath: string): string {
    return rawPath
        .trim()
        .replace(/\\/g, "/")
        .split("/")
        .filter((pathSegment) => pathSegment.length > 0 && pathSegment !== ".")
        .join("/");
}
function compareProjectPaths(leftPath: string, rightPath: string): number {
    if (leftPath < rightPath) {
        return -1;
    }
    if (leftPath > rightPath) {
        return 1;
    }
    return 0;
}
class CodeProjectEditorController {
    entryFilePath: string = "";
    selectedPath: string = "";
    errorMessage: string = "";
    structureVersion: number = 0;
    private sourceFilesByPath: Map<string, string> = new Map();
    private folderPaths: Set<string> = new Set();
    private dirtyPaths: Set<string> = new Set();
    private entryFileManuallySelected: boolean = false;
    private listeners: Set<CodeProjectEditorListener> = new Set();
    get fileCount(): number {
        return this.sourceFilesByPath.size;
    }
    get openFilePath(): string {
        return this.sourceFilesByPath.has(this.selectedPath) ? this.selectedPath : "";
    }
    sourceTextFor(relativePath: string): string {
        return this.sourceFilesByPath.get(relativePath) ?? "";
    }
    filePaths(): ReadonlyArray<string> {
        return [...this.sourceFilesByPath.keys()].sort(compareProjectPaths);
    }
    isDirty(relativePath: string): boolean {
        return this.dirtyPaths.has(relativePath);
    }
    selectPath(relativePath: string): void {
        this.selectedPath = relativePath;
        this.errorMessage = "";
        this.notifyListeners();
    }
    setEntryFilePath(relativePath: string): void {
        const normalizedPath = normalizeProjectPath(relativePath);
        if (!this.sourceFilesByPath.has(normalizedPath)) {
            this.errorMessage = "Select an existing file as the entry file.";
            this.notifyListeners();
            return;
        }
        this.entryFilePath = normalizedPath;
        this.entryFileManuallySelected = true;
        this.errorMessage = "";
        this.notifyListeners();
    }
    createFile(rawPath: string, fileContents: string = ""): void {
        const relativePath = normalizeProjectPath(rawPath);
        const validationMessage = this.validateNewPath(relativePath);
        if (validationMessage.length > 0) {
            this.errorMessage = validationMessage;
            this.notifyListeners();
            return;
        }
        this.sourceFilesByPath.set(relativePath, fileContents);
        this.registerParentFolders(relativePath);
        if (this.selectedPath.length === 0) {
            this.selectedPath = relativePath;
        }
        this.refreshEntryFile();
        this.errorMessage = "";
        this.bumpStructureVersion();
    }
    createFolder(rawPath: string): void {
        const relativePath = normalizeProjectPath(rawPath);
        const validationMessage = this.validateNewPath(relativePath);
        if (validationMessage.length > 0) {
            this.errorMessage = validationMessage;
            this.notifyListeners();
            return;
        }
        this.folderPaths.add(relativePath);
        this.registerParentFolders(relativePath);
        this.errorMessage = "";
        this.bumpStructureVersion();
    }
    renameEntry(rawFromPath: string, rawToPath: string): void {
        const fromPath = normalizeProjectPath(rawFromPath);
        const toPath = normalizeProjectPath(rawToPath);
        if (toPath.length === 0) {
            this.errorMessage = "Enter the new file or folder path.";
            this.notifyListeners();
            return;
        }
        if (fromPath === toPath) {
            this.errorMessage = "";
            this.notifyListeners();
            return;
        }
        const isFile = this.sourceFilesByPath.has(fromPath);
        const isFolder = this.folderPaths.has(fromPath);
        if (!isFile && !isFolder) {
            this.errorMessage = `"${fromPath}" no longer exists.`;
            this.notifyListeners();
            return;
        }
        if (isFolder && toPath.startsWith(`${fromPath}/`)) {
            this.errorMessage = "A folder cannot be moved inside itself.";
            this.notifyListeners();
            return;
        }
        const validationMessage = this.validateNewPath(toPath);
        if (validationMessage.length > 0) {
            this.errorMessage = validationMessage;
            this.notifyListeners();
            return;
        }
        if (isFile) {
            const fileContents = this.sourceFilesByPath.get(fromPath) ?? "";
            this.sourceFilesByPath.delete(fromPath);
            this.sourceFilesByPath.set(toPath, fileContents);
            if (this.dirtyPaths.delete(fromPath)) {
                this.dirtyPaths.add(toPath);
            }
            if (this.selectedPath === fromPath) {
                this.selectedPath = toPath;
            }
            if (this.entryFilePath === fromPath) {
                this.entryFilePath = toPath;
            }
        } else {
            this.renameFolderDescendants(fromPath, toPath);
            this.folderPaths.delete(fromPath);
            this.folderPaths.add(toPath);
        }
        this.registerParentFolders(toPath);
        this.errorMessage = "";
        this.bumpStructureVersion();
    }
    deleteEntry(rawPath: string): void {
        const relativePath = normalizeProjectPath(rawPath);
        const isFile = this.sourceFilesByPath.has(relativePath);
        const isFolder = this.folderPaths.has(relativePath);
        if (!isFile && !isFolder) {
            this.errorMessage = `"${relativePath}" no longer exists.`;
            this.notifyListeners();
            return;
        }
        if (isFile) {
            this.sourceFilesByPath.delete(relativePath);
            this.dirtyPaths.delete(relativePath);
        } else {
            const folderPrefix = `${relativePath}/`;
            for (const filePath of [...this.sourceFilesByPath.keys()]) {
                if (filePath.startsWith(folderPrefix)) {
                    this.sourceFilesByPath.delete(filePath);
                    this.dirtyPaths.delete(filePath);
                }
            }
            for (const folderPath of [...this.folderPaths]) {
                if (folderPath === relativePath || folderPath.startsWith(folderPrefix)) {
                    this.folderPaths.delete(folderPath);
                }
            }
        }
        if (
            this.selectedPath === relativePath ||
            this.selectedPath.startsWith(`${relativePath}/`)
        ) {
            this.selectedPath = this.filePaths()[0] ?? "";
        }
        if (
            this.entryFilePath === relativePath ||
            this.entryFilePath.startsWith(`${relativePath}/`)
        ) {
            this.entryFileManuallySelected = false;
        }
        this.refreshEntryFile();
        this.errorMessage = "";
        this.bumpStructureVersion();
    }
    updateFileContent(rawPath: string, fileContents: string): void {
        const relativePath = normalizeProjectPath(rawPath);
        if (!this.sourceFilesByPath.has(relativePath)) {
            return;
        }
        if (this.sourceFilesByPath.get(relativePath) === fileContents) {
            return;
        }
        this.sourceFilesByPath.set(relativePath, fileContents);
        this.dirtyPaths.add(relativePath);
        this.notifyListeners();
    }
    treeEntries(): ReadonlyArray<CodeProjectTreeEntry> {
        const allPaths = [...this.folderPaths, ...this.sourceFilesByPath.keys()].sort(
            compareProjectPaths,
        );
        return allPaths.map((relativePath) => {
            const isFile = this.sourceFilesByPath.has(relativePath);
            const lastSeparatorIndex = relativePath.lastIndexOf("/");
            return {
                relativePath,
                displayName:
                    lastSeparatorIndex >= 0
                        ? relativePath.slice(lastSeparatorIndex + 1)
                        : relativePath,
                entryKind: isFile ? "file" : "folder",
                depth: relativePath.split("/").length - 1,
                languageLabel: isFile ? codeEditorLanguageLabelForPath(relativePath) : "",
            };
        });
    }
    packSourceArchive(): Uint8Array<ArrayBuffer> {
        return packProjectArchive(this.sourceFilesByPath);
    }
    async loadLanguageSupportFor(relativePath: string): Promise<Extension> {
        const languageEntry = codeEditorLanguageEntryForPath(relativePath);
        if (!languageEntry?.loadLanguageSupport) {
            return [];
        }
        try {
            return await languageEntry.loadLanguageSupport();
        } catch {
            return [];
        }
    }
    subscribe(listener: CodeProjectEditorListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }
    private validateNewPath(relativePath: string): string {
        if (relativePath.length === 0) {
            return "Enter a file or folder path.";
        }
        if (relativePath.split("/").includes("..")) {
            return "Paths cannot contain '..'.";
        }
        if (this.sourceFilesByPath.has(relativePath) || this.folderPaths.has(relativePath)) {
            return `"${relativePath}" already exists.`;
        }
        return "";
    }
    private registerParentFolders(relativePath: string): void {
        const pathSegments = relativePath.split("/");
        for (let segmentCount = 1; segmentCount < pathSegments.length; segmentCount += 1) {
            this.folderPaths.add(pathSegments.slice(0, segmentCount).join("/"));
        }
    }
    private refreshEntryFile(): void {
        if (this.entryFileManuallySelected && this.sourceFilesByPath.has(this.entryFilePath)) {
            return;
        }
        this.entryFilePath = detectEntryFile(this.filePaths());
    }
    private renameFolderDescendants(fromPath: string, toPath: string): void {
        const fromPrefix = `${fromPath}/`;
        for (const filePath of [...this.sourceFilesByPath.keys()]) {
            if (!filePath.startsWith(fromPrefix)) {
                continue;
            }
            const movedPath = `${toPath}${filePath.slice(fromPath.length)}`;
            const fileContents = this.sourceFilesByPath.get(filePath) ?? "";
            this.sourceFilesByPath.delete(filePath);
            this.sourceFilesByPath.set(movedPath, fileContents);
            if (this.dirtyPaths.delete(filePath)) {
                this.dirtyPaths.add(movedPath);
            }
            if (this.selectedPath === filePath) {
                this.selectedPath = movedPath;
            }
            if (this.entryFilePath === filePath) {
                this.entryFilePath = movedPath;
            }
        }
        for (const folderPath of [...this.folderPaths]) {
            if (!folderPath.startsWith(fromPrefix)) {
                continue;
            }
            this.folderPaths.delete(folderPath);
            this.folderPaths.add(`${toPath}${folderPath.slice(fromPath.length)}`);
        }
    }
    private bumpStructureVersion(): void {
        this.structureVersion += 1;
        this.notifyListeners();
    }
    private notifyListeners(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }
}
export {
    CODE_EDITOR_LANGUAGE_TABLE,
    CodeProjectEditorController,
    codeEditorLanguageEntryForPath,
    codeEditorLanguageLabelForPath,
};
export type {
    CodeEditorLanguageEntry,
    CodeEditorLanguageLoader,
    CodeProjectEditorListener,
    CodeProjectTreeEntry,
};
