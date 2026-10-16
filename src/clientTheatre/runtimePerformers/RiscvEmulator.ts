import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import type { RiscvProgramImage } from "@clientTheatre/runtimePerformers/RiscvAssembler.ts";
const DEFAULT_STEP_LIMIT = 5_000_000;
const STACK_TOP_ADDRESS = 0x7fff0000;
const ARGUMENT_STRING_BASE_ADDRESS = 0x7ffd0000;
const ARGUMENT_STRING_STRIDE = 0x400;
const ARGUMENT_TABLE_BASE_ADDRESS = 0x7ffe0000;
interface RiscvProgramIo {
    writeText(text: string): void;
    readLine(): string;
    readFile(relativePath: string): Uint8Array | undefined;
}
interface RiscvMachineOptions {
    stepLimit?: number;
}
interface RiscvOpenFile {
    bytes: Uint8Array;
    offset: number;
}
function signExtend(value: number, bitCount: number): number {
    const shift = 32 - bitCount;
    return (value << shift) >> shift;
}
class RiscvMachine {
    private readonly io: RiscvProgramIo;
    private readonly registers: Uint32Array = new Uint32Array(32);
    private readonly memory: Map<number, number> = new Map();
    private readonly openFiles: Map<number, RiscvOpenFile> = new Map();
    private readonly stepLimit: number;
    private readonly textDecoder: TextDecoder = new TextDecoder();
    private readonly textEncoder: TextEncoder = new TextEncoder();
    private programCounter: number;
    private nextFileDescriptor: number = 3;
    private executedSteps: number = 0;
    private exitRequested: boolean = false;
    private exitCode: number = 0;
    constructor(
        image: RiscvProgramImage,
        io: RiscvProgramIo,
        programArguments: ReadonlyArray<string> = [],
        options: RiscvMachineOptions = {},
    ) {
        this.io = io;
        this.stepLimit = options.stepLimit ?? DEFAULT_STEP_LIMIT;
        this.programCounter = image.entryAddress;
        this.loadSegment(image.textBaseAddress, image.textBytes);
        this.loadSegment(image.dataBaseAddress, image.dataBytes);
        this.registers[2] = STACK_TOP_ADDRESS;
        this.placeProgramArguments(programArguments);
    }
    run(): number {
        while (!this.exitRequested) {
            if (this.executedSteps >= this.stepLimit) {
                throw new Error(
                    `Execution stopped after ${this.stepLimit} instructions at program counter 0x${(this.programCounter >>> 0).toString(16)}: the program may contain an infinite loop.`,
                );
            }
            const instructionWord = this.readWord(this.programCounter);
            this.programCounter = (this.programCounter + 4) >>> 0;
            this.executeInstruction(instructionWord);
            this.executedSteps += 1;
        }
        return this.exitCode;
    }
    private loadSegment(baseAddress: number, segmentBytes: Uint8Array): void {
        for (let byteIndex = 0; byteIndex < segmentBytes.length; byteIndex++) {
            this.memory.set((baseAddress + byteIndex) >>> 0, segmentBytes[byteIndex] as number);
        }
    }
    private placeProgramArguments(programArguments: ReadonlyArray<string>): void {
        if (programArguments.length === 0) {
            this.registers[10] = 0;
            this.registers[11] = 0;
            return;
        }
        programArguments.forEach((argument, argumentIndex) => {
            const stringAddress =
                ARGUMENT_STRING_BASE_ADDRESS + argumentIndex * ARGUMENT_STRING_STRIDE;
            const encoded = this.textEncoder.encode(argument);
            if (encoded.length >= ARGUMENT_STRING_STRIDE) {
                throw new Error(
                    `Program argument ${argumentIndex} is longer than ${ARGUMENT_STRING_STRIDE - 1} bytes.`,
                );
            }
            for (let byteIndex = 0; byteIndex < encoded.length; byteIndex++) {
                this.writeByte(stringAddress + byteIndex, encoded[byteIndex] as number);
            }
            this.writeByte(stringAddress + encoded.length, 0);
            this.writeWord(ARGUMENT_TABLE_BASE_ADDRESS + argumentIndex * 4, stringAddress);
        });
        this.registers[10] = programArguments.length;
        this.registers[11] = ARGUMENT_TABLE_BASE_ADDRESS;
    }
    private executeInstruction(instructionWord: number): void {
        const opcode = instructionWord & 0x7f;
        const destinationRegister = (instructionWord >>> 7) & 0x1f;
        const leftRegister = (instructionWord >>> 15) & 0x1f;
        const rightRegister = (instructionWord >>> 20) & 0x1f;
        const funct3 = (instructionWord >>> 12) & 0x7;
        const funct7 = instructionWord >>> 25;
        const leftValue = this.registerValue(leftRegister);
        const rightValue = this.registerValue(rightRegister);
        const writeRegister = (registerIndex: number, value: number): void => {
            if (registerIndex !== 0) {
                this.registers[registerIndex] = value >>> 0;
            }
        };
        switch (opcode) {
            case 0x33: {
                writeRegister(
                    destinationRegister,
                    this.applyRegisterOperation(funct3, funct7, leftValue, rightValue),
                );
                return;
            }
            case 0x13: {
                if (funct3 === 1 || funct3 === 5) {
                    const shiftAmount = (instructionWord >>> 20) & 0x1f;
                    if (funct3 === 1) {
                        writeRegister(destinationRegister, leftValue << shiftAmount);
                        return;
                    }
                    const shifted =
                        funct7 === 0x20
                            ? (leftValue | 0) >> shiftAmount
                            : leftValue >>> shiftAmount;
                    writeRegister(destinationRegister, shifted);
                    return;
                }
                const immediate = signExtend(instructionWord >>> 20, 12);
                writeRegister(
                    destinationRegister,
                    this.applyImmediateOperation(funct3, leftValue, immediate),
                );
                return;
            }
            case 0x03: {
                const address = (leftValue + signExtend(instructionWord >>> 20, 12)) >>> 0;
                writeRegister(destinationRegister, this.loadValue(funct3, address));
                return;
            }
            case 0x23: {
                const immediate = signExtend(
                    ((instructionWord >>> 25) << 5) | ((instructionWord >>> 7) & 0x1f),
                    12,
                );
                this.storeValue(funct3, (leftValue + immediate) >>> 0, rightValue);
                return;
            }
            case 0x63: {
                const immediate = signExtend(
                    ((instructionWord >>> 31) << 12) |
                        (((instructionWord >>> 7) & 1) << 11) |
                        (((instructionWord >>> 25) & 0x3f) << 5) |
                        (((instructionWord >>> 8) & 0xf) << 1),
                    13,
                );
                if (this.branchIsTaken(funct3, leftValue, rightValue)) {
                    this.programCounter = (this.programCounter - 4 + immediate) >>> 0;
                }
                return;
            }
            case 0x37: {
                writeRegister(destinationRegister, instructionWord & 0xfffff000);
                return;
            }
            case 0x17: {
                writeRegister(
                    destinationRegister,
                    ((instructionWord & 0xfffff000) + (this.programCounter - 4)) >>> 0,
                );
                return;
            }
            case 0x6f: {
                const immediate = signExtend(
                    ((instructionWord >>> 31) << 20) |
                        (((instructionWord >>> 12) & 0xff) << 12) |
                        (((instructionWord >>> 20) & 1) << 11) |
                        (((instructionWord >>> 21) & 0x3ff) << 1),
                    21,
                );
                writeRegister(destinationRegister, this.programCounter);
                this.programCounter = (this.programCounter - 4 + immediate) >>> 0;
                return;
            }
            case 0x67: {
                const immediate = signExtend(instructionWord >>> 20, 12);
                const jumpTarget = (leftValue + immediate) & 0xfffffffe;
                writeRegister(destinationRegister, this.programCounter);
                this.programCounter = jumpTarget >>> 0;
                return;
            }
            case 0x0f:
                return;
            case 0x73: {
                if (instructionWord === 0x00000073) {
                    this.executeEnvironmentCall();
                    return;
                }
                if (instructionWord === 0x00100073) {
                    throw new Error(
                        `EBREAK encountered at program counter 0x${(this.programCounter - 4).toString(16)}.`,
                    );
                }
                throw new Error(
                    `Unknown system instruction 0x${instructionWord.toString(16)} at program counter 0x${(this.programCounter - 4).toString(16)}.`,
                );
            }
            default:
                throw new Error(
                    `Unknown instruction 0x${(instructionWord >>> 0).toString(16)} at program counter 0x${(this.programCounter - 4).toString(16)}.`,
                );
        }
    }
    private applyRegisterOperation(
        funct3: number,
        funct7: number,
        leftValue: number,
        rightValue: number,
    ): number {
        switch (funct3) {
            case 0:
                return funct7 === 0x20
                    ? (leftValue - rightValue) >>> 0
                    : (leftValue + rightValue) >>> 0;
            case 1:
                return leftValue << (rightValue & 31);
            case 2:
                return (leftValue | 0) < (rightValue | 0) ? 1 : 0;
            case 3:
                return leftValue < rightValue ? 1 : 0;
            case 4:
                return leftValue ^ rightValue;
            case 5:
                return funct7 === 0x20
                    ? (leftValue | 0) >> (rightValue & 31)
                    : leftValue >>> (rightValue & 31);
            case 6:
                return leftValue | rightValue;
            default:
                return leftValue & rightValue;
        }
    }
    private applyImmediateOperation(funct3: number, leftValue: number, immediate: number): number {
        switch (funct3) {
            case 0:
                return (leftValue + immediate) >>> 0;
            case 2:
                return (leftValue | 0) < immediate ? 1 : 0;
            case 3:
                return leftValue < immediate >>> 0 ? 1 : 0;
            case 4:
                return leftValue ^ immediate;
            case 6:
                return leftValue | immediate;
            default:
                return leftValue & immediate;
        }
    }
    private loadValue(funct3: number, address: number): number {
        switch (funct3) {
            case 0:
                return signExtend(this.readByte(address), 8) >>> 0;
            case 1:
                return signExtend(this.readHalf(address), 16) >>> 0;
            case 2:
                return this.readWord(address);
            case 4:
                return this.readByte(address);
            default:
                return this.readHalf(address);
        }
    }
    private storeValue(funct3: number, address: number, value: number): void {
        if (funct3 === 0) {
            this.writeByte(address, value);
            return;
        }
        if (funct3 === 1) {
            this.writeHalf(address, value);
            return;
        }
        this.writeWord(address, value);
    }
    private branchIsTaken(funct3: number, leftValue: number, rightValue: number): boolean {
        switch (funct3) {
            case 0:
                return leftValue === rightValue;
            case 1:
                return leftValue !== rightValue;
            case 4:
                return (leftValue | 0) < (rightValue | 0);
            case 5:
                return (leftValue | 0) >= (rightValue | 0);
            case 6:
                return leftValue < rightValue;
            default:
                return leftValue >= rightValue;
        }
    }
    private executeEnvironmentCall(): void {
        const serviceNumber = this.registerValue(17);
        const argumentOne = this.registerValue(11);
        const argumentTwo = this.registerValue(12);
        switch (serviceNumber) {
            case 1:
                this.io.writeText(String(argumentOne | 0));
                return;
            case 4:
                this.io.writeText(this.readStringAt(argumentOne, argumentTwo));
                return;
            case 5: {
                const parsedValue = Number.parseInt(this.io.readLine().trim(), 10);
                if (Number.isNaN(parsedValue)) {
                    throw new Error(
                        "The RISC-V program requested an integer but the input was not one.",
                    );
                }
                this.registers[10] = parsedValue >>> 0;
                return;
            }
            case 8: {
                const enteredLine = this.io.readLine();
                const encodedLine = this.textEncoder.encode(enteredLine);
                const writableLength = Math.max(0, Math.min(encodedLine.length, argumentTwo - 1));
                for (let byteIndex = 0; byteIndex < writableLength; byteIndex++) {
                    this.writeByte(argumentOne + byteIndex, encodedLine[byteIndex] as number);
                }
                this.writeByte(argumentOne + writableLength, 0);
                this.registers[10] = writableLength;
                return;
            }
            case 10:
                this.exitCode = this.registerValue(10) & 0xff;
                this.exitRequested = true;
                return;
            case 11:
                this.io.writeText(String.fromCharCode(argumentOne & 0xff));
                return;
            case 13: {
                const requestedPath = this.readStringAt(argumentOne, 4096);
                const fileBytes = this.io.readFile(requestedPath);
                if (fileBytes === undefined) {
                    this.registers[10] = 0xffffffff;
                    return;
                }
                const fileDescriptor = this.nextFileDescriptor;
                this.nextFileDescriptor += 1;
                this.openFiles.set(fileDescriptor, { bytes: fileBytes, offset: 0 });
                this.registers[10] = fileDescriptor;
                return;
            }
            case 14: {
                const openFile = this.openFiles.get(this.registerValue(10));
                if (!openFile) {
                    this.registers[10] = 0xffffffff;
                    return;
                }
                const readableLength = Math.max(
                    0,
                    Math.min(argumentTwo, openFile.bytes.length - openFile.offset),
                );
                for (let byteIndex = 0; byteIndex < readableLength; byteIndex++) {
                    this.writeByte(
                        argumentOne + byteIndex,
                        openFile.bytes[openFile.offset + byteIndex] as number,
                    );
                }
                openFile.offset += readableLength;
                this.registers[10] = readableLength;
                return;
            }
            case 15:
                this.openFiles.delete(this.registerValue(10));
                this.registers[10] = 0;
                return;
            case 20:
                this.io.writeText(this.readStringAt(argumentOne, 4096));
                return;
            default:
                throw new Error(
                    `Unsupported RISC-V syscall ${serviceNumber}. Supported services: 1, 4, 5, 8, 10, 11, 13, 14, 15, 20.`,
                );
        }
    }
    private readStringAt(address: number, maximumLength: number): string {
        const collectedBytes: Array<number> = [];
        for (let byteIndex = 0; byteIndex < maximumLength; byteIndex++) {
            const byteValue = this.readByte(address + byteIndex);
            if (byteValue === 0) {
                break;
            }
            collectedBytes.push(byteValue);
        }
        return this.textDecoder.decode(new Uint8Array(collectedBytes));
    }
    private registerValue(registerIndex: number): number {
        return registerIndex === 0 ? 0 : (this.registers[registerIndex] as number);
    }
    private readByte(address: number): number {
        return this.memory.get(address >>> 0) ?? 0;
    }
    private writeByte(address: number, value: number): void {
        this.memory.set(address >>> 0, value & 0xff);
    }
    private readHalf(address: number): number {
        return (this.readByte(address) | (this.readByte(address + 1) << 8)) >>> 0;
    }
    private writeHalf(address: number, value: number): void {
        this.writeByte(address, value);
        this.writeByte(address + 1, value >> 8);
    }
    private readWord(address: number): number {
        return (
            (this.readByte(address) |
                (this.readByte(address + 1) << 8) |
                (this.readByte(address + 2) << 16) |
                (this.readByte(address + 3) << 24)) >>>
            0
        );
    }
    private writeWord(address: number, value: number): void {
        this.writeByte(address, value);
        this.writeByte(address + 1, value >> 8);
        this.writeByte(address + 2, value >> 16);
        this.writeByte(address + 3, value >> 24);
    }
}
export { RiscvMachine, DEFAULT_STEP_LIMIT, STACK_TOP_ADDRESS };
export type { RiscvProgramIo, RiscvMachineOptions };
