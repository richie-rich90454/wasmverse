import { describe, expect, test } from "vitest";
import { detectEntryFile, isCodeFile, stemOf } from "@clientTheatre/services/EntryFileDetector.ts";
describe("detectEntryFile", () => {
    test("prefers main at the archive root", () => {
        const result = detectEntryFile(["lib/util.py", "main.py", "README.md"]);
        expect(result).toBe("main.py");
    });
    test("falls back to program when main is absent", () => {
        const result = detectEntryFile(["program.go", "helper.go"]);
        expect(result).toBe("program.go");
    });
    test("prefers a nested main over an unrelated root code file", () => {
        const result = detectEntryFile(["src/main.rs", "build.rs"]);
        expect(result).toBe("src/main.rs");
    });
    test("uses the first root code file when no preferred stem matches", () => {
        const result = detectEntryFile(["build.rs", "src/lib.rs"]);
        expect(result).toBe("build.rs");
    });
    test("uses nested code files when no root code file exists", () => {
        const result = detectEntryFile(["src/app/main.dart", "pubspec.yaml"]);
        expect(result).toBe("src/app/main.dart");
    });
    test("returns the first path when nothing looks like code", () => {
        const result = detectEntryFile(["README.md", "Makefile"]);
        expect(result).toBe("README.md");
    });
    test("returns an empty string for an empty archive", () => {
        expect(detectEntryFile([])).toBe("");
    });
});
describe("isCodeFile", () => {
    test("recognizes supported source extensions", () => {
        expect(isCodeFile("main.py")).toBe(true);
        expect(isCodeFile("Main.java")).toBe(true);
        expect(isCodeFile("Program.cs")).toBe(true);
        expect(isCodeFile("notes.txt")).toBe(false);
    });
});
describe("stemOf", () => {
    test("strips the final extension from the base name", () => {
        expect(stemOf("src/main.rs")).toBe("main");
        expect(stemOf("Main.java")).toBe("Main");
    });
});
