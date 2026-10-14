import { describe, expect, test } from "vitest";
import { CherryModuleLinker } from "@clientTheatre/runtimePerformers/CherryModuleLinker.ts";

describe("CherryModuleLinker", () => {
    const moduleSources = new Map<string, string>([
        [
            "main.cljs",
            [
                "import * as cherry_core from 'cherry-cljs/cljs.core.js';",
                "import * as helper from 'helper';",
                "cherry_core.println.call(null, helper.label.call(null));",
            ].join("\n"),
        ],
        ["sub/tools.cljs", "export const tool = 1;"],
        ["helper.cljs", "export const label = () => 'helper';"],
    ]);
    test("rewrites runtime and local specifiers through the replacer", () => {
        const linker = new CherryModuleLinker(
            moduleSources,
            "main.cljs",
            "https://example.test/runtime/clojurescript",
        );
        const rewritten = linker.rewriteModule("main.cljs", (specifier) => {
            if (linker.isRuntimeSpecifier(specifier)) {
                return linker.runtimeSpecifierFor(specifier);
            }
            return `blob:${linker.resolveLocalModule(specifier, "main.cljs")}`;
        });
        expect(rewritten).toContain('"https://example.test/runtime/clojurescript/cljs.core.js"');
        expect(rewritten).toContain('"blob:helper.cljs"');
        expect(rewritten.includes("'cherry-cljs/")).toBe(false);
    });
    test("resolves dotted namespaces to nested files and prefers local directories", () => {
        const linker = new CherryModuleLinker(
            moduleSources,
            "sub/tools.cljs",
            "https://example.test/runtime/clojurescript",
        );
        expect(linker.resolveLocalModule("helper", "sub/tools.cljs")).toBe("helper.cljs");
        expect(
            new CherryModuleLinker(
                new Map([["sub/helper.cljs", ""]]),
                "sub/tools.cljs",
                "https://example.test/runtime/clojurescript",
            ).resolveLocalModule("helper", "sub/tools.cljs"),
        ).toBe("sub/helper.cljs");
    });
    test("rejects unresolved namespaces", () => {
        const linker = new CherryModuleLinker(
            moduleSources,
            "main.cljs",
            "https://example.test/runtime/clojurescript",
        );
        expect(() => linker.resolveLocalModule("missing", "main.cljs")).toThrow(
            /Cannot resolve ClojureScript namespace 'missing'/,
        );
    });
});
