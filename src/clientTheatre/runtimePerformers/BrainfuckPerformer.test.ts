import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
    BrainfuckInterpreter,
    BrainfuckStdinBytes,
} from "@clientTheatre/runtimePerformers/BrainfuckPerformer.ts";
import { isTerminalInputNeeded } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
interface RecordedRun {
    output: string;
    error?: unknown;
}
function runProgram(sourceText: string, fedLines: ReadonlyArray<string> = []): RecordedRun {
    const outputBytes: Array<number> = [];
    try {
        new BrainfuckInterpreter().run(sourceText, new BrainfuckStdinBytes(fedLines), {
            writeByte: (byte: number) => outputBytes.push(byte),
        });
    } catch (error) {
        return { output: new TextDecoder().decode(Uint8Array.from(outputBytes)), error };
    }
    return { output: new TextDecoder().decode(Uint8Array.from(outputBytes)) };
}
describe("BrainfuckInterpreter", () => {
    test("prints a cell value once the plus characters sum up", () => {
        const outcome = runProgram("+".repeat(65) + ".");
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("A");
    });
    test("runs a multiplication loop with the moving pointer", () => {
        const outcome = runProgram("++++++++++[>++++++++++<-]>.");
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("d");
    });
    test("wraps cells modulo 256", () => {
        const wrapOutcome = runProgram("+".repeat(256) + ".");
        expect(wrapOutcome.output).toBe("\u0000");
        const decrementOutcome = runProgram("-.");
        expect(decrementOutcome.output).toBe("\uFFFD");
    });
    test("echoes stdin bytes in order", () => {
        const outcome = runProgram(",.,.,.", ["Ada"]);
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toBe("Ada");
    });
    test("asks for more input once the fed bytes run out", () => {
        const outcome = runProgram(",", []);
        expect(outcome.error).toBeDefined();
        expect(isTerminalInputNeeded(outcome.error)).toBe(true);
    });
    test("reports unmatched brackets with their position", () => {
        const openOutcome = runProgram("++[");
        expect(String((openOutcome.error as Error).message)).toBe("Unmatched '[' at position 2.");
        const closeOutcome = runProgram("+++]");
        expect(String((closeOutcome.error as Error).message)).toBe("Unmatched ']' at position 3.");
    });
    test("reports pointer movement outside the tape", () => {
        const leftOutcome = runProgram("<");
        expect(String((leftOutcome.error as Error).message)).toContain("tape");
        const rightOutcome = runProgram(">".repeat(30000));
        expect(String((rightOutcome.error as Error).message)).toContain("tape");
    });
    test("stops programs that never leave an empty loop", () => {
        const outcome = runProgram("+[]");
        expect(String((outcome.error as Error).message)).toContain("steps");
    });
});
describe("BrainfuckStdinBytes", () => {
    test("feeds each line with a trailing newline byte", () => {
        const stdinBytes = new BrainfuckStdinBytes(["Ada"]);
        expect(stdinBytes.readByte()).toBe(65);
        expect(stdinBytes.readByte()).toBe(100);
        expect(stdinBytes.readByte()).toBe(97);
        expect(stdinBytes.readByte()).toBe(10);
        expect(() => stdinBytes.readByte()).toThrow();
    });
});
describe("brainfuck showcase template", () => {
    test("prints the tape loop banner and finishes with the closing line", () => {
        const templatePath = fileURLToPath(
            new URL("../../../userSourceTemplates/main.bf", import.meta.url),
        );
        const outcome = runProgram(readFileSync(templatePath, "utf8"), [""]);
        expect(outcome.error).toBeUndefined();
        expect(outcome.output).toContain("WASMVerse Brainfuck showcase");
        expect(outcome.output).toContain("ABC\nABC\n");
        expect(outcome.output.endsWith("Showcase complete.\n")).toBe(true);
    });
});
