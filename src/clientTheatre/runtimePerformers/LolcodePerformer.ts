import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { SessionUserFilesClient } from "@clientTheatre/runtimePerformers/SessionUserFilesClient.ts";
import {
    TerminalInputNeededSignal,
    isTerminalInputNeeded,
} from "@clientTheatre/runtimePerformers/ReplayableStdinFile.ts";
import { ReplayOutputTracker } from "@clientTheatre/runtimePerformers/ReplayOutputTracker.ts";
const MAXIMUM_REPLAY_INPUTS = 1000;
const LOLCODE_LOOP_ITERATION_LIMIT = 200_000;
const LOLCODE_BINARY_OPERATORS: ReadonlySet<string> = new Set([
    "SUM OF",
    "DIFF OF",
    "PRODUKT OF",
    "QUOSHUNT OF",
    "MOD OF",
    "BIGGR OF",
    "SMALLR OF",
    "BOTH SAEM",
    "DIFFRINT",
]);
type LolcodeValue = number | string | boolean;
type LolcodeExpression =
    | { kind: "literal"; value: LolcodeValue; line: number }
    | { kind: "variable"; name: string; line: number }
    | {
          kind: "call";
          operator: string;
          operands: ReadonlyArray<LolcodeExpression>;
          line: number;
      };
type LolcodeStatement =
    | { kind: "declare"; name: string; expression?: LolcodeExpression; line: number }
    | { kind: "assign"; name: string; expression: LolcodeExpression; line: number }
    | {
          kind: "visible";
          expressions: ReadonlyArray<LolcodeExpression>;
          suppressNewline: boolean;
          line: number;
      }
    | { kind: "gimmeh"; name: string; line: number }
    | { kind: "expression"; expression: LolcodeExpression; line: number }
    | {
          kind: "if";
          consequent: ReadonlyArray<LolcodeStatement>;
          alternative: ReadonlyArray<LolcodeStatement>;
          line: number;
      }
    | {
          kind: "loop";
          label: string;
          counterName?: string;
          counterOperation?: "UPPIN" | "NERFIN";
          conditionKind?: "TIL" | "WILE";
          condition?: LolcodeExpression;
          body: ReadonlyArray<LolcodeStatement>;
          line: number;
      };
