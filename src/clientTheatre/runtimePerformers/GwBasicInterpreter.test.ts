import { describe, expect, test } from "vitest";
import { GwBasicInterpreter } from "@clientTheatre/runtimePerformers/GwBasicInterpreter.ts";
class RecordingSink {
    readonly parts: Array<string> = [];
    writeText(text: string): void {
        this.parts.push(text);
    }
    get shownText(): string {
        return this.parts.join("");
    }
}
function runBasic(
    sourceLines: ReadonlyArray<string>,
    options: { fedLines?: Array<string> } = {},
): RecordingSink {
    const sink = new RecordingSink();
    const fedLines = [...(options.fedLines ?? [])];
    const interpreter = new GwBasicInterpreter();
    interpreter.run(sourceLines.join("\n"), {
        sink,
        readLine: () => {
            if (fedLines.length === 0) {
                throw new Error("INPUT_NEEDED");
            }
            return fedLines.shift() as string;
        },
    });
    return sink;
}
describe("GwBasicInterpreter", () => {
    test("prints with ; and , separators and GW-BASIC number spacing", () => {
        expect(runBasic(['10 PRINT "a"; 5; "b"']).shownText).toBe("a 5 b\n");
        expect(runBasic(["10 PRINT 2 + 3"]).shownText).toBe(" 5 \n");
        expect(runBasic(['10 PRINT "x", "y"']).shownText).toBe(`x${" ".repeat(13)}y\n`);
        expect(runBasic(['10 PRINT "a";', '20 PRINT "b"']).shownText).toBe("ab\n");
        expect(runBasic(["10 PRINT"]).shownText).toBe("\n");
    });
    test("assigns variables with LET, implicit assignment and string variables", () => {
        const sink = runBasic([
            "10 LET A = 4",
            "20 B = A * 3",
            '30 C$ = "hello" + " " + "world"',
            '40 PRINT "B:"; B; " C:"; C$',
        ]);
        expect(sink.shownText).toBe("B: 12  C:hello world\n");
    });
    test("runs IF/THEN with statements, line numbers and ELSE", () => {
        const sink = runBasic([
            '10 IF 3 > 2 THEN PRINT "yes"',
            '20 IF 1 > 2 THEN PRINT "wrong" ELSE PRINT "else-branch"',
            "30 GOTO 100",
            '40 PRINT "skipped"',
            "100 IF 5 = 5 THEN 200",
            '110 PRINT "wrong"',
            '200 PRINT "done"',
        ]);
        expect(sink.shownText).toBe("yes\nelse-branch\ndone\n");
    });
    test("loops with FOR/NEXT including STEP and nested bodies", () => {
        const sink = runBasic([
            "10 TOTAL = 0",
            "20 FOR I = 10 TO 1 STEP -2",
            "30 TOTAL = TOTAL + I",
            "40 NEXT I",
            '50 PRINT "total:"; TOTAL',
        ]);
        expect(sink.shownText).toBe("total: 30 \n");
    });
    test("calls subroutines with GOSUB and RETURN", () => {
        const sink = runBasic([
            "10 GOSUB 100",
            '20 PRINT "after:"; LABEL$',
            "30 END",
            '100 LABEL$ = "helper"',
            "110 RETURN",
        ]);
        expect(sink.shownText).toBe("after:helper\n");
    });
    test("reads DATA with READ and rewinds with RESTORE", () => {
        const sink = runBasic([
            "10 READ A, B",
            "20 RESTORE",
            "30 READ C",
            '40 PRINT "sum:"; A + B + C',
            "50 DATA 1, 2, 3",
        ]);
        expect(sink.shownText).toBe("sum: 4 \n");
    });
    test("indexes DIM arrays and reports subscript errors", () => {
        const sink = runBasic([
            "10 DIM GRID(2, 2)",
            "20 GRID(1, 2) = 7",
            '30 PRINT "cell:"; GRID(1, 2)',
            "40 DIM NAMES$(2)",
            '50 NAMES$(0) = "ada"',
            '60 PRINT "name:"; NAMES$(0)',
        ]);
        expect(sink.shownText).toBe("cell: 7 \nname:ada\n");
        expect(() => {
            runBasic(["10 DIM GRID(1)", "20 GRID(9) = 1"]);
        }).toThrow("Subscript out of range");
    });
    test("applies string and numeric built-in functions", () => {
        const sink = runBasic([
            '10 PRINT "len:"; LEN("abc"); " asc:"; ASC("A"); " chr:"; CHR$(66)',
            '20 PRINT "str:"; STR$(42); " val:"; VAL("12abc"); " int:"; INT(3.7)',
            '30 PRINT "abs:"; ABS(-9); " sqr:"; SQR(16)',
        ]);
        expect(sink.shownText).toBe(
            "len: 3  asc: 65  chr:B\nstr:42 val: 12  int: 3 \nabs: 9  sqr: 4 \n",
        );
    });
    test("produces the same seeded RND sequence every run and RND(0) repeats", () => {
        const program = [
            "10 FOR I = 1 TO 3",
            "20 PRINT INT(RND(1) * 1000);",
            "30 NEXT I",
            "40 PRINT RND(0) = RND(0)",
        ];
        const firstRun = runBasic(program).shownText;
        const secondRun = runBasic(program).shownText;
        expect(firstRun).toBe(secondRun);
        expect(firstRun.trimEnd().endsWith("-1")).toBe(true);
        const reseeded = runBasic(["10 RANDOMIZE 7", "20 PRINT INT(RND(1) * 1000000)"]).shownText;
        expect(reseeded).not.toBe(runBasic(["10 PRINT INT(RND(1) * 1000000)"]).shownText);
    });
    test("accepts INPUT through the line reader and reports type redo", () => {
        const sink = runBasic(['10 INPUT "name? "; N$', '20 PRINT "hi"; N$'], {
            fedLines: ["Ada"],
        });
        expect(sink.shownText).toBe("name? ? hiAda\n");
        const redoSink = runBasic(["10 INPUT N"], { fedLines: ["oops", "5"] });
        expect(redoSink.shownText).toBe("? ?Redo from start\n? ");
    });
    test("propagates the input-needed signal when the reader runs dry", () => {
        expect(() => {
            runBasic(["10 INPUT N"], {});
        }).toThrow("INPUT_NEEDED");
    });
    test("reports undefined lines and unknown statements readably", () => {
        expect(() => {
            runBasic(["10 GOTO 500"]);
        }).toThrow("Undefined line number 500");
        expect(() => {
            runBasic(["10 FROBNICATE"]);
        }).toThrow("Unknown statement");
    });
    test("runs the showcase shape without errors", () => {
        const sink = runBasic([
            '10 PRINT "WASMVerse GW-BASIC showcase"',
            "20 DIM SQUARES(10)",
            "30 FOR I = 1 TO 10",
            "40 SQUARES(I) = I * I",
            "50 NEXT I",
            "60 GOSUB 200",
            '70 PRINT "square total:"; TOTAL',
            "80 READ COEFFICIENT",
            '90 PRINT "coefficient:"; COEFFICIENT',
            '100 NAME$ = "LOGO" + "-" + CHR$(66) + "ASIC"',
            '110 PRINT NAME$; " len:"; LEN(NAME$); " asc:"; ASC(NAME$)',
            '120 PRINT "Showcase complete."',
            "130 END",
            "200 TOTAL = 0",
            "210 FOR J = 1 TO 10",
            "220 TOTAL = TOTAL + SQUARES(J)",
            "230 NEXT J",
            "240 RETURN",
            "300 DATA 1.5",
        ]);
        expect(sink.shownText).toContain("square total: 385 ");
        expect(sink.shownText).toContain("coefficient: 1.5 ");
        expect(sink.shownText).toContain("LOGO-BASIC len: 10  asc: 76 ");
        expect(sink.shownText.endsWith("Showcase complete.\n")).toBe(true);
    });
});
