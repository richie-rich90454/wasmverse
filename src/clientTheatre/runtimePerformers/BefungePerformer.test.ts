import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    BefungeInterpreter,
    BefungeStdinSource,
} from "@clientTheatre/runtimePerformers/BefungePerformer.ts";
import { isTerminalInputNeeded } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
interface RecordedRun {
    output: string;
    error?: unknown;
}
function runProgram(
    sourceText: string,
    fedLines: ReadonlyArray<string> = [],
    stdinSource?: BefungeStdinSource,
): RecordedRun {
    const outputParts: Array<string> = [];
    try {
        new BefungeInterpreter().run(sourceText, stdinSource ?? new BefungeStdinSource(fedLines), {
            writeText: (text: string) => outputParts.push(text),
        });
    } catch (error) {
        return { output: outputParts.join(""), error };
    }
    return { output: outputParts.join("") };
}
describe("BefungeInterpreter", () => {
    test("prints reversed string literals in order through the bridge loop", () => {
        const outcome = runProgram('"adA:repleh:teerg">:#,_@');
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("greet:helper:Ada");
    });
    test("computes stack arithmetic with division and modulo", () => {
        const sumOutcome = runProgram("23+.@");
        expect(sumOutcome.output).toBe("5 ");
        const differenceOutcome = runProgram("93-.@");
        expect(differenceOutcome.output).toBe("6 ");
        const productOutcome = runProgram("67*.@");
        expect(productOutcome.output).toBe("42 ");
        const quotientOutcome = runProgram("92/.@");
        expect(quotientOutcome.output).toBe("4 ");
        const moduloOutcome = runProgram("74%.@");
        expect(moduloOutcome.output).toBe("3 ");
    });
    test("supports comparison, not, duplicate, swap and discard", () => {
        expect(runProgram("63`.@").output).toBe("1 ");
        expect(runProgram("36`.@").output).toBe("0 ");
        expect(runProgram("0!.@").output).toBe("1 ");
        expect(runProgram("5!.@").output).toBe("0 ");
        expect(runProgram("7:..@").output).toBe("7 7 ");
        expect(runProgram("12\\..@").output).toBe("1 2 ");
        expect(runProgram("123$..@").output).toBe("2 1 ");
    });
    test("returns zero when popping an empty stack", () => {
        expect(runProgram("..@").output).toBe("0 0 ");
    });
    test("reads one character at a time through the tilde instruction", () => {
        const outcome = runProgram("~,~,@", ["Ada"]);
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("Ad");
    });
    test("reads whole integers through the ampersand instruction", () => {
        const outcome = runProgram("&.&.@", ["42 7"]);
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("42 7 ");
    });
    test("reports non-numeric ampersand input", () => {
        const outcome = runProgram("&", ["nope"]);
        expect(String((outcome.error as Error).message)).toContain("expected an integer");
    });
    test("asks for input when the fed text runs out", () => {
        const outcome = runProgram("~", []);
        expect(isTerminalInputNeeded(outcome.error)).toBe(true);
    });
    test("reports division and modulo by zero", () => {
        expect(String((runProgram("10/").error as Error).message)).toContain("division by zero");
        expect(String((runProgram("10%").error as Error).message)).toContain("modulo by zero");
    });
    test("wraps movement around the 80x25 playfield", () => {
        const sourceText = "<" + " ".repeat(78) + "@";
        const outcome = runProgram(sourceText);
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("");
    });
    test("pokes and reads back playfield cells with p and g", () => {
        const outcome = runProgram("67*65*2*64*p65*2*64*g,@");
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("*");
    });
    test("branches horizontally on zero and vertically on zero", () => {
        expect(runProgram('0_"x",@').output).toBe("x");
        expect(runProgram('0|\n >"x",@').output).toBe("x");
    });
    test("branches upward on nonzero and wraps to the far row", () => {
        const sourceText = "1|" + "\n".repeat(23) + ' >"x",@';
        expect(runProgram(sourceText).output).toBe("x");
    });
    test("rejects programs wider than the playfield", () => {
        const outcome = runProgram("@".padStart(81, " ").slice(0, 81));
        expect(String((outcome.error as Error).message)).toContain("80-column playfield");
    });
    test("rejects programs taller than the playfield", () => {
        const outcome = runProgram(Array.from({ length: 26 }, () => "@").join("\n"));
        expect(String((outcome.error as Error).message)).toContain("25 rows");
    });
    test("stops programs that never halt", () => {
        const outcome = runProgram(">");
        expect(String((outcome.error as Error).message)).toContain("steps");
    });
});
describe("BefungeStdinSource", () => {
    test("mixes characters and integer reads over one cursor", () => {
        const stdinSource = new BefungeStdinSource(["12ab"]);
        expect(stdinSource.readCharacter()).toBe(49);
        expect(stdinSource.readInteger()).toBe(2);
        expect(stdinSource.readCharacter()).toBe(97);
        expect(stdinSource.readCharacter()).toBe(98);
        expect(stdinSource.readCharacter()).toBe(10);
        expect(() => stdinSource.readCharacter()).toThrow();
    });
});
describe("befunge showcase template", () => {
    test("prints the banner, reads stdin and finishes with the closing line", () => {
        const templatePath = fileURLToPath(
            new URL("../../../userSourceTemplates/main.bef", import.meta.url),
        );
        const outcome = runProgram(readFileSync(templatePath, "utf8"), [""]);
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toContain("WASMVerse Befunge showcase");
        expect(outcome.output.endsWith("Showcase complete.")).toBe(true);
    });
});
