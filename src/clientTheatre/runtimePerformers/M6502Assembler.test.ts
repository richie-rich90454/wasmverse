import { describe, expect, test } from "vitest";
import { M6502Assembler } from "@clientTheatre/runtimePerformers/M6502Assembler.ts";
function toHex(bytes: Uint8Array): string {
    return [...bytes].map((byteValue) => byteValue.toString(16).padStart(2, "0")).join(" ");
}
describe("M6502Assembler", () => {
    test("assembles basic instructions with labels", () => {
        const result = new M6502Assembler().assemble(
            [
                "        .org $0200",
                "start:",
                "        lda #$05",
                "        sta $10",
                "        jmp start",
            ].join("\n"),
        );
        expect(result.origin).toBe(0x0200);
        expect(toHex(result.bytes)).toBe("a9 05 85 10 4c 00 02");
        expect(result.labels["start"]).toBe(0x0200);
    });
    test("emits .byte strings, .word labels and .res space", () => {
        const result = new M6502Assembler().assemble(
            [
                "        .org $0300",
                "message:",
                '        .byte "hi", 0',
                "pointer:",
                "        .word message",
                "        .res 3",
                "end:",
            ].join("\n"),
        );
        expect(toHex(result.bytes)).toBe("68 69 00 00 03 00 00 00");
        expect(result.labels["message"]).toBe(0x0300);
        expect(result.labels["pointer"]).toBe(0x0303);
        expect(result.labels["end"]).toBe(0x0308);
    });
    test("selects zero page addressing when the operand fits", () => {
        const result = new M6502Assembler().assemble(
            ["        lda $10", "        lda $1000", "        sta $20,x"].join("\n"),
        );
        expect(toHex(result.bytes)).toBe("a5 10 ad 00 10 95 20");
    });
    test("sizes forward label operands as absolute and resolves them in pass two", () => {
        const result = new M6502Assembler().assemble(
            ["        lda later", "        nop", "later:", "        rts"].join("\n"),
        );
        expect(toHex(result.bytes)).toBe("ad 04 02 ea 60");
    });
    test("assembles indirect addressing forms", () => {
        const result = new M6502Assembler().assemble(
            [
                "        lda ($20),y",
                "        lda ($20,x)",
                "        jmp ($1234)",
                "        ldx $20,y",
            ].join("\n"),
        );
        expect(toHex(result.bytes)).toBe("b1 20 a1 20 6c 34 12 b6 20");
    });
    test("resolves .include files so labels can span files", () => {
        const result = new M6502Assembler().assemble(
            ['        .include "helper.6502"', "        lda helperText"].join("\n"),
            {
                readFile: (requestedPath: string) => {
                    if (requestedPath === "helper.6502") {
                        return 'helperText:\n        .byte "helper", 0\n';
                    }
                    throw new Error(`missing ${requestedPath}`);
                },
            },
        );
        expect(toHex(result.bytes)).toBe("68 65 6c 70 65 72 00 ad 00 02");
        expect(result.labels["helperText"]).toBe(0x0200);
    });
    test("computes branch offsets and reports out-of-range branches", () => {
        const near = new M6502Assembler().assemble(
            ["        beq target", "        nop", "target:", "        rts"].join("\n"),
        );
        expect(toHex(near.bytes)).toBe("f0 01 ea 60");
        expect(() => {
            new M6502Assembler().assemble(
                ["        beq far", "        .res 200", "far:", "        rts"].join("\n"),
            );
        }).toThrow("branch out of range");
    });
    test("reports undefined labels, duplicate labels and unknown instructions", () => {
        expect(() => {
            new M6502Assembler().assemble("        lda #missing");
        }).toThrow("Undefined label");
        expect(() => {
            new M6502Assembler().assemble("twice:\n        nop\ntwice:\n        nop");
        }).toThrow("duplicate label 'twice'");
        expect(() => {
            new M6502Assembler().assemble("        frobnicate #1");
        }).toThrow("unknown instruction 'FROBNICATE'");
    });
    test("reports include files that cannot be resolved", () => {
        expect(() => {
            new M6502Assembler().assemble('        .include "missing.6502"', {
                readFile: () => {
                    throw new Error("not found");
                },
            });
        }).toThrow("include file 'missing.6502' not found");
    });
});
