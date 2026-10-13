import { describe, expect, test } from "vitest";
import { parseProgramArgumentText } from "@clientTheatre/services/ProgramArgumentSerializer.ts";
describe("parseProgramArgumentText", () => {
    test("keeps one argument per line", () => {
        const argumentsList = parseProgramArgumentText("alpha\nbeta gamma\n--flag=1");
        expect(argumentsList).toEqual(["alpha", "beta gamma", "--flag=1"]);
    });
    test("trims surrounding whitespace and drops blank lines", () => {
        const argumentsList = parseProgramArgumentText("  alpha  \n\n\t\nbeta");
        expect(argumentsList).toEqual(["alpha", "beta"]);
    });
    test("handles windows line endings", () => {
        const argumentsList = parseProgramArgumentText("alpha\r\nbeta\r\n");
        expect(argumentsList).toEqual(["alpha", "beta"]);
    });
    test("returns an empty list for empty input", () => {
        expect(parseProgramArgumentText("")).toEqual([]);
        expect(parseProgramArgumentText("   \n  ")).toEqual([]);
    });
});
