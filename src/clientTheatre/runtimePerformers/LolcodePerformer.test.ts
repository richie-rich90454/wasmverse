import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LolcodeInterpreter } from "@clientTheatre/runtimePerformers/LolcodePerformer.ts";
import { isTerminalInputNeeded } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
interface RecordedRun {
    output: string;
    error?: unknown;
}
function runProgram(sourceText: string, fedLines: ReadonlyArray<string> = []): RecordedRun {
    const outputParts: Array<string> = [];
    let fedIndex = 0;
    try {
        new LolcodeInterpreter().run(
            sourceText,
            {
                readLine: () => {
                    if (fedIndex < fedLines.length) {
                        const fedLine = fedLines[fedIndex] as string;
                        fedIndex += 1;
                        return fedLine;
                    }
                    throw new Error("TERMINAL_INPUT_NEEDED");
                },
            },
            { writeText: (text: string) => outputParts.push(text) },
        );
    } catch (error) {
        return { output: outputParts.join(""), error };
    }
    return { output: outputParts.join("") };
}
describe("LolcodeInterpreter", () => {
    test("prints declared variables and literals", () => {
        const outcome = runProgram(
            ["HAI 1.2", "I HAS A X ITZ 3", "VISIBLE X", 'VISIBLE "done"', "KTHXBYE"].join("\n"),
        );
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("3\ndone\n");
    });
    test("computes the arithmetic operators", () => {
        const outcome = runProgram(
            [
                "HAI 1.2",
                "VISIBLE SUM OF 3 AN 4",
                "VISIBLE DIFF OF 10 AN 4",
                "VISIBLE PRODUKT OF 6 AN 7",
                "VISIBLE QUOSHUNT OF 9 AN 3",
                "VISIBLE MOD OF 17 AN 5",
                "VISIBLE BIGGR OF 3 AN 7",
                "VISIBLE SMALLR OF 2 AN 8",
                "KTHXBYE",
            ].join("\n"),
        );
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("7\n6\n42\n3\n2\n7\n2\n");
    });
    test("compares values and branches with O RLY?", () => {
        const outcome = runProgram(
            [
                "HAI 1.2",
                "BOTH SAEM 5 AN 5",
                "O RLY?",
                "    YA RLY",
                '        VISIBLE "equal"',
                "    NO WAI",
                '        VISIBLE "different"',
                "OIC",
                "DIFFRINT 5 AN 5",
                "O RLY?",
                "    YA RLY",
                '        VISIBLE "wrong"',
                "    NO WAI",
                '        VISIBLE "faithful"',
                "OIC",
                "KTHXBYE",
            ].join("\n"),
        );
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("equal\nfaithful\n");
    });
    test("runs UPPIN loops until the TIL condition wins", () => {
        const outcome = runProgram(
            [
                "HAI 1.2",
                "I HAS A N ITZ 0",
                "IM IN YR COUNTER UPPIN YR N TIL BOTH SAEM N AN 3",
                "    VISIBLE N",
                "IM OUTTA YR COUNTER",
                "KTHXBYE",
            ].join("\n"),
        );
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("0\n1\n2\n");
    });
    test("runs WILE loops that update their own counter", () => {
        const outcome = runProgram(
            [
                "HAI 1.2",
                "I HAS A N ITZ 0",
                "IM IN YR COUNTER WILE DIFFRINT N AN 3",
                "    N R SUM OF N AN 1",
                "    VISIBLE N",
                "IM OUTTA YR COUNTER",
                "KTHXBYE",
            ].join("\n"),
        );
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("1\n2\n3\n");
    });
    test("builds strings with SMOOSH and prints WIN and FAIL", () => {
        const outcome = runProgram(
            [
                "HAI 1.2",
                'VISIBLE SMOOSH "a" AN "b" AN "c" MKAY',
                "BOTH SAEM 1 AN 1",
                "VISIBLE IT",
                "DIFFRINT 1 AN 1",
                "VISIBLE IT",
                "KTHXBYE",
            ].join("\n"),
        );
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("abc\nWIN\nFAIL\n");
    });
    test("suppresses the newline for VISIBLE lines ending in a bang", () => {
        const outcome = runProgram(
            ["HAI 1.2", 'VISIBLE "one "!', 'VISIBLE "two"', "KTHXBYE"].join("\n"),
        );
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("one two\n");
    });
    test("reads stdin with GIMMEH", () => {
        const outcome = runProgram(
            ["HAI 1.2", "I HAS A NAME", "GIMMEH NAME", "VISIBLE NAME", "KTHXBYE"].join("\n"),
            ["Ada"],
        );
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("Ada\n");
    });
    test("asks for input when no fed lines remain", () => {
        const outcome = runProgram(
            ["HAI 1.2", "I HAS A NAME", "GIMMEH NAME", "KTHXBYE"].join("\n"),
            [],
        );
        expect(isTerminalInputNeeded(outcome.error)).toBe(true);
    });
    test("ignores BTW and OBTW comments", () => {
        const outcome = runProgram(
            [
                "HAI 1.2",
                "BTW a line comment",
                "OBTW a block comment",
                "still inside TLDR",
                'VISIBLE "kept"',
                "KTHXBYE",
            ].join("\n"),
        );
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("kept\n");
    });
    test("reports undefined variables with their line number", () => {
        const outcome = runProgram(["HAI 1.2", "VISIBLE MISSING", "KTHXBYE"].join("\n"));
        expect(String((outcome.error as Error).message)).toBe(
            "LOLCODE line 2: variable MISSING is not defined.",
        );
    });
    test("reports division by zero", () => {
        const outcome = runProgram(["HAI 1.2", "VISIBLE QUOSHUNT OF 1 AN 0", "KTHXBYE"].join("\n"));
        expect(String((outcome.error as Error).message)).toContain("QUOSHUNT OF by zero");
    });
    test("reports programs that miss their KTHXBYE", () => {
        const outcome = runProgram(["HAI 1.2", "VISIBLE 1"].join("\n"));
        expect(String((outcome.error as Error).message)).toContain("KTHXBYE");
    });
    test("reports unterminated YARN literals", () => {
        const outcome = runProgram(["HAI 1.2", 'VISIBLE "open', "KTHXBYE"].join("\n"));
        expect(String((outcome.error as Error).message)).toContain("unterminated YARN");
    });
    test("stops loops that never satisfy their condition", () => {
        const outcome = runProgram(
            ["HAI 1.2", "IM IN YR SPIN", "IM OUTTA YR SPIN", "KTHXBYE"].join("\n"),
        );
        expect(String((outcome.error as Error).message)).toContain("add TIL or WILE");
    });
});
describe("lolcode showcase template", () => {
    test("prints each stage and finishes with the closing line", () => {
        const templatePath = fileURLToPath(
            new URL("../../../userSourceTemplates/main.lol", import.meta.url),
        );
        const outcome = runProgram(readFileSync(templatePath, "utf8"), [""]);
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toContain("sum 0..5: 15");
        expect(outcome.output).toContain("total is 15");
        expect(outcome.output.endsWith("Showcase complete.\n")).toBe(true);
    });
});
