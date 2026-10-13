function parseProgramArgumentText(argumentText: string): Array<string> {
    return argumentText
        .split(/\r?\n/)
        .map((argumentLine) => argumentLine.trim())
        .filter((argumentLine) => argumentLine.length > 0);
}
export { parseProgramArgumentText };
