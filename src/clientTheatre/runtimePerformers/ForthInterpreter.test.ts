import { describe, expect, test } from "vitest";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { ForthInterpreter } from "@clientTheatre/runtimePerformers/ForthInterpreter.ts";
import { ForthPerformer } from "@clientTheatre/runtimePerformers/ForthPerformer.ts";
import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
interface ForthFixture {
    interpreter: ForthInterpreter;
    outputText: string;
}
function createInterpreter(options: {
    fedLines?: ReadonlyArray<string>;
    programArguments?: ReadonlyArray<string>;
    userFiles?: ReadonlyMap<string, string>;
    entryRelativePath?: string;
}): ForthFixture {
    const outputChunks: Array<string> = [];
    const fedLines = options.fedLines ?? [];
    let fedIndex = 0;
    const interpreter = new ForthInterpreter({
        appendOutput: (text: string) => {
            outputChunks.push(text);
        },
        readLine: () => {
            const fedLine = fedLines[fedIndex];
            if (fedLine === undefined) {
                throw new TerminalInputNeededSignal();
            }
            fedIndex += 1;
            return fedLine;
        },
        programArguments: options.programArguments ?? [],
        userFiles: options.userFiles ?? new Map(),
        entryRelativePath: options.entryRelativePath ?? "main.fth",
    });
    return {
        interpreter,
        get outputText() {
            return outputChunks.join("");
        },
    };
}
function runFor(interpreter: ForthInterpreter, sourceText: string): void {
    interpreter.run(sourceText);
}
describe("ForthInterpreter", () => {
    test("evaluates arithmetic with left-to-right stack order", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, "3 4 + . 10 3 - . 6 7 * . 20 6 / . 20 6 MOD .");
        expect(fixture.outputText).toBe("7 7 42 3 2 ");
    });
    test("rewrites the stack with DUP DROP SWAP OVER ROT and PICK", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, "1 2 DUP . . .");
        runFor(fixture.interpreter, "3 4 SWAP . .");
        runFor(fixture.interpreter, "5 6 OVER . . .");
        runFor(fixture.interpreter, "7 8 9 ROT . . .");
        runFor(fixture.interpreter, "10 20 30 2 PICK . . . .");
        runFor(fixture.interpreter, "1 2 DROP .");
        expect(fixture.outputText).toBe("2 2 1 3 4 5 6 5 7 9 8 10 30 20 10 1 ");
    });
    test("defines words and calls them", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, ": SQUARE DUP * ; 5 SQUARE . 9 SQUARE .");
        expect(fixture.outputText).toBe("25 81 ");
    });
    test("branches with IF ELSE THEN and early EXIT", () => {
        const fixture = createInterpreter({});
        runFor(
            fixture.interpreter,
            ': SIGN IF ." yes" ELSE ." no" THEN ; -1 SIGN 0 SIGN : EARLY 1 EXIT 2 ; EARLY .',
        );
        expect(fixture.outputText).toBe("yesno1 ");
    });
    test("counts with DO LOOP and I", () => {
        const fixture = createInterpreter({});
        runFor(
            fixture.interpreter,
            ": COUNT-UP 5 0 DO I . LOOP ; COUNT-UP : SPAN 4 2 DO I . LOOP ; SPAN",
        );
        expect(fixture.outputText).toBe("0 1 2 3 4 2 3 ");
    });
    test("folds with DO LOOP", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, ": SUM-TO 0 SWAP 0 DO I + LOOP ; 5 SUM-TO .");
        expect(fixture.outputText).toBe("10 ");
    });
    test("loops with BEGIN UNTIL", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, ": COUNT-DOWN BEGIN DUP . 1- DUP 0= UNTIL DROP ; 3 COUNT-DOWN");
        expect(fixture.outputText).toBe("3 2 1 ");
    });
    test("loops with BEGIN WHILE REPEAT", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, ": COUNT-WHILE 0 BEGIN DUP 3 < WHILE DUP . 1+ REPEAT DROP ; COUNT-WHILE");
        expect(fixture.outputText).toBe("0 1 2 ");
    });
    test("stores and fetches variables", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, "VARIABLE X 42 X ! X @ . 8 X +! X @ .");
        expect(fixture.outputText).toBe("42 50 ");
    });
    test("writes strings with S\" and .\"", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, 'S" hello" TYPE 32 EMIT ." world" CR');
        expect(fixture.outputText).toBe("hello world\n");
    });
    test("accepts stdin through the replay contract", () => {
        const fixture = createInterpreter({ fedLines: ["Ada"] });
        runFor(fixture.interpreter, "0 64 ACCEPT 0 SWAP TYPE");
        expect(fixture.outputText).toBe("Ada");
    });
    test("signals input needed when stdin runs dry", () => {
        const fixture = createInterpreter({});
        expect(() => runFor(fixture.interpreter, "0 64 ACCEPT DROP")).toThrow(
            TerminalInputNeededSignal,
        );
    });
    test("reads single characters with KEY", () => {
        const fixture = createInterpreter({ fedLines: ["Ada"] });
        runFor(fixture.interpreter, "KEY EMIT KEY EMIT");
        expect(fixture.outputText).toBe("Ad");
    });
    test("exposes program arguments through ARGC and ARG", () => {
        const fixture = createInterpreter({ programArguments: ["alpha", "beta"] });
        runFor(fixture.interpreter, "ARGC . 0 ARG TYPE 32 EMIT 1 ARG TYPE");
        expect(fixture.outputText).toBe("2 alpha beta");
    });
    test("includes helper files from the session user files", () => {
        const fixture = createInterpreter({
            userFiles: new Map([
                ["main.fth", ""],
                ["helper.fth", ": TRIPLE 3 * ;"],
            ]),
        });
        runFor(fixture.interpreter, "INCLUDE helper.fth 5 TRIPLE .");
        expect(fixture.outputText).toBe("15 ");
    });
    test("reads data files with READ-FILE", () => {
        const fixture = createInterpreter({
            userFiles: new Map([["data.txt", "probe-data"]]),
        });
        runFor(fixture.interpreter, "READ-FILE data.txt TYPE");
        expect(fixture.outputText).toBe("probe-data");
    });
    test("evaluates strings with EVALUATE", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, 'S" 4 5 +" EVALUATE .');
        expect(fixture.outputText).toBe("9 ");
    });
    test("ignores ( ) and backslash comments", () => {
        const fixture = createInterpreter({});
        runFor(fixture.interpreter, "( ignored ) 1 2 + . \\ trailing\n 3 4 + .");
        expect(fixture.outputText).toBe("3 7 ");
    });
    test("reports unknown words and stack underflow as single-line errors", () => {
        const fixture = createInterpreter({});
        expect(() => runFor(fixture.interpreter, "FOO")).toThrow("Unknown word: FOO");
        expect(() => runFor(fixture.interpreter, "1 +")).toThrow("Stack underflow in +");
        expect(() => runFor(fixture.interpreter, "1 0 /")).toThrow("Division by zero");
        expect(() => runFor(fixture.interpreter, ": BAD IF ;")).toThrow(
            "Unbalanced control structure in definition",
        );
        expect(() => runFor(fixture.interpreter, ": BROKEN 1 +")).toThrow(
            "Unterminated definition",
        );
    });
});
class FakeTerminalStage {
    readonly writtenText: Array<string> = [];
    readonly writtenLines: Array<string> = [];
    readonly prompts: Array<string> = [];
    readonly inputAnswers: Array<string> = [];
    writeText(text: string): void {
        this.writtenText.push(text);
    }
    writeLine(text: string): void {
        this.writtenLines.push(text);
    }
    async readLine(promptText: string): Promise<string> {
        this.prompts.push(promptText);
        return this.inputAnswers.shift() ?? "";
    }
    get shownText(): string {
        return this.writtenText.join("");
    }
}
async function createForthPerformerFixture(
    entrySource: string,
    programArguments: ReadonlyArray<string>,
): Promise<{ performer: ForthPerformer; stage: FakeTerminalStage; dispose(): void }> {
    const stage = new FakeTerminalStage();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.fth",
                    includedFileRelativePaths: ["main.fth"],
                    programArguments,
                }),
            } as Response;
        }
        if (url.endsWith("/user-code/main.fth")) {
            return { ok: true, text: async () => entrySource } as Response;
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new ForthPerformer("https://example.test/session");
    return {
        performer,
        stage,
        dispose: () => {
            globalThis.fetch = originalFetch;
        },
    };
}
describe("ForthPerformer", () => {
    test("replays program runs until stdin is satisfied", async () => {
        const fixture = await createForthPerformerFixture(
            '." ready" CR 0 64 ACCEPT ." name: " 0 SWAP TYPE CR',
            ["alpha"],
        );
        try {
            await fixture.performer.loadInto(fixture.stage as unknown as TerminalStageController);
            fixture.stage.inputAnswers.push("Ada");
            await fixture.performer.performOn(fixture.stage as unknown as TerminalStageController);
            expect(fixture.stage.shownText).toBe("ready\nname: Ada\n");
            expect(fixture.stage.prompts).toEqual([""]);
        } finally {
            fixture.dispose();
        }
    });
    test("stops when the program keeps asking for input", async () => {
        const endlessAcceptSource = "0 64 ACCEPT DROP ".repeat(1002);
        const fixture = await createForthPerformerFixture(endlessAcceptSource, []);
        try {
            await fixture.performer.loadInto(fixture.stage as unknown as TerminalStageController);
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("Too many input prompts. Stopping to protect the session.");
        } finally {
            fixture.dispose();
        }
    });
    test("shapes program errors into one readable line", async () => {
        const fixture = await createForthPerformerFixture('." before" CR MISSING-WORD', []);
        try {
            await fixture.performer.loadInto(fixture.stage as unknown as TerminalStageController);
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("Forth error: Unknown word: MISSING-WORD");
            expect(fixture.stage.shownText).toBe("before\n");
        } finally {
            fixture.dispose();
        }
    });
});
