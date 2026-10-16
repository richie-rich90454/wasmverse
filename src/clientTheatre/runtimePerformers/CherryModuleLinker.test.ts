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
    const resolveRuntimeAsset = (runtimeRelativePath: string) =>
        `https://example.test/runtime/clojurescript/${runtimeRelativePath}`;
    test("rewrites runtime and local specifiers through the replacer", () => {
        const linker = new CherryModuleLinker(moduleSources, resolveRuntimeAsset);
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
    test("routes runtime specifiers through the runtime asset resolver", () => {
        const resolvedRuntimePaths: Array<string> = [];
        const linker = new CherryModuleLinker(moduleSources, (runtimeRelativePath) => {
            resolvedRuntimePaths.push(runtimeRelativePath);
            return `blob:runtime-${runtimeRelativePath}`;
        });
        const rewritten = linker.rewriteModule("main.cljs", (specifier) =>
            linker.isRuntimeSpecifier(specifier)
                ? linker.runtimeSpecifierFor(specifier)
                : specifier,
        );
        expect(resolvedRuntimePaths).toEqual(["cljs.core.js"]);
        expect(rewritten).toContain('"blob:runtime-cljs.core.js"');
    });
    test("resolves dotted namespaces to nested files and prefers local directories", () => {
        const linker = new CherryModuleLinker(moduleSources, resolveRuntimeAsset);
        expect(linker.resolveLocalModule("helper", "sub/tools.cljs")).toBe("helper.cljs");
        expect(
            new CherryModuleLinker(
                new Map([["sub/helper.cljs", ""]]),
                resolveRuntimeAsset,
            ).resolveLocalModule("helper", "sub/tools.cljs"),
        ).toBe("sub/helper.cljs");
    });
    test("rejects unresolved namespaces", () => {
        const linker = new CherryModuleLinker(moduleSources, resolveRuntimeAsset);
        expect(() => linker.resolveLocalModule("missing", "main.cljs")).toThrow(
            /Cannot resolve ClojureScript namespace 'missing'/,
        );
    });
});