interface LolcodeInputSource {
    readLine(): string;
}
interface LolcodeOutputSink {
    writeText(text: string): void;
}
interface LolcodeSourceLine {
    tokens: ReadonlyArray<string>;
    lineNumber: number;
}
function upperTokens(tokens: ReadonlyArray<string>): ReadonlyArray<string> {
    return tokens.map((token) => token.toUpperCase());
}
class LolcodeExpressionParser {
    private readonly tokens: ReadonlyArray<string>;
    private readonly upper: ReadonlyArray<string>;
    private readonly lineNumber: number;
    private position: number = 0;
    constructor(tokens: ReadonlyArray<string>, lineNumber: number) {
        this.tokens = tokens;
        this.upper = upperTokens(tokens);
        this.lineNumber = lineNumber;
    }
    parseExpression(): LolcodeExpression {
        const token = this.tokens[this.position];
        if (token === undefined) {
            this.fail("expression expected");
        }
        const upperToken = this.upper[this.position] as string;
        const binaryOperator = this.matchBinaryOperator();
        if (upperToken === "SMOOSH") {
            this.position += 1;
            const operands: Array<LolcodeExpression> = [];
            while (this.position < this.tokens.length) {
                const nextUpper = this.upper[this.position] as string;
                if (nextUpper === "MKAY") {
                    this.position += 1;
                    break;
                }
                if (nextUpper === "AN") {
                    this.position += 1;
                    continue;
                }
                operands.push(this.parseExpression());
            }
            return { kind: "call", operator: "SMOOSH", operands, line: this.lineNumber };
        }
        if (binaryOperator !== undefined) {
            this.position += binaryOperator.split(" ").length;
            const leftOperand = this.parseExpression();
            this.expectKeyword("AN");
            const rightOperand = this.parseExpression();
            return {
                kind: "call",
                operator: binaryOperator,
                operands: [leftOperand, rightOperand],
                line: this.lineNumber,
            };
        }
        this.position += 1;
        if (token.startsWith('"')) {
            return { kind: "literal", value: this.decodeYarn(token), line: this.lineNumber };
        }
        if (/^[+-]?\d+(\.\d+)?$/.test(token)) {
            return { kind: "literal", value: Number(token), line: this.lineNumber };
        }
        if (upperToken === "WIN") {
            return { kind: "literal", value: true, line: this.lineNumber };
        }
        if (upperToken === "FAIL") {
            return { kind: "literal", value: false, line: this.lineNumber };
        }
        if (upperToken === "NOOB") {
            this.fail("NOOB is not supported by this interpreter");
        }
        return { kind: "variable", name: upperToken, line: this.lineNumber };
    }
    private matchBinaryOperator(): string | undefined {
        const singleTokenKeyword = this.upper[this.position] as string;
        if (singleTokenKeyword === "DIFFRINT") {
            return "DIFFRINT";
        }
        const twoTokenKeyword = `${singleTokenKeyword} ${this.upper[this.position + 1]}`;
        if (LOLCODE_BINARY_OPERATORS.has(twoTokenKeyword)) {
            return twoTokenKeyword;
        }
        return undefined;
    }
    expectDone(): void {
        if (this.position < this.tokens.length) {
            this.fail(`unexpected tokens '${this.tokens.slice(this.position).join(" ")}'`);
        }
    }
    isDone(): boolean {
        return this.position >= this.tokens.length;
    }
    consumeIfKeyword(keyword: string): boolean {
        if (this.upper[this.position] === keyword) {
            this.position += 1;
            return true;
        }
        return false;
    }
    private expectKeyword(keyword: string): void {
        if (this.upper[this.position] !== keyword) {
            this.fail(
                `expected '${keyword}' but found '${this.tokens[this.position] ?? "nothing"}'`,
            );
        }
        this.position += 1;
    }
    private decodeYarn(token: string): string {
        const innerText = token.slice(1, -1);
        let decodedText = "";
        for (let index = 0; index < innerText.length; index += 1) {
            const character = innerText[index];
            const escapedCharacter = innerText[index + 1];
            if (
                character === ":" &&
                (escapedCharacter === ":" || escapedCharacter === ">" || escapedCharacter === '"')
            ) {
                if (escapedCharacter === ":") {
                    decodedText += ":";
                } else if (escapedCharacter === ">") {
                    decodedText += "\t";
                } else {
                    decodedText += "\n";
                }
                index += 1;
                continue;
            }
            decodedText += character;
        }
        return decodedText;
    }
    private fail(message: string): never {
        throw new Error(`LOLCODE line ${this.lineNumber}: ${message}.`);
    }
}
class LolcodeProgramParser {
    private lines: ReadonlyArray<LolcodeSourceLine> = [];
    private lineIndex: number = 0;
    parse(sourceText: string): ReadonlyArray<LolcodeStatement> {
        this.lines = this.preprocess(sourceText);
        this.lineIndex = 0;
        const firstLine = this.lines[0];
        if (firstLine === undefined || (firstLine.tokens[0] ?? "").toUpperCase() !== "HAI") {
            throw new Error("LOLCODE line 1: a program must start with HAI.");
        }
        this.lineIndex += 1;
        const statements = this.parseBlock((tokens) => tokens[0] === "KTHXBYE");
        const closingLine = this.lines[this.lineIndex];
        if (closingLine === undefined || closingLine.tokens[0] !== "KTHXBYE") {
            throw new Error("LOLCODE: a program must end with KTHXBYE.");
        }
        this.lineIndex += 1;
        if (this.lineIndex < this.lines.length) {
            const extraLine = this.lines[this.lineIndex] as LolcodeSourceLine;
            throw new Error(
                `LOLCODE line ${extraLine.lineNumber}: content after KTHXBYE is not allowed.`,
            );
        }
        return statements;
    }
    private preprocess(sourceText: string): ReadonlyArray<LolcodeSourceLine> {
        const rawLines = sourceText.replace(/\r\n?/g, "\n").split("\n");
        const sourceLines: Array<LolcodeSourceLine> = [];
        let inBlockComment = false;
        for (let index = 0; index < rawLines.length; index += 1) {
            let processedText = rawLines[index] as string;
            if (inBlockComment) {
                const closeIndex = processedText.search(/\bTLDR\b/i);
                if (closeIndex < 0) {
                    continue;
                }
                processedText = processedText.slice(closeIndex + 4);
                inBlockComment = false;
            }
            const openMatch = /\bOBTW\b/i.exec(processedText);
            if (openMatch) {
                const afterOpenText = processedText.slice(openMatch.index + 4);
                const closeMatch = /\bTLDR\b/i.exec(afterOpenText);
                if (closeMatch) {
                    processedText =
                        processedText.slice(0, openMatch.index) +
                        afterOpenText.slice(closeMatch.index + 4);
                } else {
                    processedText = processedText.slice(0, openMatch.index);
                    inBlockComment = true;
                }
            }
            const commentMatch = /\bBTW\b/i.exec(processedText);
            if (commentMatch) {
                processedText = processedText.slice(0, commentMatch.index);
            }
            if (processedText.trim().length === 0) {
                continue;
            }
            sourceLines.push({
                tokens: this.tokenize(processedText),
                lineNumber: index + 1,
            });
        }
        return sourceLines;
    }
    private tokenize(lineText: string): ReadonlyArray<string> {
        const tokens: Array<string> = [];
        let index = 0;
        while (index < lineText.length) {
            const character = lineText[index] as string;
            if (/\s/.test(character)) {
                index += 1;
                continue;
            }
            if (character === '"') {
                let token = '"';
                index += 1;
                let closed = false;
                while (index < lineText.length) {
                    const innerCharacter = lineText[index] as string;
                    if (innerCharacter === ":" && index + 1 < lineText.length) {
                        const escapedCharacter = lineText[index + 1] as string;
                        if (escapedCharacter === '"' || escapedCharacter === ":") {
                            token += innerCharacter + escapedCharacter;
                            index += 2;
                            continue;
                        }
                    }
                    if (innerCharacter === '"') {
                        closed = true;
                        index += 1;
                        break;
                    }
                    token += innerCharacter;
                    index += 1;
                }
                if (!closed) {
                    throw new Error("LOLCODE: unterminated YARN literal.");
                }
                tokens.push(`${token}"`);
                continue;
            }
            let token = "";
            while (index < lineText.length && !/\s/.test(lineText[index] as string)) {
                token += lineText[index];
                index += 1;
            }
            tokens.push(token);
        }
        return tokens;
    }
    private parseBlock(
        isTerminator: (upper: ReadonlyArray<string>) => boolean,
    ): ReadonlyArray<LolcodeStatement> {
        const statements: Array<LolcodeStatement> = [];
        while (this.lineIndex < this.lines.length) {
            const sourceLine = this.lines[this.lineIndex] as LolcodeSourceLine;
            if (isTerminator(upperTokens(sourceLine.tokens))) {
                break;
            }
            statements.push(this.parseStatement(sourceLine));
        }
        return statements;
    }
    private parseStatement(sourceLine: LolcodeSourceLine): LolcodeStatement {
        const tokens = sourceLine.tokens;
        const upper = upperTokens(tokens);
        const lineNumber = sourceLine.lineNumber;
        if (upper[0] === "I" && upper[1] === "HAS" && upper[2] === "A") {
            this.lineIndex += 1;
            const name = tokens[3];
            if (name === undefined) {
                throw new Error(`LOLCODE line ${lineNumber}: I HAS A needs a variable name.`);
            }
            const remainingTokens = tokens.slice(4);
            if (remainingTokens.length === 0) {
                return { kind: "declare", name: name.toUpperCase(), line: lineNumber };
            }
            if (remainingTokens.length === 1 || remainingTokens[0]?.toUpperCase() !== "ITZ") {
                throw new Error(
                    `LOLCODE line ${lineNumber}: expected ITZ after the variable name.`,
                );
            }
            return {
                kind: "declare",
                name: name.toUpperCase(),
                expression: this.parseExpressionTokens(remainingTokens.slice(1), lineNumber),
                line: lineNumber,
            };
        }
        if (upper[0] === "VISIBLE") {
            this.lineIndex += 1;
            let expressionTokens = tokens.slice(1);
            let suppressNewline = false;
            if (expressionTokens[expressionTokens.length - 1] === "!") {
                suppressNewline = true;
                expressionTokens = expressionTokens.slice(0, -1);
            }
            const expressions: Array<LolcodeExpression> = [];
            const expressionParser = new LolcodeExpressionParser(expressionTokens, lineNumber);
            while (!expressionParser.isDone()) {
                if (expressionParser.consumeIfKeyword("AN")) {
                    continue;
                }
                expressions.push(expressionParser.parseExpression());
            }
            return { kind: "visible", expressions, suppressNewline, line: lineNumber };
        }
        if (upper[0] === "GIMMEH") {
            this.lineIndex += 1;
            const name = tokens[1];
            if (name === undefined) {
                throw new Error(`LOLCODE line ${lineNumber}: GIMMEH needs a variable name.`);
            }
            return { kind: "gimmeh", name: name.toUpperCase(), line: lineNumber };
        }
        if (upper[0] === "O" && upper[1] === "RLY?") {
            return this.parseIfStatement(sourceLine);
        }
        if (upper[0] === "IM" && upper[1] === "IN") {
            return this.parseLoopStatement(sourceLine);
        }
        if (upper[0] === "GTFO") {
            this.lineIndex += 1;
            throw new Error(
                `LOLCODE line ${lineNumber}: GTFO is not supported; end loops with TIL or WILE.`,
            );
        }
        if (upper[1] === "R") {
            this.lineIndex += 1;
            const name = tokens[0] as string;
            return {
                kind: "assign",
                name: name.toUpperCase(),
                expression: this.parseExpressionTokens(tokens.slice(2), lineNumber),
                line: lineNumber,
            };
        }
        this.lineIndex += 1;
        return {
            kind: "expression",
            expression: this.parseExpressionTokens(tokens, lineNumber),
            line: lineNumber,
        };
    }
    private parseIfStatement(sourceLine: LolcodeSourceLine): LolcodeStatement {
        this.lineIndex += 1;
        const consequentHeader = this.lines[this.lineIndex];
        if (
            consequentHeader === undefined ||
            upperTokens(consequentHeader.tokens)[0] !== "YA" ||
            upperTokens(consequentHeader.tokens)[1] !== "RLY"
        ) {
            throw new Error(
                `LOLCODE line ${sourceLine.lineNumber}: O RLY? must be followed by YA RLY.`,
            );
        }
        this.lineIndex += 1;
        const consequent = this.parseBlock(
            (upper) => (upper[0] === "NO" && upper[1] === "WAI") || upper[0] === "OIC",
        );
        let alternative: ReadonlyArray<LolcodeStatement> = [];
        const branchLine = this.lines[this.lineIndex];
        if (
            branchLine !== undefined &&
            upperTokens(branchLine.tokens)[0] === "NO" &&
            upperTokens(branchLine.tokens)[1] === "WAI"
        ) {
            this.lineIndex += 1;
            alternative = this.parseBlock((upper) => upper[0] === "OIC");
        }
        const closingLine = this.lines[this.lineIndex];
        if (closingLine === undefined || upperTokens(closingLine.tokens)[0] !== "OIC") {
            throw new Error(`LOLCODE line ${sourceLine.lineNumber}: O RLY? block is missing OIC.`);
        }
        this.lineIndex += 1;
        return { kind: "if", consequent, alternative, line: sourceLine.lineNumber };
    }
    private parseLoopStatement(sourceLine: LolcodeSourceLine): LolcodeStatement {
        const tokens = sourceLine.tokens;
        const upper = upperTokens(tokens);
        this.lineIndex += 1;
        const label = tokens[3];
        if (label === undefined) {
            throw new Error(`LOLCODE line ${sourceLine.lineNumber}: IM IN YR needs a loop label.`);
        }
        let position = 4;
        let counterOperation: "UPPIN" | "NERFIN" | undefined;
        let counterName: string | undefined;
        if (upper[position] === "UPPIN" || upper[position] === "NERFIN") {
            counterOperation = upper[position] as "UPPIN" | "NERFIN";
            if (upper[position + 1] !== "YR") {
                throw new Error(
                    `LOLCODE line ${sourceLine.lineNumber}: expected YR after ${upper[position]}.`,
                );
            }
            counterName = (tokens[position + 2] ?? "").toUpperCase();
            if (counterName.length === 0) {
                throw new Error(
                    `LOLCODE line ${sourceLine.lineNumber}: the loop counter needs a variable name.`,
                );
            }
            position += 3;
        }
        let conditionKind: "TIL" | "WILE" | undefined;
        let condition: LolcodeExpression | undefined;
        if (upper[position] === "TIL" || upper[position] === "WILE") {
            conditionKind = upper[position] as "TIL" | "WILE";
            condition = this.parseExpressionTokens(
                tokens.slice(position + 1),
                sourceLine.lineNumber,
            );
        } else if (position < tokens.length) {
            throw new Error(
                `LOLCODE line ${sourceLine.lineNumber}: unexpected '${tokens[position]}' in the loop header.`,
            );
        }
        const body = this.parseBlock(
            (lineUpper) => lineUpper[0] === "IM" && lineUpper[1] === "OUTTA",
        );
        const closingLine = this.lines[this.lineIndex];
        if (closingLine === undefined) {
            throw new Error(
                `LOLCODE line ${sourceLine.lineNumber}: loop ${label} is missing IM OUTTA YR.`,
            );
        }
        const closingTokens = closingLine.tokens;
        const closingLabel = closingTokens[3];
        if (
            upperTokens(closingTokens)[0] !== "IM" ||
            upperTokens(closingTokens)[1] !== "OUTTA" ||
            (closingLabel ?? "").toUpperCase() !== label.toUpperCase()
        ) {
            throw new Error(
                `LOLCODE line ${sourceLine.lineNumber}: loop ${label} is closed by '${closingTokens.join(" ")}'.`,
            );
        }
        this.lineIndex += 1;
        return {
            kind: "loop",
            label,
            counterName,
            counterOperation,
            conditionKind,
            condition,
            body,
            line: sourceLine.lineNumber,
        };
    }
    private parseExpressionTokens(
        tokens: ReadonlyArray<string>,
        lineNumber: number,
    ): LolcodeExpression {
        const expressionParser = new LolcodeExpressionParser(tokens, lineNumber);
        const expression = expressionParser.parseExpression();
        expressionParser.expectDone();
        return expression;
    }
}
class LolcodeInterpreter {
    private readonly variables: Map<string, LolcodeValue> = new Map();
    private loopIterationCount: number = 0;
    run(sourceText: string, inputSource: LolcodeInputSource, outputSink: LolcodeOutputSink): void {
        const statements = new LolcodeProgramParser().parse(sourceText);
        this.variables.clear();
        this.variables.set("IT", 0);
        this.loopIterationCount = 0;
        this.executeStatements(statements, inputSource, outputSink);
    }
    private executeStatements(
        statements: ReadonlyArray<LolcodeStatement>,
        inputSource: LolcodeInputSource,
        outputSink: LolcodeOutputSink,
    ): void {
        for (const statement of statements) {
            this.executeStatement(statement, inputSource, outputSink);
        }
    }
    private executeStatement(
        statement: LolcodeStatement,
        inputSource: LolcodeInputSource,
        outputSink: LolcodeOutputSink,
    ): void {
        switch (statement.kind) {
            case "declare": {
                const value =
                    statement.expression === undefined ? 0 : this.evaluate(statement.expression);
                this.variables.set(statement.name, value);
                return;
            }
            case "assign": {
                this.variables.set(statement.name, this.evaluate(statement.expression));
                return;
            }
            case "visible": {
                const renderedParts = statement.expressions.map((expression) =>
                    this.visibleText(this.evaluate(expression), expression.line),
                );
                outputSink.writeText(
                    renderedParts.join("") + (statement.suppressNewline ? "" : "\n"),
                );
                return;
            }
            case "gimmeh": {
                this.variables.set(statement.name, inputSource.readLine());
                return;
            }
            case "expression": {
                this.variables.set("IT", this.evaluate(statement.expression));
                return;
            }
            case "if": {
                const conditionValue = this.conditionValue(
                    this.variables.get("IT") ?? 0,
                    statement.line,
                );
                this.executeStatements(
                    conditionValue ? statement.consequent : statement.alternative,
                    inputSource,
                    outputSink,
                );
                return;
            }
            case "loop": {
                this.executeLoop(statement, inputSource, outputSink);
                return;
            }
        }
    }
    private executeLoop(
        statement: Extract<LolcodeStatement, { kind: "loop" }>,
        inputSource: LolcodeInputSource,
        outputSink: LolcodeOutputSink,
    ): void {
        for (;;) {
            if (statement.conditionKind === "TIL" && statement.condition !== undefined) {
                if (this.conditionValue(this.evaluate(statement.condition), statement.line)) {
                    return;
                }
            }
            if (statement.conditionKind === "WILE" && statement.condition !== undefined) {
                if (!this.conditionValue(this.evaluate(statement.condition), statement.line)) {
                    return;
                }
            }
            this.executeStatements(statement.body, inputSource, outputSink);
            if (statement.counterOperation !== undefined && statement.counterName !== undefined) {
                const currentValue = this.numberValue(
                    this.variables.get(statement.counterName) ?? 0,
                    statement.line,
                );
                this.variables.set(
                    statement.counterName,
                    statement.counterOperation === "UPPIN" ? currentValue + 1 : currentValue - 1,
                );
            }
            this.loopIterationCount += 1;
            if (this.loopIterationCount > LOLCODE_LOOP_ITERATION_LIMIT) {
                throw new Error(
                    `LOLCODE line ${statement.line}: loops ran ${LOLCODE_LOOP_ITERATION_LIMIT} times; add TIL or WILE to stop.`,
                );
            }
        }
    }
    private evaluate(expression: LolcodeExpression): LolcodeValue {
        switch (expression.kind) {
            case "literal":
                return expression.value;
            case "variable": {
                const value = this.variables.get(expression.name);
                if (value === undefined) {
                    throw new Error(
                        `LOLCODE line ${expression.line}: variable ${expression.name} is not defined.`,
                    );
                }
                return value;
            }
            case "call":
                return this.evaluateCall(expression);
        }
    }
    private evaluateCall(expression: Extract<LolcodeExpression, { kind: "call" }>): LolcodeValue {
        const operands = expression.operands.map((operand) => this.evaluate(operand));
        switch (expression.operator) {
            case "SUM OF":
                return (
                    this.numberValue(operands[0] as LolcodeValue, expression.line) +
                    this.numberValue(operands[1] as LolcodeValue, expression.line)
                );
            case "DIFF OF":
                return (
                    this.numberValue(operands[0] as LolcodeValue, expression.line) -
                    this.numberValue(operands[1] as LolcodeValue, expression.line)
                );
            case "PRODUKT OF":
                return (
                    this.numberValue(operands[0] as LolcodeValue, expression.line) *
                    this.numberValue(operands[1] as LolcodeValue, expression.line)
                );
            case "QUOSHUNT OF": {
                const divisor = this.numberValue(operands[1] as LolcodeValue, expression.line);
                if (divisor === 0) {
                    throw new Error(`LOLCODE line ${expression.line}: QUOSHUNT OF by zero.`);
                }
                return this.numberValue(operands[0] as LolcodeValue, expression.line) / divisor;
            }
            case "MOD OF": {
                const divisor = this.numberValue(operands[1] as LolcodeValue, expression.line);
                if (divisor === 0) {
                    throw new Error(`LOLCODE line ${expression.line}: MOD OF by zero.`);
                }
                return this.numberValue(operands[0] as LolcodeValue, expression.line) % divisor;
            }
            case "BIGGR OF":
                return Math.max(
                    this.numberValue(operands[0] as LolcodeValue, expression.line),
                    this.numberValue(operands[1] as LolcodeValue, expression.line),
                );
            case "SMALLR OF":
                return Math.min(
                    this.numberValue(operands[0] as LolcodeValue, expression.line),
                    this.numberValue(operands[1] as LolcodeValue, expression.line),
                );
            case "BOTH SAEM":
                return this.valuesEqual(operands[0] as LolcodeValue, operands[1] as LolcodeValue);
            case "DIFFRINT":
                return !this.valuesEqual(operands[0] as LolcodeValue, operands[1] as LolcodeValue);
            case "SMOOSH":
                return operands
                    .map((operand) => this.visibleText(operand, expression.line))
                    .join("");
            default:
                throw new Error(
                    `LOLCODE line ${expression.line}: ${expression.operator} is not supported.`,
                );
        }
    }
    private numberValue(value: LolcodeValue, line: number): number {
        if (typeof value === "number") {
            return value;
        }
        if (typeof value === "boolean") {
            return value ? 1 : 0;
        }
        throw new Error(`LOLCODE line ${line}: expected a NUMBR but found a YARN.`);
    }
    private conditionValue(value: LolcodeValue, line: number): boolean {
        if (typeof value === "boolean") {
            return value;
        }
        if (typeof value === "number") {
            return value !== 0;
        }
        throw new Error(`LOLCODE line ${line}: expected WIN or FAIL but found a YARN.`);
    }
    private visibleText(value: LolcodeValue, line: number): string {
        if (typeof value === "string") {
            return value;
        }
        if (typeof value === "boolean") {
            return value ? "WIN" : "FAIL";
        }
        if (typeof value === "number") {
            return String(value);
        }
        throw new Error(`LOLCODE line ${line}: cannot print this value.`);
    }
    private valuesEqual(leftValue: LolcodeValue, rightValue: LolcodeValue): boolean {
        if (typeof leftValue !== typeof rightValue) {
            return false;
        }
        return leftValue === rightValue;
    }
}
class LolcodePerformer implements TerminalPerformerContract {
    private readonly userFilesClient: SessionUserFilesClient;
    private readonly outputTracker: ReplayOutputTracker;
    private entryRelativePath: string = "";
    private entrySourceText: string = "";
    constructor(sessionBaseUrl: string) {
        this.userFilesClient = new SessionUserFilesClient(sessionBaseUrl);
        this.outputTracker = new ReplayOutputTracker();
    }
    async loadInto(stage: TerminalStageController): Promise<void> {
        const fetchedFiles = await this.userFilesClient.fetchUserFiles();
        this.entryRelativePath = fetchedFiles.entryRelativePath;
        const entrySourceText = fetchedFiles.userFiles.get(this.entryRelativePath);
        if (entrySourceText === undefined) {
            throw new Error(`Entry program ${this.entryRelativePath} is missing from the session.`);
        }
        this.entrySourceText = entrySourceText;
        stage.writeLine("LOLCODE runtime ready. Programs run in this browser tab.");
    }
    async performOn(stage: TerminalStageController): Promise<void> {
        const fedLines: Array<string> = [];
        stage.writeLine("Running LOLCODE program.");
        for (let inputCount = 0; ; inputCount += 1) {
            if (inputCount > MAXIMUM_REPLAY_INPUTS) {
                throw new Error("Too many input prompts. Stopping to protect the session.");
            }
            this.outputTracker.beginRun();
            let inputWasNeeded = false;
            let fedIndex = 0;
            try {
                const interpreter = new LolcodeInterpreter();
                interpreter.run(
                    this.entrySourceText,
                    {
                        readLine: () => {
                            if (fedIndex < fedLines.length) {
                                const fedLine = fedLines[fedIndex] as string;
                                fedIndex += 1;
                                return fedLine;
                            }
                            throw new TerminalInputNeededSignal();
                        },
                    },
                    { writeText: (text: string) => this.outputTracker.appendText(text) },
                );
            } catch (runError) {
                if (!isTerminalInputNeeded(runError)) {
                    throw new Error(this.describeLolcodeError(runError));
                }
                inputWasNeeded = true;
            } finally {
                this.outputTracker.flushShownInto(stage);
            }
            if (!inputWasNeeded) {
                break;
            }
            const fedLine = await stage.readLine("");
            fedLines.push(fedLine);
        }
    }
    private describeLolcodeError(runError: unknown): string {
        const rawMessage = runError instanceof Error ? runError.message : String(runError);
        const messageLines = rawMessage
            .split("\n")
            .map((line) => line.trimEnd())
            .filter((line) => line.trim().length > 0);
        const lastLine = messageLines[messageLines.length - 1] ?? rawMessage;
        return lastLine.length > 300 ? lastLine.slice(0, 300) : lastLine;
    }
}
export { LolcodeInterpreter, LolcodeProgramParser, LolcodePerformer };
export type { LolcodeInputSource, LolcodeOutputSink, LolcodeValue };
