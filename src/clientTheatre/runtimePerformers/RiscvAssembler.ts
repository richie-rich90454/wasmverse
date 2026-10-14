const RISCV_TEXT_BASE_ADDRESS = 0x00400000;
const RISCV_DATA_BASE_ADDRESS = 0x10010000;
const MAXIMUM_INCLUDE_DEPTH = 16;
interface RiscvProgramImage {
    textBytes: Uint8Array;
    dataBytes: Uint8Array;
    textBaseAddress: number;
    dataBaseAddress: number;
    entryAddress: number;
}
const REGISTER_NUMBERS: Readonly<Record<string, number>> = {
    zero: 0,
    x0: 0,
    ra: 1,
    x1: 1,
    sp: 2,
    x2: 2,
    gp: 3,
    x3: 3,
    tp: 4,
    x4: 4,
    t0: 5,
    x5: 5,
    t1: 6,
    x6: 6,
    t2: 7,
    x7: 7,
    s0: 8,
    fp: 8,
    x8: 8,
    s1: 9,
    x9: 9,
    a0: 10,
    x10: 10,
    a1: 11,
    x11: 11,
    a2: 12,
    x12: 12,
    a3: 13,
    x13: 13,
    a4: 14,
    x14: 14,
    a5: 15,
    x15: 15,
    a6: 16,
    x16: 16,
    a7: 17,
    x17: 17,
    s2: 18,
    x18: 18,
    s3: 19,
    x19: 19,
    s4: 20,
    x20: 20,
    s5: 21,
    x21: 21,
    s6: 22,
    x22: 22,
    s7: 23,
    x23: 23,
    s8: 24,
    x24: 24,
    s9: 25,
    x25: 25,
    s10: 26,
    x26: 26,
    s11: 27,
    x27: 27,
    t3: 28,
    x28: 28,
    t4: 29,
    x29: 29,
    t5: 30,
    x30: 30,
    t6: 31,
    x31: 31,
};
interface RiscvStatement {
    fileName: string;
    lineNumber: number;
    section: "text" | "data";
    labels: ReadonlyArray<string>;
    opcode: string;
    operands: ReadonlyArray<string>;
}
interface RiscvLabelPlacement {
    address: number;
    section: "text" | "data";
}
const R_TYPE_FUNCTIONS: Readonly<Record<string, { funct3: number; funct7: number }>> = {
    add: { funct3: 0, funct7: 0 },
    sub: { funct3: 0, funct7: 0x20 },
    sll: { funct3: 1, funct7: 0 },
    slt: { funct3: 2, funct7: 0 },
    sltu: { funct3: 3, funct7: 0 },
    xor: { funct3: 4, funct7: 0 },
    srl: { funct3: 5, funct7: 0 },
    sra: { funct3: 5, funct7: 0x20 },
    or: { funct3: 6, funct7: 0 },
    and: { funct3: 7, funct7: 0 },
};
const I_TYPE_FUNCTIONS: Readonly<Record<string, number>> = {
    addi: 0,
    slti: 2,
    sltiu: 3,
    xori: 4,
    ori: 6,
    andi: 7,
};
const SHIFT_IMMEDIATE_FUNCTIONS: Readonly<Record<string, { funct3: number; funct7: number }>> = {
    slli: { funct3: 1, funct7: 0 },
    srli: { funct3: 5, funct7: 0 },
    srai: { funct3: 5, funct7: 0x20 },
};
const LOAD_FUNCTIONS: Readonly<Record<string, number>> = {
    lb: 0,
    lh: 1,
    lw: 2,
    lbu: 4,
    lhu: 5,
};
const STORE_FUNCTIONS: Readonly<Record<string, number>> = {
    sb: 0,
    sh: 1,
    sw: 2,
};
const BRANCH_FUNCTIONS: Readonly<Record<string, number>> = {
    beq: 0,
    bne: 1,
    blt: 4,
    bge: 5,
    bltu: 6,
    bgeu: 7,
};
const BRANCH_ZERO_PSEUDOS: Readonly<Record<string, { mnemonic: string; swapped: boolean }>> = {
    beqz: { mnemonic: "beq", swapped: false },
    bnez: { mnemonic: "bne", swapped: false },
    bltz: { mnemonic: "blt", swapped: false },
    bgez: { mnemonic: "bge", swapped: false },
    blez: { mnemonic: "bge", swapped: true },
    bgtz: { mnemonic: "blt", swapped: true },
};
function requireOperandText(statement: RiscvStatement, text: string): string {
    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
        throw new Error(
            `${statement.fileName}:${statement.lineNumber}: ${statement.opcode} is missing an operand.`,
        );
    }
    return trimmedText;
}
function splitStatementFields(text: string): Array<string> {
    const fields: Array<string> = [];
    let currentField = "";
    let insideString = false;
    let insideCharacter = false;
    let escaped = false;
    for (const character of text) {
        if (escaped) {
            currentField += character;
            escaped = false;
            continue;
        }
        if ((insideString || insideCharacter) && character === "\\") {
            currentField += character;
            escaped = true;
            continue;
        }
        if (character === '"' && !insideCharacter) {
            insideString = !insideString;
            currentField += character;
            continue;
        }
        if (character === "'" && !insideString) {
            insideCharacter = !insideCharacter;
            currentField += character;
            continue;
        }
        const isSeparator =
            !insideString &&
            !insideCharacter &&
            (character === "," || character === " " || character === "\t");
        if (isSeparator) {
            if (currentField.length > 0) {
                fields.push(currentField);
                currentField = "";
            }
            continue;
        }
        currentField += character;
    }
    if (currentField.length > 0) {
        fields.push(currentField);
    }
    return fields;
}
function stripStatementComment(text: string): string {
    let insideString = false;
    let insideCharacter = false;
    let escaped = false;
    for (let index = 0; index < text.length; index++) {
        const character = text[index] as string;
        if (escaped) {
            escaped = false;
            continue;
        }
        if ((insideString || insideCharacter) && character === "\\") {
            escaped = true;
            continue;
        }
        if (character === '"' && !insideCharacter) {
            insideString = !insideString;
            continue;
        }
        if (character === "'" && !insideString) {
            insideCharacter = !insideCharacter;
            continue;
        }
        if (character === "#" && !insideString && !insideCharacter) {
            return text.slice(0, index);
        }
    }
    return text;
}
function decodeStringLiteral(statement: RiscvStatement, literal: string): Uint8Array {
    if (literal.length < 2 || !literal.startsWith('"') || !literal.endsWith('"')) {
        throw new Error(
            `${statement.fileName}:${statement.lineNumber}: ${statement.opcode} expects a quoted string, found '${literal}'.`,
        );
    }
    const innerText = literal.slice(1, -1);
    const bytes: Array<number> = [];
    for (let index = 0; index < innerText.length; index++) {
        const character = innerText[index] as string;
        if (character !== "\\") {
            bytes.push(...new TextEncoder().encode(character));
            continue;
        }
        index += 1;
        const escapeCharacter = innerText[index];
        if (escapeCharacter === undefined) {
            throw new Error(
                `${statement.fileName}:${statement.lineNumber}: string literal ends with a dangling backslash.`,
            );
        }
        const simpleEscapes: Readonly<Record<string, number>> = {
            n: 10,
            t: 9,
            r: 13,
            "0": 0,
            "\\": 92,
            '"': 34,
            "'": 39,
        };
        const simpleEscape = simpleEscapes[escapeCharacter];
        if (simpleEscape !== undefined) {
            bytes.push(simpleEscape);
            continue;
        }
        if (escapeCharacter === "x") {
            const hexDigits = innerText.slice(index + 1, index + 3);
            if (!/^[0-9a-fA-F]{2}$/.test(hexDigits)) {
                throw new Error(
                    `${statement.fileName}:${statement.lineNumber}: '\\x' must be followed by two hex digits.`,
                );
            }
            bytes.push(Number.parseInt(hexDigits, 16));
            index += 2;
            continue;
        }
        throw new Error(
            `${statement.fileName}:${statement.lineNumber}: unsupported escape sequence '\\${escapeCharacter}'.`,
        );
    }
    return new Uint8Array(bytes);
}
class RiscvAssembler {
    private readonly includeResolver: (relativePath: string) => string | undefined;
    constructor(includeResolver: (relativePath: string) => string | undefined = () => undefined) {
        this.includeResolver = includeResolver;
    }
    assemble(sourceText: string, sourceName: string = "main.s"): RiscvProgramImage {
        const statements = this.collectStatements(sourceText, sourceName, 0);
        const labelPlacements = new Map<string, RiscvLabelPlacement>();
        const layout = this.measureStatements(statements, labelPlacements);
        return this.emitStatements(statements, layout, labelPlacements);
    }
    private collectStatements(
        sourceText: string,
        sourceName: string,
        includeDepth: number,
    ): Array<RiscvStatement> {
        if (includeDepth > MAXIMUM_INCLUDE_DEPTH) {
            throw new Error(`${sourceName}: include depth exceeds ${MAXIMUM_INCLUDE_DEPTH}.`);
        }
        const collectedStatements: Array<RiscvStatement> = [];
        const sourceLines = sourceText.split(/\r?\n/);
        for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
            let lineText = stripStatementComment(sourceLines[lineIndex] as string).trim();
            if (lineText.length === 0) {
                continue;
            }
            const labels: Array<string> = [];
            for (;;) {
                const labelMatch = /^([A-Za-z_.$][A-Za-z0-9_.$]*):/.exec(lineText);
                if (!labelMatch) {
                    break;
                }
                labels.push(labelMatch[1] as string);
                lineText = lineText.slice(labelMatch[0].length).trim();
                if (lineText.length === 0) {
                    break;
                }
            }
            if (lineText.length === 0) {
                if (labels.length > 0) {
                    collectedStatements.push({
                        fileName: sourceName,
                        lineNumber: lineIndex + 1,
                        section: "text",
                        labels,
                        opcode: "",
                        operands: [],
                    });
                }
                continue;
            }
            const fields = splitStatementFields(lineText);
            const opcode = (fields[0] as string).toLowerCase();
            if (opcode === ".include") {
                const includePath = requireOperandText(
                    {
                        fileName: sourceName,
                        lineNumber: lineIndex + 1,
                        section: "text",
                        labels: [],
                        opcode,
                        operands: fields.slice(1),
                    },
                    fields[1] ?? "",
                );
                const resolvedPath = includePath.replace(/^"|"$/g, "");
                const includedText = this.includeResolver(resolvedPath);
                if (includedText === undefined) {
                    throw new Error(
                        `${sourceName}:${lineIndex + 1}: cannot find included file '${resolvedPath}'.`,
                    );
                }
                collectedStatements.push(
                    ...this.collectStatements(includedText, resolvedPath, includeDepth + 1),
                );
                continue;
            }
            collectedStatements.push({
                fileName: sourceName,
                lineNumber: lineIndex + 1,
                section: "text",
                labels,
                opcode,
                operands: fields.slice(1),
            });
        }
        let activeSection: "text" | "data" = "text";
        for (const statement of collectedStatements) {
            if (statement.opcode === ".data" || statement.opcode === ".section") {
                const requestedSection =
                    statement.opcode === ".data"
                        ? ".data"
                        : (statement.operands[0] ?? "").toLowerCase();
                if (requestedSection === ".data" || requestedSection === ".rodata") {
                    activeSection = "data";
                } else if (requestedSection === ".text") {
                    activeSection = "text";
                } else if (statement.opcode === ".section") {
                    throw new Error(
                        `${statement.fileName}:${statement.lineNumber}: unsupported section '${statement.operands[0] ?? ""}'.`,
                    );
                }
            }
            if (statement.opcode === ".text") {
                activeSection = "text";
            }
            (statement as { section: "text" | "data" }).section = activeSection;
        }
        return collectedStatements;
    }
    private measureStatements(
        statements: ReadonlyArray<RiscvStatement>,
        labelPlacements: Map<string, RiscvLabelPlacement>,
    ): { textLength: number; dataLength: number } {
        let textLength = 0;
        let dataLength = 0;
        for (const statement of statements) {
            for (const label of statement.labels) {
                labelPlacements.set(label, {
                    address:
                        statement.section === "text"
                            ? RISCV_TEXT_BASE_ADDRESS + textLength
                            : RISCV_DATA_BASE_ADDRESS + dataLength,
                    section: statement.section,
                });
            }
            if (statement.opcode.startsWith(".")) {
                dataLength = this.measureDataDirective(statement, dataLength);
                continue;
            }
            if (statement.opcode.length === 0) {
                continue;
            }
            textLength += this.countInstructionWords(statement) * 4;
        }
        return { textLength, dataLength };
    }
    private measureDataDirective(statement: RiscvStatement, dataLength: number): number {
        const { opcode, operands } = statement;
        switch (opcode) {
            case ".word":
            case ".half":
            case ".byte": {
                if (operands.length === 0) {
                    throw new Error(
                        `${statement.fileName}:${statement.lineNumber}: ${opcode} needs at least one value.`,
                    );
                }
                const elementSize = opcode === ".word" ? 4 : opcode === ".half" ? 2 : 1;
                return dataLength + operands.length * elementSize;
            }
            case ".asciz":
            case ".string":
                return dataLength + decodeStringLiteral(statement, operands[0] ?? "").length + 1;
            case ".ascii":
                return dataLength + decodeStringLiteral(statement, operands[0] ?? "").length;
            case ".space": {
                const byteCount = this.numericValue(statement, operands[0] ?? "");
                if (byteCount < 0) {
                    throw new Error(
                        `${statement.fileName}:${statement.lineNumber}: .space needs a non-negative size.`,
                    );
                }
                return dataLength + byteCount;
            }
            case ".align": {
                const exponent = this.numericValue(statement, operands[0] ?? "");
                const alignment = 2 ** exponent;
                return Math.ceil(dataLength / alignment) * alignment;
            }
            case ".data":
            case ".text":
            case ".section":
            case ".globl":
            case ".global":
                return dataLength;
            default:
                throw new Error(
                    `${statement.fileName}:${statement.lineNumber}: unknown directive '${opcode}'.`,
                );
        }
    }
    private countInstructionWords(statement: RiscvStatement): number {
        switch (statement.opcode) {
            case "li": {
                const value = this.numericValue(statement, statement.operands[1] ?? "");
                return value >= -2048 && value <= 2047 ? 1 : 2;
            }
            case "la":
            case "call":
                return 2;
            default:
                return 1;
        }
    }
    private emitStatements(
        statements: ReadonlyArray<RiscvStatement>,
        layout: { textLength: number; dataLength: number },
        labelPlacements: Map<string, RiscvLabelPlacement>,
    ): RiscvProgramImage {
        const textBytes = new Uint8Array(layout.textLength);
        const dataBytes = new Uint8Array(layout.dataLength);
        let textOffset = 0;
        let dataOffset = 0;
        for (const statement of statements) {
            if (!statement.opcode.startsWith(".")) {
                if (statement.opcode.length === 0) {
                    continue;
                }
                const instructionWords = this.encodeInstruction(
                    statement,
                    labelPlacements,
                    textOffset,
                );
                for (const word of instructionWords) {
                    writeWordLittleEndian(textBytes, textOffset, word);
                    textOffset += 4;
                }
                continue;
            }
            dataOffset = this.emitDataDirective(statement, dataBytes, dataOffset, labelPlacements);
        }
        const entryLabel = labelPlacements.get("_start") ?? labelPlacements.get("main");
        const entryAddress =
            entryLabel && entryLabel.section === "text"
                ? entryLabel.address
                : RISCV_TEXT_BASE_ADDRESS;
        return {
            textBytes,
            dataBytes,
            textBaseAddress: RISCV_TEXT_BASE_ADDRESS,
            dataBaseAddress: RISCV_DATA_BASE_ADDRESS,
            entryAddress,
        };
    }
    private emitDataDirective(
        statement: RiscvStatement,
        dataBytes: Uint8Array,
        dataOffset: number,
        labelPlacements: Map<string, RiscvLabelPlacement>,
    ): number {
        const { opcode, operands } = statement;
        switch (opcode) {
            case ".word":
            case ".half":
            case ".byte": {
                const elementSize = opcode === ".word" ? 4 : opcode === ".half" ? 2 : 1;
                for (const operand of operands) {
                    const value = this.dataValue(statement, operand, labelPlacements);
                    for (let byteIndex = 0; byteIndex < elementSize; byteIndex++) {
                        dataBytes[dataOffset + byteIndex] = (value >> (byteIndex * 8)) & 0xff;
                    }
                    dataOffset += elementSize;
                }
                return dataOffset;
            }
            case ".asciz":
            case ".string": {
                const encoded = decodeStringLiteral(statement, operands[0] ?? "");
                dataBytes.set(encoded, dataOffset);
                dataBytes[dataOffset + encoded.length] = 0;
                return dataOffset + encoded.length + 1;
            }
            case ".ascii": {
                const encoded = decodeStringLiteral(statement, operands[0] ?? "");
                dataBytes.set(encoded, dataOffset);
                return dataOffset + encoded.length;
            }
            case ".space":
                return dataOffset + this.numericValue(statement, operands[0] ?? "");
            case ".align": {
                const alignment = 2 ** this.numericValue(statement, operands[0] ?? "");
                return Math.ceil(dataOffset / alignment) * alignment;
            }
            case ".data":
            case ".text":
            case ".section":
            case ".globl":
            case ".global":
                return dataOffset;
            default:
                throw new Error(
                    `${statement.fileName}:${statement.lineNumber}: unknown directive '${opcode}'.`,
                );
        }
    }
    private dataValue(
        statement: RiscvStatement,
        operandText: string,
        labelPlacements: Map<string, RiscvLabelPlacement>,
    ): number {
        const placement = labelPlacements.get(operandText);
        if (placement) {
            return placement.address;
        }
        return this.numericValue(statement, operandText);
    }
    private encodeInstruction(
        statement: RiscvStatement,
        labelPlacements: Map<string, RiscvLabelPlacement>,
        textOffset: number,
    ): Array<number> {
        const { opcode, operands } = statement;
        const programCounter = RISCV_TEXT_BASE_ADDRESS + textOffset;
        const registerOf = (operandText: string | undefined): number =>
            this.registerValue(statement, requireOperandText(statement, operandText ?? ""));
        const immediateOf = (
            operandText: string | undefined,
            minimum: number,
            maximum: number,
        ): number => {
            const rawText = requireOperandText(statement, operandText ?? "");
            const value = this.numericValue(statement, rawText);
            if (value < minimum || value > maximum) {
                throw new Error(
                    `${statement.fileName}:${statement.lineNumber}: immediate ${value} is outside the allowed range ${minimum}..${maximum}.`,
                );
            }
            return value;
        };
        const targetAddressOf = (operandText: string | undefined): number => {
            const rawText = requireOperandText(statement, operandText ?? "");
            const placement = labelPlacements.get(rawText);
            if (!placement) {
                const numericTarget = this.tryNumericValue(rawText);
                if (numericTarget === undefined) {
                    throw new Error(
                        `${statement.fileName}:${statement.lineNumber}: unknown label '${rawText}'.`,
                    );
                }
                return numericTarget;
            }
            return placement.address;
        };
        const branchWord = (
            mnemonic: string,
            leftRegister: number,
            rightRegister: number,
            targetOperand: string | undefined,
        ): number => {
            const offset = targetAddressOf(targetOperand) - programCounter;
            if (offset % 2 !== 0 || offset < -4096 || offset > 4094) {
                throw new Error(
                    `${statement.fileName}:${statement.lineNumber}: branch target is out of the +/-4 KiB range.`,
                );
            }
            return encodeBranchWord(
                BRANCH_FUNCTIONS[mnemonic] as number,
                leftRegister,
                rightRegister,
                offset,
            );
        };
        if (opcode in R_TYPE_FUNCTIONS) {
            const functions = R_TYPE_FUNCTIONS[opcode] as { funct3: number; funct7: number };
            return [
                encodeRegisterWord(
                    functions.funct7,
                    registerOf(operands[2]),
                    registerOf(operands[1]),
                    registerOf(operands[0]),
                    functions.funct3,
                ),
            ];
        }
        if (opcode in I_TYPE_FUNCTIONS) {
            return [
                encodeImmediateWord(
                    0x13,
                    I_TYPE_FUNCTIONS[opcode] as number,
                    registerOf(operands[0]),
                    registerOf(operands[1]),
                    immediateOf(operands[2], -2048, 2047),
                ),
            ];
        }
        if (opcode in SHIFT_IMMEDIATE_FUNCTIONS) {
            const functions = SHIFT_IMMEDIATE_FUNCTIONS[opcode] as {
                funct3: number;
                funct7: number;
            };
            const shiftAmount = immediateOf(operands[2], 0, 31);
            return [
                encodeImmediateWord(
                    0x13,
                    functions.funct3,
                    registerOf(operands[0]),
                    registerOf(operands[1]),
                    (functions.funct7 << 5) | shiftAmount,
                ),
            ];
        }
        if (opcode in LOAD_FUNCTIONS) {
            const { offset, baseRegister } = this.memoryOperand(statement, operands[1]);
            if (offset < -2048 || offset > 2047) {
                throw new Error(
                    `${statement.fileName}:${statement.lineNumber}: load offset ${offset} is outside the allowed range -2048..2047.`,
                );
            }
            return [
                encodeImmediateWord(
                    0x03,
                    LOAD_FUNCTIONS[opcode] as number,
                    registerOf(operands[0]),
                    baseRegister,
                    offset,
                ),
            ];
        }
        if (opcode in STORE_FUNCTIONS) {
            const { offset, baseRegister } = this.memoryOperand(statement, operands[1]);
            if (offset < -2048 || offset > 2047) {
                throw new Error(
                    `${statement.fileName}:${statement.lineNumber}: store offset ${offset} is outside the allowed range -2048..2047.`,
                );
            }
            return [
                encodeStoreWord(
                    STORE_FUNCTIONS[opcode] as number,
                    baseRegister,
                    registerOf(operands[0]),
                    offset,
                ),
            ];
        }
        if (opcode === "lui" || opcode === "auipc") {
            const immediate = immediateOf(operands[1], -(2 ** 19), 2 ** 19 - 1) & 0xfffff;
            return [
                encodeUpperWord(opcode === "lui" ? 0x37 : 0x17, registerOf(operands[0]), immediate),
            ];
        }
        if (opcode === "jal") {
            if (operands.length === 1) {
                const offset = targetAddressOf(operands[0]) - programCounter;
                if (offset % 2 !== 0 || offset < -(2 ** 20) || offset > 2 ** 20 - 2) {
                    throw new Error(
                        `${statement.fileName}:${statement.lineNumber}: jump target is out of the +/-1 MiB range.`,
                    );
                }
                return [encodeJumpWord(1, offset)];
            }
            const offset = targetAddressOf(operands[1]) - programCounter;
            if (offset % 2 !== 0 || offset < -(2 ** 20) || offset > 2 ** 20 - 2) {
                throw new Error(
                    `${statement.fileName}:${statement.lineNumber}: jump target is out of the +/-1 MiB range.`,
                );
            }
            return [encodeJumpWord(registerOf(operands[0]), offset)];
        }
        if (opcode === "jalr") {
            if (operands.length === 2 && operands[1]?.includes("(")) {
                const { offset, baseRegister } = this.memoryOperand(statement, operands[1]);
                return [
                    encodeImmediateWord(0x67, 0, registerOf(operands[0]), baseRegister, offset),
                ];
            }
            const immediate = operands.length >= 3 ? immediateOf(operands[2], -2048, 2047) : 0;
            return [
                encodeImmediateWord(
                    0x67,
                    0,
                    registerOf(operands[0]),
                    registerOf(operands[1]),
                    immediate,
                ),
            ];
        }
        if (opcode in BRANCH_FUNCTIONS) {
            return [
                branchWord(opcode, registerOf(operands[0]), registerOf(operands[1]), operands[2]),
            ];
        }
        if (opcode in BRANCH_ZERO_PSEUDOS) {
            const pseudo = BRANCH_ZERO_PSEUDOS[opcode] as { mnemonic: string; swapped: boolean };
            const register = registerOf(operands[0]);
            return [
                pseudo.swapped
                    ? branchWord(pseudo.mnemonic, 0, register, operands[1])
                    : branchWord(pseudo.mnemonic, register, 0, operands[1]),
            ];
        }
        if (opcode === "bgt" || opcode === "ble") {
            const mnemonic = opcode === "bgt" ? "blt" : "bge";
            return [
                branchWord(mnemonic, registerOf(operands[1]), registerOf(operands[0]), operands[2]),
            ];
        }
        switch (opcode) {
            case "nop":
                return [encodeImmediateWord(0x13, 0, 0, 0, 0)];
            case "li": {
                const value = immediateOf(operands[1], -(2 ** 31), 2 ** 31 - 1);
                const targetRegister = registerOf(operands[0]);
                const upper = (value + 0x800) >> 12;
                if (upper === 0) {
                    return [encodeImmediateWord(0x13, 0, targetRegister, 0, value)];
                }
                const lower = value - (upper << 12);
                return [
                    encodeUpperWord(0x37, targetRegister, upper & 0xfffff),
                    encodeImmediateWord(0x13, 0, targetRegister, targetRegister, lower),
                ];
            }
            case "la":
            case "call": {
                const targetAddress = targetAddressOf(operands[1]);
                const delta = targetAddress - programCounter;
                const upper = (((delta + 0x800) >> 12) & 0xfffff) >>> 0;
                const lower = delta - (upper << 12);
                const linkRegister = opcode === "call" ? 1 : registerOf(operands[0]);
                return [
                    encodeUpperWord(0x17, linkRegister, upper),
                    encodeImmediateWord(0x13, 0, linkRegister, linkRegister, lower),
                ];
            }
            case "mv":
                return [
                    encodeImmediateWord(
                        0x13,
                        0,
                        registerOf(operands[0]),
                        registerOf(operands[1]),
                        0,
                    ),
                ];
            case "not":
                return [
                    encodeImmediateWord(
                        0x13,
                        4,
                        registerOf(operands[0]),
                        registerOf(operands[1]),
                        -1,
                    ),
                ];
            case "neg":
                return [
                    encodeRegisterWord(
                        0x20,
                        registerOf(operands[1]),
                        0,
                        registerOf(operands[0]),
                        0,
                    ),
                ];
            case "seqz":
                return [
                    encodeImmediateWord(
                        0x13,
                        3,
                        registerOf(operands[0]),
                        registerOf(operands[1]),
                        1,
                    ),
                ];
            case "snez":
                return [
                    encodeRegisterWord(0, registerOf(operands[1]), 0, registerOf(operands[0]), 3),
                ];
            case "j":
            case "jump": {
                const offset = targetAddressOf(operands[0]) - programCounter;
                if (offset % 2 !== 0 || offset < -(2 ** 20) || offset > 2 ** 20 - 2) {
                    throw new Error(
                        `${statement.fileName}:${statement.lineNumber}: jump target is out of the +/-1 MiB range.`,
                    );
                }
                return [encodeJumpWord(0, offset)];
            }
            case "jr":
                return [encodeImmediateWord(0x67, 0, 0, registerOf(operands[0]), 0)];
            case "ret":
                return [encodeImmediateWord(0x67, 0, 0, 1, 0)];
            case "ecall":
            case "syscall":
                return [0x00000073];
            case "ebreak":
                return [0x00100073];
            case "fence":
                return [0x0ff0000f];
            default:
                throw new Error(
                    `${statement.fileName}:${statement.lineNumber}: unknown instruction '${opcode}'.`,
                );
        }
    }
    private memoryOperand(
        statement: RiscvStatement,
        operandText: string | undefined,
    ): { offset: number; baseRegister: number } {
        const rawText = requireOperandText(statement, operandText ?? "");
        const memoryMatch = /^([^()]*?)\(\s*([A-Za-z0-9_]+)\s*\)$/.exec(rawText);
        if (!memoryMatch) {
            throw new Error(
                `${statement.fileName}:${statement.lineNumber}: '${rawText}' is not a memory operand like 8(sp).`,
            );
        }
        const offsetText = (memoryMatch[1] as string).trim();
        const offset = offsetText.length === 0 ? 0 : this.numericValue(statement, offsetText);
        return {
            offset,
            baseRegister: this.registerValue(statement, memoryMatch[2] as string),
        };
    }
    private registerValue(statement: RiscvStatement, registerText: string): number {
        const namedRegister = REGISTER_NUMBERS[registerText.toLowerCase()];
        if (namedRegister !== undefined) {
            return namedRegister;
        }
        const numericRegister = this.tryNumericValue(registerText);
        if (numericRegister !== undefined && numericRegister >= 0 && numericRegister <= 31) {
            return numericRegister;
        }
        throw new Error(
            `${statement.fileName}:${statement.lineNumber}: unknown register '${registerText}'.`,
        );
    }
    private numericValue(statement: RiscvStatement, operandText: string): number {
        const value = this.tryNumericValue(operandText);
        if (value === undefined) {
            throw new Error(
                `${statement.fileName}:${statement.lineNumber}: '${operandText}' is not a number or character literal.`,
            );
        }
        return value;
    }
    private tryNumericValue(operandText: string): number | undefined {
        const trimmedText = operandText.trim();
        if (/^'.*'$/.test(trimmedText) && trimmedText.length >= 3) {
            const decoded = decodeStringLiteral(
                {
                    fileName: "",
                    lineNumber: 0,
                    section: "text",
                    labels: [],
                    opcode: "",
                    operands: [],
                },
                `"${trimmedText.slice(1, -1).replace(/"/g, '\\"')}"`,
            );
            if (decoded.length === 0) {
                return 0;
            }
            let value = 0;
            for (const byte of decoded) {
                value = (value << 8) | byte;
            }
            return value | 0;
        }
        if (/^-?0[xX][0-9a-fA-F]+$/.test(trimmedText)) {
            const negative = trimmedText.startsWith("-");
            const magnitude = Number.parseInt(negative ? trimmedText.slice(1) : trimmedText, 16);
            return negative ? -magnitude : magnitude;
        }
        if (/^-?0[bB][01]+$/.test(trimmedText)) {
            const negative = trimmedText.startsWith("-");
            const magnitude = Number.parseInt(negative ? trimmedText.slice(1) : trimmedText, 2);
            return negative ? -magnitude : magnitude;
        }
        if (/^-?\d+$/.test(trimmedText)) {
            return Number.parseInt(trimmedText, 10);
        }
        return undefined;
    }
}
function encodeRegisterWord(
    funct7: number,
    rs2: number,
    rs1: number,
    rd: number,
    funct3: number,
): number {
    return ((funct7 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | 0x33) >>> 0;
}
function encodeImmediateWord(
    opcode: number,
    funct3: number,
    rd: number,
    rs1: number,
    imm: number,
): number {
    return (((imm & 0xfff) << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode) >>> 0;
}
function encodeStoreWord(funct3: number, rs1: number, rs2: number, imm: number): number {
    return (
        (((imm & 0xfe0) << 20) |
            (rs2 << 20) |
            (rs1 << 15) |
            (funct3 << 12) |
            ((imm & 0x1f) << 7) |
            0x23) >>>
        0
    );
}
function encodeBranchWord(funct3: number, rs1: number, rs2: number, imm: number): number {
    const immediate12 = (imm >> 12) & 1;
    const immediate11 = (imm >> 11) & 1;
    const immediate10To5 = (imm >> 5) & 0x3f;
    const immediate4To1 = (imm >> 1) & 0xf;
    return (
        ((immediate12 << 31) |
            (immediate10To5 << 25) |
            (rs2 << 20) |
            (rs1 << 15) |
            (funct3 << 12) |
            (immediate4To1 << 8) |
            (immediate11 << 7) |
            0x63) >>>
        0
    );
}
function encodeUpperWord(opcode: number, rd: number, imm: number): number {
    return (((imm & 0xfffff) << 12) | (rd << 7) | opcode) >>> 0;
}
function encodeJumpWord(rd: number, imm: number): number {
    const immediate20 = (imm >> 20) & 1;
    const immediate10To1 = (imm >> 1) & 0x3ff;
    const immediate11 = (imm >> 11) & 1;
    const immediate19To12 = (imm >> 12) & 0xff;
    return (
        ((immediate20 << 31) |
            (immediate10To1 << 21) |
            (immediate11 << 20) |
            (immediate19To12 << 12) |
            (rd << 7) |
            0x6f) >>>
        0
    );
}
function writeWordLittleEndian(targetBytes: Uint8Array, offset: number, word: number): void {
    targetBytes[offset] = word & 0xff;
    targetBytes[offset + 1] = (word >> 8) & 0xff;
    targetBytes[offset + 2] = (word >> 16) & 0xff;
    targetBytes[offset + 3] = (word >> 24) & 0xff;
}
export {
    RiscvAssembler,
    RISCV_DATA_BASE_ADDRESS,
    RISCV_TEXT_BASE_ADDRESS,
    REGISTER_NUMBERS,
    decodeStringLiteral,
};
export type { RiscvProgramImage, RiscvStatement };
