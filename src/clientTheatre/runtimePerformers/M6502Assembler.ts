type M6502AddressingMode =
    | "implied"
    | "accumulator"
    | "immediate"
    | "zeroPage"
    | "zeroPageX"
    | "zeroPageY"
    | "absolute"
    | "absoluteX"
    | "absoluteY"
    | "indirect"
    | "indexedIndirect"
    | "indirectIndexed"
    | "relative";
interface M6502AssemblyOptions {
    readFile?: (requestedPath: string) => string;
}
interface M6502AssemblyResult {
    bytes: Uint8Array;
    origin: number;
    labels: Readonly<Record<string, number>>;
}
interface M6502ExpressionNode {
    kind: "number" | "label" | "binary" | "low" | "high";
    value?: number;
    text?: string;
    operator?: string;
    left?: M6502ExpressionNode;
    right?: M6502ExpressionNode;
    operand?: M6502ExpressionNode;
}
interface M6502Statement {
    lineNumber: number;
    address: number;
    kind: "instruction" | "bytes" | "words";
    mnemonic?: string;
    mode?: M6502AddressingMode;
    operand?: M6502ExpressionNode;
    size: number;
    byteItems?: ReadonlyArray<number | M6502ExpressionNode>;
    wordOperands?: ReadonlyArray<M6502ExpressionNode>;
}
const OPCODES: Readonly<Record<string, Partial<Record<M6502AddressingMode, number>>>> = {
    ADC: {
        immediate: 0x69,
        zeroPage: 0x65,
        zeroPageX: 0x75,
        absolute: 0x6d,
        absoluteX: 0x7d,
        absoluteY: 0x79,
        indexedIndirect: 0x61,
        indirectIndexed: 0x71,
    },
    AND: {
        immediate: 0x29,
        zeroPage: 0x25,
        zeroPageX: 0x35,
        absolute: 0x2d,
        absoluteX: 0x3d,
        absoluteY: 0x39,
        indexedIndirect: 0x21,
        indirectIndexed: 0x31,
    },
    ASL: {
        accumulator: 0x0a,
        zeroPage: 0x06,
        zeroPageX: 0x16,
        absolute: 0x0e,
        absoluteX: 0x1e,
    },
    BCC: { relative: 0x90 },
    BCS: { relative: 0xb0 },
    BEQ: { relative: 0xf0 },
    BIT: { zeroPage: 0x24, absolute: 0x2c },
    BMI: { relative: 0x30 },
    BNE: { relative: 0xd0 },
    BPL: { relative: 0x10 },
    BRK: { implied: 0x00 },
    BVC: { relative: 0x50 },
    BVS: { relative: 0x70 },
    CLC: { implied: 0x18 },
    CLD: { implied: 0xd8 },
    CLI: { implied: 0x58 },
    CLV: { implied: 0xb8 },
    CMP: {
        immediate: 0xc9,
        zeroPage: 0xc5,
        zeroPageX: 0xd5,
        absolute: 0xcd,
        absoluteX: 0xdd,
        absoluteY: 0xd9,
        indexedIndirect: 0xc1,
        indirectIndexed: 0xd1,
    },
    CPX: { immediate: 0xe0, zeroPage: 0xe4, absolute: 0xec },
    CPY: { immediate: 0xc0, zeroPage: 0xc4, absolute: 0xcc },
    DEC: { zeroPage: 0xc6, zeroPageX: 0xd6, absolute: 0xce, absoluteX: 0xde },
    DEX: { implied: 0xca },
    DEY: { implied: 0x88 },
    EOR: {
        immediate: 0x49,
        zeroPage: 0x45,
        zeroPageX: 0x55,
        absolute: 0x4d,
        absoluteX: 0x5d,
        absoluteY: 0x59,
        indexedIndirect: 0x41,
        indirectIndexed: 0x51,
    },
    INC: { zeroPage: 0xe6, zeroPageX: 0xf6, absolute: 0xee, absoluteX: 0xfe },
    INX: { implied: 0xe8 },
    INY: { implied: 0xc8 },
    JMP: { absolute: 0x4c, indirect: 0x6c },
    JSR: { absolute: 0x20 },
    LDA: {
        immediate: 0xa9,
        zeroPage: 0xa5,
        zeroPageX: 0xb5,
        absolute: 0xad,
        absoluteX: 0xbd,
        absoluteY: 0xb9,
        indexedIndirect: 0xa1,
        indirectIndexed: 0xb1,
    },
    LDX: {
        immediate: 0xa2,
        zeroPage: 0xa6,
        zeroPageY: 0xb6,
        absolute: 0xae,
        absoluteY: 0xbe,
    },
    LDY: {
        immediate: 0xa0,
        zeroPage: 0xa4,
        zeroPageX: 0xb4,
        absolute: 0xac,
        absoluteX: 0xbc,
    },
    LSR: {
        accumulator: 0x4a,
        zeroPage: 0x46,
        zeroPageX: 0x56,
        absolute: 0x4e,
        absoluteX: 0x5e,
    },
    NOP: { implied: 0xea },
    ORA: {
        immediate: 0x09,
        zeroPage: 0x05,
        zeroPageX: 0x15,
        absolute: 0x0d,
        absoluteX: 0x1d,
        absoluteY: 0x19,
        indexedIndirect: 0x01,
        indirectIndexed: 0x11,
    },
    PHA: { implied: 0x48 },
    PHP: { implied: 0x08 },
    PLA: { implied: 0x68 },
    PLP: { implied: 0x28 },
    ROL: {
        accumulator: 0x2a,
        zeroPage: 0x26,
        zeroPageX: 0x36,
        absolute: 0x2e,
        absoluteX: 0x3e,
    },
    ROR: {
        accumulator: 0x6a,
        zeroPage: 0x66,
        zeroPageX: 0x76,
        absolute: 0x6e,
        absoluteX: 0x7e,
    },
    RTI: { implied: 0x40 },
    RTS: { implied: 0x60 },
    SBC: {
        immediate: 0xe9,
        zeroPage: 0xe5,
        zeroPageX: 0xf5,
        absolute: 0xed,
        absoluteX: 0xfd,
        absoluteY: 0xf9,
        indexedIndirect: 0xe1,
        indirectIndexed: 0xf1,
    },
    SEC: { implied: 0x38 },
    SED: { implied: 0xf8 },
    SEI: { implied: 0x78 },
    STA: {
        zeroPage: 0x85,
        zeroPageX: 0x95,
        absolute: 0x8d,
        absoluteX: 0x9d,
        absoluteY: 0x99,
        indexedIndirect: 0x81,
        indirectIndexed: 0x91,
    },
    STX: { zeroPage: 0x86, zeroPageY: 0x96, absolute: 0x8e },
    STY: { zeroPage: 0x84, zeroPageX: 0x94, absolute: 0x8c },
    TAX: { implied: 0xaa },
    TAY: { implied: 0xa8 },
    TSX: { implied: 0xba },
    TXA: { implied: 0x8a },
    TXS: { implied: 0x9a },
    TYA: { implied: 0x98 },
};
const MODE_SIZES: Readonly<Record<M6502AddressingMode, number>> = {
    implied: 1,
    accumulator: 1,
    immediate: 2,
    zeroPage: 2,
    zeroPageX: 2,
    zeroPageY: 2,
    absolute: 3,
    absoluteX: 3,
    absoluteY: 3,
    indirect: 3,
    indexedIndirect: 2,
    indirectIndexed: 2,
    relative: 2,
};
class M6502Assembler {
    assemble(sourceText: string, options: M6502AssemblyOptions = {}): M6502AssemblyResult {
        const expandedSource = this.expandIncludes(sourceText, "", options.readFile, 0);
        const labels: Map<string, number> = new Map();
        const statements = this.sizeStatements(expandedSource, labels);
        const bytes = this.emitStatements(statements, labels);
        return {
            bytes,
            origin: statements.length > 0 ? (statements[0] as M6502Statement).address : 0x0200,
            labels: Object.fromEntries(labels),
        };
    }
    private expandIncludes(
        sourceText: string,
        baseDirectory: string,
        readFile: ((requestedPath: string) => string) | undefined,
        depth: number,
    ): string {
        if (depth > 8) {
            throw new Error("Include depth exceeds 8 files.");
        }
        const outputLines: Array<string> = [];
        for (const [lineIndex, rawLine] of sourceText
            .replace(/\r\n/g, "\n")
            .split("\n")
            .entries()) {
            const lineText = stripComment(rawLine).trim();
            const includeMatch = /^\.include\s+"([^"]+)"$/i.exec(lineText);
            if (!includeMatch) {
                outputLines.push(rawLine);
                continue;
            }
            if (!readFile) {
                throw new Error(
                    `Line ${lineIndex + 1}: .include needs a file resolver in this context.`,
                );
            }
            const requestedPath = includeMatch[1] as string;
            const candidatePaths =
                baseDirectory.length > 0
                    ? [`${baseDirectory}/${requestedPath}`, requestedPath]
                    : [requestedPath];
            let includedSource: string | undefined;
            for (const candidatePath of candidatePaths) {
                try {
                    includedSource = readFile(candidatePath);
                    break;
                } catch {
                    includedSource = undefined;
                }
            }
            if (includedSource === undefined) {
                throw new Error(
                    `Line ${lineIndex + 1}: include file '${requestedPath}' not found.`,
                );
            }
            const includedBaseDirectory = requestedPath.includes("/")
                ? requestedPath.split("/").slice(0, -1).join("/")
                : baseDirectory;
            outputLines.push(
                this.expandIncludes(includedSource, includedBaseDirectory, readFile, depth + 1),
            );
        }
        return outputLines.join("\n");
    }
    private sizeStatements(sourceText: string, labels: Map<string, number>): Array<M6502Statement> {
        const statements: Array<M6502Statement> = [];
        let currentAddress = 0x0200;
        const sourceLines = sourceText.replace(/\r\n/g, "\n").split("\n");
        for (const [lineIndex, rawLine] of sourceLines.entries()) {
            const lineNumber = lineIndex + 1;
            const lineText = stripComment(rawLine).trim();
            if (lineText.length === 0) {
                continue;
            }
            let remainder = lineText;
            const labelMatch = /^([A-Za-z_][A-Za-z0-9_]*):\s*([\s\S]*)$/.exec(remainder);
            if (labelMatch) {
                const labelName = labelMatch[1] as string;
                if (labels.has(labelName)) {
                    throw new Error(`Line ${lineNumber}: duplicate label '${labelName}'.`);
                }
                labels.set(labelName, currentAddress);
                remainder = (labelMatch[2] as string).trim();
            }
            if (remainder.length === 0) {
                continue;
            }
            if (remainder.startsWith(".")) {
                const directiveMatch = /^\.(\w+)\s*([\s\S]*)$/.exec(remainder);
                if (!directiveMatch) {
                    throw new Error(`Line ${lineNumber}: unrecognized directive.`);
                }
                const directiveName = (directiveMatch[1] as string).toLowerCase();
                const directiveOperand = (directiveMatch[2] as string).trim();
                if (directiveName === "org") {
                    const targetExpression = parseM6502Expression(directiveOperand);
                    currentAddress = evaluateM6502Expression(targetExpression, labels);
                    if (currentAddress < 0 || currentAddress > 0xffff) {
                        throw new Error(`Line ${lineNumber}: .org value out of range.`);
                    }
                    continue;
                }
                if (directiveName === "res") {
                    const countExpression = parseM6502Expression(directiveOperand);
                    const reservedCount = evaluateM6502Expression(countExpression, labels);
                    if (
                        !Number.isInteger(reservedCount) ||
                        reservedCount < 0 ||
                        reservedCount > 65536
                    ) {
                        throw new Error(`Line ${lineNumber}: .res count out of range.`);
                    }
                    statements.push({
                        lineNumber,
                        address: currentAddress,
                        kind: "bytes",
                        size: reservedCount,
                        byteItems: new Array<number>(reservedCount).fill(0),
                    });
                    currentAddress += reservedCount;
                    continue;
                }
                if (directiveName === "byte") {
                    const byteItems = this.parseByteItems(directiveOperand, lineNumber);
                    statements.push({
                        lineNumber,
                        address: currentAddress,
                        kind: "bytes",
                        size: byteItems.length,
                        byteItems,
                    });
                    currentAddress += byteItems.length;
                    continue;
                }
                if (directiveName === "word") {
                    const wordOperands = splitTopLevelCommas(directiveOperand).map((itemText) =>
                        parseM6502Expression(itemText),
                    );
                    statements.push({
                        lineNumber,
                        address: currentAddress,
                        kind: "words",
                        size: wordOperands.length * 2,
                        wordOperands,
                    });
                    currentAddress += wordOperands.length * 2;
                    continue;
                }
                throw new Error(`Line ${lineNumber}: unknown directive '.${directiveName}'.`);
            }
            const instructionMatch = /^([A-Za-z]+)\s*([\s\S]*)$/.exec(remainder);
            if (!instructionMatch) {
                throw new Error(`Line ${lineNumber}: unrecognized statement '${remainder}'.`);
            }
            const mnemonic = (instructionMatch[1] as string).toUpperCase();
            const operandText = (instructionMatch[2] as string).trim();
            const modeTable = OPCODES[mnemonic];
            if (!modeTable) {
                throw new Error(`Line ${lineNumber}: unknown instruction '${mnemonic}'.`);
            }
            const resolved = this.resolveAddressingMode(
                mnemonic,
                operandText,
                modeTable,
                labels,
                lineNumber,
            );
            const size = MODE_SIZES[resolved.mode];
            statements.push({
                lineNumber,
                address: currentAddress,
                kind: "instruction",
                mnemonic,
                mode: resolved.mode,
                operand: resolved.operand,
                size,
            });
            currentAddress += size;
        }
        return statements;
    }
    private resolveAddressingMode(
        mnemonic: string,
        operandText: string,
        modeTable: Partial<Record<M6502AddressingMode, number>>,
        labels: Map<string, number>,
        lineNumber: number,
    ): { mode: M6502AddressingMode; operand?: M6502ExpressionNode } {
        if (operandText.length === 0) {
            if (modeTable.implied !== undefined) {
                return { mode: "implied" };
            }
            if (modeTable.accumulator !== undefined) {
                return { mode: "accumulator" };
            }
            throw new Error(`Line ${lineNumber}: ${mnemonic} needs an operand.`);
        }
        if ((operandText === "A" || operandText === "a") && modeTable.accumulator !== undefined) {
            return { mode: "accumulator" };
        }
        if (operandText.startsWith("#")) {
            if (modeTable.immediate === undefined) {
                throw new Error(`Line ${lineNumber}: ${mnemonic} does not support #immediate.`);
            }
            return {
                mode: "immediate",
                operand: parseM6502Expression(operandText.slice(1)),
            };
        }
        if (operandText.startsWith("(")) {
            const closingIndex = operandText.indexOf(")");
            if (closingIndex < 0) {
                throw new Error(`Line ${lineNumber}: missing closing parenthesis.`);
            }
            const innerText = operandText.slice(1, closingIndex).trim();
            const trailingText = operandText.slice(closingIndex + 1).trim();
            if (trailingText.length === 0) {
                const innerParts = splitTopLevelCommas(innerText);
                if (
                    innerParts.length === 2 &&
                    (innerParts[1] as string).trim().toUpperCase() === "X"
                ) {
                    if (modeTable.indexedIndirect === undefined) {
                        throw new Error(`Line ${lineNumber}: ${mnemonic} does not support (zp,X).`);
                    }
                    return {
                        mode: "indexedIndirect",
                        operand: parseM6502Expression(innerParts[0] as string),
                    };
                }
                if (innerParts.length !== 1) {
                    throw new Error(`Line ${lineNumber}: malformed indirect operand.`);
                }
                if (modeTable.indirect === undefined) {
                    throw new Error(`Line ${lineNumber}: ${mnemonic} does not support (addr).`);
                }
                return { mode: "indirect", operand: parseM6502Expression(innerText) };
            }
            if (trailingText.toUpperCase() === ",Y") {
                if (modeTable.indirectIndexed === undefined) {
                    throw new Error(`Line ${lineNumber}: ${mnemonic} does not support (zp),Y.`);
                }
                return { mode: "indirectIndexed", operand: parseM6502Expression(innerText) };
            }
            throw new Error(`Line ${lineNumber}: malformed indirect operand.`);
        }
        const indexedMatch = /^([\s\S]+),\s*([XYxy])$/.exec(operandText);
        if (indexedMatch) {
            const indexRegister = (indexedMatch[2] as string).toUpperCase();
            const indexExpression = parseM6502Expression((indexedMatch[1] as string).trim());
            const indexValue = tryEvaluateM6502Expression(indexExpression, labels);
            if (indexRegister === "X") {
                const wantsZeroPage =
                    indexValue !== undefined && indexValue >= 0 && indexValue <= 0xff;
                if (wantsZeroPage && modeTable.zeroPageX !== undefined) {
                    return { mode: "zeroPageX", operand: indexExpression };
                }
                if (modeTable.absoluteX !== undefined) {
                    return { mode: "absoluteX", operand: indexExpression };
                }
                throw new Error(`Line ${lineNumber}: ${mnemonic} does not support ,X indexing.`);
            }
            const wantsZeroPage = indexValue !== undefined && indexValue >= 0 && indexValue <= 0xff;
            if (wantsZeroPage && modeTable.zeroPageY !== undefined) {
                return { mode: "zeroPageY", operand: indexExpression };
            }
            if (modeTable.absoluteY !== undefined) {
                return { mode: "absoluteY", operand: indexExpression };
            }
            throw new Error(`Line ${lineNumber}: ${mnemonic} does not support ,Y indexing.`);
        }
        const plainExpression = parseM6502Expression(operandText);
        const plainValue = tryEvaluateM6502Expression(plainExpression, labels);
        if (modeTable.relative !== undefined) {
            return { mode: "relative", operand: plainExpression };
        }
        const wantsZeroPage = plainValue !== undefined && plainValue >= 0 && plainValue <= 0xff;
        if (wantsZeroPage && modeTable.zeroPage !== undefined) {
            return { mode: "zeroPage", operand: plainExpression };
        }
        if (modeTable.absolute !== undefined) {
            return { mode: "absolute", operand: plainExpression };
        }
        throw new Error(`Line ${lineNumber}: ${mnemonic} does not support this operand.`);
    }
    private parseByteItems(
        operandText: string,
        lineNumber: number,
    ): Array<number | M6502ExpressionNode> {
        const byteItems: Array<number | M6502ExpressionNode> = [];
        for (const itemText of splitTopLevelCommas(operandText)) {
            const trimmedItem = itemText.trim();
            if (
                trimmedItem.startsWith('"') &&
                trimmedItem.endsWith('"') &&
                trimmedItem.length >= 2
            ) {
                for (const character of trimmedItem.slice(1, -1)) {
                    byteItems.push(character.charCodeAt(0) & 0xff);
                }
                continue;
            }
            if (trimmedItem.length === 0) {
                throw new Error(`Line ${lineNumber}: empty .byte item.`);
            }
            byteItems.push(parseM6502Expression(trimmedItem));
        }
        return byteItems;
    }
    private emitStatements(
        statements: ReadonlyArray<M6502Statement>,
        labels: Map<string, number>,
    ): Uint8Array {
        if (statements.length === 0) {
            return new Uint8Array(0);
        }
        const origin = (statements[0] as M6502Statement).address;
        const lastStatement = statements[statements.length - 1] as M6502Statement;
        const totalSize = lastStatement.address + lastStatement.size - origin;
        const bytes = new Uint8Array(totalSize);
        for (const statement of statements) {
            const offset = statement.address - origin;
            if (statement.kind === "bytes") {
                for (const [byteIndex, byteItem] of (statement.byteItems ?? []).entries()) {
                    const byteValue =
                        typeof byteItem === "number"
                            ? byteItem
                            : evaluateM6502Expression(byteItem, labels);
                    if (byteValue < -128 || byteValue > 255) {
                        throw new Error(
                            `Line ${statement.lineNumber}: .byte value ${byteValue} is out of range.`,
                        );
                    }
                    bytes[offset + byteIndex] = byteValue & 0xff;
                }
                continue;
            }
            if (statement.kind === "words") {
                for (const [wordIndex, wordOperand] of (statement.wordOperands ?? []).entries()) {
                    const value = evaluateM6502Expression(wordOperand, labels);
                    if (value < -32768 || value > 65535) {
                        throw new Error(`Line ${statement.lineNumber}: .word value out of range.`);
                    }
                    bytes[offset + wordIndex * 2] = value & 0xff;
                    bytes[offset + wordIndex * 2 + 1] = (value >> 8) & 0xff;
                }
                continue;
            }
            const mnemonic = statement.mnemonic as string;
            const mode = statement.mode as M6502AddressingMode;
            const opcode = OPCODES[mnemonic]?.[mode] as number;
            bytes[offset] = opcode;
            if (statement.size === 1) {
                continue;
            }
            const operandValue = evaluateM6502Expression(
                statement.operand as M6502ExpressionNode,
                labels,
            );
            if (mode === "relative") {
                const offsetValue = operandValue - (statement.address + 2);
                if (offsetValue < -128 || offsetValue > 127) {
                    throw new Error(
                        `Line ${statement.lineNumber}: branch out of range by ${offsetValue} bytes.`,
                    );
                }
                bytes[offset + 1] = offsetValue & 0xff;
                continue;
            }
            if (statement.size === 2) {
                if (operandValue < -128 || operandValue > 0xffff) {
                    throw new Error(
                        `Line ${statement.lineNumber}: operand ${operandValue} is out of range.`,
                    );
                }
                bytes[offset + 1] = operandValue & 0xff;
                continue;
            }
            if (operandValue < -32768 || operandValue > 0xffff) {
                throw new Error(
                    `Line ${statement.lineNumber}: operand ${operandValue} is out of range.`,
                );
            }
            bytes[offset + 1] = operandValue & 0xff;
            bytes[offset + 2] = (operandValue >> 8) & 0xff;
        }
        return bytes;
    }
}
function stripComment(lineText: string): string {
    let inString = false;
    for (let position = 0; position < lineText.length; position++) {
        const character = lineText[position] as string;
        if (character === '"') {
            inString = !inString;
            continue;
        }
        if (character === ";" && !inString) {
            return lineText.slice(0, position);
        }
    }
    return lineText;
}
function splitTopLevelCommas(text: string): Array<string> {
    const parts: Array<string> = [];
    let current = "";
    let inString = false;
    for (const character of text) {
        if (character === '"') {
            inString = !inString;
        }
        if (character === "," && !inString) {
            parts.push(current);
            current = "";
            continue;
        }
        current += character;
    }
    parts.push(current);
    return parts;
}
function parseM6502Expression(expressionText: string): M6502ExpressionNode {
    const text = expressionText.trim();
    let position = 0;
    const skipSpaces = (): void => {
        while (text[position] === " " || text[position] === "\t") {
            position++;
        }
    };
    const parseAtom = (): M6502ExpressionNode => {
        skipSpaces();
        const character = text[position];
        if (character === undefined) {
            throw new Error("Expected an expression.");
        }
        if (character === "<" || character === ">") {
            position++;
            const operand = parseAtom();
            return character === "<" ? { kind: "low", operand } : { kind: "high", operand };
        }
        if (character === "$") {
            let hexText = "";
            position++;
            while (/[0-9A-Fa-f]/.test(text[position] ?? "")) {
                hexText += text[position];
                position++;
            }
            if (hexText.length === 0) {
                throw new Error("Expected hexadecimal digits after '$'.");
            }
            return { kind: "number", value: Number.parseInt(hexText, 16) };
        }
        if (character === "%") {
            let binaryText = "";
            position++;
            while (text[position] === "0" || text[position] === "1") {
                binaryText += text[position];
                position++;
            }
            if (binaryText.length === 0) {
                throw new Error("Expected binary digits after '%'.");
            }
            return { kind: "number", value: Number.parseInt(binaryText, 2) };
        }
        if (character >= "0" && character <= "9") {
            let decimalText = "";
            while (text[position] >= "0" && text[position] <= "9") {
                decimalText += text[position];
                position++;
            }
            return { kind: "number", value: Number(decimalText) };
        }
        if (character === "'") {
            const charValue = text[position + 1];
            if (charValue === undefined) {
                throw new Error("Expected a character after '''.");
            }
            position += 2;
            return { kind: "number", value: charValue.charCodeAt(0) };
        }
        if (character === "(") {
            position++;
            const inner = parseSum();
            skipSpaces();
            if (text[position] !== ")") {
                throw new Error("Missing closing parenthesis in expression.");
            }
            position++;
            return inner;
        }
        if (/[A-Za-z_]/.test(character)) {
            let labelText = "";
            let labelValue = text[position] as string;
            while (/[A-Za-z0-9_.]/.test(labelValue ?? "")) {
                labelText += labelValue;
                position++;
                labelValue = text[position] as string;
            }
            return { kind: "label", text: labelText };
        }
        throw new Error(`Unexpected character '${character}' in expression.`);
    };
    const parseTerm = (): M6502ExpressionNode => parseAtom();
    const parseSum = (): M6502ExpressionNode => {
        let left = parseTerm();
        for (;;) {
            skipSpaces();
            const operator = text[position];
            if (operator !== "+" && operator !== "-") {
                return left;
            }
            position++;
            const right = parseTerm();
            left = { kind: "binary", operator, left, right };
        }
    };
    const result = parseSum();
    skipSpaces();
    if (position < text.length) {
        throw new Error(`Unexpected text '${text.slice(position)}' in expression.`);
    }
    return result;
}
function evaluateM6502Expression(
    expression: M6502ExpressionNode,
    labels: ReadonlyMap<string, number>,
): number {
    const value = tryEvaluateM6502Expression(expression, labels);
    if (value === undefined) {
        throw new Error("Undefined label in expression.");
    }
    return value;
}
function tryEvaluateM6502Expression(
    expression: M6502ExpressionNode,
    labels: ReadonlyMap<string, number>,
): number | undefined {
    switch (expression.kind) {
        case "number":
            return expression.value;
        case "label": {
            const labelValue = labels.get(expression.text as string);
            return labelValue;
        }
        case "low": {
            const operandValue = tryEvaluateM6502Expression(
                expression.operand as M6502ExpressionNode,
                labels,
            );
            return operandValue === undefined ? undefined : operandValue & 0xff;
        }
        case "high": {
            const operandValue = tryEvaluateM6502Expression(
                expression.operand as M6502ExpressionNode,
                labels,
            );
            return operandValue === undefined ? undefined : (operandValue >> 8) & 0xff;
        }
        case "binary": {
            const leftValue = tryEvaluateM6502Expression(
                expression.left as M6502ExpressionNode,
                labels,
            );
            const rightValue = tryEvaluateM6502Expression(
                expression.right as M6502ExpressionNode,
                labels,
            );
            if (leftValue === undefined || rightValue === undefined) {
                return undefined;
            }
            return expression.operator === "+" ? leftValue + rightValue : leftValue - rightValue;
        }
        default:
            return undefined;
    }
}
export { M6502Assembler, OPCODES, parseM6502Expression, evaluateM6502Expression };
export type { M6502AddressingMode, M6502AssemblyOptions, M6502AssemblyResult, M6502ExpressionNode };
