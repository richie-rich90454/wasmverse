import { TerminalInputNeededSignal } from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
interface StInteger {
    kind: "integer";
    value: number;
}
interface StFloat {
    kind: "float";
    value: number;
}
interface StString {
    kind: "string";
    value: string;
}
interface StSymbol {
    kind: "symbol";
    value: string;
}
interface StCharacter {
    kind: "character";
    value: string;
}
interface StArray {
    kind: "array";
    items: Array<StValue>;
}
interface StBlock {
    kind: "block";
    parameters: ReadonlyArray<string>;
    temporaries: ReadonlyArray<string>;
    body: ReadonlyArray<StNode>;
    scope: StScope;
}
interface StBoolean {
    kind: "boolean";
    value: boolean;
}
interface StNil {
    kind: "nil";
}
interface StTranscript {
    kind: "transcript";
}
interface StStandardInput {
    kind: "standardInput";
}
interface StStream {
    kind: "stream";
    path: string;
    mode: "read" | "write";
    buffer: string;
    position: number;
}
interface StClass {
    kind: "class";
    name: string;
}
type StValue =
    | StInteger
    | StFloat
    | StString
    | StSymbol
    | StCharacter
    | StArray
    | StBlock
    | StBoolean
    | StNil
    | StTranscript
    | StStandardInput
    | StStream
    | StClass;
type StNumber = StInteger | StFloat;
interface StScope {
    variables: Map<string, StValue>;
    parent: StScope | undefined;
}
interface StMessageSend {
    selector: string;
    arguments: Array<StNode>;
}
type StNode =
    | { kind: "literal"; value: StValue }
    | { kind: "variable"; name: string }
    | { kind: "assignment"; name: string; value: StNode }
    | { kind: "block"; parameters: Array<string>; temporaries: Array<string>; body: Array<StNode> }
    | { kind: "send"; receiver: StNode; messages: Array<StMessageSend> }
    | { kind: "return"; value: StNode }
    | { kind: "dynamicArray"; elements: Array<StNode> }
    | { kind: "parenthesized"; value: StNode };
type StToken =
    | { type: "identifier"; text: string }
    | { type: "keyword"; text: string }
    | { type: "binary"; text: string }
    | { type: "integer"; value: number }
    | { type: "float"; value: number }
    | { type: "string"; value: string }
    | { type: "symbol"; value: string }
    | { type: "character"; value: string }
    | { type: "arrayOpen" }
    | { type: "punct"; text: string }
    | { type: "end" };
