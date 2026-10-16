import { OPCODES } from "@clientTheatre/runtimePerformers/M6502Assembler.ts";
import type { M6502AddressingMode } from "@clientTheatre/runtimePerformers/M6502Assembler.ts";
interface M6502CpuHooks {
    writeOutputCharacter(characterCode: number): void;
    readInputByte(): number;
}
interface M6502RunOutcome {
    exitCode: number;
    haltReason: "port" | "brk" | "end";
    haltAddress: number;
    steps: number;
}
const CHARACTER_OUTPUT_ADDRESS = 0xf001;
const HALT_ADDRESS = 0xf002;
const INPUT_ADDRESS = 0xf004;
const STACK_PAGE = 0x0100;
const OPCODE_LOOKUP: Record<number, { mnemonic: string; mode: M6502AddressingMode }> = {};
for (const [mnemonic, modes] of Object.entries(OPCODES)) {
    for (const [mode, opcode] of Object.entries(modes)) {
        OPCODE_LOOKUP[opcode as number] = {
            mnemonic,
            mode: mode as M6502AddressingMode,
        };
    }
}
function toHexWord(value: number): string {
    return `$${value.toString(16).toUpperCase().padStart(4, "0")}`;
}
class M6502Cpu {
    readonly memory: Uint8Array = new Uint8Array(0x10000);
    a: number = 0;
    x: number = 0;
    y: number = 0;
    sp: number = 0xfd;
    pc: number = 0x0200;
    readonly flags = { c: false, z: false, i: true, d: false, v: false, n: false };
    private readonly hooks: M6502CpuHooks;
    private halted: boolean = false;
    private haltReason: M6502RunOutcome["haltReason"] = "end";
    private exitCode: number = 0;
    private haltAddress: number = 0;
    constructor(hooks: M6502CpuHooks) {
        this.hooks = hooks;
    }
    loadProgram(bytes: Uint8Array, origin: number): void {
        this.memory.set(bytes, origin);
    }
    reset(origin: number): void {
        this.a = 0;
        this.x = 0;
        this.y = 0;
        this.sp = 0xfd;
        this.pc = origin;
        this.flags.c = false;
        this.flags.z = false;
        this.flags.i = true;
        this.flags.d = false;
        this.flags.v = false;
        this.flags.n = false;
        this.halted = false;
        this.haltReason = "end";
        this.exitCode = 0;
        this.haltAddress = 0;
    }
    run(maximumSteps: number): M6502RunOutcome {
        let steps = 0;
        while (!this.halted) {
            if (steps >= maximumSteps) {
                throw new Error(
                    `Program exceeded ${maximumSteps} instruction steps. Stopping to protect the session.`,
                );
            }
            this.step();
            steps++;
        }
        return {
            exitCode: this.exitCode,
            haltReason: this.haltReason,
            haltAddress: this.haltAddress,
            steps,
        };
    }
    step(): void {
        const instructionAddress = this.pc;
        const opcode = this.readByteAt(this.pc);
        this.pc = (this.pc + 1) & 0xffff;
        const entry = OPCODE_LOOKUP[opcode];
        if (!entry) {
            throw new Error(
                `Unimplemented opcode ${toHexWord(opcode)} at ${toHexWord(instructionAddress)}.`,
            );
        }
        this.execute(entry.mnemonic, entry.mode, opcode, instructionAddress);
    }
    private execute(
        mnemonic: string,
        mode: M6502AddressingMode,
        opcode: number,
        instructionAddress: number,
    ): void {
        const operand = this.decodeOperand(mode);
        const value = operand.value;
        switch (mnemonic) {
            case "LDA":
                this.a = value;
                this.setNegativeZero(this.a);
                return;
            case "LDX":
                this.x = value;
                this.setNegativeZero(this.x);
                return;
            case "LDY":
                this.y = value;
                this.setNegativeZero(this.y);
                return;
            case "STA":
                this.writeByteAt(operand.address as number, this.a);
                return;
            case "STX":
                this.writeByteAt(operand.address as number, this.x);
                return;
            case "STY":
                this.writeByteAt(operand.address as number, this.y);
                return;
            case "TAX":
                this.x = this.a;
                this.setNegativeZero(this.x);
                return;
            case "TAY":
                this.y = this.a;
                this.setNegativeZero(this.y);
                return;
            case "TXA":
                this.a = this.x;
                this.setNegativeZero(this.a);
                return;
            case "TYA":
                this.a = this.y;
                this.setNegativeZero(this.a);
                return;
            case "TSX":
                this.x = this.sp;
                this.setNegativeZero(this.x);
                return;
            case "TXS":
                this.sp = this.x;
                return;
            case "PHA":
                this.pushByte(this.a);
                return;
            case "PHP":
                this.pushByte(this.flagsToByte() | 0x30);
                return;
            case "PLA":
                this.a = this.pullByte();
                this.setNegativeZero(this.a);
                return;
            case "PLP":
                this.byteToFlags(this.pullByte());
                return;
            case "AND":
                this.a &= value;
                this.setNegativeZero(this.a);
                return;
            case "ORA":
                this.a |= value;
                this.setNegativeZero(this.a);
                return;
            case "EOR":
                this.a ^= value;
                this.setNegativeZero(this.a);
                return;
            case "BIT":
                this.flags.z = (this.a & value) === 0;
                this.flags.v = (value & 0x40) !== 0;
                this.flags.n = (value & 0x80) !== 0;
                return;
            case "ADC":
                this.addWithCarry(value);
                return;
            case "SBC":
                this.subtractWithCarry(value);
                return;
            case "CMP":
                this.compareRegister(this.a, value);
                return;
            case "CPX":
                this.compareRegister(this.x, value);
                return;
            case "CPY":
                this.compareRegister(this.y, value);
                return;
            case "INC": {
                const incremented = (value + 1) & 0xff;
                this.writeByteAt(operand.address as number, incremented);
                this.setNegativeZero(incremented);
                return;
            }
            case "DEC": {
                const decremented = (value - 1) & 0xff;
                this.writeByteAt(operand.address as number, decremented);
                this.setNegativeZero(decremented);
                return;
            }
            case "INX":
                this.x = (this.x + 1) & 0xff;
                this.setNegativeZero(this.x);
                return;
            case "INY":
                this.y = (this.y + 1) & 0xff;
                this.setNegativeZero(this.y);
                return;
            case "DEX":
                this.x = (this.x - 1) & 0xff;
                this.setNegativeZero(this.x);
                return;
            case "DEY":
                this.y = (this.y - 1) & 0xff;
                this.setNegativeZero(this.y);
                return;
            case "ASL":
                this.shiftIntoAccumulatorOrMemory(mode, operand.address, "left");
                return;
            case "LSR":
                this.shiftIntoAccumulatorOrMemory(mode, operand.address, "right");
                return;
            case "ROL":
                this.rotateIntoAccumulatorOrMemory(mode, operand.address, "left");
                return;
            case "ROR":
                this.rotateIntoAccumulatorOrMemory(mode, operand.address, "right");
                return;
            case "BCC":
                this.branchIf(!this.flags.c, operand.relativeTarget as number);
                return;
            case "BCS":
                this.branchIf(this.flags.c, operand.relativeTarget as number);
                return;
            case "BEQ":
                this.branchIf(this.flags.z, operand.relativeTarget as number);
                return;
            case "BNE":
                this.branchIf(!this.flags.z, operand.relativeTarget as number);
                return;
            case "BMI":
                this.branchIf(this.flags.n, operand.relativeTarget as number);
                return;
            case "BPL":
                this.branchIf(!this.flags.n, operand.relativeTarget as number);
                return;
            case "BVC":
                this.branchIf(!this.flags.v, operand.relativeTarget as number);
                return;
            case "BVS":
                this.branchIf(this.flags.v, operand.relativeTarget as number);
                return;
            case "JMP":
                this.pc = operand.address as number;
                return;
            case "JSR": {
                const returnAddress = (this.pc - 1) & 0xffff;
                this.pushByte((returnAddress >> 8) & 0xff);
                this.pushByte(returnAddress & 0xff);
                this.pc = operand.address as number;
                return;
            }
            case "RTS": {
                const lowByte = this.pullByte();
                const highByte = this.pullByte();
                this.pc = (((highByte << 8) | lowByte) + 1) & 0xffff;
                return;
            }
            case "RTI": {
                this.byteToFlags(this.pullByte());
                const lowByte = this.pullByte();
                const highByte = this.pullByte();
                this.pc = (highByte << 8) | lowByte;
                return;
            }
            case "CLC":
                this.flags.c = false;
                return;
            case "SEC":
                this.flags.c = true;
                return;
            case "CLI":
                this.flags.i = false;
                return;
            case "SEI":
                this.flags.i = true;
                return;
            case "CLD":
                this.flags.d = false;
                return;
            case "SED":
                this.flags.d = true;
                return;
            case "CLV":
                this.flags.v = false;
                return;
            case "NOP":
                return;
            case "BRK":
                this.halted = true;
                this.haltReason = "brk";
                this.haltAddress = instructionAddress;
                return;
            default:
                throw new Error(
                    `Unimplemented opcode ${toHexWord(opcode)} at ${toHexWord(instructionAddress)}.`,
                );
        }
    }
    private decodeOperand(mode: M6502AddressingMode): {
        address?: number;
        value: number;
        relativeTarget?: number;
    } {
        switch (mode) {
            case "implied":
            case "accumulator":
                return { value: 0 };
            case "immediate": {
                const immediateValue = this.readByteAt(this.pc);
                this.pc = (this.pc + 1) & 0xffff;
                return { value: immediateValue };
            }
            case "zeroPage": {
                const zeroPageAddress = this.readByteAt(this.pc);
                this.pc = (this.pc + 1) & 0xffff;
                return { address: zeroPageAddress, value: this.readByteAt(zeroPageAddress) };
            }
            case "zeroPageX": {
                const zeroPageAddress = (this.readByteAt(this.pc) + this.x) & 0xff;
                this.pc = (this.pc + 1) & 0xffff;
                return { address: zeroPageAddress, value: this.readByteAt(zeroPageAddress) };
            }
            case "zeroPageY": {
                const zeroPageAddress = (this.readByteAt(this.pc) + this.y) & 0xff;
                this.pc = (this.pc + 1) & 0xffff;
                return { address: zeroPageAddress, value: this.readByteAt(zeroPageAddress) };
            }
            case "absolute": {
                const address = this.readWordAt(this.pc);
                this.pc = (this.pc + 2) & 0xffff;
                return { address, value: this.readByteAt(address) };
            }
            case "absoluteX": {
                const address = (this.readWordAt(this.pc) + this.x) & 0xffff;
                this.pc = (this.pc + 2) & 0xffff;
                return { address, value: this.readByteAt(address) };
            }
            case "absoluteY": {
                const address = (this.readWordAt(this.pc) + this.y) & 0xffff;
                this.pc = (this.pc + 2) & 0xffff;
                return { address, value: this.readByteAt(address) };
            }
            case "indirect": {
                const pointer = this.readWordAt(this.pc);
                this.pc = (this.pc + 2) & 0xffff;
                const lowByte = this.readByteAt(pointer);
                const highAddress = (pointer & 0xff00) | ((pointer + 1) & 0x00ff);
                const highByte = this.readByteAt(highAddress);
                return { address: (highByte << 8) | lowByte, value: 0 };
            }
            case "indexedIndirect": {
                const zeroPagePointer = (this.readByteAt(this.pc) + this.x) & 0xff;
                this.pc = (this.pc + 1) & 0xffff;
                const lowByte = this.readByteAt(zeroPagePointer);
                const highByte = this.readByteAt((zeroPagePointer + 1) & 0xff);
                const address = (highByte << 8) | lowByte;
                return { address, value: this.readByteAt(address) };
            }
            case "indirectIndexed": {
                const zeroPagePointer = this.readByteAt(this.pc);
                this.pc = (this.pc + 1) & 0xffff;
                const lowByte = this.readByteAt(zeroPagePointer);
                const highByte = this.readByteAt((zeroPagePointer + 1) & 0xff);
                const address = (((highByte << 8) | lowByte) + this.y) & 0xffff;
                return { address, value: this.readByteAt(address) };
            }
            case "relative": {
                const offsetByte = this.readByteAt(this.pc);
                this.pc = (this.pc + 1) & 0xffff;
                const signedOffset = offsetByte < 0x80 ? offsetByte : offsetByte - 0x100;
                return { value: 0, relativeTarget: (this.pc + signedOffset) & 0xffff };
            }
            default:
                throw new Error(`Unsupported addressing mode ${mode}.`);
        }
    }
    private shiftIntoAccumulatorOrMemory(
        mode: M6502AddressingMode,
        address: number | undefined,
        direction: "left" | "right",
    ): void {
        const operandValue =
            mode === "accumulator" ? this.a : (this.memory[address as number] as number);
        if (direction === "left") {
            this.flags.c = (operandValue & 0x80) !== 0;
            const shifted = (operandValue << 1) & 0xff;
            this.storeShiftResult(mode, address, shifted);
            return;
        }
        this.flags.c = (operandValue & 0x01) !== 0;
        const shifted = (operandValue >> 1) & 0xff;
        this.storeShiftResult(mode, address, shifted);
    }
    private rotateIntoAccumulatorOrMemory(
        mode: M6502AddressingMode,
        address: number | undefined,
        direction: "left" | "right",
    ): void {
        const operandValue =
            mode === "accumulator" ? this.a : (this.memory[address as number] as number);
        const carryIn = this.flags.c ? 1 : 0;
        if (direction === "left") {
            this.flags.c = (operandValue & 0x80) !== 0;
            const rotated = ((operandValue << 1) | carryIn) & 0xff;
            this.storeShiftResult(mode, address, rotated);
            return;
        }
        this.flags.c = (operandValue & 0x01) !== 0;
        const rotated = ((operandValue >> 1) | (carryIn << 7)) & 0xff;
        this.storeShiftResult(mode, address, rotated);
    }
    private storeShiftResult(
        mode: M6502AddressingMode,
        address: number | undefined,
        value: number,
    ): void {
        if (mode === "accumulator") {
            this.a = value;
        } else {
            this.writeByteAt(address as number, value);
        }
        this.setNegativeZero(value);
    }
    private addWithCarry(value: number): void {
        const carryIn = this.flags.c ? 1 : 0;
        const sum = this.a + value + carryIn;
        this.flags.c = sum > 0xff;
        const result = sum & 0xff;
        this.flags.v = (~(this.a ^ value) & (this.a ^ result) & 0x80) !== 0;
        this.a = result;
        this.setNegativeZero(this.a);
    }
    private subtractWithCarry(value: number): void {
        this.addWithCarry(value ^ 0xff);
    }
    private compareRegister(registerValue: number, value: number): void {
        const difference = (registerValue - value) & 0xff;
        this.flags.c = registerValue >= value;
        this.flags.z = difference === 0;
        this.flags.n = (difference & 0x80) !== 0;
    }
    private branchIf(condition: boolean, target: number): void {
        if (condition) {
            this.pc = target;
        }
    }
    private setNegativeZero(value: number): void {
        this.flags.z = (value & 0xff) === 0;
        this.flags.n = (value & 0x80) !== 0;
    }
    private flagsToByte(): number {
        return (
            (this.flags.c ? 0x01 : 0) |
            (this.flags.z ? 0x02 : 0) |
            (this.flags.i ? 0x04 : 0) |
            (this.flags.d ? 0x08 : 0) |
            (this.flags.v ? 0x40 : 0) |
            (this.flags.n ? 0x80 : 0)
        );
    }
    private byteToFlags(flagByte: number): void {
        this.flags.c = (flagByte & 0x01) !== 0;
        this.flags.z = (flagByte & 0x02) !== 0;
        this.flags.i = (flagByte & 0x04) !== 0;
        this.flags.d = (flagByte & 0x08) !== 0;
        this.flags.v = (flagByte & 0x40) !== 0;
        this.flags.n = (flagByte & 0x80) !== 0;
    }
    private pushByte(value: number): void {
        this.memory[STACK_PAGE + this.sp] = value & 0xff;
        this.sp = (this.sp - 1) & 0xff;
    }
    private pullByte(): number {
        this.sp = (this.sp + 1) & 0xff;
        return this.memory[STACK_PAGE + this.sp] as number;
    }
    private readWordAt(address: number): number {
        const lowByte = this.readByteAt(address);
        const highByte = this.readByteAt((address + 1) & 0xffff);
        return (highByte << 8) | lowByte;
    }
    private readByteAt(address: number): number {
        if (address === INPUT_ADDRESS) {
            return this.hooks.readInputByte() & 0xff;
        }
        return this.memory[address] as number;
    }
    private writeByteAt(address: number, value: number): void {
        const maskedValue = value & 0xff;
        if (address === CHARACTER_OUTPUT_ADDRESS) {
            this.hooks.writeOutputCharacter(maskedValue);
            return;
        }
        if (address === HALT_ADDRESS) {
            this.halted = true;
            this.haltReason = "port";
            this.exitCode = maskedValue;
            this.haltAddress = address;
            return;
        }
        this.memory[address] = maskedValue;
    }
}
export {
    CHARACTER_OUTPUT_ADDRESS,
    HALT_ADDRESS,
    INPUT_ADDRESS,
    M6502Cpu,
    OPCODE_LOOKUP,
    toHexWord,
};
export type { M6502CpuHooks, M6502RunOutcome };
