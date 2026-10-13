import { describe, expect, test } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { CodeProjectEditorController } from "@clientTheatre/services/CodeProjectEditorController.ts";
describe("CodeProjectEditorController file tree operations", () => {
    test("creates files with implicit parent folders and detects the entry file", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("lib/util.py", "u = 1");
        const pathsAfterFirstFile = editorController
            .treeEntries()
            .map((treeEntry) => treeEntry.relativePath);
        expect(pathsAfterFirstFile).toEqual(["lib", "lib/util.py"]);
        editorController.createFile("main.py", "print('hi')");
        expect(editorController.entryFilePath).toBe("main.py");
    });
    test("orders tree entries parents before children with depth and kind", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("src/deep/helper.py");
        editorController.createFile("main.py");
        const treeEntries = editorController.treeEntries();
        expect(treeEntries.map((treeEntry) => treeEntry.relativePath)).toEqual([
            "main.py",
            "src",
            "src/deep",
            "src/deep/helper.py",
        ]);
        expect(
            treeEntries.find((treeEntry) => treeEntry.relativePath === "src/deep")?.entryKind,
        ).toBe("folder");
        expect(
            treeEntries.find((treeEntry) => treeEntry.relativePath === "src/deep/helper.py")?.depth,
        ).toBe(2);
    });
    test("renames files and follows dirty state and entry linkage", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("main.py", "print('hi')");
        editorController.updateFileContent("main.py", "print('bye')");
        expect(editorController.isDirty("main.py")).toBe(true);
        editorController.renameEntry("main.py", "app.py");
        expect(editorController.filePaths()).toEqual(["app.py"]);
        expect(editorController.entryFilePath).toBe("app.py");
        expect(editorController.isDirty("app.py")).toBe(true);
        expect(editorController.isDirty("main.py")).toBe(false);
    });
    test("renames folders with their descendants and follows selection and entry", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("src/main.py", "print('hi')");
        editorController.selectPath("src/main.py");
        editorController.renameEntry("src", "app");
        expect(editorController.filePaths()).toEqual(["app/main.py"]);
        expect(editorController.entryFilePath).toBe("app/main.py");
        expect(editorController.selectedPath).toBe("app/main.py");
        expect(editorController.treeEntries().map((treeEntry) => treeEntry.relativePath)).toEqual([
            "app",
            "app/main.py",
        ]);
    });
    test("deletes folders with their descendants and re-detects the entry file", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("main.py");
        editorController.createFile("lib/util.py");
        expect(editorController.entryFilePath).toBe("main.py");
        editorController.deleteEntry("lib");
        expect(editorController.filePaths()).toEqual(["main.py"]);
        editorController.deleteEntry("main.py");
        expect(editorController.entryFilePath).toBe("");
        editorController.createFile("main.py");
        expect(editorController.entryFilePath).toBe("main.py");
    });
    test("rejects duplicates, folder and file collisions, and traversal paths", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("main.py");
        editorController.createFile("main.py");
        expect(editorController.errorMessage).toContain("already exists");
        editorController.createFolder("src");
        editorController.createFile("src");
        expect(editorController.errorMessage).toContain("already exists");
        editorController.createFile("../escape.py");
        expect(editorController.errorMessage).toContain("'..'");
    });
    test("normalizes separators and dot segments when creating files", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile(".\\src\\main.py");
        expect(editorController.filePaths()).toEqual(["src/main.py"]);
        expect(editorController.selectedPath).toBe("src/main.py");
    });
    test("keeps a manually selected entry file when new files arrive", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("helper.py");
        editorController.setEntryFilePath("helper.py");
        editorController.createFile("main.py");
        expect(editorController.entryFilePath).toBe("helper.py");
    });
    test("refuses to move a folder inside itself", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("src/main.py");
        editorController.renameEntry("src", "src/nested");
        expect(editorController.errorMessage).toContain("inside itself");
        expect(editorController.filePaths()).toEqual(["src/main.py"]);
    });
    test("tracks dirty files and ignores unknown paths", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("main.py", "print('hi')");
        editorController.updateFileContent("missing.py", "x = 1");
        expect(editorController.isDirty("missing.py")).toBe(false);
        editorController.updateFileContent("main.py", "print('hi')");
        expect(editorController.isDirty("main.py")).toBe(false);
        editorController.updateFileContent("main.py", "print('bye')");
        expect(editorController.isDirty("main.py")).toBe(true);
    });
    test("labels languages for supported and unknown extensions", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("main.py");
        editorController.createFile("Main.java");
        editorController.createFile("main.zig");
        editorController.createFile("notes.txt");
        const labelByPath = new Map(
            editorController
                .treeEntries()
                .map((treeEntry) => [treeEntry.relativePath, treeEntry.languageLabel]),
        );
        expect(labelByPath.get("main.py")).toBe("Python");
        expect(labelByPath.get("Main.java")).toBe("Java");
        expect(labelByPath.get("main.zig")).toBe("Zig");
        expect(labelByPath.get("notes.txt")).toBe("Plain Text");
    });
    test("packs the current files into a readable zip", () => {
        const editorController = new CodeProjectEditorController();
        editorController.createFile("main.py", "print('hi')");
        editorController.createFile("lib/util.py", "x = 1");
        const unzippedEntries = unzipSync(editorController.packSourceArchive());
        expect(Object.keys(unzippedEntries).sort()).toEqual(["lib/util.py", "main.py"]);
        expect(strFromU8(unzippedEntries["main.py"] as Uint8Array)).toBe("print('hi')");
    });
});