interface SmalltalkEvaluatorDependencies {
    appendOutput(text: string): void;
    readLine(): string;
    programArguments: ReadonlyArray<string>;
    userFiles: ReadonlyMap<string, string>;
}
const BINARY_SELECTOR_CHARACTERS = "+-*/\\~<>=&@%,?!";
const STATEMENT_TERMINATORS: ReadonlySet<string> = new Set([")", "]", "}"]);
class StReturnSignal extends Error {
    readonly returnValue: StValue;
    constructor(returnValue: StValue) {
        super("return");
        this.returnValue = returnValue;
    }
}
class StParser {
    private readonly tokens: ReadonlyArray<StToken>;
    private tokenIndex = 0;
    constructor(sourceText: string) {
        this.tokens = tokenizeSmalltalk(sourceText);
    }
    parseProgram(): Array<StNode> {
        const statements = this.parseStatements(new Set());
        this.expectEnd();
        return statements;
    }
    private parseStatements(extraTerminators: ReadonlySet<string>): Array<StNode> {
        const statements: Array<StNode> = [];
        for (;;) {
            if (this.isTerminator(extraTerminators)) {
                break;
            }
            statements.push(this.parseStatement());
            if (this.matchPunct(".")) {
                continue;
            }
            if (this.isTerminator(extraTerminators)) {
                break;
            }
            throw new Error(
                `Expected '.' between statements but found ${this.describeCurrentToken()}`,
            );
        }
        return statements;
    }
    private parseStatement(): StNode {
        if (this.matchPunct("^")) {
            return { kind: "return", value: this.parseExpression() };
        }
        return this.parseExpression();
    }
    private parseExpression(): StNode {
        const receiver = this.parseKeywordMessage();
        if (!this.matchPunct(";")) {
            return receiver;
        }
        if (receiver.kind !== "send") {
            throw new Error("Cascades need a message send receiver");
        }
        const messages: Array<StMessageSend> = [...receiver.messages];
        for (;;) {
            messages.push(this.parseMessageSend());
            if (!this.matchPunct(";")) {
                break;
            }
        }
        return { kind: "send", receiver: receiver.receiver, messages };
    }
    private parseKeywordMessage(): StNode {
        const receiver = this.parseBinaryMessage();
        const keywordParts: Array<string> = [];
        const keywordArguments: Array<StNode> = [];
        while (this.currentToken().type === "keyword") {
            keywordParts.push((this.currentToken() as { text: string }).text);
            this.tokenIndex += 1;
            keywordArguments.push(this.parseBinaryMessage());
        }
        if (keywordParts.length === 0) {
            return receiver;
        }
        return {
            kind: "send",
            receiver,
            messages: [{ selector: keywordParts.join(""), arguments: keywordArguments }],
        };
    }
    private parseBinaryMessage(): StNode {
        let receiver = this.parseUnaryMessage();
        while (this.currentToken().type === "binary") {
            const selector = (this.currentToken() as { text: string }).text;
            this.tokenIndex += 1;
            const argument = this.parseUnaryMessage();
            receiver = {
                kind: "send",
                receiver,
                messages: [{ selector, arguments: [argument] }],
            };
        }
        return receiver;
    }
    private parseUnaryMessage(): StNode {
        let receiver = this.parsePrimary();
        while (this.currentToken().type === "identifier") {
            const selector = (this.currentToken() as { text: string }).text;
            this.tokenIndex += 1;
            receiver = {
                kind: "send",
                receiver,
                messages: [{ selector, arguments: [] }],
            };
        }
        return receiver;
    }
    private parseMessageSend(): StMessageSend {
        const token = this.currentToken();
        if (token.type === "identifier") {
            this.tokenIndex += 1;
            return { selector: token.text, arguments: [] };
        }
        if (token.type === "binary") {
            this.tokenIndex += 1;
            return { selector: token.text, arguments: [this.parseUnaryMessage()] };
        }
        if (token.type === "keyword") {
            const keywordParts: Array<string> = [];
            const keywordArguments: Array<StNode> = [];
            while (this.currentToken().type === "keyword") {
                keywordParts.push((this.currentToken() as { text: string }).text);
                this.tokenIndex += 1;
                keywordArguments.push(this.parseBinaryMessage());
            }
            return { selector: keywordParts.join(""), arguments: keywordArguments };
        }
        throw new Error(`Expected a message send but found ${this.describeCurrentToken()}`);
    }
    private parsePrimary(): StNode {
        const token = this.currentToken();
        switch (token.type) {
            case "integer": {
                this.tokenIndex += 1;
                return { kind: "literal", value: { kind: "integer", value: token.value } };
            }
            case "float": {
                this.tokenIndex += 1;
                return { kind: "literal", value: { kind: "float", value: token.value } };
            }
            case "string": {
                this.tokenIndex += 1;
                return { kind: "literal", value: { kind: "string", value: token.value } };
            }
            case "symbol": {
                this.tokenIndex += 1;
                return { kind: "literal", value: { kind: "symbol", value: token.value } };
            }
            case "character": {
                this.tokenIndex += 1;
                return { kind: "literal", value: { kind: "character", value: token.value } };
            }
            case "arrayOpen": {
                this.tokenIndex += 1;
                const items = this.parseLiteralArrayItems();
                return { kind: "literal", value: { kind: "array", items } };
            }
            case "identifier": {
                this.tokenIndex += 1;
                if (this.currentToken().type === "punct" && this.punctText() === ":=") {
                    this.tokenIndex += 1;
                    return { kind: "assignment", name: token.text, value: this.parseExpression() };
                }
                return { kind: "variable", name: token.text };
            }
            case "punct": {
                return this.parsePunctuatedPrimary(token.text);
            }
            default: {
                throw new Error(`Unexpected token ${this.describeCurrentToken()}`);
            }
        }
    }
    private parsePunctuatedPrimary(punct: string): StNode {
        if (punct === "(") {
            this.tokenIndex += 1;
            const inner = this.parseExpression();
            this.expectPunct(")");
            return { kind: "parenthesized", value: inner };
        }
        if (punct === "[") {
            this.tokenIndex += 1;
            return this.parseBlock();
        }
        if (punct === "{") {
            this.tokenIndex += 1;
            const elements: Array<StNode> = [];
            while (!(this.currentToken().type === "punct" && this.punctText() === "}")) {
                elements.push(this.parseStatement());
                if (!this.matchPunct(".")) {
                    break;
                }
            }
            this.expectPunct("}");
            return { kind: "dynamicArray", elements };
        }
        throw new Error(`Unexpected token ${punct}`);
    }
    private parseBlock(): StNode {
        const parameters: Array<string> = [];
        while (this.currentToken().type === "punct" && this.punctText() === ":") {
            this.tokenIndex += 1;
            parameters.push(this.expectIdentifier("block parameter"));
        }
        const temporaries: Array<string> = [];
        if (parameters.length > 0) {
            this.matchPunct("|");
        }
        if (this.matchPunct("|")) {
            while (!(this.currentToken().type === "punct" && this.punctText() === "|")) {
                temporaries.push(this.expectIdentifier("block temporary"));
            }
            this.expectPunct("|");
        }
        const body = this.parseStatements(new Set(["]"]));
        this.expectPunct("]");
        return { kind: "block", parameters, temporaries, body };
    }
    private parseLiteralArrayItems(): Array<StValue> {
        const items: Array<StValue> = [];
        while (!(this.currentToken().type === "punct" && this.punctText() === ")")) {
            const token = this.currentToken();
            switch (token.type) {
                case "integer": {
                    this.tokenIndex += 1;
                    items.push({ kind: "integer", value: token.value });
                    break;
                }
                case "float": {
                    this.tokenIndex += 1;
                    items.push({ kind: "float", value: token.value });
                    break;
                }
                case "string": {
                    this.tokenIndex += 1;
                    items.push({ kind: "string", value: token.value });
                    break;
                }
                case "symbol": {
                    this.tokenIndex += 1;
                    items.push({ kind: "symbol", value: token.value });
                    break;
                }
                case "character": {
                    this.tokenIndex += 1;
                    items.push({ kind: "character", value: token.value });
                    break;
                }
                case "identifier": {
                    this.tokenIndex += 1;
                    items.push({ kind: "symbol", value: token.text });
                    break;
                }
                case "arrayOpen": {
                    this.tokenIndex += 1;
                    items.push({ kind: "array", items: this.parseLiteralArrayItems() });
                    break;
                }
                default: {
                    throw new Error(
                        `Unexpected token in literal array: ${this.describeCurrentToken()}`,
                    );
                }
            }
        }
        this.expectPunct(")");
        return items;
    }
    private isTerminator(extraTerminators: ReadonlySet<string>): boolean {
        const token = this.currentToken();
        if (token.type === "end") {
            return true;
        }
        if (token.type !== "punct") {
            return false;
        }
        return STATEMENT_TERMINATORS.has(token.text) || extraTerminators.has(token.text);
    }
    private currentToken(): StToken {
        return this.tokens[this.tokenIndex] as StToken;
    }
    private punctText(): string {
        return (this.currentToken() as { text: string }).text;
    }
    private matchPunct(punct: string): boolean {
        const token = this.currentToken();
        if (token.type === "punct" && token.text === punct) {
            this.tokenIndex += 1;
            return true;
        }
        return false;
    }
    private expectPunct(punct: string): void {
        if (!this.matchPunct(punct)) {
            throw new Error(`Expected '${punct}' but found ${this.describeCurrentToken()}`);
        }
    }
    private expectIdentifier(context: string): string {
        const token = this.currentToken();
        if (token.type !== "identifier") {
            throw new Error(`Expected ${context} but found ${this.describeCurrentToken()}`);
        }
        this.tokenIndex += 1;
        return token.text;
    }
    private expectEnd(): void {
        if (this.currentToken().type !== "end") {
            throw new Error(`Unexpected token ${this.describeCurrentToken()}`);
        }
    }
    private describeCurrentToken(): string {
        const token = this.currentToken();
        if (token.type === "end") {
            return "end of program";
        }
        if (token.type === "punct" || token.type === "identifier" || token.type === "keyword") {
            return `'${token.text}'`;
        }
        if (token.type === "binary") {
            return `'${token.text}'`;
        }
        return token.type;
    }
}
function tokenizeSmalltalk(sourceText: string): Array<StToken> {
    const tokens: Array<StToken> = [];
    let index = 0;
    let previousTokenAllowsNegative = true;
    const push = (token: StToken) => {
        tokens.push(token);
        previousTokenAllowsNegative = computeAllowsNegative(token);
    };
    while (index < sourceText.length) {
        const character = sourceText[index] as string;
        if (/\s/.test(character)) {
            index += 1;
            continue;
        }
        if (character === '"') {
            const closingIndex = sourceText.indexOf('"', index + 1);
            if (closingIndex < 0) {
                throw new Error("Unterminated Smalltalk comment");
            }
            index = closingIndex + 1;
            continue;
        }
        if (character === "'") {
            const { text, nextIndex } = readQuotedString(sourceText, index);
            push({ type: "string", value: text });
            index = nextIndex;
            continue;
        }
        if (character === "$") {
            const characterText = sourceText[index + 1];
            if (characterText === undefined) {
                throw new Error("Unterminated character literal");
            }
            push({ type: "character", value: characterText });
            index += 2;
            continue;
        }
        if (character === "#") {
            index = readHashToken(sourceText, index, push);
            continue;
        }
        if (character === "-" && previousTokenAllowsNegative) {
            const numberToken = readSignedNumber(sourceText, index);
            if (numberToken) {
                push(numberToken.token);
                index = numberToken.nextIndex;
                continue;
            }
        }
        if (/\d/.test(character)) {
            const numberToken = readUnsignedNumber(sourceText, index);
            push(numberToken.token);
            index = numberToken.nextIndex;
            continue;
        }
        if (/[A-Za-z_]/.test(character)) {
            let endIndex = index;
            while (
                endIndex < sourceText.length &&
                /[A-Za-z0-9_]/.test(sourceText[endIndex] as string)
            ) {
                endIndex += 1;
            }
            const name = sourceText.slice(index, endIndex);
            if (sourceText[endIndex] === ":" && sourceText[endIndex + 1] !== "=") {
                push({ type: "keyword", text: `${name}:` });
                index = endIndex + 1;
                continue;
            }
            push({ type: "identifier", text: name });
            index = endIndex;
            continue;
        }
        if (character === ":" && sourceText[index + 1] === "=") {
            push({ type: "punct", text: ":=" });
            index += 2;
            continue;
        }
        if (BINARY_SELECTOR_CHARACTERS.includes(character)) {
            let endIndex = index + 1;
            if (
                endIndex < sourceText.length &&
                BINARY_SELECTOR_CHARACTERS.includes(sourceText[endIndex] as string)
            ) {
                endIndex += 1;
            }
            push({ type: "binary", text: sourceText.slice(index, endIndex) });
            index = endIndex;
            continue;
        }
        if ("^.;|()[]{}:".includes(character)) {
            push({ type: "punct", text: character });
            index += 1;
            continue;
        }
        throw new Error(`Unexpected character '${character}'`);
    }
    tokens.push({ type: "end" });
    return tokens;
}
function computeAllowsNegative(token: StToken): boolean {
    switch (token.type) {
        case "identifier":
        case "string":
        case "symbol":
        case "character":
        case "integer":
        case "float": {
            return false;
        }
        case "punct": {
            return token.text !== ")" && token.text !== "]";
        }
        default: {
            return true;
        }
    }
}
function readQuotedString(
    sourceText: string,
    startIndex: number,
): { text: string; nextIndex: number } {
    let index = startIndex + 1;
    let text = "";
    while (index < sourceText.length) {
        const character = sourceText[index] as string;
        if (character === "'") {
            if (sourceText[index + 1] === "'") {
                text += "'";
                index += 2;
                continue;
            }
            return { text, nextIndex: index + 1 };
        }
        text += character;
        index += 1;
    }
    throw new Error("Unterminated string literal");
}
function readHashToken(
    sourceText: string,
    startIndex: number,
    push: (token: StToken) => void,
): number {
    const nextCharacter = sourceText[startIndex + 1];
    if (nextCharacter === "(") {
        push({ type: "arrayOpen" });
        return startIndex + 2;
    }
    if (nextCharacter === "'") {
        const { text, nextIndex } = readQuotedString(sourceText, startIndex + 1);
        push({ type: "symbol", value: text });
        return nextIndex;
    }
    if (nextCharacter && /[A-Za-z0-9_]/.test(nextCharacter)) {
        let endIndex = startIndex + 1;
        while (
            endIndex < sourceText.length &&
            /[A-Za-z0-9_:]/.test(sourceText[endIndex] as string)
        ) {
            endIndex += 1;
        }
        push({ type: "symbol", value: sourceText.slice(startIndex + 1, endIndex) });
        return endIndex;
    }
    throw new Error("Malformed symbol literal");
}
function readSignedNumber(
    sourceText: string,
    startIndex: number,
): { token: StToken; nextIndex: number } | undefined {
    if (!/\d/.test(sourceText[startIndex + 1] ?? "")) {
        return undefined;
    }
    const unsigned = readUnsignedNumber(sourceText, startIndex + 1);
    if (unsigned.token.type === "integer") {
        return {
            token: { type: "integer", value: -unsigned.token.value },
            nextIndex: unsigned.nextIndex,
        };
    }
    if (unsigned.token.type === "float") {
        return {
            token: { type: "float", value: -unsigned.token.value },
            nextIndex: unsigned.nextIndex,
        };
    }
    return undefined;
}
function readUnsignedNumber(
    sourceText: string,
    startIndex: number,
): { token: StToken; nextIndex: number } {
    let endIndex = startIndex;
    while (endIndex < sourceText.length && /\d/.test(sourceText[endIndex] as string)) {
        endIndex += 1;
    }
    if (sourceText[endIndex] === "." && /\d/.test(sourceText[endIndex + 1] ?? "")) {
        endIndex += 1;
        while (endIndex < sourceText.length && /\d/.test(sourceText[endIndex] as string)) {
            endIndex += 1;
        }
        return {
            token: {
                type: "float",
                value: Number.parseFloat(sourceText.slice(startIndex, endIndex)),
            },
            nextIndex: endIndex,
        };
    }
    return {
        token: {
            type: "integer",
            value: Number.parseInt(sourceText.slice(startIndex, endIndex), 10),
        },
        nextIndex: endIndex,
    };
}
class SmalltalkEvaluator {
    private readonly dependencies: SmalltalkEvaluatorDependencies;
    private readonly globals: StScope;
    private readonly files: Map<string, string>;
    constructor(dependencies: SmalltalkEvaluatorDependencies) {
        this.dependencies = dependencies;
        this.files = new Map(dependencies.userFiles);
        this.globals = { variables: new Map(), parent: undefined };
        this.installGlobals();
    }
    run(sourceText: string): void {
        try {
            this.evaluateSource(sourceText);
        } catch (signal) {
            if (signal instanceof StReturnSignal) {
                return;
            }
            throw signal;
        }
    }
    evaluateSource(sourceText: string): StValue {
        const statements = new StParser(sourceText).parseProgram();
        let lastValue: StValue = { kind: "nil" };
        try {
            for (const statement of statements) {
                lastValue = this.evaluateNode(statement, this.globals);
            }
        } catch (signal) {
            if (signal instanceof StReturnSignal) {
                return signal.returnValue;
            }
            throw signal;
        }
        return lastValue;
    }
    private installGlobals(): void {
        const variables = this.globals.variables;
        variables.set("true", { kind: "boolean", value: true });
        variables.set("false", { kind: "boolean", value: false });
        variables.set("nil", { kind: "nil" });
        variables.set("Transcript", { kind: "transcript" });
        variables.set("StandardInput", { kind: "standardInput" });
        variables.set("SmalltalkArguments", {
            kind: "array",
            items: this.dependencies.programArguments.map((argument) => ({
                kind: "string" as const,
                value: argument,
            })),
        });
        for (const className of [
            "FileStream",
            "Compiler",
            "Smalltalk",
            "Object",
            "Integer",
            "Float",
            "String",
            "Symbol",
            "Character",
            "Array",
            "BlockClosure",
        ]) {
            variables.set(className, { kind: "class", name: className });
        }
    }
    private evaluateNode(node: StNode, scope: StScope): StValue {
        switch (node.kind) {
            case "literal": {
                return node.value;
            }
            case "variable": {
                return this.lookupVariable(node.name, scope);
            }
            case "assignment": {
                const value = this.evaluateNode(node.value, scope);
                this.assignVariable(node.name, value, scope);
                return value;
            }
            case "block": {
                return {
                    kind: "block",
                    parameters: node.parameters,
                    temporaries: node.temporaries,
                    body: node.body,
                    scope,
                };
            }
            case "return": {
                throw new StReturnSignal(this.evaluateNode(node.value, scope));
            }
            case "dynamicArray": {
                return {
                    kind: "array",
                    items: node.elements.map((element) => this.evaluateNode(element, scope)),
                };
            }
            case "parenthesized": {
                return this.evaluateNode(node.value, scope);
            }
            case "send": {
                const receiverValue = this.evaluateNode(node.receiver, scope);
                let result = receiverValue;
                for (const message of node.messages) {
                    const argumentValues = message.arguments.map((argument) =>
                        this.evaluateNode(argument, scope),
                    );
                    result = this.sendMessage(receiverValue, message.selector, argumentValues);
                }
                return result;
            }
        }
    }
    private lookupVariable(name: string, scope: StScope): StValue {
        let current: StScope | undefined = scope;
        while (current) {
            const value = current.variables.get(name);
            if (value !== undefined) {
                return value;
            }
            current = current.parent;
        }
        throw new Error(`Unknown variable: ${name}`);
    }
    private assignVariable(name: string, value: StValue, scope: StScope): void {
        let current: StScope | undefined = scope;
        while (current) {
            if (current.variables.has(name)) {
                current.variables.set(name, value);
                return;
            }
            current = current.parent;
        }
        scope.variables.set(name, value);
    }
    private sendMessage(
        receiver: StValue,
        selector: string,
        argumentValues: Array<StValue>,
    ): StValue {
        switch (receiver.kind) {
            case "integer":
            case "float": {
                return this.sendToNumber(receiver, selector, argumentValues);
            }
            case "string": {
                return this.sendToString(receiver, selector, argumentValues);
            }
            case "symbol": {
                return this.sendToSymbol(receiver, selector, argumentValues);
            }
            case "character": {
                return this.sendToCharacter(receiver, selector, argumentValues);
            }
            case "array": {
                return this.sendToArray(receiver, selector, argumentValues);
            }
            case "block": {
                return this.sendToBlock(receiver, selector, argumentValues);
            }
            case "boolean": {
                return this.sendToBoolean(receiver, selector, argumentValues);
            }
            case "nil": {
                return this.sendToNil(receiver, selector, argumentValues);
            }
            case "transcript": {
                return this.sendToTranscript(receiver, selector, argumentValues);
            }
            case "standardInput": {
                return this.sendToStandardInput(receiver, selector, argumentValues);
            }
            case "stream": {
                return this.sendToStream(receiver, selector, argumentValues);
            }
            case "class": {
                return this.sendToClass(receiver, selector, argumentValues);
            }
        }
    }
    private sendToCommon(
        receiver: StValue,
        selector: string,
        args: Array<StValue>,
    ): StValue | undefined {
        switch (selector) {
            case "=": {
                const other = args[0];
                return this.booleanValue(other !== undefined && this.valuesEqual(receiver, other));
            }
            case "~=": {
                const other = args[0];
                return this.booleanValue(other === undefined || !this.valuesEqual(receiver, other));
            }
            case "isNil": {
                return this.booleanValue(false);
            }
            case "notNil": {
                return this.booleanValue(true);
            }
            case "yourself": {
                return receiver;
            }
            case "printString": {
                return { kind: "string", value: this.printString(receiver) };
            }
            case "displayString": {
                return { kind: "string", value: this.displayString(receiver) };
            }
            case "class": {
                return { kind: "class", name: this.classNameOf(receiver) };
            }
            default: {
                return undefined;
            }
        }
    }
    private sendToNumber(receiver: StNumber, selector: string, args: Array<StValue>): StValue {
        if (selector === "=" || selector === "~=") {
            const other = args[0];
            const equal = other !== undefined && isNumber(other) && other.value === receiver.value;
            return this.booleanValue(selector === "=" ? equal : !equal);
        }
        const commonResult = this.sendToCommon(receiver, selector, args);
        if (commonResult !== undefined) {
            return commonResult;
        }
        if (selector === "+" || selector === "-" || selector === "*") {
            const left = receiver;
            const right = this.requireNumber(args[0], selector);
            const result = this.numericResult(left, right, (a, b) =>
                selector === "+" ? a + b : selector === "-" ? a - b : a * b,
            );
            return result;
        }
        if (selector === "/") {
            const right = this.requireNumber(args[0], selector);
            if (right.value === 0) {
                throw new Error("Division by zero");
            }
            if (
                receiver.kind === "integer" &&
                right.kind === "integer" &&
                receiver.value % right.value === 0
            ) {
                return { kind: "integer", value: receiver.value / right.value };
            }
            return { kind: "float", value: receiver.value / right.value };
        }
        if (selector === "//") {
            const right = this.requireNumber(args[0], selector);
            if (right.value === 0) {
                throw new Error("Division by zero");
            }
            return this.numericResult(receiver, right, (a, b) => Math.floor(a / b));
        }
        if (selector === "\\" || selector === "\\\\") {
            const right = this.requireNumber(args[0], selector);
            if (right.value === 0) {
                throw new Error("Division by zero");
            }
            return this.numericResult(receiver, right, (a, b) => a % b);
        }
        if (selector === "<" || selector === ">" || selector === "<=" || selector === ">=") {
            const right = this.requireNumber(args[0], selector);
            const outcome =
                selector === "<"
                    ? receiver.value < right.value
                    : selector === ">"
                      ? receiver.value > right.value
                      : selector === "<="
                        ? receiver.value <= right.value
                        : receiver.value >= right.value;
            return this.booleanValue(outcome);
        }
        if (selector === "min:") {
            return this.numericResult(receiver, this.requireNumber(args[0], selector), Math.min);
        }
        if (selector === "max:") {
            return this.numericResult(receiver, this.requireNumber(args[0], selector), Math.max);
        }
        switch (selector) {
            case "abs": {
                return { kind: receiver.kind, value: Math.abs(receiver.value) };
            }
            case "negated": {
                return { kind: receiver.kind, value: -receiver.value };
            }
            case "isZero": {
                return this.booleanValue(receiver.value === 0);
            }
            case "even": {
                return this.booleanValue(receiver.value % 2 === 0);
            }
            case "odd": {
                return this.booleanValue(receiver.value % 2 !== 0);
            }
            case "truncated": {
                return { kind: "integer", value: Math.trunc(receiver.value) };
            }
            case "asFloat": {
                return { kind: "float", value: receiver.value };
            }
            case "asInteger": {
                return { kind: "integer", value: Math.trunc(receiver.value) };
            }
            case "asString": {
                return { kind: "string", value: this.displayString(receiver) };
            }
            case "timesRepeat:": {
                const block = this.requireBlock(args[0], selector);
                for (let index = 0; index < Math.trunc(receiver.value); index++) {
                    this.evaluateBlock(block, []);
                }
                return receiver;
            }
            case "to:do:": {
                const limit = this.requireNumber(args[0], selector);
                const block = this.requireBlock(args[1], selector);
                const step = receiver.value <= limit.value ? 1 : -1;
                for (
                    let index = receiver.value;
                    step === 1 ? index <= limit.value : index >= limit.value;
                    index += step
                ) {
                    this.evaluateBlock(block, [{ kind: "integer", value: index }]);
                }
                return receiver;
            }
            case "to:": {
                const limit = this.requireNumber(args[0], selector);
                const step = receiver.value <= limit.value ? 1 : -1;
                const items: Array<StValue> = [];
                for (
                    let index = receiver.value;
                    step === 1 ? index <= limit.value : index >= limit.value;
                    index += step
                ) {
                    items.push({ kind: "integer", value: index });
                }
                return { kind: "array", items };
            }
            case "to:by:do:": {
                const limit = this.requireNumber(args[0], selector);
                const step = this.requireNumber(args[1], selector);
                const block = this.requireBlock(args[2], selector);
                if (step.value === 0) {
                    throw new Error("to:by:do: step must not be zero");
                }
                for (
                    let index = receiver.value;
                    step.value > 0 ? index <= limit.value : index >= limit.value;
                    index += step.value
                ) {
                    this.evaluateBlock(block, [{ kind: "integer", value: index }]);
                }
                return receiver;
            }
            default: {
                throw new Error(`MessageNotUnderstood: ${this.classNameOf(receiver)}>>${selector}`);
            }
        }
    }
    private sendToString(receiver: StString, selector: string, args: Array<StValue>): StValue {
        if (selector === "=" || selector === "~=") {
            const other = args[0];
            const equal =
                other !== undefined && other.kind === "string" && other.value === receiver.value;
            return this.booleanValue(selector === "=" ? equal : !equal);
        }
        const commonResult = this.sendToCommon(receiver, selector, args);
        if (commonResult !== undefined) {
            return commonResult;
        }
        switch (selector) {
            case "size": {
                return { kind: "integer", value: receiver.value.length };
            }
            case "isEmpty": {
                return this.booleanValue(receiver.value.length === 0);
            }
            case "notEmpty": {
                return this.booleanValue(receiver.value.length > 0);
            }
            case "at:": {
                const index = this.requireIndex(args[0], selector, receiver.value.length);
                return { kind: "character", value: receiver.value[index - 1] as string };
            }
            case "first": {
                if (receiver.value.length === 0) {
                    throw new Error("first of an empty string");
                }
                return { kind: "character", value: receiver.value.slice(0, 1) };
            }
            case "last": {
                if (receiver.value.length === 0) {
                    throw new Error("last of an empty string");
                }
                return { kind: "character", value: receiver.value.slice(-1) };
            }
            case ",": {
                const other = args[0] as StValue;
                return {
                    kind: "string",
                    value: receiver.value + this.displayString(other),
                };
            }
            case "asUppercase": {
                return { kind: "string", value: receiver.value.toUpperCase() };
            }
            case "asLowercase": {
                return { kind: "string", value: receiver.value.toLowerCase() };
            }
            case "asString": {
                return receiver;
            }
            case "asSymbol": {
                return { kind: "symbol", value: receiver.value };
            }
            case "asInteger": {
                const trimmed = receiver.value.trim();
                if (!/^-?\d+$/.test(trimmed)) {
                    throw new Error(`asInteger failed for '${receiver.value}'`);
                }
                return { kind: "integer", value: Number.parseInt(trimmed, 10) };
            }
            case "asNumber": {
                const trimmed = receiver.value.trim();
                if (/^-?\d+$/.test(trimmed)) {
                    return { kind: "integer", value: Number.parseInt(trimmed, 10) };
                }
                if (/^-?\d+\.\d+$/.test(trimmed)) {
                    return { kind: "float", value: Number.parseFloat(trimmed) };
                }
                throw new Error(`asNumber failed for '${receiver.value}'`);
            }
            case "reversed": {
                return { kind: "string", value: [...receiver.value].reverse().join("") };
            }
            case "includesSubstring:": {
                const needle = args[0];
                if (!needle || needle.kind !== "string") {
                    throw new Error("includesSubstring: needs a string argument");
                }
                return this.booleanValue(receiver.value.includes(needle.value));
            }
            case "copyFrom:to:": {
                const from = this.requireIndex(args[0], selector, receiver.value.length);
                const to = this.requireIndex(args[1], selector, receiver.value.length);
                return { kind: "string", value: receiver.value.slice(from - 1, to) };
            }
            case "trimmed": {
                return { kind: "string", value: receiver.value.trim() };
            }
            default: {
                throw new Error(`MessageNotUnderstood: String>>${selector}`);
            }
        }
    }
    private sendToSymbol(receiver: StSymbol, selector: string, args: Array<StValue>): StValue {
        if (selector === "=" || selector === "~=") {
            const other = args[0];
            const equal =
                other !== undefined && other.kind === "symbol" && other.value === receiver.value;
            return this.booleanValue(selector === "=" ? equal : !equal);
        }
        const commonResult = this.sendToCommon(receiver, selector, args);
        if (commonResult !== undefined) {
            return commonResult;
        }
        switch (selector) {
            case "asString": {
                return { kind: "string", value: receiver.value };
            }
            case "asSymbol": {
                return receiver;
            }
            default: {
                throw new Error(`MessageNotUnderstood: Symbol>>${selector}`);
            }
        }
    }
    private sendToCharacter(
        receiver: StCharacter,
        selector: string,
        args: Array<StValue>,
    ): StValue {
        if (selector === "=" || selector === "~=") {
            const other = args[0];
            const equal =
                other !== undefined && other.kind === "character" && other.value === receiver.value;
            return this.booleanValue(selector === "=" ? equal : !equal);
        }
        const commonResult = this.sendToCommon(receiver, selector, args);
        if (commonResult !== undefined) {
            return commonResult;
        }
        switch (selector) {
            case "codePoint": {
                return { kind: "integer", value: receiver.value.codePointAt(0) as number };
            }
            case "asString": {
                return { kind: "string", value: receiver.value };
            }
            case "asUppercase": {
                return { kind: "character", value: receiver.value.toUpperCase() };
            }
            default: {
                throw new Error(`MessageNotUnderstood: Character>>${selector}`);
            }
        }
    }
    private sendToArray(receiver: StArray, selector: string, args: Array<StValue>): StValue {
        if (selector === "=" || selector === "~=") {
            const other = args[0];
            const equal = other !== undefined && this.valuesEqual(receiver, other);
            return this.booleanValue(selector === "=" ? equal : !equal);
        }
        const commonResult = this.sendToCommon(receiver, selector, args);
        if (commonResult !== undefined) {
            return commonResult;
        }
        switch (selector) {
            case "size": {
                return { kind: "integer", value: receiver.items.length };
            }
            case "isEmpty": {
                return this.booleanValue(receiver.items.length === 0);
            }
            case "notEmpty": {
                return this.booleanValue(receiver.items.length > 0);
            }
            case "at:": {
                const index = this.requireIndex(args[0], selector, receiver.items.length);
                return receiver.items[index - 1] as StValue;
            }
            case "at:put:": {
                const index = this.requireIndex(args[0], selector, receiver.items.length);
                const value = args[1] as StValue;
                receiver.items[index - 1] = value;
                return value;
            }
            case "first": {
                if (receiver.items.length === 0) {
                    throw new Error("first of an empty collection");
                }
                return receiver.items[0] as StValue;
            }
            case "last": {
                if (receiver.items.length === 0) {
                    throw new Error("last of an empty collection");
                }
                return receiver.items[receiver.items.length - 1] as StValue;
            }
            case "do:": {
                const block = this.requireBlock(args[0], selector);
                for (const item of receiver.items) {
                    this.evaluateBlock(block, [item]);
                }
                return receiver;
            }
            case "collect:": {
                const block = this.requireBlock(args[0], selector);
                return {
                    kind: "array",
                    items: receiver.items.map((item) => this.evaluateBlock(block, [item])),
                };
            }
            case "select:": {
                const block = this.requireBlock(args[0], selector);
                return {
                    kind: "array",
                    items: receiver.items.filter((item) =>
                        this.requireBoolean(this.evaluateBlock(block, [item]), "select:"),
                    ),
                };
            }
            case "reject:": {
                const block = this.requireBlock(args[0], selector);
                return {
                    kind: "array",
                    items: receiver.items.filter(
                        (item) =>
                            !this.requireBoolean(this.evaluateBlock(block, [item]), "reject:"),
                    ),
                };
            }
            case "inject:into:": {
                const initial = args[0] as StValue;
                const block = this.requireBlock(args[1], selector);
                let accumulator = initial;
                for (const item of receiver.items) {
                    accumulator = this.evaluateBlock(block, [accumulator, item]);
                }
                return accumulator;
            }
            case "includes:": {
                const needle = args[0] as StValue;
                return this.booleanValue(
                    receiver.items.some((item) => this.valuesEqual(item, needle)),
                );
            }
            case "reversed": {
                return { kind: "array", items: [...receiver.items].reverse() };
            }
            case "copyFrom:to:": {
                const from = this.requireIndex(args[0], selector, receiver.items.length);
                const to = this.requireIndex(args[1], selector, receiver.items.length);
                return { kind: "array", items: receiver.items.slice(from - 1, to) };
            }
            case "copy": {
                return { kind: "array", items: [...receiver.items] };
            }
            default: {
                throw new Error(`MessageNotUnderstood: Array>>${selector}`);
            }
        }
    }
    private sendToBlock(receiver: StBlock, selector: string, args: Array<StValue>): StValue {
        const commonResult = this.sendToCommon(receiver, selector, args);
        if (commonResult !== undefined) {
            return commonResult;
        }
        switch (selector) {
            case "value": {
                return this.evaluateBlock(receiver, []);
            }
            case "value:": {
                return this.evaluateBlock(receiver, [args[0] as StValue]);
            }
            case "value:value:": {
                return this.evaluateBlock(receiver, [args[0] as StValue, args[1] as StValue]);
            }
            case "value:value:value:": {
                return this.evaluateBlock(receiver, [
                    args[0] as StValue,
                    args[1] as StValue,
                    args[2] as StValue,
                ]);
            }
            case "whileTrue:": {
                const body = this.requireBlock(args[0], selector);
                while (this.requireBoolean(this.evaluateBlock(receiver, []), "whileTrue:")) {
                    this.evaluateBlock(body, []);
                }
                return { kind: "nil" };
            }
            case "whileFalse:": {
                const body = this.requireBlock(args[0], selector);
                while (!this.requireBoolean(this.evaluateBlock(receiver, []), "whileFalse:")) {
                    this.evaluateBlock(body, []);
                }
                return { kind: "nil" };
            }
            case "whileTrue": {
                while (this.requireBoolean(this.evaluateBlock(receiver, []), "whileTrue")) {
                    continue;
                }
                return { kind: "nil" };
            }
            case "whileFalse": {
                while (!this.requireBoolean(this.evaluateBlock(receiver, []), "whileFalse")) {
                    continue;
                }
                return { kind: "nil" };
            }
            case "repeat": {
                for (;;) {
                    this.evaluateBlock(receiver, []);
                }
            }
            default: {
                throw new Error(`MessageNotUnderstood: BlockClosure>>${selector}`);
            }
        }
    }
    private sendToBoolean(receiver: StBoolean, selector: string, args: Array<StValue>): StValue {
        if (selector === "=" || selector === "~=") {
            const other = args[0];
            const equal =
                other !== undefined && other.kind === "boolean" && other.value === receiver.value;
            return this.booleanValue(selector === "=" ? equal : !equal);
        }
        const commonResult = this.sendToCommon(receiver, selector, args);
        if (commonResult !== undefined) {
            return commonResult;
        }
        switch (selector) {
            case "ifTrue:": {
                return receiver.value
                    ? this.evaluateBlock(this.requireBlock(args[0], selector), [])
                    : { kind: "nil" };
            }
            case "ifFalse:": {
                return receiver.value
                    ? { kind: "nil" }
                    : this.evaluateBlock(this.requireBlock(args[0], selector), []);
            }
            case "ifTrue:ifFalse:": {
                return receiver.value
                    ? this.evaluateBlock(this.requireBlock(args[0], selector), [])
                    : this.evaluateBlock(this.requireBlock(args[1], selector), []);
            }
            case "ifFalse:ifTrue:": {
                return receiver.value
                    ? this.evaluateBlock(this.requireBlock(args[1], selector), [])
                    : this.evaluateBlock(this.requireBlock(args[0], selector), []);
            }
            case "not": {
                return this.booleanValue(!receiver.value);
            }
            case "&": {
                return this.booleanValue(
                    receiver.value && this.requireBoolean(args[0] as StValue, "&"),
                );
            }
            case "|": {
                return this.booleanValue(
                    receiver.value || this.requireBoolean(args[0] as StValue, "|"),
                );
            }
            case "and:": {
                return this.booleanValue(
                    receiver.value &&
                        this.requireBoolean(
                            this.evaluateBlock(this.requireBlock(args[0], selector), []),
                            "and:",
                        ),
                );
            }
            case "or:": {
                return this.booleanValue(
                    receiver.value ||
                        this.requireBoolean(
                            this.evaluateBlock(this.requireBlock(args[0], selector), []),
                            "or:",
                        ),
                );
            }
            case "asString": {
                return { kind: "string", value: receiver.value ? "true" : "false" };
            }
            default: {
                throw new Error(`MessageNotUnderstood: Boolean>>${selector}`);
            }
        }
    }
    private sendToNil(receiver: StNil, selector: string, args: Array<StValue>): StValue {
        if (selector === "=" || selector === "~=") {
            const other = args[0];
            const equal = other !== undefined && other.kind === "nil";
            return this.booleanValue(selector === "=" ? equal : !equal);
        }
        if (selector === "isNil") {
            return this.booleanValue(true);
        }
        if (selector === "notNil") {
            return this.booleanValue(false);
        }
        const commonResult = this.sendToCommon(receiver, selector, args);
        if (commonResult !== undefined) {
            return commonResult;
        }
        switch (selector) {
            case "ifNil:": {
                return this.evaluateBlock(this.requireBlock(args[0], selector), []);
            }
            case "ifNotNil:": {
                return receiver;
            }
            case "ifNil:ifNotNil:": {
                return this.evaluateBlock(this.requireBlock(args[0], selector), []);
            }
            case "ifNotNil:ifNil:": {
                return this.evaluateBlock(this.requireBlock(args[1], selector), []);
            }
            case "asString": {
                return { kind: "string", value: "nil" };
            }
            default: {
                throw new Error(`MessageNotUnderstood: UndefinedObject>>${selector}`);
            }
        }
    }
    private sendToTranscript(
        receiver: StTranscript,
        selector: string,
        args: Array<StValue>,
    ): StValue {
        switch (selector) {
            case "show:": {
                this.dependencies.appendOutput(this.displayString(args[0] as StValue));
                return receiver;
            }
            case "showCr:": {
                this.dependencies.appendOutput(`${this.displayString(args[0] as StValue)}\n`);
                return receiver;
            }
            case "cr": {
                this.dependencies.appendOutput("\n");
                return receiver;
            }
            case "tab": {
                this.dependencies.appendOutput("\t");
                return receiver;
            }
            case "space": {
                this.dependencies.appendOutput(" ");
                return receiver;
            }
            default: {
                throw new Error(`MessageNotUnderstood: Transcript>>${selector}`);
            }
        }
    }
    private sendToStandardInput(
        receiver: StStandardInput,
        selector: string,
        _args: Array<StValue>,
    ): StValue {
        switch (selector) {
            case "nextLine": {
                return { kind: "string", value: this.dependencies.readLine() };
            }
            default: {
                throw new Error(`MessageNotUnderstood: StandardInput>>${selector}`);
            }
        }
    }
    private sendToStream(receiver: StStream, selector: string, args: Array<StValue>): StValue {
        switch (selector) {
            case "contentsOfEntireFile": {
                this.requireStreamMode(receiver, "read", selector);
                return { kind: "string", value: receiver.buffer };
            }
            case "nextLine": {
                this.requireStreamMode(receiver, "read", selector);
                const nextBreak = receiver.buffer.indexOf("\n", receiver.position);
                if (nextBreak < 0) {
                    const remaining = receiver.buffer.slice(receiver.position);
                    receiver.position = receiver.buffer.length;
                    return { kind: "string", value: remaining };
                }
                const line = receiver.buffer.slice(receiver.position, nextBreak);
                receiver.position = nextBreak + 1;
                return { kind: "string", value: line };
            }
            case "nextPutAll:": {
                this.requireStreamMode(receiver, "write", selector);
                receiver.buffer += this.displayString(args[0] as StValue);
                return receiver;
            }
            case "cr": {
                this.requireStreamMode(receiver, "write", selector);
                receiver.buffer += "\n";
                return receiver;
            }
            case "close": {
                if (receiver.mode === "write") {
                    this.files.set(receiver.path, receiver.buffer);
                }
                return receiver;
            }
            case "printString": {
                return { kind: "string", value: "a FileStream" };
            }
            default: {
                throw new Error(`MessageNotUnderstood: FileStream>>${selector}`);
            }
        }
    }
    private sendToClass(receiver: StClass, selector: string, args: Array<StValue>): StValue {
        switch (selector) {
            case "name": {
                return { kind: "string", value: receiver.name };
            }
            case "=": {
                const other = args[0];
                return this.booleanValue(
                    other !== undefined && other.kind === "class" && other.name === receiver.name,
                );
            }
            case "~=": {
                const other = args[0];
                return this.booleanValue(
                    other === undefined || other.kind !== "class" || other.name !== receiver.name,
                );
            }
            case "printString":
            case "displayString": {
                return { kind: "string", value: receiver.name };
            }
            default: {
                return this.sendClassSideMessage(receiver, selector, args);
            }
        }
    }
    private sendClassSideMessage(
        receiver: StClass,
        selector: string,
        args: Array<StValue>,
    ): StValue {
        if (receiver.name === "FileStream") {
            if (selector === "readOnlyFileNamed:") {
                const path = this.requirePath(args[0], selector);
                const contents = this.files.get(path);
                if (contents === undefined) {
                    throw new Error(`File does not exist: ${path}`);
                }
                return { kind: "stream", path, mode: "read", buffer: contents, position: 0 };
            }
            if (selector === "fileNamed:") {
                const path = this.requirePath(args[0], selector);
                return { kind: "stream", path, mode: "write", buffer: "", position: 0 };
            }
        }
        if (receiver.name === "Compiler" && selector === "evaluate:") {
            const sourceArgument = args[0];
            if (sourceArgument === undefined || sourceArgument.kind !== "string") {
                throw new Error("Compiler evaluate: needs a string");
            }
            return this.evaluateSource(sourceArgument.value);
        }
        if (receiver.name === "Smalltalk") {
            if (selector === "at:") {
                const key = this.requireGlobalName(args[0], selector);
                const value = this.globals.variables.get(key);
                if (value === undefined) {
                    throw new Error(`Global not found: ${key}`);
                }
                return value;
            }
            if (selector === "at:put:") {
                const key = this.requireGlobalName(args[0], selector);
                const value = args[1] as StValue;
                this.globals.variables.set(key, value);
                return value;
            }
            if (selector === "at:ifAbsent:") {
                const key = this.requireGlobalName(args[0], selector);
                const value = this.globals.variables.get(key);
                if (value !== undefined) {
                    return value;
                }
                return this.evaluateBlock(this.requireBlock(args[1], selector), []);
            }
        }
        throw new Error(`MessageNotUnderstood: ${receiver.name} class>>${selector}`);
    }
    private evaluateBlock(block: StBlock, argumentValues: Array<StValue>): StValue {
        if (block.parameters.length !== argumentValues.length) {
            throw new Error(
                `Block expected ${block.parameters.length} arguments but got ${argumentValues.length}`,
            );
        }
        const blockScope: StScope = { variables: new Map(), parent: block.scope };
        block.parameters.forEach((parameter, index) => {
            blockScope.variables.set(parameter, argumentValues[index] as StValue);
        });
        for (const temporary of block.temporaries) {
            blockScope.variables.set(temporary, { kind: "nil" });
        }
        let lastValue: StValue = { kind: "nil" };
        for (const statement of block.body) {
            lastValue = this.evaluateNode(statement, blockScope);
        }
        return lastValue;
    }
    private printString(value: StValue): string {
        switch (value.kind) {
            case "integer": {
                return String(value.value);
            }
            case "float": {
                return String(value.value);
            }
            case "string": {
                return `'${value.value.replace(/'/g, "''")}'`;
            }
            case "symbol": {
                return `#${value.value}`;
            }
            case "character": {
                return `$${value.value}`;
            }
            case "boolean": {
                return value.value ? "true" : "false";
            }
            case "nil": {
                return "nil";
            }
            case "array": {
                return `(${value.items.map((item) => this.printString(item)).join(" ")})`;
            }
            case "block": {
                return "a BlockClosure";
            }
            case "class": {
                return value.name;
            }
            default: {
                return "a FileStream";
            }
        }
    }
    private displayString(value: StValue): string {
        switch (value.kind) {
            case "string": {
                return value.value;
            }
            case "symbol": {
                return value.value;
            }
            case "character": {
                return value.value;
            }
            default: {
                return this.printString(value);
            }
        }
    }
    private classNameOf(value: StValue): string {
        switch (value.kind) {
            case "integer": {
                return "Integer";
            }
            case "float": {
                return "Float";
            }
            case "string": {
                return "String";
            }
            case "symbol": {
                return "Symbol";
            }
            case "character": {
                return "Character";
            }
            case "array": {
                return "Array";
            }
            case "block": {
                return "BlockClosure";
            }
            case "boolean": {
                return "Boolean";
            }
            case "nil": {
                return "UndefinedObject";
            }
            case "transcript": {
                return "Transcript";
            }
            case "standardInput": {
                return "StandardInput";
            }
            case "stream": {
                return "FileStream";
            }
            case "class": {
                return "Class";
            }
        }
    }
    private valuesEqual(left: StValue, right: StValue): boolean {
        if (isNumber(left) && isNumber(right)) {
            return left.value === right.value;
        }
        if (left.kind !== right.kind) {
            return false;
        }
        switch (left.kind) {
            case "string": {
                return right.kind === "string" && left.value === right.value;
            }
            case "symbol": {
                return right.kind === "symbol" && left.value === right.value;
            }
            case "character": {
                return right.kind === "character" && left.value === right.value;
            }
            case "boolean": {
                return right.kind === "boolean" && left.value === right.value;
            }
            case "nil": {
                return true;
            }
            case "array": {
                if (right.kind !== "array" || left.items.length !== right.items.length) {
                    return false;
                }
                return left.items.every((item, index) =>
                    this.valuesEqual(item, right.items[index] as StValue),
                );
            }
            case "class": {
                return right.kind === "class" && left.name === right.name;
            }
            default: {
                return left === right;
            }
        }
    }
    private numericResult(
        left: StNumber,
        right: StNumber,
        operation: (a: number, b: number) => number,
        forceFloat = false,
    ): StValue {
        const result = operation(left.value, right.value);
        if (!forceFloat && left.kind === "integer" && right.kind === "integer") {
            return { kind: "integer", value: result };
        }
        return { kind: "float", value: result };
    }
    private requireNumber(candidate: StValue | undefined, selector: string): StNumber {
        if (!candidate || !isNumber(candidate)) {
            throw new Error(`${selector} needs a number argument`);
        }
        return candidate;
    }
    private requireIndex(candidate: StValue | undefined, selector: string, size: number): number {
        const number = this.requireNumber(candidate, selector);
        const index = Math.trunc(number.value);
        if (index < 1 || index > size) {
            throw new Error(`Index ${index} is outside 1 to ${size}`);
        }
        return index;
    }
    private requireBlock(candidate: StValue | undefined, selector: string): StBlock {
        if (!candidate || candidate.kind !== "block") {
            throw new Error(`${selector} needs a block argument`);
        }
        return candidate;
    }
    private requireBoolean(candidate: StValue, context: string): boolean {
        if (candidate.kind !== "boolean") {
            throw new Error(`${context} needs a boolean but got ${this.printString(candidate)}`);
        }
        return candidate.value;
    }
    private requirePath(candidate: StValue | undefined, selector: string): string {
        if (!candidate || candidate.kind !== "string") {
            throw new Error(`${selector} needs a file name string`);
        }
        return candidate.value;
    }
    private requireGlobalName(candidate: StValue | undefined, selector: string): string {
        if (candidate?.kind === "symbol") {
            return candidate.value;
        }
        if (candidate?.kind === "string") {
            return candidate.value;
        }
        throw new Error(`${selector} needs a symbol or string key`);
    }
    private requireStreamMode(receiver: StStream, mode: "read" | "write", selector: string): void {
        if (receiver.mode !== mode) {
            throw new Error(`${selector} needs a ${mode} stream`);
        }
    }
    private booleanValue(value: boolean): StBoolean {
        return { kind: "boolean", value };
    }
}
function isNumber(candidate: StValue): candidate is StNumber {
    return candidate.kind === "integer" || candidate.kind === "float";
}
export { SmalltalkEvaluator, StReturnSignal };
export type { SmalltalkEvaluatorDependencies, StValue };
