import { describe, expect, test } from "vitest";
import { PathGuard } from "@serverAtelier/utilities/PathGuard.ts";
describe("PathGuard", () => {
    test("allows a plain file inside the base directory", () => {
        const guard = new PathGuard();
        expect(() => guard.assertInsideBaseDirectory("main.py", "sessions/abc")).not.toThrow();
    });
    test("allows a nested path that stays inside the base directory", () => {
        const guard = new PathGuard();
        expect(() =>
            guard.assertInsideBaseDirectory("dist/runtime/app.wasm", "sessions/abc"),
        ).not.toThrow();
    });
    test("rejects a parent directory escape", () => {
        const guard = new PathGuard();
        expect(() => guard.assertInsideBaseDirectory("../secret", "sessions/abc")).toThrow();
    });
    test("rejects a nested escape hidden behind a subdirectory", () => {
        const guard = new PathGuard();
        expect(() =>
            guard.assertInsideBaseDirectory("dist/../../secret", "sessions/abc"),
        ).toThrow();
    });
    test("resolves a valid path inside the base directory", () => {
        const guard = new PathGuard();
        const resolved = guard.resolveInsideBaseDirectory("dist/app.js", "sessions/abc");
        expect(resolved.endsWith("app.js")).toBe(true);
        expect(resolved.includes("dist")).toBe(true);
    });
    test("refuses to resolve an escaping path", () => {
        const guard = new PathGuard();
        expect(() => guard.resolveInsideBaseDirectory("../../secret", "sessions/abc")).toThrow();
    });
});
