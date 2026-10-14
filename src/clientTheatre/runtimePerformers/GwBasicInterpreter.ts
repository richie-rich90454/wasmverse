type BasicValue = number | string;
interface BasicOutputSink {
    writeText(text: string): void;
}
interface BasicRunOptions {
    sink: BasicOutputSink;
    readLine(): string;
}
type BasicToken =
    | { kind: "number"; value: number }
    | { kind: "string"; text: string }
    | { kind: "identifier"; text: string }
    | { kind: "operator"; text: string }
    | { kind: "separator"; text: string }
    | { kind: "lparen" }
    | { kind: "rparen" };
type BasicNode =
    | { kind: "literal"; value: BasicValue }
    | { kind: "variable"; name: string }
    | { kind: "array"; name: string; indexes: ReadonlyArray<BasicNode> }
    | { kind: "call"; name: string; args: ReadonlyArray<BasicNode> }
    | { kind: "unary"; operator: string; operand: BasicNode }
    | { kind: "binary"; operator: string; left: BasicNode; right: BasicNode };
interface ForFrame {
    variable: string;
    endValue: number;
    stepValue: number;
    resumeLineIndex: number;
    resumeStatementIndex: number;
}
interface DataItem {
    value: BasicValue;
    lineNumber: number;
}
interface BasicArray {
    isString: boolean;
    dimensions: ReadonlyArray<number>;
    values: Array<BasicValue>;
}
const MAXIMUM_EXECUTED_STATEMENTS = 2_000_000;
const PRINT_ZONE_WIDTH = 14;
const DEFAULT_SEED = 42;
const LEHMER_MULTIPLIER = 48271;
const LEHMER_MODULUS = 2_147_483_647;
const FUNCTION_NAMES: ReadonlyArray<string> = [
    "INT",
    "ABS",
    "SQR",
    "LEN",
    "CHR$",
    "ASC",
    "STR$",
    "VAL",
    "RND",
];
const INFIX_PRECEDENCE: Readonly<Record<string, number>> = {
    OR: 1,
    AND: 2,
    "=": 4,
    "<>": 4,
    "<": 4,
    ">": 4,
    "<=": 4,
    ">=": 4,
    "+": 5,
    "-": 5,
    MOD: 6,
    "\\": 7,
    "*": 8,
    "/": 8,
    "^": 9,
};
const KEYWORD_STATEMENTS: ReadonlyArray<string> = [
    "PRINT",
    "INPUT",
    "LET",
    "IF",
    "FOR",
    "NEXT",
    "GOTO",
    "GOSUB",
    "RETURN",
    "REM",
    "END",
    "STOP",
    "RANDOMIZE",
    "DATA",
    "READ",
    "RESTORE",
    "DIM",
];
function isIdentifierStart(character: string): boolean {
    return (character >= "A" && character <= "Z") || (character >= "a" && character <= "z");
}
function isIdentifierPart(character: string): boolean {
    return isIdentifierStart(character) || (character >= "0" && character <= "9");
}
function normalizeBasicName(rawName: string): string {
    return rawName.toUpperCase();
}
function isStringVariable(name: string): boolean {
    return name.endsWith("$");
}
function tokenizeBasic(sourceText: string): Array<BasicToken> {
    const tokens: Array<BasicToken> = [];
    let position = 0;
    while (position < sourceText.length) {
        const character = sourceText[position] as string;
        if (character === " " || character === "\t") {
            position++;
            continue;
        }
        if (character === '"') {
            let text = "";
            position++;
            while (position < sourceText.length && sourceText[position] !== '"') {
                text += sourceText[position];
                position++;
            }
            if (sourceText[position] === '"') {
                position++;
            }
            tokens.push({ kind: "string", text });
            continue;
        }
        if (
            (character >= "0" && character <= "9") ||
            (character === "." && (sourceText[position + 1] ?? "") >= "0")
        ) {
            let numberText = "";
            while (
                position < sourceText.length &&
                (sourceText[position] as string) >= "0" &&
                (sourceText[position] as string) <= "9"
            ) {
                numberText += sourceText[position];
                position++;
            }
            if (sourceText[position] === ".") {
                numberText += ".";
                position++;
                while (
                    position < sourceText.length &&
                    (sourceText[position] as string) >= "0" &&
                    (sourceText[position] as string) <= "9"
                ) {
                    numberText += sourceText[position];
                    position++;
                }
            }
            if (sourceText[position] === "E" || sourceText[position] === "e") {
                let exponentText = sourceText[position] as string;
                let exponentPosition = position + 1;
                if (sourceText[exponentPosition] === "+" || sourceText[exponentPosition] === "-") {
                    exponentText += sourceText[exponentPosition];
                    exponentPosition++;
                }
                let exponentDigits = "";
                while (
                    exponentPosition < sourceText.length &&
                    (sourceText[exponentPosition] as string) >= "0" &&
                    (sourceText[exponentPosition] as string) <= "9"
                ) {
                    exponentDigits += sourceText[exponentPosition];
                    exponentPosition++;
                }
                if (exponentDigits.length > 0) {
                    numberText += `${exponentText}${exponentDigits}`;
                    position = exponentPosition;
                }
            }
            tokens.push({ kind: "number", value: Number(numberText) });
            continue;
        }
        if (isIdentifierStart(character)) {
            let nameText = "";
            while (
                position < sourceText.length &&
                isIdentifierPart(sourceText[position] as string)
            ) {
                nameText += sourceText[position];
                position++;
            }
            if (sourceText[position] === "$") {
                nameText += "$";
                position++;
            }
            tokens.push({ kind: "identifier", text: normalizeBasicName(nameText) });
            continue;
        }
        if (character === "<" || character === ">") {
            const nextCharacter = sourceText[position + 1];
            if (nextCharacter === "=") {
                tokens.push({ kind: "operator", text: `${character}=` });
                position += 2;
                continue;
            }
            if (character === "<" && nextCharacter === ">") {
                tokens.push({ kind: "operator", text: "<>" });
                position += 2;
                continue;
            }
            tokens.push({ kind: "operator", text: character });
            position++;
            continue;
        }
        if ("+-*/^=\\".includes(character)) {
            tokens.push({ kind: "operator", text: character });
            position++;
            continue;
        }
        if (character === ";" || character === ",") {
            tokens.push({ kind: "separator", text: character });
            position++;
            continue;
        }
        if (character === "(") {
            tokens.push({ kind: "lparen" });
            position++;
            continue;
        }
        if (character === ")") {
            tokens.push({ kind: "rparen" });
            position++;
            continue;
        }
        throw new Error(`Unexpected character '${character}' in expression.`);
    }
    return tokens;
}
function splitTopLevel(text: string, delimiter: string): Array<string> {
    const parts: Array<string> = [];
    let current = "";
    let inString = false;
    let parenthesisDepth = 0;
    for (const character of text) {
        if (character === '"') {
            inString = !inString;
        }
        if (!inString) {
            if (character === "(") {
                parenthesisDepth++;
            }
            if (character === ")") {
                parenthesisDepth--;
            }
        }
        if (character === delimiter && !inString && parenthesisDepth === 0) {
            parts.push(current);
            current = "";
            continue;
        }
        current += character;
    }
    parts.push(current);
    return parts;
}
function splitStatementLine(lineText: string): Array<string> {
    const statements: Array<string> = [];
    let current = "";
    let inString = false;
    for (const character of lineText) {
        if (character === '"') {
            inString = !inString;
        }
        if (character === ":" && !inString) {
            const trimmedCurrent = current.trim().toUpperCase();
            const isIfStatement = trimmedCurrent.startsWith("IF ") || trimmedCurrent === "IF";
            const isRemStatement =
                trimmedCurrent.startsWith("REM") || trimmedCurrent.startsWith("'");
            if (!isIfStatement && !isRemStatement) {
                statements.push(current);
                current = "";
                continue;
            }
        }
        current += character;
    }
    statements.push(current);
    return statements;
}
function formatBasicNumber(value: number): string {
    const text = String(value);
    return value >= 0 ? ` ${text} ` : `${text} `;
}
function formatStrDollar(value: number): string {
    return String(value);
}
function findKeywordSplit(statementText: string, keyword: string): number {
    const upperText = statementText.toUpperCase();
    let inString = false;
    for (let position = 0; position <= upperText.length - keyword.length; position++) {
        const character = upperText[position] as string;
        if (character === '"') {
            inString = !inString;
            continue;
        }
        if (inString) {
            continue;
        }
        if (upperText.startsWith(keyword, position)) {
            const before = position === 0 ? " " : (upperText[position - 1] as string);
            const after = upperText[position + keyword.length] ?? " ";
            const beforeIsBoundary = !isIdentifierPart(before);
            const afterIsBoundary = !isIdentifierPart(after);
            if (beforeIsBoundary && afterIsBoundary) {
                return position;
            }
        }
    }
    return -1;
}
class GwBasicInterpreter {
    private sink: BasicOutputSink = { writeText: () => undefined };
    private readLineSource: () => string = () => "";
    private readonly lineNumbers: Array<number> = [];
    private readonly statementsByLine: Map<number, ReadonlyArray<string>> = new Map();
    private readonly lineIndexByNumber: Map<number, number> = new Map();
    private variables: Map<string, BasicValue> = new Map();
    private arrays: Map<string, BasicArray> = new Map();
    private forStack: Array<ForFrame> = [];
    private gosubStack: Array<{ lineIndex: number; statementIndex: number }> = [];
    private dataItems: Array<DataItem> = [];
    private dataIndex: number = 0;
    private outputColumn: number = 0;
    private randomSeed: number = DEFAULT_SEED;
    private lastRandomValue: number = 0;
    private executedStatementCount: number = 0;
    private lineIndex: number = 0;
    private statementIndex: number = 0;
    private afterStatement: { lineIndex: number; statementIndex: number } = {
        lineIndex: 0,
        statementIndex: 0,
    };
    run(sourceText: string, options: BasicRunOptions): void {
        this.sink = options.sink;
        this.readLineSource = options.readLine;
        this.loadProgram(sourceText);
        this.executedStatementCount = 0;
        this.lineIndex = 0;
        this.statementIndex = 0;
        for (;;) {
            const statements = this.statementsByLine.get(
                this.lineNumbers[this.lineIndex] as number,
            );
            if (!statements) {
                return;
            }
            if (this.statementIndex >= statements.length) {
                this.lineIndex++;
                this.statementIndex = 0;
                continue;
            }
            const statement = statements[this.statementIndex] as string;
            this.afterStatement = {
                lineIndex: this.lineIndex,
                statementIndex: this.statementIndex + 1,
            };
            const didJump = this.executeStatementText(statement);
            this.executedStatementCount++;
            if (this.executedStatementCount > MAXIMUM_EXECUTED_STATEMENTS) {
                throw new Error(
                    `Program exceeded ${MAXIMUM_EXECUTED_STATEMENTS} executed statements. Stopping to protect the session.`,
                );
            }
            if (!didJump) {
                this.statementIndex++;
            }
        }
    }
    private loadProgram(sourceText: string): void {
        this.lineNumbers.length = 0;
        this.statementsByLine.clear();
        this.lineIndexByNumber.clear();
        this.dataItems = [];
        this.dataIndex = 0;
        this.variables = new Map();
        this.arrays = new Map();
        this.forStack = [];
        this.gosubStack = [];
        this.outputColumn = 0;
        this.randomSeed = DEFAULT_SEED;
        this.lastRandomValue = 0;
        const rawLines = sourceText.replace(/\r\n/g, "\n").split("\n");
        for (const [rawIndex, rawLine] of rawLines.entries()) {
            const lineText = rawLine.trim();
            if (lineText.length === 0) {
                continue;
            }
            const numberMatch = /^(\d+)\s*([\s\S]*)$/.exec(lineText);
            if (!numberMatch) {
                throw new Error(
                    `Line ${rawIndex + 1}: every statement needs a line number in this interpreter.`,
                );
            }
            const lineNumber = Number(numberMatch[1]);
            const statements = splitStatementLine(numberMatch[2] as string).map((statement) =>
                statement.trim(),
            );
            this.lineNumbers.push(lineNumber);
            this.statementsByLine.set(lineNumber, statements);
        }
        this.lineNumbers.sort((left, right) => left - right);
        for (const [index, lineNumber] of this.lineNumbers.entries()) {
            this.lineIndexByNumber.set(lineNumber, index);
        }
        for (const lineNumber of this.lineNumbers) {
            const statements = this.statementsByLine.get(lineNumber) as ReadonlyArray<string>;
            for (const statement of statements) {
                if (statement.toUpperCase().startsWith("DATA")) {
                    this.collectDataItems(statement.slice(4), lineNumber);
                }
            }
        }
    }
    private collectDataItems(dataText: string, lineNumber: number): void {
        for (const rawItem of splitTopLevel(dataText, ",")) {
            const itemText = rawItem.trim();
            if (itemText.length === 0) {
                continue;
            }
            if (itemText.startsWith('"') && itemText.endsWith('"') && itemText.length >= 2) {
                this.dataItems.push({ value: itemText.slice(1, -1), lineNumber });
                continue;
            }
            const numericValue = Number(itemText);
            this.dataItems.push({
                value: Number.isNaN(numericValue) ? itemText : numericValue,
                lineNumber,
            });
        }
    }
    private executeStatementText(statement: string): boolean {
        const trimmedStatement = statement.trim();
        if (trimmedStatement.length === 0) {
            return false;
        }
        const upperStatement = trimmedStatement.toUpperCase();
        if (upperStatement.startsWith("REM") || upperStatement.startsWith("'")) {
            return false;
        }
        const keywordMatch = /^([A-Z]+)\b/.exec(upperStatement);
        const keyword = keywordMatch?.[1] ?? "";
        if (KEYWORD_STATEMENTS.includes(keyword)) {
            return this.executeKeywordStatement(keyword, trimmedStatement);
        }
        const assignmentMatch =
            /^([A-Za-z][A-Za-z0-9]*\$?)\s*(?:\(([^()]*)\))?\s*=(?!=)([\s\S]*)$/.exec(
                trimmedStatement,
            );
        if (assignmentMatch) {
            return this.executeAssignment(
                assignmentMatch[1] as string,
                assignmentMatch[2],
                assignmentMatch[3] as string,
            );
        }
        throw new Error(`Unknown statement '${trimmedStatement}'.`);
    }
    private executeKeywordStatement(keyword: string, statement: string): boolean {
        switch (keyword) {
            case "PRINT":
                this.executePrint(statement.slice(5));
                return false;
            case "INPUT":
                this.executeInput(statement.slice(5));
                return false;
            case "LET":
                return this.executeLet(statement.slice(3));
            case "IF":
                return this.executeIf(statement.slice(2));
            case "FOR":
                return this.executeFor(statement.slice(3));
            case "NEXT":
                return this.executeNext(statement.slice(4));
            case "GOTO":
                return this.executeGoto(statement.slice(4));
            case "GOSUB":
                return this.executeGosub(statement.slice(5));
            case "RETURN":
                return this.executeReturn();
            case "END":
                this.lineIndex = this.lineNumbers.length;
                return true;
            case "STOP":
                this.writeText(`Break in ${this.currentLineNumber()}\n`);
                this.lineIndex = this.lineNumbers.length;
                return true;
            case "RANDOMIZE":
                return this.executeRandomize(statement.slice(9));
            case "READ":
                this.executeRead(statement.slice(4));
                return false;
            case "RESTORE":
                this.executeRestore(statement.slice(7));
                return false;
            case "DIM":
                this.executeDim(statement.slice(3));
                return false;
            case "DATA":
                return false;
            default:
                throw new Error(`Unsupported statement ${keyword}.`);
        }
    }
    private executeLet(restText: string): boolean {
        const assignmentMatch =
            /^\s*([A-Za-z][A-Za-z0-9]*\$?)\s*(?:\(([^()]*)\))?\s*=(?!=)([\s\S]*)$/.exec(restText);
        if (!assignmentMatch) {
            throw new Error(`LET needs an assignment, got '${restText.trim()}'.`);
        }
        return this.executeAssignment(
            assignmentMatch[1] as string,
            assignmentMatch[2],
            assignmentMatch[3] as string,
        );
    }
    private executeAssignment(
        rawName: string,
        rawIndexes: string | undefined,
        rawValueText: string,
    ): boolean {
        const name = normalizeBasicName(rawName);
        const value = this.evaluateExpressionText(rawValueText);
        this.checkAssignedType(name, value);
        if (rawIndexes !== undefined) {
            const indexes = splitTopLevel(rawIndexes, ",").map((indexText) =>
                this.evaluateExpressionText(indexText),
            );
            this.writeArrayElement(name, indexes, value);
            return false;
        }
        this.variables.set(name, value);
        return false;
    }
    private executePrint(restText: string): void {
        const tokens = tokenizeBasic(restText);
        let tokenIndex = 0;
        let lastSeparator: ";" | "," | "none" = "none";
        if (tokens.length === 0) {
            this.writeText("\n");
            this.outputColumn = 0;
            return;
        }
        while (tokenIndex < tokens.length) {
            const currentToken = tokens[tokenIndex];
            if (currentToken && currentToken.kind === "separator") {
                lastSeparator = currentToken.text === "," ? "," : ";";
                tokenIndex++;
                if (lastSeparator === ",") {
                    this.advanceToNextPrintZone();
                }
                continue;
            }
            const parsed = this.parseNode(tokens, tokenIndex);
            tokenIndex = parsed.nextIndex;
            this.writeText(this.printValue(this.evaluateNode(parsed.node)));
            const separatorToken = tokens[tokenIndex];
            if (separatorToken && separatorToken.kind === "separator") {
                lastSeparator = separatorToken.text === "," ? "," : ";";
                tokenIndex++;
                if (lastSeparator === ",") {
                    this.advanceToNextPrintZone();
                }
            } else {
                lastSeparator = "none";
            }
        }
        if (lastSeparator === "none") {
            this.writeText("\n");
            this.outputColumn = 0;
        }
    }
    private executeInput(restText: string): void {
        let variableText = restText.trim();
        const promptMatch = /^"([^"]*)"\s*([;,])?\s*([\s\S]*)$/.exec(variableText);
        let promptText = "";
        if (promptMatch) {
            promptText = promptMatch[1] as string;
            variableText = promptMatch[3] as string;
        }
        const variableNames = splitTopLevel(variableText, ",")
            .map((name) => normalizeBasicName(name.trim()))
            .filter((name) => name.length > 0);
        if (variableNames.length === 0) {
            throw new Error("INPUT needs at least one variable.");
        }
        this.writeText(promptText);
        for (;;) {
            this.writeText("? ");
            const inputLine = this.readLineSource();
            const parts = inputLine.split(",").map((part) => part.trim());
            if (parts.length < variableNames.length) {
                this.writeText("?Redo from start\n");
                continue;
            }
            let parseFailed = false;
            const parsedValues: Array<BasicValue> = [];
            for (const [variablePosition, variableName] of variableNames.entries()) {
                const part = parts[variablePosition] as string;
                if (isStringVariable(variableName)) {
                    parsedValues.push(
                        part.startsWith('"') && part.endsWith('"') && part.length >= 2
                            ? part.slice(1, -1)
                            : part,
                    );
                    continue;
                }
                const numericValue = Number(part);
                if (part.length === 0 || Number.isNaN(numericValue)) {
                    parseFailed = true;
                    break;
                }
                parsedValues.push(numericValue);
            }
            if (parseFailed) {
                this.writeText("?Redo from start\n");
                continue;
            }
            for (const [variablePosition, variableName] of variableNames.entries()) {
                this.variables.set(variableName, parsedValues[variablePosition] as BasicValue);
            }
            return;
        }
    }
    private advanceToNextPrintZone(): void {
        const nextZone = (Math.floor(this.outputColumn / PRINT_ZONE_WIDTH) + 1) * PRINT_ZONE_WIDTH;
        this.writeText(" ".repeat(nextZone - this.outputColumn));
    }
    private executeIf(restText: string): boolean {
        const thenPosition = findKeywordSplit(restText, "THEN");
        if (thenPosition < 0) {
            throw new Error("IF needs a THEN clause.");
        }
        const conditionText = restText.slice(0, thenPosition);
        const branchText = restText.slice(thenPosition + 4).trim();
        const condition = this.evaluateExpressionText(conditionText);
        const conditionTruthy =
            typeof condition === "number" ? condition !== 0 : condition.length > 0;
        const elsePosition = findKeywordSplit(branchText, "ELSE");
        const thenBranchText =
            elsePosition >= 0 ? branchText.slice(0, elsePosition).trim() : branchText;
        const elseBranchText = elsePosition >= 0 ? branchText.slice(elsePosition + 4).trim() : "";
        if (conditionTruthy) {
            return this.executeBranchText(thenBranchText);
        }
        if (elseBranchText.length > 0) {
            return this.executeBranchText(elseBranchText);
        }
        return false;
    }
    private executeBranchText(branchText: string): boolean {
        if (branchText.length === 0) {
            return false;
        }
        if (/^\d+$/.test(branchText)) {
            return this.jumpToLine(Number(branchText));
        }
        if (branchText.toUpperCase().startsWith("GOTO ")) {
            return this.executeGoto(branchText.slice(4));
        }
        let didJump = false;
        for (const subStatement of splitStatementLine(branchText)) {
            if (subStatement.trim().length === 0) {
                continue;
            }
            this.executedStatementCount++;
            if (this.executeStatementText(subStatement)) {
                didJump = true;
            }
        }
        return didJump;
    }
    private executeFor(restText: string): boolean {
        const forMatch = /^\s*([A-Za-z][A-Za-z0-9]*)\s*=\s*([\s\S]*)$/.exec(restText);
        if (!forMatch) {
            throw new Error("FOR needs a loop variable and a range.");
        }
        const variable = normalizeBasicName(forMatch[1] as string);
        const rangeText = forMatch[2] as string;
        const toPosition = findKeywordSplit(rangeText, "TO");
        if (toPosition < 0) {
            throw new Error("FOR needs a TO clause.");
        }
        const startText = rangeText.slice(0, toPosition);
        const afterToText = rangeText.slice(toPosition + 2);
        const stepPosition = findKeywordSplit(afterToText, "STEP");
        const endText = stepPosition >= 0 ? afterToText.slice(0, stepPosition) : afterToText;
        const stepText = stepPosition >= 0 ? afterToText.slice(stepPosition + 4) : "1";
        const startValue = this.requireNumber(
            this.evaluateExpressionText(startText),
            "FOR start value",
        );
        const endValue = this.requireNumber(this.evaluateExpressionText(endText), "FOR end value");
        const stepValue = this.requireNumber(this.evaluateExpressionText(stepText), "FOR STEP");
        if (stepValue === 0) {
            throw new Error("FOR STEP cannot be zero.");
        }
        this.variables.set(variable, startValue);
        this.forStack.push({
            variable,
            endValue,
            stepValue,
            resumeLineIndex: this.afterStatement.lineIndex,
            resumeStatementIndex: this.afterStatement.statementIndex,
        });
        return false;
    }
    private executeNext(restText: string): boolean {
        const frame = this.forStack[this.forStack.length - 1];
        if (!frame) {
            throw new Error("NEXT without FOR.");
        }
        const requestedVariable =
            restText.trim().length > 0 ? normalizeBasicName(restText.trim()) : frame.variable;
        if (requestedVariable !== frame.variable) {
            throw new Error(`NEXT ${requestedVariable} does not match FOR ${frame.variable}.`);
        }
        const currentValue = this.requireNumber(
            this.variables.get(frame.variable) ?? 0,
            "NEXT loop variable",
        );
        const nextValue = currentValue + frame.stepValue;
        const continues =
            frame.stepValue > 0 ? nextValue <= frame.endValue : nextValue >= frame.endValue;
        if (!continues) {
            this.forStack.pop();
            return false;
        }
        this.variables.set(frame.variable, nextValue);
        this.lineIndex = frame.resumeLineIndex;
        this.statementIndex = frame.resumeStatementIndex;
        return true;
    }
    private executeGoto(restText: string): boolean {
        const target = this.requireNumber(this.evaluateExpressionText(restText), "GOTO target");
        return this.jumpToLine(target);
    }
    private executeGosub(restText: string): boolean {
        const target = this.requireNumber(this.evaluateExpressionText(restText), "GOSUB target");
        this.gosubStack.push({ ...this.afterStatement });
        return this.jumpToLine(target);
    }
    private executeReturn(): boolean {
        const returnPosition = this.gosubStack.pop();
        if (!returnPosition) {
            throw new Error("RETURN without GOSUB.");
        }
        this.lineIndex = returnPosition.lineIndex;
        this.statementIndex = returnPosition.statementIndex;
        return true;
    }
    private executeRandomize(restText: string): boolean {
        if (restText.trim().length === 0) {
            this.randomSeed = DEFAULT_SEED;
            return false;
        }
        const seedValue = this.requireNumber(
            this.evaluateExpressionText(restText),
            "RANDOMIZE seed",
        );
        const normalizedSeed = Math.trunc(seedValue) % LEHMER_MODULUS;
        this.randomSeed = normalizedSeed === 0 ? DEFAULT_SEED : Math.abs(normalizedSeed);
        return false;
    }
    private executeRead(restText: string): void {
        const variableNames = splitTopLevel(restText, ",")
            .map((name) => normalizeBasicName(name.trim()))
            .filter((name) => name.length > 0);
        for (const variableName of variableNames) {
            const dataItem = this.dataItems[this.dataIndex];
            if (!dataItem) {
                throw new Error("Out of DATA.");
            }
            this.dataIndex++;
            const dataValue = dataItem.value;
            if (isStringVariable(variableName)) {
                this.variables.set(
                    variableName,
                    typeof dataValue === "string" ? dataValue : String(dataValue),
                );
                continue;
            }
            if (typeof dataValue === "string") {
                throw new Error(`Type mismatch reading DATA into ${variableName}.`);
            }
            this.variables.set(variableName, dataValue);
        }
    }
    private executeRestore(restText: string): void {
        if (restText.trim().length === 0) {
            this.dataIndex = 0;
            return;
        }
        const targetLine = this.requireNumber(
            this.evaluateExpressionText(restText),
            "RESTORE target",
        );
        const restoredIndex = this.dataItems.findIndex((item) => item.lineNumber >= targetLine);
        this.dataIndex = restoredIndex >= 0 ? restoredIndex : this.dataItems.length;
    }
    private executeDim(restText: string): void {
        for (const rawDeclaration of splitTopLevel(restText, ",")) {
            const declarationMatch = /^\s*([A-Za-z][A-Za-z0-9]*\$?)\s*\(([^()]*)\)\s*$/.exec(
                rawDeclaration,
            );
            if (!declarationMatch) {
                throw new Error(
                    `DIM needs a declaration like A(10), got '${rawDeclaration.trim()}'.`,
                );
            }
            const name = normalizeBasicName(declarationMatch[1] as string);
            const dimensions = splitTopLevel(declarationMatch[2] as string, ",").map(
                (dimensionText) =>
                    this.requireNumber(this.evaluateExpressionText(dimensionText), "DIM dimension"),
            );
            this.declareArray(name, dimensions);
        }
    }
    private declareArray(name: string, dimensions: ReadonlyArray<number>): void {
        const checkedDimensions: Array<number> = [];
        for (const dimension of dimensions) {
            if (!Number.isInteger(dimension) || dimension < 0) {
                throw new Error(`DIM ${name}: dimensions must be non-negative integers.`);
            }
            checkedDimensions.push(dimension);
        }
        const elementCount = checkedDimensions.reduce(
            (runningTotal, dimension) => runningTotal * (dimension + 1),
            1,
        );
        const isString = isStringVariable(name);
        this.arrays.set(name, {
            isString,
            dimensions: checkedDimensions,
            values: new Array<BasicValue>(elementCount).fill(isString ? "" : 0),
        });
    }
    private writeArrayElement(
        name: string,
        indexes: ReadonlyArray<BasicValue>,
        value: BasicValue,
    ): void {
        const array = this.requireArrayForWrite(name, indexes.length);
        const flatIndex = this.flatArrayIndex(array, name, indexes);
        array.values[flatIndex] = array.isString
            ? this.requireString(value, name)
            : this.requireNumber(value, name);
    }
    private requireArrayForWrite(name: string, indexCount: number): BasicArray {
        let array = this.arrays.get(name);
        if (!array) {
            this.declareArray(name, indexCount === 2 ? [10, 10] : [10]);
            array = this.arrays.get(name) as BasicArray;
        }
        return array;
    }
    private flatArrayIndex(
        array: BasicArray,
        name: string,
        indexes: ReadonlyArray<BasicValue>,
    ): number {
        if (indexes.length !== array.dimensions.length) {
            throw new Error(`Subscript out of range for ${name}.`);
        }
        let flatIndex = 0;
        for (const [dimensionPosition, rawIndex] of indexes.entries()) {
            const index = this.requireNumber(rawIndex, "array index");
            const dimensionSize = array.dimensions[dimensionPosition] as number;
            if (!Number.isInteger(index) || index < 0 || index > dimensionSize) {
                throw new Error(`Subscript out of range for ${name}.`);
            }
            flatIndex = flatIndex * (dimensionSize + 1) + index;
        }
        return flatIndex;
    }
    private jumpToLine(target: number): boolean {
        const targetLine = Math.trunc(target);
        const targetIndex = this.lineIndexByNumber.get(targetLine);
        if (targetIndex === undefined) {
            throw new Error(
                `Undefined line number ${targetLine} (from line ${this.currentLineNumber()}).`,
            );
        }
        this.lineIndex = targetIndex;
        this.statementIndex = 0;
        return true;
    }
    private currentLineNumber(): number {
        return this.lineNumbers[this.lineIndex] ?? 0;
    }
    private evaluateExpressionText(expressionText: string): BasicValue {
        const tokens = tokenizeBasic(expressionText);
        if (tokens.length === 0) {
            throw new Error("Expected an expression.");
        }
        const parsed = this.parseNode(tokens, 0);
        if (parsed.nextIndex < tokens.length) {
            throw new Error(`Unexpected text in expression '${expressionText.trim()}'.`);
        }
        return this.evaluateNode(parsed.node);
    }
    private parseNode(
        tokens: ReadonlyArray<BasicToken>,
        startIndex: number,
    ): { node: BasicNode; nextIndex: number } {
        let left: { node: BasicNode; nextIndex: number };
        const token = tokens[startIndex];
        if (!token) {
            throw new Error("Unexpected end of expression.");
        }
        if (token.kind === "number") {
            left = {
                node: { kind: "literal", value: token.value },
                nextIndex: startIndex + 1,
            };
        } else if (token.kind === "string") {
            left = {
                node: { kind: "literal", value: token.text },
                nextIndex: startIndex + 1,
            };
        } else if (token.kind === "lparen") {
            const inner = this.parseBinary(tokens, startIndex + 1, 0);
            const closingToken = tokens[inner.nextIndex];
            if (!closingToken || closingToken.kind !== "rparen") {
                throw new Error("Missing closing parenthesis.");
            }
            left = { node: inner.node, nextIndex: inner.nextIndex + 1 };
        } else if (token.kind === "operator" && (token.text === "-" || token.text === "+")) {
            const operand = this.parseNode(tokens, startIndex + 1);
            left = {
                node:
                    token.text === "-"
                        ? { kind: "unary", operator: "-", operand: operand.node }
                        : operand.node,
                nextIndex: operand.nextIndex,
            };
        } else if (token.kind === "identifier" && token.text === "NOT") {
            const operand = this.parseBinary(tokens, startIndex + 1, 4);
            left = {
                node: { kind: "unary", operator: "NOT", operand: operand.node },
                nextIndex: operand.nextIndex,
            };
        } else if (token.kind === "identifier") {
            left = this.parseIdentifierNode(tokens, startIndex);
        } else {
            throw new Error("Expected a value in expression.");
        }
        return this.parseBinary(tokens, left.nextIndex, 0, left.node);
    }
    private parseBinary(
        tokens: ReadonlyArray<BasicToken>,
        startIndex: number,
        minimumPrecedence: number,
        existingLeft?: BasicNode,
    ): { node: BasicNode; nextIndex: number } {
        let left = existingLeft;
        let tokenIndex = startIndex;
        if (left === undefined) {
            const inner = this.parseNode(tokens, startIndex);
            left = inner.node;
            tokenIndex = inner.nextIndex;
        }
        for (;;) {
            const token = tokens[tokenIndex];
            let operatorText: string | undefined;
            if (token && token.kind === "operator") {
                operatorText = token.text;
            }
            if (
                token &&
                token.kind === "identifier" &&
                (token.text === "AND" || token.text === "OR" || token.text === "MOD")
            ) {
                operatorText = token.text;
            }
            if (operatorText === undefined) {
                return { node: left, nextIndex: tokenIndex };
            }
            const precedence = INFIX_PRECEDENCE[operatorText];
            if (precedence === undefined || precedence < minimumPrecedence) {
                return { node: left, nextIndex: tokenIndex };
            }
            const rightAssociative = operatorText === "^";
            const right = this.parseBinary(
                tokens,
                tokenIndex + 1,
                rightAssociative ? precedence : precedence + 1,
            );
            left = { kind: "binary", operator: operatorText, left, right: right.node };
            tokenIndex = right.nextIndex;
        }
    }
    private parseIdentifierNode(
        tokens: ReadonlyArray<BasicToken>,
        startIndex: number,
    ): { node: BasicNode; nextIndex: number } {
        const token = tokens[startIndex] as { kind: "identifier"; text: string };
        const name = token.text;
        const nextToken = tokens[startIndex + 1];
        if (FUNCTION_NAMES.includes(name)) {
            if (name === "RND" && (!nextToken || nextToken.kind !== "lparen")) {
                return { node: { kind: "call", name, args: [] }, nextIndex: startIndex + 1 };
            }
            if (!nextToken || nextToken.kind !== "lparen") {
                throw new Error(`${name} needs parenthesized arguments.`);
            }
            const args = this.parseArgumentList(tokens, startIndex + 1);
            return { node: { kind: "call", name, args: args.nodes }, nextIndex: args.nextIndex };
        }
        if (nextToken && nextToken.kind === "lparen") {
            const args = this.parseArgumentList(tokens, startIndex + 1);
            return {
                node: { kind: "array", name, indexes: args.nodes },
                nextIndex: args.nextIndex,
            };
        }
        return { node: { kind: "variable", name }, nextIndex: startIndex + 1 };
    }
    private parseArgumentList(
        tokens: ReadonlyArray<BasicToken>,
        lparenIndex: number,
    ): { nodes: ReadonlyArray<BasicNode>; nextIndex: number } {
        const nodes: Array<BasicNode> = [];
        let tokenIndex = lparenIndex + 1;
        const closingToken = tokens[tokenIndex];
        if (closingToken && closingToken.kind === "rparen") {
            return { nodes, nextIndex: tokenIndex + 1 };
        }
        for (;;) {
            const argument = this.parseBinary(tokens, tokenIndex, 0);
            nodes.push(argument.node);
            tokenIndex = argument.nextIndex;
            const separatorToken = tokens[tokenIndex];
            if (
                separatorToken &&
                separatorToken.kind === "separator" &&
                separatorToken.text === ","
            ) {
                tokenIndex++;
                continue;
            }
            if (separatorToken && separatorToken.kind === "rparen") {
                return { nodes, nextIndex: tokenIndex + 1 };
            }
            throw new Error("Missing closing parenthesis in argument list.");
        }
    }
    private evaluateNode(node: BasicNode): BasicValue {
        switch (node.kind) {
            case "literal":
                return node.value;
            case "variable":
                return this.variables.get(node.name) ?? (isStringVariable(node.name) ? "" : 0);
            case "array": {
                const array = this.arrays.get(node.name);
                if (!array) {
                    const implicit = this.requireArrayForWrite(node.name, node.indexes.length);
                    const indexValues = node.indexes.map((index) => this.evaluateNode(index));
                    return implicit.values[
                        this.flatArrayIndex(implicit, node.name, indexValues)
                    ] as BasicValue;
                }
                const indexValues = node.indexes.map((index) => this.evaluateNode(index));
                return array.values[
                    this.flatArrayIndex(array, node.name, indexValues)
                ] as BasicValue;
            }
            case "unary": {
                const operand = this.evaluateNode(node.operand);
                if (node.operator === "NOT") {
                    return ~this.requireNumber(this.integerize(operand), "NOT");
                }
                return -this.requireNumber(operand, "unary minus");
            }
            case "binary":
                return this.evaluateBinary(node);
            case "call":
                return this.evaluateFunction(node);
            default:
                throw new Error("Unsupported expression.");
        }
    }
    private evaluateBinary(node: {
        operator: string;
        left: BasicNode;
        right: BasicNode;
    }): BasicValue {
        const operator = node.operator;
        if (operator === "AND" || operator === "OR") {
            const left = this.requireNumber(
                this.integerize(this.evaluateNode(node.left)),
                operator,
            );
            const right = this.requireNumber(
                this.integerize(this.evaluateNode(node.right)),
                operator,
            );
            return operator === "AND" ? left & right : left | right;
        }
        const left = this.evaluateNode(node.left);
        const right = this.evaluateNode(node.right);
        if (
            operator === "=" ||
            operator === "<>" ||
            operator === "<" ||
            operator === ">" ||
            operator === "<=" ||
            operator === ">="
        ) {
            let comparison: boolean;
            if (typeof left === "number" && typeof right === "number") {
                comparison = this.compareValues(left, right, operator);
            } else if (typeof left === "string" && typeof right === "string") {
                comparison = this.compareValues(left, right, operator);
            } else {
                throw new Error(`Type mismatch in comparison with ${operator}.`);
            }
            return comparison ? -1 : 0;
        }
        if (operator === "+" && (typeof left === "string" || typeof right === "string")) {
            if (typeof left !== "string" || typeof right !== "string") {
                throw new Error("Type mismatch in string concatenation.");
            }
            return left + right;
        }
        const leftNumber = this.requireNumber(left, `operator ${operator}`);
        const rightNumber = this.requireNumber(right, `operator ${operator}`);
        switch (operator) {
            case "+":
                return leftNumber + rightNumber;
            case "-":
                return leftNumber - rightNumber;
            case "*":
                return leftNumber * rightNumber;
            case "/":
                if (rightNumber === 0) {
                    throw new Error("Division by zero.");
                }
                return leftNumber / rightNumber;
            case "\\":
                if (rightNumber === 0) {
                    throw new Error("Division by zero.");
                }
                return Math.trunc(leftNumber / rightNumber);
            case "MOD":
                if (rightNumber === 0) {
                    throw new Error("Division by zero.");
                }
                return leftNumber % rightNumber;
            case "^":
                return leftNumber ** rightNumber;
            default:
                throw new Error(`Unsupported operator ${operator}.`);
        }
    }
    private compareValues(
        left: number | string,
        right: number | string,
        operator: string,
    ): boolean {
        switch (operator) {
            case "=":
                return left === right;
            case "<>":
                return left !== right;
            case "<":
                return left < right;
            case ">":
                return left > right;
            case "<=":
                return left <= right;
            case ">=":
                return left >= right;
            default:
                return false;
        }
    }
    private evaluateFunction(node: { name: string; args: ReadonlyArray<BasicNode> }): BasicValue {
        const argumentValues = node.args.map((argument) => this.evaluateNode(argument));
        switch (node.name) {
            case "INT":
                return Math.floor(this.requireNumber(argumentValues[0] as BasicValue, "INT"));
            case "ABS":
                return Math.abs(this.requireNumber(argumentValues[0] as BasicValue, "ABS"));
            case "SQR": {
                const value = this.requireNumber(argumentValues[0] as BasicValue, "SQR");
                if (value < 0) {
                    throw new Error("SQR: illegal function call with a negative number.");
                }
                return Math.sqrt(value);
            }
            case "LEN":
                return this.requireString(argumentValues[0] as BasicValue, "LEN").length;
            case "CHR$": {
                const value = this.requireNumber(argumentValues[0] as BasicValue, "CHR$");
                if (!Number.isInteger(value) || value < 0 || value > 255) {
                    throw new Error("CHR$: code must be an integer from 0 to 255.");
                }
                return String.fromCharCode(value);
            }
            case "ASC": {
                const text = this.requireString(argumentValues[0] as BasicValue, "ASC");
                if (text.length === 0) {
                    throw new Error("ASC: illegal function call with an empty string.");
                }
                return text.charCodeAt(0);
            }
            case "STR$":
                return formatStrDollar(this.requireNumber(argumentValues[0] as BasicValue, "STR$"));
            case "VAL": {
                const text = this.requireString(argumentValues[0] as BasicValue, "VAL");
                const numericMatch = /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(text);
                return numericMatch ? Number(numericMatch[0]) : 0;
            }
            case "RND": {
                const argumentValue =
                    argumentValues.length === 0
                        ? 1
                        : this.requireNumber(argumentValues[0] as BasicValue, "RND");
                if (argumentValue === 0) {
                    return this.lastRandomValue;
                }
                this.randomSeed = (this.randomSeed * LEHMER_MULTIPLIER) % LEHMER_MODULUS;
                this.lastRandomValue = this.randomSeed / LEHMER_MODULUS;
                return this.lastRandomValue;
            }
            default:
                throw new Error(`Unsupported function ${node.name}.`);
        }
    }
    private integerize(value: BasicValue): BasicValue {
        if (typeof value !== "number") {
            throw new Error("Type mismatch: a number was expected.");
        }
        return Math.trunc(value);
    }
    private requireNumber(value: BasicValue, operationName: string): number {
        if (typeof value !== "number") {
            throw new Error(`Type mismatch: ${operationName} needs a number.`);
        }
        return value;
    }
    private requireString(value: BasicValue, operationName: string): string {
        if (typeof value !== "string") {
            throw new Error(`Type mismatch: ${operationName} needs a string.`);
        }
        return value;
    }
    private checkAssignedType(name: string, value: BasicValue): void {
        const isStringTarget = isStringVariable(name);
        const isStringValue = typeof value === "string";
        if (isStringTarget !== isStringValue) {
            throw new Error(
                `Type mismatch assigning a ${isStringValue ? "string" : "number"} to ${name}.`,
            );
        }
    }
    private printValue(value: BasicValue): string {
        if (typeof value === "number") {
            return formatBasicNumber(value);
        }
        return value;
    }
    private writeText(text: string): void {
        this.sink.writeText(text);
        const lastNewlineIndex = text.lastIndexOf("\n");
        if (lastNewlineIndex >= 0) {
            this.outputColumn = text.length - lastNewlineIndex - 1;
            return;
        }
        this.outputColumn += text.length;
    }
}
export { GwBasicInterpreter, splitStatementLine, tokenizeBasic };
export type { BasicOutputSink, BasicRunOptions, BasicValue };
