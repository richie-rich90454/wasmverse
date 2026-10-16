import { describe, expect, test } from "vitest";
import { isBuildOutputPath } from "@serverAtelier/utilities/BuildOutputFilter.ts";

describe("isBuildOutputPath", () => {
    test("classifies compiler caches that land inside the session as build output", () => {
        expect(isBuildOutputPath(".scala-build/source_abc/classes/main/Main$.class")).toBe(true);
        expect(isBuildOutputPath("elm-stuff/0.19.3/Main.elmo")).toBe(true);
        expect(isBuildOutputPath("lib/bs/Main.cmj")).toBe(true);
        expect(isBuildOutputPath("lib/ocaml/Main.cmi")).toBe(true);
        expect(isBuildOutputPath("target/wasmverse/app.js")).toBe(true);
        expect(isBuildOutputPath("bin/Release/app.dll")).toBe(true);
        expect(isBuildOutputPath("obj/Debug/app.dll")).toBe(true);
        expect(isBuildOutputPath("node_modules/pkg/index.js")).toBe(true);
        expect(isBuildOutputPath(".zig-cache/tmp/x")).toBe(true);
    });
    test("keeps user source files and lookalike directory names", () => {
        expect(isBuildOutputPath("main.scala")).toBe(false);
        expect(isBuildOutputPath("helper.scala")).toBe(false);
        expect(isBuildOutputPath("library/main.scala")).toBe(false);
        expect(isBuildOutputPath("binaries/notes.txt")).toBe(false);
        expect(isBuildOutputPath("objectives/goals.txt")).toBe(false);
        expect(isBuildOutputPath("lib/main.kt")).toBe(false);
        expect(isBuildOutputPath("scala-build/main.scala")).toBe(false);
    });
});
