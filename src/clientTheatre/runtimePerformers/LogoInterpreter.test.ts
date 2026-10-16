import { describe, expect, test } from "vitest";
import { LogoInterpreter } from "@clientTheatre/runtimePerformers/LogoInterpreter.ts";
class RecordingSink {
    readonly lines: Array<string> = [];
    readonly textParts: Array<string> = [];
    writeLine(text: string): void {
        this.lines.push(text);
    }
    writeText(text: string): void {
        this.textParts.push(text);
    }
    get shownText(): string {
        return this.lines.join("\n");
    }
}
function runLogo(
    sourceText: string,
    options: { fedLines?: Array<string>; programArguments?: Array<string> } = {},
): RecordingSink {
    const sink = new RecordingSink();
    const fedLines = [...(options.fedLines ?? [])];
    const interpreter = new LogoInterpreter();
    interpreter.run(sourceText, {
        sink,
        readLine: () => {
            if (fedLines.length === 0) {
                throw new Error("INPUT_NEEDED");
            }
            return fedLines.shift() as string;
        },
        programArguments: options.programArguments ?? [],
    });
    return sink;
}
describe("LogoInterpreter", () => {
    test("evaluates infix arithmetic and prints values", () => {
        const sink = runLogo(
            ["PRINT 2 + 3 * 4", "PRINT (SUM 20 22)", "SHOW 7", "PRINT 10 / 4"].join("\n"),
        );
        expect(sink.lines).toEqual(["14", "42", "7", "2.5"]);
    });
    test("stores variables with MAKE and reads them with colons and THING", () => {
        const sink = runLogo(
            ['MAKE "LIMIT 12', "PRINT :LIMIT + 8", 'PRINT (THING "LIMIT) * 2'].join("\n"),
        );
        expect(sink.lines).toEqual(["20", "24"]);
    });
    test("defines procedures with parameters and OUTPUT, including recursion", () => {
        const sink = runLogo(
            [
                "TO FACT :N",
                "  IF :N = 0 [ OUTPUT 1 ]",
                "  OUTPUT :N * FACT :N - 1",
                "END",
                "PRINT (FACT 5)",
                "PRINT (FACT 6)",
            ].join("\n"),
        );
        expect(sink.lines).toEqual(["120", "720"]);
    });
    test("runs REPEAT, IF and IFELSE with instruction lists", () => {
        const sink = runLogo(
            [
                'MAKE "S 0',
                'REPEAT 4 [ MAKE "S :S + 3 ]',
                "PRINT :S",
                'IF 3 > 2 [ PRINT "then-branch ]',
                'IF 1 > 2 [ PRINT "wrong ]',
                'IFELSE 1 > 2 [ PRINT "wrong ] [ PRINT "else-branch ]',
            ].join("\n"),
        );
        expect(sink.lines).toEqual(["12", "then-branch", "else-branch"]);
    });
    test("handles list basics and word building", () => {
        const sink = runLogo(
            [
                'MAKE "ITEMS [alpha beta gamma]',
                "PRINT (FIRST :ITEMS)",
                "PRINT (LAST :ITEMS)",
                "PRINT (COUNT :ITEMS)",
                "PRINT (ITEM 2 :ITEMS)",
                "PRINT (BUTFIRST [1 2 3])",
                "SHOW (LIST 1 2)",
                'PRINT (WORD "foo "bar)',
                'PRINT (SENTENCE [a b] "c)',
            ].join("\n"),
        );
        expect(sink.lines).toEqual([
            "alpha",
            "gamma",
            "3",
            "beta",
            "2 3",
            "[1 2]",
            "foobar",
            "a b c",
        ]);
    });
    test("reads stdin through READWORD and READLIST and signals when input runs out", () => {
        const sink = runLogo(['PRINT (WORD "name: READWORD)', "SHOW READLIST"].join("\n"), {
            fedLines: ["Ada", "red green"],
        });
        expect(sink.lines).toEqual(["name:Ada", "[red green]"]);
        expect(() => {
            runLogo("PRINT READWORD", {});
        }).toThrow("INPUT_NEEDED");
    });
    test("exposes program arguments as a list", () => {
        const sink = runLogo(
            ["PRINT (FIRST :WASMVERSE.ARGUMENTS)", "SHOW :WASMVERSE.ARGUMENTS"].join("\n"),
            { programArguments: ["alpha", "beta"] },
        );
        expect(sink.lines).toEqual(["alpha", "[alpha beta]"]);
    });
    test("renders the turtle path as ASCII art with DRAW", () => {
        const sink = runLogo(
            ["CLEARSCREEN", "FORWARD 2", "RIGHT 90", "FORWARD 2", "RIGHT 90", "DRAW"].join("\n"),
        );
        expect(sink.lines).toEqual(["###", "#", "#"]);
    });
    test("DRAW reports an empty path and rejects oversized grids", () => {
        const emptySink = runLogo("DRAW");
        expect(emptySink.lines).toEqual(["(no turtle path)"]);
        expect(() => {
            runLogo(["CLEARSCREEN", "FORWARD 500", "DRAW"].join("\n"));
        }).toThrow("exceeds the 200 by 100 character limit");
    });
    test("reports unknown commands and division by zero readably", () => {
        expect(() => {
            runLogo("FROBNICATE 1");
        }).toThrow("I don't know how to FROBNICATE");
        expect(() => {
            runLogo("PRINT 1 / 0");
        }).toThrow("Division by zero");
    });
    test("runs the showcase shape without errors", () => {
        const sink = runLogo(
            [
                "PRINT |WASMVerse Logo showcase|",
                'MAKE "PRIMES [2 3 5 7 11 13]',
                "SHOW :PRIMES",
                'MAKE "STEP 2',
                "REPEAT 8 [",
                "  FORWARD :STEP",
                "  RIGHT 90",
                '  MAKE "STEP :STEP + 2',
                "]",
                "DRAW",
                "PRINT |Showcase complete.|",
            ].join("\n"),
        );
        expect(sink.lines[0]).toBe("WASMVerse Logo showcase");
        expect(sink.lines[1]).toBe("[2 3 5 7 11 13]");
        expect(sink.lines[sink.lines.length - 1]).toBe("Showcase complete.");
    });
});
