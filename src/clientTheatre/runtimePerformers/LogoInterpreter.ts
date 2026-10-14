type LogoList = Array<LogoValue>;
type LogoValue = number | string | LogoList;
interface LogoOutputSink {
    writeLine(text: string): void;
    writeText(text: string): void;
}
interface LogoRunOptions {
    sink: LogoOutputSink;
    readLine(): string;
    programArguments?: ReadonlyArray<string>;
}
type LogoToken =
    | { kind: "number"; value: number; line: number }
    | { kind: "word"; text: string; line: number }
    | { kind: "string"; text: string; line: number }
    | { kind: "colon"; name: string; line: number }
    | { kind: "list"; value: LogoList; line: number }
    | { kind: "lparen"; line: number }
    | { kind: "rparen"; line: number }
    | { kind: "operator"; text: string; line: number }
    | { kind: "eol"; line: number };
type LogoNode =
    | { kind: "literal"; value: LogoValue }
    | { kind: "variable"; name: string }
    | { kind: "unary"; operator: string; operand: LogoNode }
    | { kind: "binary"; operator: string; left: LogoNode; right: LogoNode }
    | { kind: "call"; name: string; args: ReadonlyArray<LogoNode> };
interface LogoProcedure {
    parameters: ReadonlyArray<string>;
    body: ReadonlyArray<LogoToken>;
}
const MAXIMUM_DRAW_COLUMNS = 200;
const MAXIMUM_DRAW_ROWS = 100;
const INFIX_PRECEDENCE: Readonly<Record<string, number>> = {
    "=": 1,
    "<": 1,
    ">": 1,
    "+": 2,
    "-": 2,
    "*": 3,
    "/": 3,
};
const BUILTIN_ARITIES: Readonly<Record<string, number>> = {
    PRINT: 1,
    SHOW: 1,
    TYPE: 1,
    MAKE: 2,
    THING: 1,
    FIRST: 1,
    LAST: 1,
    BUTFIRST: 1,
    BF: 1,
    BUTLAST: 1,
    BL: 1,
    COUNT: 1,
    ITEM: 2,
    WORD: 2,
    LIST: 2,
    SENTENCE: 2,
    SE: 2,
    SUM: 2,
    DIFFERENCE: 2,
    PRODUCT: 2,
    QUOTIENT: 2,
    ABS: 1,
    INT: 1,
    READWORD: 0,
    READLIST: 0,
    RUN: 1,
    FORWARD: 1,
    FD: 1,
    BACK: 1,
    BK: 1,
    RIGHT: 1,
    RT: 1,
    LEFT: 1,
    LT: 1,
    SETHEADING: 1,
    SETH: 1,
    HOME: 0,
    PENDOWN: 0,
    PD: 0,
    PENUP: 0,
    PU: 0,
    DRAW: 0,
    CLEARSCREEN: 0,
    CS: 0,
};
const SPECIAL_FORM_ARITIES: Readonly<Record<string, number>> = {
    REPEAT: 2,
    IF: 2,
    IFELSE: 3,
    OUTPUT: 1,
};
class LogoOutputSignal {
    readonly value: LogoValue;
    constructor(value: LogoValue) {
        this.value = value;
    }
}
function tokenizeLogo(sourceText: string): Array<LogoToken> {
    const tokens: Array<LogoToken> = [];
    let position = 0;
    let line = 1;
    const isDelimiter = (character: string): boolean =>
        character === "" || ' \t\r\n[]();+-*/=<>"'.includes(character);
    const isQuotedWordStop = (character: string): boolean =>
        character === "" || " \t\r\n[]();".includes(character);
    const isListWordStop = (character: string): boolean =>
        character === "" || " \t\r\n[]()".includes(character);
    const skipToLineEnd = (): void => {
        while (position < sourceText.length && sourceText[position] !== "\n") {
            position++;
        }
    };
    while (position < sourceText.length) {
        const character = sourceText[position] as string;
        if (character === "\n") {
            tokens.push({ kind: "eol", line });
            line++;
            position++;
            continue;
        }
        if (character === " " || character === "\t" || character === "\r") {
            position++;
            continue;
        }
        if (character === ";") {
            skipToLineEnd();
            continue;
        }
        if (character === "[") {
            const listStartLine = line;
            position++;
            const items: LogoList = [];
            for (;;) {
                while (
                    position < sourceText.length &&
                    " \t\r\n".includes(sourceText[position] as string)
                ) {
                    if (sourceText[position] === "\n") {
                        line++;
                    }
                    position++;
                }
                if (position >= sourceText.length) {
                    throw new Error(`Line ${listStartLine}: unterminated list.`);
                }
                const inner = sourceText[position] as string;
                if (inner === "]") {
                    position++;
                    break;
                }
                if (inner === "[") {
                    const nestedStart = position;
                    let depth = 0;
                    while (position < sourceText.length) {
                        const candidate = sourceText[position] as string;
                        if (candidate === "[") {
                            depth++;
                        }
                        if (candidate === "]") {
                            depth--;
                            if (depth === 0) {
                                position++;
                                break;
                            }
                        }
                        if (candidate === "\n") {
                            line++;
                        }
                        position++;
                    }
                    const nestedTokens = tokenizeLogo(
                        sourceText.slice(nestedStart, position),
                    ).filter((token) => token.kind === "list");
                    const nestedToken = nestedTokens[0];
                    if (!nestedToken || nestedToken.kind !== "list") {
                        throw new Error(`Line ${listStartLine}: unterminated list.`);
                    }
                    items.push(nestedToken.value);
                    continue;
                }
                if (inner === '"') {
                    let wordPosition = position + 1;
                    let wordText = '"';
                    while (
                        wordPosition < sourceText.length &&
                        !isQuotedWordStop(sourceText[wordPosition] as string)
                    ) {
                        wordText += sourceText[wordPosition];
                        wordPosition++;
                    }
                    items.push(wordText);
                    position = wordPosition;
                    continue;
                }
                if (inner === ":") {
                    let namePosition = position + 1;
                    let wordText = ":";
                    while (
                        namePosition < sourceText.length &&
                        !isDelimiter(sourceText[namePosition] as string)
                    ) {
                        wordText += sourceText[namePosition];
                        namePosition++;
                    }
                    items.push(wordText);
                    position = namePosition;
                    continue;
                }
                if (inner >= "0" && inner <= "9") {
                    let numberPosition = position;
                    let numberText = "";
                    while (
                        numberPosition < sourceText.length &&
                        (sourceText[numberPosition] as string) >= "0" &&
                        (sourceText[numberPosition] as string) <= "9"
                    ) {
                        numberText += sourceText[numberPosition];
                        numberPosition++;
                    }
                    items.push(Number(numberText));
                    position = numberPosition;
                    continue;
                }
                if (inner === "|") {
                    const closingBarIndex = sourceText.indexOf("|", position + 1);
                    if (closingBarIndex < 0) {
                        throw new Error(`Line ${listStartLine}: unterminated |word| in list.`);
                    }
                    items.push(sourceText.slice(position, closingBarIndex + 1));
                    position = closingBarIndex + 1;
                    continue;
                }
                if (inner === "(" || inner === ")") {
                    items.push(inner);
                    position++;
                    continue;
                }
                let wordPosition = position;
                let wordText = "";
                while (
                    wordPosition < sourceText.length &&
                    !isListWordStop(sourceText[wordPosition] as string)
                ) {
                    wordText += sourceText[wordPosition];
                    wordPosition++;
                }
                items.push(wordText);
                position = wordPosition;
            }
            tokens.push({ kind: "list", value: items, line: listStartLine });
            continue;
        }
        if (character === "|") {
            const closingBarIndex = sourceText.indexOf("|", position + 1);
            if (closingBarIndex < 0) {
                throw new Error(`Line ${line}: unterminated |word|.`);
            }
            tokens.push({
                kind: "string",
                text: sourceText.slice(position + 1, closingBarIndex),
                line,
            });
            position = closingBarIndex + 1;
            continue;
        }
        if (character === '"') {
            position++;
            let wordText = "";
            while (
                position < sourceText.length &&
                !isQuotedWordStop(sourceText[position] as string)
            ) {
                wordText += sourceText[position];
                position++;
            }
            tokens.push({ kind: "string", text: wordText, line });
            continue;
        }
        if (character === ":") {
            position++;
            let nameText = "";
            while (position < sourceText.length && !isDelimiter(sourceText[position] as string)) {
                nameText += sourceText[position];
                position++;
            }
            tokens.push({ kind: "colon", name: nameText.toUpperCase(), line });
            continue;
        }
        if (character >= "0" && character <= "9") {
            let numberText = "";
            while (
                position < sourceText.length &&
                (sourceText[position] as string) >= "0" &&
                (sourceText[position] as string) <= "9"
            ) {
                numberText += sourceText[position];
                position++;
            }
            tokens.push({ kind: "number", value: Number(numberText), line });
            continue;
        }
        if (character === "(") {
            tokens.push({ kind: "lparen", line });
            position++;
            continue;
        }
        if (character === ")") {
            tokens.push({ kind: "rparen", line });
            position++;
            continue;
        }
        if ("+-*/=<>".includes(character)) {
            tokens.push({ kind: "operator", text: character, line });
            position++;
            continue;
        }
        let wordText = "";
        while (position < sourceText.length && !isDelimiter(sourceText[position] as string)) {
            wordText += sourceText[position];
            position++;
        }
        if (wordText.length === 0) {
            throw new Error(`Line ${line}: unexpected '${character}'.`);
        }
        tokens.push({ kind: "word", text: wordText, line });
    }
    tokens.push({ kind: "eol", line });
    return tokens;
}
function renderLogoList(list: LogoList): string {
    return list
        .map((item) => {
            if (typeof item === "number") {
                return formatLogoNumber(item);
            }
            if (typeof item === "string") {
                return item;
            }
            return `[ ${renderLogoList(item)} ]`;
        })
        .join(" ");
}
function formatLogoNumber(value: number): string {
    return String(value);
}
function isLogoList(value: LogoValue): value is LogoList {
    return Array.isArray(value);
}
class LogoInterpreter {
    private sink: LogoOutputSink = {
        writeLine: () => undefined,
        writeText: () => undefined,
    };
    private readLineSource: () => string = () => "";
    private readonly procedures: Map<string, LogoProcedure> = new Map();
    private readonly globals: Map<string, LogoValue> = new Map();
    private readonly frames: Array<Map<string, LogoValue>> = [];
    private tokens: ReadonlyArray<LogoToken> = [];
    private position: number = 0;
    private turtleX: number = 0;
    private turtleY: number = 0;
    private turtleHeading: number = 0;
    private turtlePenDown: boolean = true;
    private turtleSegments: Array<[number, number, number, number]> = [];
    run(sourceText: string, options: LogoRunOptions): void {
        this.sink = options.sink;
        this.readLineSource = options.readLine;
        for (const [index, argument] of (options.programArguments ?? []).entries()) {
            this.globals.set(`WASMVERSE.ARGUMENTS.${index}`, argument);
        }
        this.globals.set("WASMVERSE.ARGUMENTS", [...(options.programArguments ?? [])]);
        this.executeTokens(tokenizeLogo(sourceText));
    }
    private executeTokens(tokens: ReadonlyArray<LogoToken>): void {
        const savedTokens = this.tokens;
        const savedPosition = this.position;
        this.tokens = tokens;
        this.position = 0;
        try {
            this.executeStatements();
        } finally {
            this.tokens = savedTokens;
            this.position = savedPosition;
        }
    }
    private executeStatements(): void {
        for (;;) {
            this.skipEndOfLines();
            if (this.position >= this.tokens.length) {
                return;
            }
            const token = this.tokens[this.position] as LogoToken;
            if (token.kind === "word" && token.text.toUpperCase() === "TO") {
                this.parseProcedureDefinition();
                continue;
            }
            const node = this.parseExpression(0);
            this.evaluate(node);
        }
    }
    private parseProcedureDefinition(): void {
        const definitionLine = this.currentLine();
        this.position++;
        const nameToken = this.tokens[this.position];
        if (!nameToken || nameToken.kind !== "word") {
            throw new Error(`Line ${definitionLine}: TO requires a procedure name.`);
        }
        const name = nameToken.text.toUpperCase();
        this.position++;
        const parameters: Array<string> = [];
        while (this.tokens[this.position]?.kind === "colon") {
            parameters.push((this.tokens[this.position] as { name: string }).name);
            this.position++;
        }
        const body: Array<LogoToken> = [];
        for (;;) {
            const bodyToken = this.tokens[this.position];
            if (!bodyToken) {
                throw new Error(`Line ${definitionLine}: TO ${name} is missing END.`);
            }
            this.position++;
            if (bodyToken.kind === "word" && bodyToken.text.toUpperCase() === "END") {
                break;
            }
            body.push(bodyToken);
        }
        this.procedures.set(name, { parameters, body });
    }
    private skipEndOfLines(): void {
        while (this.tokens[this.position]?.kind === "eol") {
            this.position++;
        }
    }
    private currentLine(): number {
        return this.tokens[this.position]?.line ?? this.tokens[this.tokens.length - 1]?.line ?? 1;
    }
    private parseExpression(minimumPrecedence: number): LogoNode {
        let left = this.parsePrefix();
        for (;;) {
            const token = this.tokens[this.position];
            if (!token || token.kind !== "operator") {
                return left;
            }
            const precedence = INFIX_PRECEDENCE[token.text];
            if (precedence === undefined || precedence < minimumPrecedence) {
                return left;
            }
            this.position++;
            const right = this.parseExpression(precedence + 1);
            left = { kind: "binary", operator: token.text, left, right };
        }
    }
    private parsePrefix(): LogoNode {
        const token = this.tokens[this.position];
        if (!token) {
            throw new Error("Unexpected end of program.");
        }
        if (token.kind === "number") {
            this.position++;
            return { kind: "literal", value: token.value };
        }
        if (token.kind === "string") {
            this.position++;
            return { kind: "literal", value: token.text };
        }
        if (token.kind === "colon") {
            this.position++;
            return { kind: "variable", name: token.name };
        }
        if (token.kind === "list") {
            this.position++;
            return { kind: "literal", value: token.value };
        }
        if (token.kind === "lparen") {
            this.position++;
            const node = this.parseExpression(0);
            const closingToken = this.tokens[this.position];
            if (!closingToken || closingToken.kind !== "rparen") {
                throw new Error(`Line ${token.line}: missing closing parenthesis.`);
            }
            this.position++;
            return node;
        }
        if (token.kind === "operator" && token.text === "-") {
            this.position++;
            return { kind: "unary", operator: "-", operand: this.parsePrefix() };
        }
        if (token.kind === "word") {
            return this.parseCall();
        }
        throw new Error(`Line ${token.line}: expected a value.`);
    }
    private parseCall(): LogoNode {
        const token = this.tokens[this.position] as { kind: "word"; text: string; line: number };
        const name = token.text.toUpperCase();
        this.position++;
        const argumentCount =
            SPECIAL_FORM_ARITIES[name] ??
            BUILTIN_ARITIES[name] ??
            this.procedures.get(name)?.parameters.length;
        if (argumentCount === undefined) {
            throw new Error(`Line ${token.line}: I don't know how to ${name}.`);
        }
        const args: Array<LogoNode> = [];
        for (let argumentIndex = 0; argumentIndex < argumentCount; argumentIndex++) {
            args.push(this.parseExpression(0));
        }
        return { kind: "call", name, args };
    }
    private evaluate(node: LogoNode): LogoValue {
        if (node.kind === "literal") {
            return node.value;
        }
        if (node.kind === "variable") {
            const value = this.lookupVariable(node.name);
            if (value === undefined) {
                throw new Error(`${node.name} has no value.`);
            }
            return value;
        }
        if (node.kind === "unary") {
            const operand = this.requireNumber(this.evaluate(node.operand), "unary minus");
            return -operand;
        }
        if (node.kind === "binary") {
            return this.evaluateBinary(node);
        }
        return this.evaluateCall(node);
    }
    private evaluateBinary(node: { operator: string; left: LogoNode; right: LogoNode }): LogoValue {
        const left = this.evaluate(node.left);
        const right = this.evaluate(node.right);
        switch (node.operator) {
            case "+":
            case "-":
            case "*":
            case "/": {
                const leftNumber = this.requireNumber(left, node.operator);
                const rightNumber = this.requireNumber(right, node.operator);
                if (node.operator === "+") {
                    return leftNumber + rightNumber;
                }
                if (node.operator === "-") {
                    return leftNumber - rightNumber;
                }
                if (node.operator === "*") {
                    return leftNumber * rightNumber;
                }
                if (rightNumber === 0) {
                    throw new Error("Division by zero.");
                }
                return leftNumber / rightNumber;
            }
            case "=":
            case "<":
            case ">": {
                let comparison = false;
                if (typeof left === "number" && typeof right === "number") {
                    comparison =
                        node.operator === "="
                            ? left === right
                            : node.operator === "<"
                              ? left < right
                              : left > right;
                } else if (typeof left === "string" && typeof right === "string") {
                    comparison =
                        node.operator === "="
                            ? left === right
                            : node.operator === "<"
                              ? left < right
                              : left > right;
                } else {
                    throw new Error(`Cannot compare a word with a number using ${node.operator}.`);
                }
                return comparison ? "TRUE" : "FALSE";
            }
            default:
                throw new Error(`Unsupported operator ${node.operator}.`);
        }
    }
    private evaluateCall(node: { name: string; args: ReadonlyArray<LogoNode> }): LogoValue {
        if (node.name === "REPEAT") {
            const count = this.requireNumber(this.evaluate(node.args[0] as LogoNode), "REPEAT");
            const body = this.evaluate(node.args[1] as LogoNode);
            this.requireList(body, "REPEAT");
            for (let repetition = 0; repetition < count; repetition++) {
                this.runInstructionList(body as LogoList);
            }
            return "";
        }
        if (node.name === "IF") {
            const condition = this.evaluate(node.args[0] as LogoNode);
            if (this.isTruthy(condition)) {
                const body = this.evaluate(node.args[1] as LogoNode);
                this.runInstructionList(this.requireList(body, "IF"));
            }
            return "";
        }
        if (node.name === "IFELSE") {
            const condition = this.evaluate(node.args[0] as LogoNode);
            const selectedNode = this.isTruthy(condition) ? node.args[1] : node.args[2];
            const body = this.evaluate(selectedNode as LogoNode);
            this.runInstructionList(this.requireList(body, "IFELSE"));
            return "";
        }
        if (node.name === "OUTPUT") {
            throw new LogoOutputSignal(this.evaluate(node.args[0] as LogoNode));
        }
        const procedure = this.procedures.get(node.name);
        if (procedure) {
            const argumentValues = node.args.map((argument) => this.evaluate(argument));
            const frame: Map<string, LogoValue> = new Map();
            for (const [parameterIndex, parameterName] of procedure.parameters.entries()) {
                frame.set(parameterName, argumentValues[parameterIndex] as LogoValue);
            }
            this.frames.push(frame);
            try {
                this.executeTokens(procedure.body);
                return "";
            } catch (outputSignal) {
                if (outputSignal instanceof LogoOutputSignal) {
                    return outputSignal.value;
                }
                throw outputSignal;
            } finally {
                this.frames.pop();
            }
        }
        const argumentValues = node.args.map((argument) => this.evaluate(argument));
        return this.applyBuiltin(node.name, argumentValues);
    }
    private applyBuiltin(name: string, args: ReadonlyArray<LogoValue>): LogoValue {
        switch (name) {
            case "PRINT":
                this.sink.writeLine(this.printValue(args[0] as LogoValue));
                return "";
            case "SHOW":
                this.sink.writeLine(this.showValue(args[0] as LogoValue));
                return "";
            case "TYPE":
                this.sink.writeText(this.printValue(args[0] as LogoValue));
                return "";
            case "MAKE":
                this.globals.set(
                    this.requireWord(args[0] as LogoValue, "MAKE").toUpperCase(),
                    args[1] as LogoValue,
                );
                return "";
            case "THING":
                return this.requireVariable(this.requireWord(args[0] as LogoValue, "THING"));
            case "FIRST": {
                const value = args[0] as LogoValue;
                if (isLogoList(value)) {
                    if (value.length === 0) {
                        throw new Error("FIRST requires a non-empty list.");
                    }
                    return value[0] as LogoValue;
                }
                const word = this.requireWord(value, "FIRST");
                if (word.length === 0) {
                    throw new Error("FIRST requires a non-empty word.");
                }
                return word[0] as string;
            }
            case "LAST": {
                const value = args[0] as LogoValue;
                if (isLogoList(value)) {
                    if (value.length === 0) {
                        throw new Error("LAST requires a non-empty list.");
                    }
                    return value[value.length - 1] as LogoValue;
                }
                const word = this.requireWord(value, "LAST");
                if (word.length === 0) {
                    throw new Error("LAST requires a non-empty word.");
                }
                return word[word.length - 1] as string;
            }
            case "BUTFIRST":
            case "BF": {
                const value = args[0] as LogoValue;
                if (isLogoList(value)) {
                    return value.slice(1);
                }
                return this.requireWord(value, "BUTFIRST").slice(1);
            }
            case "BUTLAST":
            case "BL": {
                const value = args[0] as LogoValue;
                if (isLogoList(value)) {
                    return value.slice(0, -1);
                }
                return this.requireWord(value, "BUTLAST").slice(0, -1);
            }
            case "COUNT": {
                const value = args[0] as LogoValue;
                if (isLogoList(value)) {
                    return value.length;
                }
                return this.requireWord(value, "COUNT").length;
            }
            case "ITEM": {
                const index = this.requireNumber(args[0] as LogoValue, "ITEM");
                if (!Number.isInteger(index) || index < 1) {
                    throw new Error("ITEM requires an index of 1 or greater.");
                }
                const value = args[1] as LogoValue;
                if (isLogoList(value)) {
                    if (index > value.length) {
                        throw new Error(`ITEM: index ${index} is out of range.`);
                    }
                    return value[index - 1] as LogoValue;
                }
                const word = this.requireWord(value, "ITEM");
                if (index > word.length) {
                    throw new Error(`ITEM: index ${index} is out of range.`);
                }
                return word[index - 1] as string;
            }
            case "WORD":
                return (
                    this.wordText(args[0] as LogoValue, "WORD") +
                    this.wordText(args[1] as LogoValue, "WORD")
                );
            case "LIST":
                return [args[0] as LogoValue, args[1] as LogoValue];
            case "SENTENCE":
            case "SE":
                return this.sentenceOf(args[0] as LogoValue).concat(
                    this.sentenceOf(args[1] as LogoValue),
                );
            case "SUM":
                return (
                    this.requireNumber(args[0] as LogoValue, "SUM") +
                    this.requireNumber(args[1] as LogoValue, "SUM")
                );
            case "DIFFERENCE":
                return (
                    this.requireNumber(args[0] as LogoValue, "DIFFERENCE") -
                    this.requireNumber(args[1] as LogoValue, "DIFFERENCE")
                );
            case "PRODUCT":
                return (
                    this.requireNumber(args[0] as LogoValue, "PRODUCT") *
                    this.requireNumber(args[1] as LogoValue, "PRODUCT")
                );
            case "QUOTIENT": {
                const divisor = this.requireNumber(args[1] as LogoValue, "QUOTIENT");
                if (divisor === 0) {
                    throw new Error("QUOTIENT: division by zero.");
                }
                return this.requireNumber(args[0] as LogoValue, "QUOTIENT") / divisor;
            }
            case "ABS":
                return Math.abs(this.requireNumber(args[0] as LogoValue, "ABS"));
            case "INT":
                return Math.trunc(this.requireNumber(args[0] as LogoValue, "INT"));
            case "READWORD": {
                const line = this.readLineSource();
                const word = line.trim().split(/\s+/)[0] ?? "";
                return word;
            }
            case "READLIST": {
                const line = this.readLineSource();
                return line.trim().length === 0 ? [] : line.trim().split(/\s+/);
            }
            case "RUN":
                this.runInstructionList(this.requireList(args[0] as LogoValue, "RUN"));
                return "";
            case "FORWARD":
            case "FD":
                this.moveTurtle(this.requireNumber(args[0] as LogoValue, "FORWARD"));
                return "";
            case "BACK":
            case "BK":
                this.moveTurtle(-this.requireNumber(args[0] as LogoValue, "BACK"));
                return "";
            case "RIGHT":
            case "RT":
                this.turtleHeading =
                    (this.turtleHeading + this.requireNumber(args[0] as LogoValue, "RIGHT")) % 360;
                return "";
            case "LEFT":
            case "LT":
                this.turtleHeading =
                    (this.turtleHeading - this.requireNumber(args[0] as LogoValue, "LEFT")) % 360;
                return "";
            case "SETHEADING":
            case "SETH":
                this.turtleHeading = this.requireNumber(args[0] as LogoValue, "SETHEADING") % 360;
                return "";
            case "HOME":
                this.turtleX = 0;
                this.turtleY = 0;
                this.turtleHeading = 0;
                return "";
            case "PENDOWN":
            case "PD":
                this.turtlePenDown = true;
                return "";
            case "PENUP":
            case "PU":
                this.turtlePenDown = false;
                return "";
            case "CLEARSCREEN":
            case "CS":
                this.turtleSegments = [];
                this.turtleX = 0;
                this.turtleY = 0;
                this.turtleHeading = 0;
                this.turtlePenDown = true;
                return "";
            case "DRAW":
                this.renderTurtleDrawing();
                return "";
            default:
                throw new Error(`Unsupported builtin ${name}.`);
        }
    }
    private runInstructionList(list: LogoList): void {
        const renderedSource = renderLogoList(list);
        this.executeTokens(tokenizeLogo(`${renderedSource}\n`));
    }
    private lookupVariable(name: string): LogoValue | undefined {
        for (let frameIndex = this.frames.length - 1; frameIndex >= 0; frameIndex--) {
            const frame = this.frames[frameIndex] as Map<string, LogoValue>;
            if (frame.has(name)) {
                return frame.get(name);
            }
        }
        return this.globals.get(name);
    }
    private requireVariable(name: string): LogoValue {
        const value = this.lookupVariable(name.toUpperCase());
        if (value === undefined) {
            throw new Error(`${name} has no value.`);
        }
        return value;
    }
    private isTruthy(value: LogoValue): boolean {
        if (typeof value === "number") {
            return value !== 0;
        }
        if (typeof value === "string") {
            return value.toUpperCase() === "TRUE";
        }
        throw new Error("A list cannot be used as a condition.");
    }
    private requireNumber(value: LogoValue, operationName: string): number {
        if (typeof value !== "number") {
            throw new Error(`${operationName} requires a number.`);
        }
        return value;
    }
    private requireWord(value: LogoValue, operationName: string): string {
        if (typeof value === "number") {
            return formatLogoNumber(value);
        }
        if (typeof value === "string") {
            return value;
        }
        throw new Error(`${operationName} requires a word, not a list.`);
    }
    private wordText(value: LogoValue, operationName: string): string {
        return this.requireWord(value, operationName);
    }
    private requireList(value: LogoValue, operationName: string): LogoList {
        if (!isLogoList(value)) {
            throw new Error(`${operationName} requires an instruction list.`);
        }
        return value;
    }
    private sentenceOf(value: LogoValue): LogoList {
        return isLogoList(value) ? value : [value];
    }
    private printValue(value: LogoValue): string {
        if (isLogoList(value)) {
            return value.map((item) => this.printValue(item)).join(" ");
        }
        if (typeof value === "number") {
            return formatLogoNumber(value);
        }
        return value;
    }
    private showValue(value: LogoValue): string {
        if (isLogoList(value)) {
            return `[${value.map((item) => this.showValue(item)).join(" ")}]`;
        }
        if (typeof value === "number") {
            return formatLogoNumber(value);
        }
        return value;
    }
    private moveTurtle(distance: number): void {
        const headingInRadians = (this.turtleHeading * Math.PI) / 180;
        const nextX = this.turtleX + distance * Math.sin(headingInRadians);
        const nextY = this.turtleY + distance * Math.cos(headingInRadians);
        if (this.turtlePenDown) {
            this.turtleSegments.push([this.turtleX, this.turtleY, nextX, nextY]);
        }
        this.turtleX = nextX;
        this.turtleY = nextY;
    }
    private renderTurtleDrawing(): void {
        if (this.turtleSegments.length === 0) {
            this.sink.writeLine("(no turtle path)");
            return;
        }
        const roundedSegments = this.turtleSegments.map(
            ([startX, startY, endX, endY]) =>
                [Math.round(startX), Math.round(startY), Math.round(endX), Math.round(endY)] as [
                    number,
                    number,
                    number,
                    number,
                ],
        );
        const allX = roundedSegments.flatMap(([startX, , endX]) => [startX, endX]);
        const allY = roundedSegments.flatMap(([, startY, , endY]) => [startY, endY]);
        const minimumX = Math.min(...allX);
        const maximumX = Math.max(...allX);
        const minimumY = Math.min(...allY);
        const maximumY = Math.max(...allY);
        const width = maximumX - minimumX + 1;
        const height = maximumY - minimumY + 1;
        if (width > MAXIMUM_DRAW_COLUMNS || height > MAXIMUM_DRAW_ROWS) {
            throw new Error(
                `DRAW grid of ${width} by ${height} exceeds the ${MAXIMUM_DRAW_COLUMNS} by ${MAXIMUM_DRAW_ROWS} character limit.`,
            );
        }
        const grid: Array<Array<string>> = [];
        for (let rowIndex = 0; rowIndex < height; rowIndex++) {
            grid.push(new Array<string>(width).fill(" "));
        }
        const plot = (x: number, y: number): void => {
            const row = grid[maximumY - y];
            if (row) {
                row[x - minimumX] = "#";
            }
        };
        for (const [startX, startY, endX, endY] of roundedSegments) {
            const stepCount = Math.max(Math.abs(endX - startX), Math.abs(endY - startY));
            if (stepCount === 0) {
                plot(startX, startY);
                continue;
            }
            for (let step = 0; step <= stepCount; step++) {
                const ratio = step / stepCount;
                plot(
                    Math.round(startX + (endX - startX) * ratio),
                    Math.round(startY + (endY - startY) * ratio),
                );
            }
        }
        for (const row of grid) {
            this.sink.writeLine(row.join("").trimEnd());
        }
    }
}
export { LogoInterpreter, renderLogoList, tokenizeLogo };
export type { LogoOutputSink, LogoRunOptions, LogoValue };
