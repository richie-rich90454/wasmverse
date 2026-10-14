import { describe, expect, test } from "vitest";
import { M6502Assembler } from "@clientTheatre/runtimePerformers/M6502Assembler.ts";
import { M6502Cpu } from "@clientTheatre/runtimePerformers/M6502Cpu.ts";
const PROBE_HELPER_SOURCE = 'helperText:\n        .byte "helper", 0\n';
const PROBE_SOURCE = [
    "        .org $0200",
    "",
    "start:",
    "        lda #<greetText",
    "        sta $00",
    "        lda #>greetText",
    "        sta $01",
    "        jsr printString",
    "        lda #<helperText",
    "        sta $00",
    "        lda #>helperText",
    "        sta $01",
    "        jsr printString",
    "        lda #<colonText",
    "        sta $00",
    "        lda #>colonText",
    "        sta $01",
    "        jsr printString",
    "        ldx #0",
    "readLoop:",
    "        lda $F004",
    "        cmp #13",
    "        beq readDone",
    "        sta nameBuffer,x",
    "        inx",
    "        cpx #60",
    "        bcc readLoop",
    "readDone:",
    "        stx nameLength",
    "        ldx #0",
    "echoLoop:",
    "        cpx nameLength",
    "        beq echoDone",
    "        lda nameBuffer,x",
    "        sta $F001",
    "        inx",
    "        jmp echoLoop",
    "echoDone:",
    "        lda #10",
    "        sta $F001",
    "        lda #<doneText",
    "        sta $00",
    "        lda #>doneText",
    "        sta $01",
    "        jsr printString",
    "        lda #0",
    "        sta $F002",
    "",
    "printString:",
    "        ldy #0",
    "printStringLoop:",
    "        lda ($00),y",
    "        beq printStringDone",
    "        sta $F001",
    "        iny",
    "        jmp printStringLoop",
    "printStringDone:",
    "        rts",
    "",
    "greetText:",
    '        .byte "greet:", 0',
    "colonText:",
    '        .byte ":", 0',
    "doneText:",
    '        .byte "PROBE-DONE", 10, 0',
    "",
    "nameBuffer:",
    "        .res 64",
    "nameLength:",
    "        .byte 0",
    "",
    '        .include "helper.6502"',
].join("\n");
const SHOWCASE_SOURCE = [
    "        .org $0200",
    "",
    "start:",
    "        lda #<bannerText",
    "        sta $00",
    "        lda #>bannerText",
    "        sta $01",
    "        jsr printString",
    "",
    "        lda #0",
    "        sta $10",
    "        lda #1",
    "        sta $11",
    "        ldx #10",
    "fibLoop:",
    "        lda $10",
    "        jsr printByte",
    "        lda #10",
    "        sta $F001",
    "        lda $10",
    "        clc",
    "        adc $11",
    "        sta $12",
    "        lda $11",
    "        sta $10",
    "        lda $12",
    "        sta $11",
    "        dex",
    "        bne fibLoop",
    "",
    "        lda #<doneText",
    "        sta $00",
    "        lda #>doneText",
    "        sta $01",
    "        jsr printString",
    "        lda #0",
    "        sta $F002",
    "",
    "printString:",
    "        ldy #0",
    "printStringLoop:",
    "        lda ($00),y",
    "        beq printStringDone",
    "        sta $F001",
    "        iny",
    "        jmp printStringLoop",
    "printStringDone:",
    "        rts",
    "",
    "printByte:",
    "        stx $04",
    "        ldx #0",
    "printByteTens:",
    "        cmp #10",
    "        bcc printByteTensDone",
    "        sbc #10",
    "        inx",
    "        jmp printByteTens",
    "printByteTensDone:",
    "        sta $03",
    "        cpx #0",
    "        beq printByteSkipTens",
    "        txa",
    "        clc",
    "        adc #48",
    "        sta $F001",
    "printByteSkipTens:",
    "        lda $03",
    "        clc",
    "        adc #48",
    "        sta $F001",
    "        ldx $04",
    "        rts",
    "",
    "bannerText:",
    '        .byte "WASMVerse 6502 showcase", 10, 0',
    "doneText:",
    '        .byte "Showcase complete.", 10, 0',
].join("\n");
interface CpuFixture {
    cpu: M6502Cpu;
    outputText(): string;
    remainingInput(): ReadonlyArray<number>;
}
function assembleAndRun(
    sourceText: string,
    inputBytes: ReadonlyArray<number> = [],
    maximumSteps: number = 1_000_000,
): CpuFixture {
    const assembly = new M6502Assembler().assemble(sourceText, {
        readFile: (requestedPath: string) => {
            if (requestedPath === "helper.6502") {
                return PROBE_HELPER_SOURCE;
            }
            throw new Error(`missing ${requestedPath}`);
        },
    });
    const outputParts: Array<string> = [];
    const pendingInput = [...inputBytes];
    const cpu = new M6502Cpu({
        writeOutputCharacter: (characterCode: number) => {
            outputParts.push(String.fromCharCode(characterCode));
        },
        readInputByte: () => {
            if (pendingInput.length === 0) {
                throw new Error("INPUT_NEEDED");
            }
            return pendingInput.shift() as number;
        },
    });
    cpu.loadProgram(assembly.bytes, assembly.origin);
    cpu.reset(assembly.origin);
    cpu.run(maximumSteps);
    return {
        cpu,
        outputText: () => outputParts.join(""),
        remainingInput: () => pendingInput,
    };
}
function characterCodes(text: string): Array<number> {
    return [...text].map((character) => character.charCodeAt(0));
}
describe("M6502Cpu", () => {
    test("runs the probe program: prints greet:helper:, echoes stdin, then PROBE-DONE", () => {
        const fixture = assembleAndRun(PROBE_SOURCE, [...characterCodes("Ada"), 13]);
        expect(fixture.outputText()).toBe("greet:helper:Ada\nPROBE-DONE\n");
    });
    test("signals the input-needed error when the probe reads past its input", () => {
        expect(() => {
            assembleAndRun(PROBE_SOURCE, characterCodes("Ada"));
        }).toThrow("INPUT_NEEDED");
    });
    test("runs the showcase program with fibonacci output", () => {
        const fixture = assembleAndRun(SHOWCASE_SOURCE);
        expect(fixture.outputText()).toBe(
            "WASMVerse 6502 showcase\n0\n1\n1\n2\n3\n5\n8\n13\n21\n34\nShowcase complete.\n",
        );
    });
    test("computes ADC carry and overflow flags in binary mode", () => {
        const overflowFixture = assembleAndRun(
            ["        lda #$7f", "        clc", "        adc #$01", "        sta $10"].join("\n"),
        );
        expect(overflowFixture.cpu.memory[0x10]).toBe(0x80);
        expect(overflowFixture.cpu.flags.c).toBe(false);
        expect(overflowFixture.cpu.flags.v).toBe(true);
        expect(overflowFixture.cpu.flags.n).toBe(true);
        const carryFixture = assembleAndRun(
            ["        lda #$ff", "        clc", "        adc #$01", "        sta $10"].join("\n"),
        );
        expect(carryFixture.cpu.memory[0x10]).toBe(0x00);
        expect(carryFixture.cpu.flags.c).toBe(true);
        expect(carryFixture.cpu.flags.z).toBe(true);
    });
    test("computes SBC with borrow", () => {
        const fixture = assembleAndRun(
            ["        sec", "        lda #$05", "        sbc #$03", "        sta $10"].join("\n"),
        );
        expect(fixture.cpu.memory[0x10]).toBe(0x02);
        expect(fixture.cpu.flags.c).toBe(true);
    });
    test("loops with DEX/BNE and indexed addressing", () => {
        const fixture = assembleAndRun(
            [
                "        ldx #4",
                "        lda #7",
                "fillLoop:",
                "        sta $10,x",
                "        dex",
                "        bne fillLoop",
                "        sta $0f",
            ].join("\n"),
        );
        expect(fixture.cpu.memory[0x14]).toBe(7);
        expect(fixture.cpu.memory[0x11]).toBe(7);
        expect(fixture.cpu.memory[0x10]).toBe(0);
        expect(fixture.cpu.memory[0x0f]).toBe(7);
        expect(fixture.cpu.x).toBe(0);
    });
    test("halts on BRK and reports the address", () => {
        const assembly = new M6502Assembler().assemble(
            ["        .org $0200", "        brk"].join("\n"),
        );
        const cpu = new M6502Cpu({
            writeOutputCharacter: () => undefined,
            readInputByte: () => {
                throw new Error("INPUT_NEEDED");
            },
        });
        cpu.loadProgram(assembly.bytes, assembly.origin);
        cpu.reset(assembly.origin);
        const outcome = cpu.run(100);
        expect(outcome.haltReason).toBe("brk");
        expect(outcome.haltAddress).toBe(0x0200);
    });
    test("stops runaway programs with a readable step limit message", () => {
        const assembly = new M6502Assembler().assemble(
            ["        .org $0200", "        jmp $0200"].join("\n"),
        );
        const cpu = new M6502Cpu({
            writeOutputCharacter: () => undefined,
            readInputByte: () => {
                throw new Error("INPUT_NEEDED");
            },
        });
        cpu.loadProgram(assembly.bytes, assembly.origin);
        cpu.reset(assembly.origin);
        expect(() => cpu.run(500)).toThrow("exceeded 500 instruction steps");
    });
    test("reports unimplemented opcodes with their address", () => {
        const cpu = new M6502Cpu({
            writeOutputCharacter: () => undefined,
            readInputByte: () => {
                throw new Error("INPUT_NEEDED");
            },
        });
        cpu.memory[0x0200] = 0x02;
        cpu.reset(0x0200);
        expect(() => cpu.run(10)).toThrow("Unimplemented opcode $0002 at $0200");
    });
});
