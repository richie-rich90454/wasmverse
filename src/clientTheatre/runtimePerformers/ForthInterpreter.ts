import {
    directoryOf,
    joinRelativePath,
    normalizeWithinRoot,
} from "@clientTheatre/runtimePerformers/UserFilePathResolver.ts";
type ForthInstruction =
    | { kind: "call"; name: string }
    | { kind: "literal"; value: number }
    | { kind: "printText"; value: string }
    | { kind: "stringLiteral"; value: string }
    | { kind: "jump"; target: number }
    | { kind: "jumpIfZero"; target: number }
    | { kind: "do" }
    | { kind: "loop"; target: number }
    | { kind: "exit" };
type ForthToken =
    | { type: "word"; text: string }
    | { type: "string"; word: "." | "S"; text: string };
interface ForthControlFrame {
    kind: "if" | "else" | "begin" | "while" | "do";
    index: number;
}
interface ForthLoopFrame {
    index: number;
    limit: number;
}
interface ForthTokenCursor {
    tokens: ReadonlyArray<ForthToken>;
    index: number;
}
interface ForthInterpreterDependencies {
    appendOutput(text: string): void;
    readLine(): string;
    programArguments: ReadonlyArray<string>;
    userFiles: ReadonlyMap<string, string>;
    entryRelativePath: string;
}
const FIRST_VARIABLE_ADDRESS = 1024;
const SCRATCH_ADDRESS = 512;
const TRUE_CELL = -1;
const CONTROL_WORD_NAMES: ReadonlySet<string> = new Set([
    "IF",
    "ELSE",
    "THEN",
    "BEGIN",
    "UNTIL",
    "WHILE",
    "REPEAT",
    "DO",
    "LOOP",
    "EXIT",
]);
const PARSER_WORD_NAMES: ReadonlySet<string> = new Set(["VARIABLE", "INCLUDE", "READ-FILE"]);
class ForthInterpreter {
    private readonly dependencies: ForthInterpreterDependencies;
    private readonly stack: Array<number> = [];
    private readonly memory: Array<number> = [];
    private loopFrames: Array<ForthLoopFrame> = [];
    private readonly callerWords: Map<string, Array<ForthInstruction>> = new Map();
    private readonly builtinWords: Map<string, () => void> = new Map();
    private readonly sourceStack: Array<string> = [];
    private readonly inputLineBuffer: Array<number> = [];
    private readonly cursorStack: Array<ForthTokenCursor> = [];
    private compilation: Array<ForthInstruction> | undefined;
    private controlFrames: Array<ForthControlFrame> = [];
    private pendingDefinitionName = "";
    private nextVariableAddress = FIRST_VARIABLE_ADDRESS;
    private scratchAddress = SCRATCH_ADDRESS;
    constructor(dependencies: ForthInterpreterDependencies) {
        this.dependencies = dependencies;
        this.registerBuiltinWords();
    }
    run(sourceText: string): void {
        try {
            this.interpretSource(sourceText);
            if (this.compilation) {
                throw new Error("Unterminated definition");
            }
        } catch (runError) {
            this.compilation = undefined;
            this.controlFrames = [];
            this.pendingDefinitionName = "";
            this.loopFrames = [];
            throw runError;
        }
    }
    stackSnapshot(): ReadonlyArray<number> {
        return [...this.stack];
    }
    private interpretSource(sourceText: string): void {
        this.sourceStack.push(sourceText);
        this.cursorStack.push({ tokens: this.tokenize(sourceText), index: 0 });
        try {
            const cursor = this.cursorStack[this.cursorStack.length - 1] as ForthTokenCursor;
            while (cursor.index < cursor.tokens.length) {
                const token = cursor.tokens[cursor.index] as ForthToken;
                cursor.index += 1;
                if (token.type === "string") {
                    this.handleStringToken(token);
                    continue;
                }
                this.handleWordToken(token.text);
            }
        } finally {
            this.cursorStack.pop();
            this.sourceStack.pop();
        }
    }
    private handleWordToken(rawWord: string): void {
        const word = rawWord.toUpperCase();
        const numericValue = this.parseNumber(rawWord);
        if (numericValue !== undefined) {
            this.emitInstruction({ kind: "literal", value: numericValue });
            return;
        }
        if (word === ":") {
            this.startDefinition();
            return;
        }
        if (word === ";") {
            this.endDefinition();
            return;
        }
        if (CONTROL_WORD_NAMES.has(word)) {
            this.handleControlWord(word);
            return;
        }
        if (PARSER_WORD_NAMES.has(word)) {
            this.requireInterpretation(word);
            this.invokeWord(word);
            return;
        }
        if (this.callerWords.has(word)) {
            this.emitInstruction({ kind: "call", name: word });
            return;
        }
        if (this.builtinWords.has(word)) {
            if (this.compilation) {
                this.emitInstruction({ kind: "call", name: word });
                return;
            }
            (this.builtinWords.get(word) as () => void)();
            return;
        }
        throw new Error(`Unknown word: ${rawWord}`);
    }
    private handleStringToken(token: Extract<ForthToken, { type: "string" }>): void {
        if (token.word === ".") {
            if (this.compilation) {
                this.emitInstruction({ kind: "printText", value: token.text });
                return;
            }
            this.dependencies.appendOutput(token.text);
            return;
        }
        this.emitInstruction({ kind: "stringLiteral", value: token.text });
    }
    private handleControlWord(word: string): void {
        if (!this.compilation) {
            throw new Error(`${word} is compile-only and needs a definition`);
        }
        switch (word) {
            case "IF": {
                this.compilation.push({ kind: "jumpIfZero", target: -1 });
                this.controlFrames.push({ kind: "if", index: this.compilation.length - 1 });
                return;
            }
            case "ELSE": {
                const frame = this.controlFrames.pop();
                if (!frame || frame.kind !== "if") {
                    throw new Error("ELSE without IF");
                }
                this.compilation.push({ kind: "jump", target: -1 });
                (this.compilation[frame.index] as { target: number }).target =
                    this.compilation.length;
                this.controlFrames.push({ kind: "else", index: this.compilation.length - 1 });
                return;
            }
            case "THEN": {
                const frame = this.controlFrames.pop();
                if (!frame || (frame.kind !== "if" && frame.kind !== "else")) {
                    throw new Error("THEN without IF");
                }
                (this.compilation[frame.index] as { target: number }).target =
                    this.compilation.length;
                return;
            }
            case "BEGIN": {
                this.controlFrames.push({ kind: "begin", index: this.compilation.length });
                return;
            }
            case "UNTIL": {
                const frame = this.controlFrames.pop();
                if (!frame || frame.kind !== "begin") {
                    throw new Error("UNTIL without BEGIN");
                }
                this.compilation.push({ kind: "jumpIfZero", target: frame.index });
                return;
            }
            case "WHILE": {
                const frame = this.controlFrames[this.controlFrames.length - 1];
                if (!frame || frame.kind !== "begin") {
                    throw new Error("WHILE outside of BEGIN ... REPEAT");
                }
                this.compilation.push({ kind: "jumpIfZero", target: -1 });
                this.controlFrames.push({ kind: "while", index: this.compilation.length - 1 });
                return;
            }
            case "REPEAT": {
                const whileFrame = this.controlFrames.pop();
                const beginFrame = this.controlFrames.pop();
                if (!whileFrame || whileFrame.kind !== "while" || !beginFrame) {
                    throw new Error("REPEAT without WHILE");
                }
                this.compilation.push({ kind: "jump", target: beginFrame.index });
                (this.compilation[whileFrame.index] as { target: number }).target =
                    this.compilation.length;
                return;
            }
            case "DO": {
                this.compilation.push({ kind: "do" });
                this.controlFrames.push({ kind: "do", index: this.compilation.length - 1 });
                return;
            }
            case "LOOP": {
                const frame = this.controlFrames.pop();
                if (!frame || frame.kind !== "do") {
                    throw new Error("LOOP without DO");
                }
                this.compilation.push({ kind: "loop", target: frame.index + 1 });
                return;
            }
            case "EXIT": {
                this.compilation.push({ kind: "exit" });
                return;
            }
            default: {
                throw new Error(`Unsupported control word: ${word}`);
            }
        }
    }
    private startDefinition(): void {
        if (this.compilation) {
            throw new Error("Nested definitions are not supported");
        }
        const name = this.consumeNextWord("definition name").toUpperCase();
        if (this.parseNumber(name) !== undefined) {
            throw new Error(`Invalid definition name: ${name}`);
        }
        this.compilation = [];
        this.controlFrames = [];
        this.pendingDefinitionName = name;
    }
    private endDefinition(): void {
        if (!this.compilation) {
            throw new Error("; without a definition");
        }
        if (this.controlFrames.length > 0) {
            throw new Error("Unbalanced control structure in definition");
        }
        this.compilation.push({ kind: "exit" });
        this.callerWords.set(this.pendingDefinitionName, this.compilation);
        this.compilation = undefined;
        this.controlFrames = [];
    }
    private consumeNextWord(context: string): string {
        const cursor = this.cursorStack[this.cursorStack.length - 1];
        if (!cursor) {
            throw new Error(`Missing ${context}`);
        }
        const token = cursor.tokens[cursor.index];
        if (!token) {
            throw new Error(`Missing ${context}`);
        }
        cursor.index += 1;
        if (token.type !== "word") {
            throw new Error(`Invalid ${context}: ${token.text}`);
        }
        return token.text;
    }
    private emitInstruction(instruction: ForthInstruction): void {
        if (this.compilation) {
            this.compilation.push(instruction);
            return;
        }
        this.executeInstructions([instruction]);
    }
    private executeInstructions(instructions: ReadonlyArray<ForthInstruction>): void {
        let instructionPointer = 0;
        while (instructionPointer < instructions.length) {
            const instruction = instructions[instructionPointer] as ForthInstruction;
            switch (instruction.kind) {
                case "call": {
                    this.invokeWord(instruction.name);
                    instructionPointer += 1;
                    break;
                }
                case "literal": {
                    this.stack.push(instruction.value);
                    instructionPointer += 1;
                    break;
                }
                case "printText": {
                    this.dependencies.appendOutput(instruction.value);
                    instructionPointer += 1;
                    break;
                }
                case "stringLiteral": {
                    this.pushText(instruction.value);
                    instructionPointer += 1;
                    break;
                }
                case "jump": {
                    instructionPointer = instruction.target;
                    break;
                }
                case "jumpIfZero": {
                    const condition = this.pop("IF");
                    instructionPointer =
                        condition === 0 ? instruction.target : instructionPointer + 1;
                    break;
                }
                case "do": {
                    const start = this.pop("DO");
                    const limit = this.pop("DO");
                    this.loopFrames.push({ index: start, limit });
                    instructionPointer += 1;
                    break;
                }
                case "loop": {
                    const loopFrame = this.loopFrames[this.loopFrames.length - 1];
                    if (!loopFrame) {
                        throw new Error("LOOP outside of DO");
                    }
                    loopFrame.index += 1;
                    if (loopFrame.index < loopFrame.limit) {
                        instructionPointer = instruction.target;
                    } else {
                        this.loopFrames.pop();
                        instructionPointer += 1;
                    }
                    break;
                }
                case "exit": {
                    return;
                }
            }
        }
    }
    private invokeWord(name: string): void {
        const definition = this.callerWords.get(name);
        if (definition) {
            this.executeInstructions(definition);
            return;
        }
        const builtin = this.builtinWords.get(name);
        if (builtin) {
            builtin();
            return;
        }
        throw new Error(`Unknown word: ${name}`);
    }
    private registerBuiltinWords(): void {
        const register = (name: string, implementation: () => void) => {
            this.builtinWords.set(name, implementation);
        };
        register("DUP", () => {
            const value = this.pop("DUP");
            this.stack.push(value, value);
        });
        register("DROP", () => {
            this.pop("DROP");
        });
        register("SWAP", () => {
            const second = this.pop("SWAP");
            const first = this.pop("SWAP");
            this.stack.push(second, first);
        });
        register("OVER", () => {
            const second = this.pop("OVER");
            const first = this.pop("OVER");
            this.stack.push(first, second, first);
        });
        register("ROT", () => {
            const third = this.pop("ROT");
            const second = this.pop("ROT");
            const first = this.pop("ROT");
            this.stack.push(second, third, first);
        });
        register("PICK", () => {
            const depth = this.pop("PICK");
            const value = this.stack[this.stack.length - 1 - depth];
            if (value === undefined) {
                throw new Error(`Stack underflow in PICK`);
            }
            this.stack.push(value);
        });
        register("DEPTH", () => {
            this.stack.push(this.stack.length);
        });
        register("+", () => this.applyBinary("+", (left, right) => left + right));
        register("-", () => this.applyBinary("-", (left, right) => left - right));
        register("*", () => this.applyBinary("*", (left, right) => left * right));
        register("/", () =>
            this.applyBinary("/", (left, right) => {
                this.requireNonZeroDivisor(right);
                return Math.trunc(left / right);
            }),
        );
        register("MOD", () =>
            this.applyBinary("MOD", (left, right) => {
                this.requireNonZeroDivisor(right);
                return left % right;
            }),
        );
        register("NEGATE", () => {
            this.stack.push(-this.pop("NEGATE"));
        });
        register("ABS", () => {
            this.stack.push(Math.abs(this.pop("ABS")));
        });
        register("1+", () => {
            this.stack.push(this.pop("1+") + 1);
        });
        register("1-", () => {
            this.stack.push(this.pop("1-") - 1);
        });
        register("MIN", () => this.applyBinary("MIN", (left, right) => Math.min(left, right)));
        register("MAX", () => this.applyBinary("MAX", (left, right) => Math.max(left, right)));
        register("AND", () => this.applyBinary("AND", (left, right) => left & right));
        register("OR", () => this.applyBinary("OR", (left, right) => left | right));
        register("XOR", () => this.applyBinary("XOR", (left, right) => left ^ right));
        register("INVERT", () => {
            this.stack.push(~this.pop("INVERT"));
        });
        register("=", () => this.applyComparison("=", (left, right) => left === right));
        register("<>", () => this.applyComparison("<>", (left, right) => left !== right));
        register("<", () => this.applyComparison("<", (left, right) => left < right));
        register(">", () => this.applyComparison(">", (left, right) => left > right));
        register("<=", () => this.applyComparison("<=", (left, right) => left <= right));
        register(">=", () => this.applyComparison(">=", (left, right) => left >= right));
        register("0=", () => this.stack.push(this.pop("0=") === 0 ? TRUE_CELL : 0));
        register("0<", () => this.stack.push(this.pop("0<") < 0 ? TRUE_CELL : 0));
        register("0>", () => this.stack.push(this.pop("0>") > 0 ? TRUE_CELL : 0));
        register(".", () => {
            this.dependencies.appendOutput(`${this.pop(".")} `);
        });
        register("EMIT", () => {
            this.dependencies.appendOutput(String.fromCharCode(this.pop("EMIT")));
        });
        register("CR", () => {
            this.dependencies.appendOutput("\n");
        });
        register("SPACE", () => {
            this.dependencies.appendOutput(" ");
        });
        register("TYPE", () => {
            const length = this.pop("TYPE");
            const address = this.pop("TYPE");
            this.dependencies.appendOutput(this.readText(address, length));
        });
        register("KEY", () => {
            if (this.inputLineBuffer.length === 0) {
                for (const character of `${this.dependencies.readLine()}\n`) {
                    this.inputLineBuffer.push(character.charCodeAt(0));
                }
            }
            this.stack.push(this.inputLineBuffer.shift() as number);
        });
        register("ACCEPT", () => {
            const maximumLength = this.pop("ACCEPT");
            const address = this.pop("ACCEPT");
            const accepted = this.dependencies.readLine().slice(0, Math.max(0, maximumLength));
            for (let index = 0; index < accepted.length; index++) {
                this.writeCell(address + index, accepted.charCodeAt(index));
            }
            this.stack.push(accepted.length);
        });
        register("SOURCE", () => {
            this.pushText(this.sourceStack[this.sourceStack.length - 1] ?? "");
        });
        register("EVALUATE", () => {
            const length = this.pop("EVALUATE");
            const address = this.pop("EVALUATE");
            this.interpretSource(this.readText(address, length));
        });
        register("VARIABLE", () => {
            const name = this.consumeNextWord("VARIABLE name").toUpperCase();
            const address = this.nextVariableAddress++;
            this.callerWords.set(name, [{ kind: "literal", value: address }]);
        });
        register("INCLUDE", () => {
            const requestedPath = this.consumeNextWord("INCLUDE path");
            this.interpretSource(this.readUserFile(requestedPath));
        });
        register("READ-FILE", () => {
            const requestedPath = this.consumeNextWord("READ-FILE path");
            this.pushText(this.readUserFile(requestedPath));
        });
        register("I", () => {
            const loopFrame = this.loopFrames[this.loopFrames.length - 1];
            if (!loopFrame) {
                throw new Error("I outside of a DO loop");
            }
            this.stack.push(loopFrame.index);
        });
        register("!", () => {
            const address = this.pop("!");
            const value = this.pop("!");
            this.writeCell(address, value);
        });
        register("@", () => {
            this.stack.push(this.readCell(this.pop("@")));
        });
        register("+!", () => {
            const address = this.pop("+!");
            const value = this.pop("+!");
            this.writeCell(address, this.readCell(address) + value);
        });
        register("?", () => {
            this.dependencies.appendOutput(`${this.readCell(this.pop("?"))} `);
        });
        register("BL", () => {
            this.stack.push(32);
        });
        register("TRUE", () => {
            this.stack.push(TRUE_CELL);
        });
        register("FALSE", () => {
            this.stack.push(0);
        });
        register("ARGC", () => {
            this.stack.push(this.dependencies.programArguments.length);
        });
        register("ARG", () => {
            const index = this.pop("ARG");
            const argument = this.dependencies.programArguments[index];
            if (argument === undefined) {
                throw new Error(`No program argument at index ${index}`);
            }
            this.pushText(argument);
        });
    }
    private tokenize(sourceText: string): Array<ForthToken> {
        const tokens: Array<ForthToken> = [];
        let index = 0;
        while (index < sourceText.length) {
            const character = sourceText[index] as string;
            if (/\s/.test(character)) {
                index += 1;
                continue;
            }
            if (character === "\\") {
                while (index < sourceText.length && sourceText[index] !== "\n") {
                    index += 1;
                }
                continue;
            }
            if (character === "(") {
                const closingIndex = sourceText.indexOf(")", index);
                if (closingIndex < 0) {
                    throw new Error("Unterminated ( comment");
                }
                index = closingIndex + 1;
                continue;
            }
            const leadingPair = sourceText.slice(index, index + 2);
            const isPrintString = leadingPair === '."';
            const isStackString = leadingPair.toLowerCase() === 's"';
            if (isPrintString || isStackString) {
                const afterQuoteIndex = index + 2;
                const stringStart =
                    sourceText[afterQuoteIndex] === " " ? afterQuoteIndex + 1 : afterQuoteIndex;
                const stringEnd = sourceText.indexOf('"', stringStart);
                if (stringEnd < 0) {
                    throw new Error("Unterminated string literal");
                }
                tokens.push({
                    type: "string",
                    word: isPrintString ? "." : "S",
                    text: sourceText.slice(stringStart, stringEnd),
                });
                index = stringEnd + 1;
                continue;
            }
            let wordEnd = index;
            while (wordEnd < sourceText.length && !/\s/.test(sourceText[wordEnd] as string)) {
                wordEnd += 1;
            }
            tokens.push({ type: "word", text: sourceText.slice(index, wordEnd) });
            index = wordEnd;
        }
        return tokens;
    }
    private parseNumber(rawWord: string): number | undefined {
        if (!/^[+-]?\d+$/.test(rawWord)) {
            return undefined;
        }
        return Number.parseInt(rawWord, 10);
    }
    private applyBinary(name: string, operation: (left: number, right: number) => number): void {
        const right = this.pop(name);
        const left = this.pop(name);
        this.stack.push(operation(left, right));
    }
    private applyComparison(
        name: string,
        predicate: (left: number, right: number) => boolean,
    ): void {
        const right = this.pop(name);
        const left = this.pop(name);
        this.stack.push(predicate(left, right) ? TRUE_CELL : 0);
    }
    private requireNonZeroDivisor(divisor: number): void {
        if (divisor === 0) {
            throw new Error("Division by zero");
        }
    }
    private requireInterpretation(context: string): void {
        if (this.compilation) {
            throw new Error(`${context} cannot be used inside a definition`);
        }
    }
    private pop(context: string): number {
        const value = this.stack.pop();
        if (value === undefined) {
            throw new Error(`Stack underflow in ${context}`);
        }
        return value;
    }
    private readCell(address: number): number {
        return this.memory[address] ?? 0;
    }
    private writeCell(address: number, value: number): void {
        this.memory[address] = value;
    }
    private pushText(text: string): void {
        const address = this.scratchAddress;
        for (let index = 0; index < text.length; index++) {
            this.writeCell(address + index, text.charCodeAt(index));
        }
        this.scratchAddress = address + Math.max(1, text.length);
        this.stack.push(address, text.length);
    }
    private readText(address: number, length: number): string {
        let text = "";
        for (let index = 0; index < length; index++) {
            text += String.fromCharCode(this.readCell(address + index));
        }
        return text;
    }
    private readUserFile(rawPath: string): string {
        const normalizedPath = normalizeWithinRoot(rawPath);
        const entryDirectory = directoryOf(this.dependencies.entryRelativePath);
        const candidatePaths =
            entryDirectory.length > 0
                ? [joinRelativePath(entryDirectory, normalizedPath), normalizedPath]
                : [normalizedPath];
        for (const candidatePath of candidatePaths) {
            const fileContent = this.dependencies.userFiles.get(candidatePath);
            if (fileContent !== undefined) {
                return fileContent;
            }
        }
        throw new Error(`File not found: ${rawPath}`);
    }
}
export { ForthInterpreter };
export type { ForthInterpreterDependencies };
