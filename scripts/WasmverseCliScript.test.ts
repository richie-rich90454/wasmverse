import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
    CliUsageError,
    collectProjectArchiveEntries,
    createProjectArchiveBytes,
    deriveDefaultOutputPath,
    isIgnoredProjectEntry,
    parseCommandLineArguments,
} from "./WasmverseCliScript.ts";
describe("parseCommandLineArguments", () => {
    test("returns help for --help and -h", () => {
        expect(parseCommandLineArguments(["--help"])).toEqual({ kind: "help" });
        expect(parseCommandLineArguments(["-h"])).toEqual({ kind: "help" });
    });
    test("returns list-languages for --list-languages", () => {
        expect(parseCommandLineArguments(["--list-languages"])).toEqual({ kind: "list-languages" });
    });
    test("parses a minimal build request", () => {
        expect(parseCommandLineArguments(["build", "./my-project", "--entry", "main.py"])).toEqual({
            kind: "build",
            projectDirectory: "./my-project",
            entryFileName: "main.py",
            programArguments: [],
            outputPath: undefined,
        });
    });
    test("parses options in any order with values", () => {
        expect(
            parseCommandLineArguments([
                "build",
                "--out",
                "exports/app.zip",
                "--args",
                "first\nsecond\n\n third ",
                "./my-project",
                "--entry",
                "src/main.py",
            ]),
        ).toEqual({
            kind: "build",
            projectDirectory: "./my-project",
            entryFileName: "src/main.py",
            programArguments: ["first", "second", "third"],
            outputPath: "exports/app.zip",
        });
    });
    test("carriage returns and blank lines are ignored in --args", () => {
        const request = parseCommandLineArguments([
            "build",
            ".",
            "--entry",
            "main.py",
            "--args",
            "a\r\nb\r\n",
        ]);
        expect(request).toMatchObject({ programArguments: ["a", "b"] });
    });
    test.each([
        [[], "Missing command."],
        [["frobnicate"], "Unknown command frobnicate."],
        [["build"], "Missing project directory."],
        [["build", "./my-project"], "Missing required option --entry."],
        [["build", "./my-project", "--entry"], "Missing value for --entry."],
        [["build", "./my-project", "--entry", "--out", "app.zip"], "Missing value for --entry."],
        [["build", "./my-project", "--entry", "main.py", "--wat"], "Unknown option --wat."],
        [["build", "./my-project", "extra", "--entry", "main.py"], "Unexpected argument extra."],
    ])("rejects %j with %s", (rawArguments, expectedMessage) => {
        expect(() => parseCommandLineArguments(rawArguments as Array<string>)).toThrowError(
            new CliUsageError(expectedMessage),
        );
    });
});
describe("deriveDefaultOutputPath", () => {
    test("strips the directory and the extension from the entry name", () => {
        expect(deriveDefaultOutputPath("main.py")).toBe("main.zip");
        expect(deriveDefaultOutputPath("src/nested/main.py")).toBe("main.zip");
        expect(deriveDefaultOutputPath("src\\nested\\main.py")).toBe("main.zip");
        expect(deriveDefaultOutputPath("Main.java")).toBe("Main.zip");
        expect(deriveDefaultOutputPath("main.duckdb.sql")).toBe("main.duckdb.zip");
    });
    test("keeps names without an extension", () => {
        expect(deriveDefaultOutputPath("Makefile")).toBe("Makefile.zip");
    });
});
describe("isIgnoredProjectEntry", () => {
    test.each([
        "node_modules/lodash/index.js",
        "sub/node_modules/lodash/index.js",
        ".git/config",
        "dist/app.js",
        "sessions/session-1/session.json",
        ".tools/zig/zig.exe",
        ".emsdk/upstream/emscripten/emcc",
        ".DS_Store",
        "web/.DS_Store",
        "Thumbs.db",
    ])("ignores %s", (relativePath) => {
        expect(isIgnoredProjectEntry(relativePath)).toBe(true);
    });
    test.each(["main.py", "src/main.py", "README.md", "include/engine.h", "distributed/notes.txt"])(
        "keeps %s",
        (relativePath) => {
            expect(isIgnoredProjectEntry(relativePath)).toBe(false);
        },
    );
});
describe("collectProjectArchiveEntries", () => {
    let projectDirectory: string;
    beforeAll(async () => {
        projectDirectory = await mkdtemp(join(tmpdir(), "wasmverse-cli-test-"));
        await mkdir(join(projectDirectory, "lib"), { recursive: true });
        await mkdir(join(projectDirectory, "node_modules", "dep"), { recursive: true });
        await mkdir(join(projectDirectory, ".git"), { recursive: true });
        await mkdir(join(projectDirectory, "dist"), { recursive: true });
        await writeFile(join(projectDirectory, "main.py"), "print('hi')\n");
        await writeFile(join(projectDirectory, "lib", "util.py"), "x = 1\n");
        await writeFile(join(projectDirectory, "node_modules", "dep", "index.js"), "noise");
        await writeFile(join(projectDirectory, ".git", "config"), "noise");
        await writeFile(join(projectDirectory, "dist", "app.js"), "noise");
        await writeFile(join(projectDirectory, ".DS_Store"), "noise");
    });
    afterAll(async () => {
        await rm(projectDirectory, { recursive: true, force: true });
    });
    test("collects files with relative posix paths and skips noise", async () => {
        const archiveEntries = await collectProjectArchiveEntries(projectDirectory);
        expect(Object.keys(archiveEntries).sort()).toEqual(["lib/util.py", "main.py"]);
        expect(strFromU8(archiveEntries["main.py"] as Uint8Array)).toBe("print('hi')\n");
    });
    test("round trips through createProjectArchiveBytes", async () => {
        const archiveBytes = await createProjectArchiveBytes(projectDirectory);
        expect(Object.keys(unzipSync(archiveBytes)).sort()).toEqual(["lib/util.py", "main.py"]);
    });
    test("rejects a project directory with no files", async () => {
        const emptyDirectory = await mkdtemp(join(tmpdir(), "wasmverse-cli-empty-"));
        try {
            await expect(createProjectArchiveBytes(emptyDirectory)).rejects.toThrow(
                /contains no files/,
            );
        } finally {
            await rm(emptyDirectory, { recursive: true, force: true });
        }
    });
});
