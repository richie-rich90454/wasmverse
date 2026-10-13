import { describe, expect, test } from "vitest";
import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import { LanguageIdentifierResolver } from "@serverAtelier/LanguageIdentifierResolver.ts";
describe("LanguageIdentifierResolver", () => {
    test("resolves every showcase entry file to its language", () => {
        const resolver = new LanguageIdentifierResolver();
        const expectedPairs: Array<[string, LanguageIdentifier]> = [
            ["main.py", "python"],
            ["main.rb", "ruby"],
            ["main.lua", "lua"],
            ["main.php", "php"],
            ["main.rs", "rust"],
            ["main.c", "c"],
            ["main.cpp", "cpp"],
            ["main.go", "go"],
            ["main.zig", "zig"],
            ["main.swift", "swift"],
            ["main.kt", "kotlin"],
            ["main.dart", "dart"],
            ["Main.java", "java"],
            ["Program.cs", "csharp"],
            ["main.as", "assemblyscript"],
            ["main.ml", "ocaml"],
            ["main.hs", "haskell"],
            ["main.js", "javascript"],
            ["main.mjs", "javascript"],
            ["main.ts", "typescript"],
            ["main.mts", "typescript"],
            ["main.sql", "sql"],
        ];
        for (const [fileName, language] of expectedPairs) {
            expect(resolver.resolveFromFileName(fileName)).toBe(language);
        }
    });
    test("matches extensions without regard to case", () => {
        const resolver = new LanguageIdentifierResolver();
        expect(resolver.resolveFromFileName("MAIN.PY")).toBe("python");
        expect(resolver.resolveFromFileName("Program.CS")).toBe("csharp");
    });
    test("maps header extensions to their compiled language", () => {
        const resolver = new LanguageIdentifierResolver();
        expect(resolver.resolveFromFileName("engine.h")).toBe("c");
        expect(resolver.resolveFromFileName("engine.hpp")).toBe("cpp");
    });
    test("rejects files without a supported extension", () => {
        const resolver = new LanguageIdentifierResolver();
        expect(() => resolver.resolveFromFileName("notes.txt")).toThrow();
        expect(() => resolver.resolveFromFileName("Makefile")).toThrow();
    });
});
