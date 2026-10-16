import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import { SmalltalkEvaluator } from "@clientTheatre/runtimePerformers/SmalltalkEvaluator.ts";
import { SmalltalkPerformer } from "@clientTheatre/runtimePerformers/SmalltalkPerformer.ts";
import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
interface SmalltalkFixture {
    evaluator: SmalltalkEvaluator;
    outputText: string;
}
function createEvaluator(options: {
    fedLines?: ReadonlyArray<string>;
    programArguments?: ReadonlyArray<string>;
    userFiles?: ReadonlyMap<string, string>;
}): SmalltalkFixture {
    const outputChunks: Array<string> = [];
    const fedLines = options.fedLines ?? [];
    let fedIndex = 0;
    const evaluator = new SmalltalkEvaluator({
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
    });
    return {
        evaluator,
        get outputText() {
            return outputChunks.join("");
        },
    };
}
function evaluate(fixture: SmalltalkFixture, sourceText: string): void {
    fixture.evaluator.run(sourceText);
}
describe("SmalltalkEvaluator", () => {
    test("sends binary messages left to right", () => {
        const fixture = createEvaluator({});
        evaluate(fixture, "Transcript showCr: (3 + 4 * 2) printString.");
        expect(fixture.outputText).toBe("14\n");
    });
    test("computes modulo with the standard double backslash selector", () => {
        const fixture = createEvaluator({});
        evaluate(fixture, "Transcript showCr: (10 \\\\ 3) printString.");
        expect(fixture.outputText).toBe("1\n");
    });
    test("gives unary messages higher precedence than binary messages", () => {
        const fixture = createEvaluator({});
        evaluate(fixture, "Transcript showCr: (2 + 3 negated) printString.");
        expect(fixture.outputText).toBe("-1\n");
    });
    test("evaluates keyword messages and assignments", () => {
        const fixture = createEvaluator({});
        evaluate(fixture, "value := 6 * 7. Transcript showCr: value printString.");
        expect(fixture.outputText).toBe("42\n");
    });
    test("strings concatenate with displayString of the argument", () => {
        const fixture = createEvaluator({});
        evaluate(fixture, "Transcript showCr: 'answer: ', 42 printString.");
        expect(fixture.outputText).toBe("answer: 42\n");
    });
    test("blocks control flow with ifTrue:ifFalse: and whileTrue:", () => {
        const fixture = createEvaluator({});
        evaluate(
            fixture,
            "count := 0. [count < 3] whileTrue: [Transcript show: count printString. count := count + 1]. Transcript showCr: ':'.",
        );
        expect(fixture.outputText).toBe("012:\n");
    });
    test("branches with ifTrue:ifFalse:", () => {
        const fixture = createEvaluator({});
        evaluate(
            fixture,
            "Transcript show: (5 > 3 ifTrue: ['big'] ifFalse: ['small']). Transcript showCr: '!'.",
        );
        expect(fixture.outputText).toBe("big!\n");
    });
    test("runs collection pipelines over arrays", () => {
        const fixture = createEvaluator({});
        evaluate(
            fixture,
            "Transcript showCr: ((1 to: 4) collect: [:each | each * each]) printString. Transcript showCr: ((1 to: 10) select: [:each | each odd]) size printString. Transcript showCr: ((1 to: 4) inject: 0 into: [:sum :each | sum + each]) printString.",
        );
        expect(fixture.outputText).toBe("(1 4 9 16)\n5\n10\n");
    });
    test("cascades send messages to the message receiver", () => {
        const fixture = createEvaluator({});
        evaluate(fixture, "Transcript show: 'a'; show: 'b'; showCr: 'c'.");
        expect(fixture.outputText).toBe("abc\n");
    });
    test("supports literal arrays, symbols, and characters", () => {
        const fixture = createEvaluator({});
        evaluate(
            fixture,
            "Transcript showCr: #(1 two $c) printString. Transcript showCr: #two printString. Transcript showCr: $a asUppercase asString.",
        );
        expect(fixture.outputText).toBe("(1 #two $c)\n#two\nA\n");
    });
    test("reads stdin through the replay contract", () => {
        const fixture = createEvaluator({ fedLines: ["Ada"] });
        evaluate(fixture, "Transcript showCr: 'greet:', StandardInput nextLine.");
        expect(fixture.outputText).toBe("greet:Ada\n");
    });
    test("signals input needed when stdin runs dry", () => {
        const fixture = createEvaluator({});
        expect(() => evaluate(fixture, "Transcript showCr: StandardInput nextLine.")).toThrow(
            TerminalInputNeededSignal,
        );
    });
    test("exposes program arguments through SmalltalkArguments", () => {
        const fixture = createEvaluator({ programArguments: ["alpha", "beta"] });
        evaluate(fixture, "Transcript showCr: 'arg0:', SmalltalkArguments first.");
        expect(fixture.outputText).toBe("arg0:alpha\n");
    });
    test("reads and writes files through FileStream", () => {
        const fixture = createEvaluator({ userFiles: new Map([["data.txt", "probe-data"]]) });
        evaluate(
            fixture,
            "(FileStream fileNamed: 'out.txt') nextPutAll: 'written'; close. Transcript showCr: 'file:', ((FileStream readOnlyFileNamed: 'out.txt') contentsOfEntireFile). Transcript showCr: 'read:', ((FileStream readOnlyFileNamed: 'data.txt') contentsOfEntireFile).",
        );
        expect(fixture.outputText).toBe("file:written\nread:probe-data\n");
    });
    test("files helper code in with Compiler evaluate: and Smalltalk globals", () => {
        const fixture = createEvaluator({
            userFiles: new Map([["helper.st", "Smalltalk at: #helperLabel put: 'helper'."]]),
        });
        evaluate(
            fixture,
            "Compiler evaluate: ((FileStream readOnlyFileNamed: 'helper.st') contentsOfEntireFile). Transcript showCr: helperLabel.",
        );
        expect(fixture.outputText).toBe("helper\n");
    });
    test("returns early with the caret operator", () => {
        const fixture = createEvaluator({});
        evaluate(fixture, "Transcript showCr: 'before'. ^ nil. Transcript showCr: 'after'.");
        expect(fixture.outputText).toBe("before\n");
    });
    test("reports unknown variables, selectors, and division by zero", () => {
        const missingVariable = createEvaluator({});
        expect(() => evaluate(missingVariable, "missingName")).toThrow(
            "Unknown variable: missingName",
        );
        const missingSelector = createEvaluator({});
        expect(() => evaluate(missingSelector, "3 frobnicate")).toThrow(
            "MessageNotUnderstood: Integer>>frobnicate",
        );
        const division = createEvaluator({});
        expect(() => evaluate(division, "1 / 0")).toThrow("Division by zero");
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
async function createSmalltalkPerformerFixture(
    entrySource: string,
): Promise<{ performer: SmalltalkPerformer; stage: FakeTerminalStage; dispose(): void }> {
    const stage = new FakeTerminalStage();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/user-code/manifest.json")) {
            return {
                ok: true,
                json: async () => ({
                    entryFileRelativePath: "main.st",
                    includedFileRelativePaths: ["main.st"],
                    programArguments: [],
                }),
            } as Response;
        }
        if (url.endsWith("/user-code/main.st")) {
            return { ok: true, text: async () => entrySource } as Response;
        }
        return { ok: false, status: 404 } as Response;
    }) as typeof fetch;
    const performer = new SmalltalkPerformer("https://example.test/session");
    return {
        performer,
        stage,
        dispose: () => {
            globalThis.fetch = originalFetch;
        },
    };
}
describe("SmalltalkPerformer", () => {
    test("replays program runs until stdin is satisfied", async () => {
        const fixture = await createSmalltalkPerformerFixture(
            "Transcript showCr: 'ready'. Transcript showCr: 'name: ', StandardInput nextLine.",
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
    test("shapes program errors into one readable line", async () => {
        const fixture = await createSmalltalkPerformerFixture(
            "Transcript showCr: 'before'. 3 frobnicate.",
        );
        try {
            await fixture.performer.loadInto(fixture.stage as unknown as TerminalStageController);
            await expect(
                fixture.performer.performOn(fixture.stage as unknown as TerminalStageController),
            ).rejects.toThrow("Smalltalk error: MessageNotUnderstood: Integer>>frobnicate");
            expect(fixture.stage.shownText).toBe("before\n");
        } finally {
            fixture.dispose();
        }
    });
});
describe("smalltalk showcase template", () => {
    test("runs the shipped showcase to completion", () => {
        const templatePath = fileURLToPath(
            new URL("../../../userSourceTemplates/main.st", import.meta.url),
        );
        const fixture = createEvaluator({});
        evaluate(fixture, readFileSync(templatePath, "utf8"));
        expect(fixture.outputText).toContain("WASMVerse Smalltalk showcase\n");
        expect(fixture.outputText.endsWith("Showcase complete.\n")).toBe(true);
    });
});
