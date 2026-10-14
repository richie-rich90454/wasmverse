import { describe, expect, test } from "vitest";
import {
    RiscvAssembler,
    RISCV_DATA_BASE_ADDRESS,
    RISCV_TEXT_BASE_ADDRESS,
} from "@clientTheatre/runtimePerformers/RiscvAssembler.ts";

describe("RiscvAssembler", () => {
    test("encodes base integer instructions and resolves labels", () => {
        const assembler = new RiscvAssembler();
        const image = assembler.assemble(
            [
                ".text",
                "_start:",
                "    li a0, 7",
                "    addi a1, a0, -2",
                "    add a2, a0, a1",
                "    bne a2, a0, done",
                "done:",
                "    jal ra, _start",
                "    ecall",
                ".data",
                "value: .word 0x12345678",
                'text:  .asciz "hi"',
            ].join("\n"),
        );
        expect(image.entryAddress).toBe(RISCV_TEXT_BASE_ADDRESS);
        expect(image.textBytes.length).toBe(24);
        expect(image.dataBytes.length).toBe(4 + 3);
        expect(image.dataBytes.slice(0, 4)).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
        expect(image.dataBytes.slice(4)).toEqual(new Uint8Array([104, 105, 0]));
        const readWordAt = (offset: number): number =>
            ((image.textBytes[offset] as number) |
                ((image.textBytes[offset + 1] as number) << 8) |
                ((image.textBytes[offset + 2] as number) << 16) |
                ((image.textBytes[offset + 3] as number) << 24)) >>>
            0;
        expect(readWordAt(0)).toBe(0x00700513);
        expect(readWordAt(4)).toBe(0xffe50593);
        expect(readWordAt(8)).toBe(0x00b50633);
        expect(readWordAt(12)).toBe(0x00a61263);
        expect(readWordAt(16)).toBe(0xff1ff0ef);
        expect(readWordAt(20)).toBe(0x00000073);
    });
    test("encodes la and large li with pc relative pairs", () => {
        const assembler = new RiscvAssembler();
        const image = assembler.assemble(
            [
                ".text",
                "la t0, message",
                "li t1, 0x12345678",
                "lw t2, 0(t0)",
                ".data",
                'message: .asciz "ok"',
            ].join("\n"),
        );
        expect(image.textBytes.length).toBe(20);
        const readWordAt = (offset: number): number =>
            ((image.textBytes[offset] as number) |
                ((image.textBytes[offset + 1] as number) << 8) |
                ((image.textBytes[offset + 2] as number) << 16) |
                ((image.textBytes[offset + 3] as number) << 24)) >>>
            0;
        const delta = RISCV_DATA_BASE_ADDRESS - RISCV_TEXT_BASE_ADDRESS;
        expect(readWordAt(0)).toBe(
            encodeUpperWordForTest(0x17, 5, ((delta + 0x800) >> 12) & 0xfffff),
        );
        expect(readWordAt(4) & 0x7f).toBe(0x13);
        expect(readWordAt(8) >>> 25).toBe(0x9);
        expect(readWordAt(12) & 0x7f).toBe(0x13);
        expect(readWordAt(16) & 0x7f).toBe(0x03);
    });
    test("resolves include files through the resolver", () => {
        const assembler = new RiscvAssembler((relativePath) =>
            relativePath === "helper.s" ? '.data\nhelper_label: .asciz "helper"\n' : undefined,
        );
        const image = assembler.assemble(
            ['.include "helper.s"', ".text", "la a1, helper_label", "ecall"].join("\n"),
        );
        expect(image.dataBytes.slice(0, 7)).toEqual(
            new Uint8Array([104, 101, 108, 112, 101, 114, 0]),
        );
    });
    test("reports readable errors with file and line", () => {
        const assembler = new RiscvAssembler();
        expect(() => assembler.assemble("    addi a0, a1, 99999", "main.s")).toThrow(
            "main.s:1: immediate 99999 is outside the allowed range -2048..2047.",
        );
        expect(() => assembler.assemble("    frobnicate a0, a1", "main.s")).toThrow(
            "main.s:1: unknown instruction 'frobnicate'.",
        );
        expect(() => assembler.assemble("    bne a0, a1, nowhere", "main.s")).toThrow(
            "main.s:1: unknown label 'nowhere'.",
        );
    });
    test("supports local labels, char literals and data symbols", () => {
        const assembler = new RiscvAssembler();
        const image = assembler.assemble(
            [
                ".data",
                "table: .word target",
                "letter: .byte 'A'",
                ".text",
                "target:",
                "    li a0, 'A'",
                "    beqz a0, .skip",
                "    j .done",
                ".skip:",
                "    nop",
                ".done:",
                "    ecall",
            ].join("\n"),
        );
        expect(image.dataBytes[0]).toBe(RISCV_TEXT_BASE_ADDRESS & 0xff);
        expect(image.dataBytes[4]).toBe(65);
    });
});
function encodeUpperWordForTest(opcode: number, rd: number, imm: number): number {
    return (((imm & 0xfffff) << 12) | (rd << 7) | opcode) >>> 0;
}
