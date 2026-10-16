import { describe, expect, test } from "vitest";
import { RiscvAssembler } from "@clientTheatre/runtimePerformers/RiscvAssembler.ts";
import { RiscvMachine } from "@clientTheatre/runtimePerformers/RiscvEmulator.ts";
import type { RiscvProgramIo } from "@clientTheatre/runtimePerformers/RiscvEmulator.ts";

interface RecordingOptions {
    fedLines?: ReadonlyArray<string>;
    programArguments?: ReadonlyArray<string>;
    files?: ReadonlyMap<string, string>;
    stepLimit?: number;
}

function runProgram(
    sourceText: string,
    options: RecordingOptions = {},
): { exitCode: number; writtenText: Array<string> } {
    const writtenText: Array<string> = [];
    const remainingLines = [...(options.fedLines ?? [])];
    const textEncoder = new TextEncoder();
    const io: RiscvProgramIo = {
        writeText: (text) => {
            writtenText.push(text);
        },
        readLine: () => {
            const nextLine = remainingLines.shift();
            if (nextLine === undefined) {
                throw new Error("Test program requested more input than was provided.");
            }
            return nextLine;
        },
        readFile: (relativePath) => {
            const contents = options.files?.get(relativePath);
            return contents === undefined ? undefined : textEncoder.encode(contents);
        },
    };
    const image = new RiscvAssembler().assemble(sourceText);
    const machine = new RiscvMachine(image, io, options.programArguments ?? [], {
        stepLimit: options.stepLimit,
    });
    return { exitCode: machine.run(), writtenText };
}

describe("RiscvMachine", () => {
    test("sums a loop with branches and prints the result", () => {
        const { exitCode, writtenText } = runProgram(
            [
                ".text",
                "_start:",
                "    li a1, 0",
                "    li t0, 1",
                "loop:",
                "    add a1, a1, t0",
                "    addi t0, t0, 1",
                "    li t1, 11",
                "    blt t0, t1, loop",
                "    li a7, 1",
                "    ecall",
                "    li a0, 0",
                "    li a7, 10",
                "    ecall",
            ].join("\n"),
        );
        expect(exitCode).toBe(0);
        expect(writtenText.join("")).toBe("55");
    });
    test("reads a line into memory and prints it back with length syscall", () => {
        const { writtenText } = runProgram(
            [
                ".data",
                'greeting: .asciz "greet:"',
                "buffer: .space 64",
                ".text",
                "_start:",
                "    la a1, greeting",
                "    li a2, 6",
                "    li a7, 4",
                "    ecall",
                "    la a1, buffer",
                "    li a2, 64",
                "    li a7, 8",
                "    ecall",
                "    la a1, buffer",
                "    mv a2, a0",
                "    li a7, 4",
                "    ecall",
                "    li a0, 0",
                "    li a7, 10",
                "    ecall",
            ].join("\n"),
            { fedLines: ["Ada"] },
        );
        expect(writtenText.join("")).toBe("greet:Ada");
    });
    test("exposes program arguments through a0 and a1", () => {
        const { writtenText } = runProgram(
            [
                ".text",
                "_start:",
                "    lw t0, 0(a1)",
                "    mv a1, t0",
                "    li a7, 20",
                "    ecall",
                "    li a0, 0",
                "    li a7, 10",
                "    ecall",
            ].join("\n"),
            { programArguments: ["alpha", "beta"] },
        );
        expect(writtenText.join("")).toBe("alpha");
    });
    test("reads files through the open, read and close syscalls", () => {
        const { writtenText } = runProgram(
            [
                ".data",
                'path:   .asciz "data.txt"',
                "buffer: .space 32",
                ".text",
                "_start:",
                "    la a1, path",
                "    li a7, 13",
                "    ecall",
                "    mv t0, a0",
                "    mv a0, t0",
                "    la a1, buffer",
                "    li a2, 31",
                "    li a7, 14",
                "    ecall",
                "    la a1, buffer",
                "    mv a2, a0",
                "    li a7, 4",
                "    ecall",
                "    mv a0, t0",
                "    li a7, 15",
                "    ecall",
                "    li a0, 0",
                "    li a7, 10",
                "    ecall",
            ].join("\n"),
            { files: new Map([["data.txt", "probe-data"]]) },
        );
        expect(writtenText.join("")).toBe("probe-data");
    });
    test("enforces the zero register", () => {
        const { writtenText } = runProgram(
            [
                ".text",
                "_start:",
                "    li x0, 99",
                "    li a1, 5",
                "    li a7, 1",
                "    ecall",
                "    li a0, 0",
                "    li a7, 10",
                "    ecall",
            ].join("\n"),
        );
        expect(writtenText.join("")).toBe("5");
    });
    test("stops runaway programs with a readable step limit error", () => {
        expect(() =>
            runProgram([".text", "_start:", "    j _start"].join("\n"), { stepLimit: 100 }),
        ).toThrow(/Execution stopped after 100 instructions/);
    });
    test("reports unsupported syscalls readable", () => {
        expect(() =>
            runProgram([".text", "_start:", "    li a7, 99", "    ecall"].join("\n")),
        ).toThrow(
            "Unsupported RISC-V syscall 99. Supported services: 1, 4, 5, 8, 10, 11, 13, 14, 15, 20.",
        );
    });
    test("reports nonzero exit codes through the return value", () => {
        const { exitCode } = runProgram(
            [".text", "_start:", "    li a0, 3", "    li a7, 10", "    ecall"].join("\n"),
        );
        expect(exitCode).toBe(3);
    });
});
