import type { TerminalStageController } from "@clientTheatre/services/TerminalStageController.ts";
let activeStage: TerminalStageController | undefined;
function registerTerminalStage(stage: TerminalStageController): void {
    activeStage = stage;
}
function installTerminalConsoleBridge(): void {
    const bridge = (originalMethod: (...args: Array<unknown>) => void) => {
        return (...args: Array<unknown>) => {
            originalMethod(...args);
            activeStage?.writeLine(args.map((argument) => String(argument)).join(" "));
        };
    };
    console.log = bridge(console.log);
    console.error = bridge(console.error);
    console.info = bridge(console.info);
    console.warn = bridge(console.warn);
    console.debug = bridge(console.debug);
}
export { installTerminalConsoleBridge, registerTerminalStage };
