import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { PyodidePerformer } from "@clientTheatre/runtimePerformers/PyodidePerformer.ts";
import { WebRPerformer } from "@clientTheatre/runtimePerformers/WebRPerformer.ts";
import { CherryCljsPerformer } from "@clientTheatre/runtimePerformers/CherryCljsPerformer.ts";
import { BiwaschemePerformer } from "@clientTheatre/runtimePerformers/BiwaschemePerformer.ts";
import { TauPrologPerformer } from "@clientTheatre/runtimePerformers/TauPrologPerformer.ts";
import { RubyWasmPerformer } from "@clientTheatre/runtimePerformers/RubyWasmPerformer.ts";
import { ZeroPerlPerformer } from "@clientTheatre/runtimePerformers/ZeroPerlPerformer.ts";
import { LuaWasmPerformer } from "@clientTheatre/runtimePerformers/LuaWasmPerformer.ts";
import { PhpWasmPerformer } from "@clientTheatre/runtimePerformers/PhpWasmPerformer.ts";
import { WasmPackPerformer } from "@clientTheatre/runtimePerformers/WasmPackPerformer.ts";
import { CommonLispPerformer } from "@clientTheatre/runtimePerformers/CommonLispPerformer.ts";
import { TclWaclPerformer } from "@clientTheatre/runtimePerformers/TclWaclPerformer.ts";
import { ForthPerformer } from "@clientTheatre/runtimePerformers/ForthPerformer.ts";
import { SmalltalkPerformer } from "@clientTheatre/runtimePerformers/SmalltalkPerformer.ts";
import { EmscriptenPerformer } from "@clientTheatre/runtimePerformers/EmscriptenPerformer.ts";
import { RiscvPerformer } from "@clientTheatre/runtimePerformers/RiscvPerformer.ts";
import { VerilogWasmPerformer } from "@clientTheatre/runtimePerformers/VerilogWasmPerformer.ts";
import { SolidityPerformer } from "@clientTheatre/runtimePerformers/SolidityPerformer.ts";
import { VimWasmPerformer } from "@clientTheatre/runtimePerformers/VimWasmPerformer.ts";
import { BrainfuckPerformer } from "@clientTheatre/runtimePerformers/BrainfuckPerformer.ts";
import { BefungePerformer } from "@clientTheatre/runtimePerformers/BefungePerformer.ts";
import { LolcodePerformer } from "@clientTheatre/runtimePerformers/LolcodePerformer.ts";
import { NgnAplPerformer } from "@clientTheatre/runtimePerformers/NgnAplPerformer.ts";
import { GoWasmPerformer } from "@clientTheatre/runtimePerformers/GoWasmPerformer.ts";
import { WasiWasmPerformer } from "@clientTheatre/runtimePerformers/WasiWasmPerformer.ts";
import { DartWasmPerformer } from "@clientTheatre/runtimePerformers/DartWasmPerformer.ts";
import { BlazorPerformer } from "@clientTheatre/runtimePerformers/BlazorPerformer.ts";
import { TeaVmPerformer } from "@clientTheatre/runtimePerformers/TeaVmPerformer.ts";
import { JavaScriptPerformer } from "@clientTheatre/runtimePerformers/JavaScriptPerformer.ts";
import { TypeScriptPerformer } from "@clientTheatre/runtimePerformers/TypeScriptPerformer.ts";
import { KotlinJsPerformer } from "@clientTheatre/runtimePerformers/KotlinJsPerformer.ts";
import { ScalaJsPerformer } from "@clientTheatre/runtimePerformers/ScalaJsPerformer.ts";
import { FablePerformer } from "@clientTheatre/runtimePerformers/FablePerformer.ts";
import { ElmPerformer } from "@clientTheatre/runtimePerformers/ElmPerformer.ts";
import { ReScriptPerformer } from "@clientTheatre/runtimePerformers/ReScriptPerformer.ts";
import { PureScriptPerformer } from "@clientTheatre/runtimePerformers/PureScriptPerformer.ts";
import { GleamPerformer } from "@clientTheatre/runtimePerformers/GleamPerformer.ts";
import { HaxePerformer } from "@clientTheatre/runtimePerformers/HaxePerformer.ts";
import { SqliteWasmPerformer } from "@clientTheatre/runtimePerformers/SqliteWasmPerformer.ts";
import { DuckDbWasmPerformer } from "@clientTheatre/runtimePerformers/DuckDbWasmPerformer.ts";
import { PglitePerformer } from "@clientTheatre/runtimePerformers/PglitePerformer.ts";
import { BusyboxAwkPerformer } from "@clientTheatre/runtimePerformers/BusyboxAwkPerformer.ts";
import { JqWasmPerformer } from "@clientTheatre/runtimePerformers/JqWasmPerformer.ts";
import { BusyboxShellPerformer } from "@clientTheatre/runtimePerformers/BusyboxShellPerformer.ts";
import { LogoPerformer } from "@clientTheatre/runtimePerformers/LogoPerformer.ts";
import { GwBasicPerformer } from "@clientTheatre/runtimePerformers/GwBasicPerformer.ts";
import { SmlPerformer } from "@clientTheatre/runtimePerformers/SmlPerformer.ts";
import { M6502Performer } from "@clientTheatre/runtimePerformers/M6502Performer.ts";
class TerminalPerformerFactory {
    private readonly creatorClosures: Map<
        LanguageIdentifier,
        (sessionBaseUrl: string) => TerminalPerformerContract
    >;
    constructor() {
        const performerEntries: Array<
            [LanguageIdentifier, (sessionBaseUrl: string) => TerminalPerformerContract]
        > = [
            ["python", (sessionBaseUrl) => new PyodidePerformer(sessionBaseUrl)],
            ["r", (sessionBaseUrl) => new WebRPerformer(sessionBaseUrl)],
            ["clojurescript", (sessionBaseUrl) => new CherryCljsPerformer(sessionBaseUrl)],
            ["scheme", (sessionBaseUrl) => new BiwaschemePerformer(sessionBaseUrl)],
            ["prolog", (sessionBaseUrl) => new TauPrologPerformer(sessionBaseUrl)],
            ["ruby", (sessionBaseUrl) => new RubyWasmPerformer(sessionBaseUrl)],
            ["perl", (sessionBaseUrl) => new ZeroPerlPerformer(sessionBaseUrl)],
            ["pascal", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["cobol", (sessionBaseUrl) => new EmscriptenPerformer(sessionBaseUrl)],
            ["fortran", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["lua", (sessionBaseUrl) => new LuaWasmPerformer(sessionBaseUrl)],
            ["php", (sessionBaseUrl) => new PhpWasmPerformer(sessionBaseUrl)],
            ["rust", (sessionBaseUrl) => new WasmPackPerformer(sessionBaseUrl)],
            ["commonlisp", (sessionBaseUrl) => new CommonLispPerformer(sessionBaseUrl)],
            ["tcl", (sessionBaseUrl) => new TclWaclPerformer(sessionBaseUrl)],
            ["forth", (sessionBaseUrl) => new ForthPerformer(sessionBaseUrl)],
            ["smalltalk", (sessionBaseUrl) => new SmalltalkPerformer(sessionBaseUrl)],
            ["c", (sessionBaseUrl) => new EmscriptenPerformer(sessionBaseUrl)],
            ["brainfuck", (sessionBaseUrl) => new BrainfuckPerformer(sessionBaseUrl)],
            ["befunge", (sessionBaseUrl) => new BefungePerformer(sessionBaseUrl)],
            ["lolcode", (sessionBaseUrl) => new LolcodePerformer(sessionBaseUrl)],
            ["apl", (sessionBaseUrl) => new NgnAplPerformer(sessionBaseUrl)],
            ["cpp", (sessionBaseUrl) => new EmscriptenPerformer(sessionBaseUrl)],
            ["riscv", (sessionBaseUrl) => new RiscvPerformer(sessionBaseUrl)],
            ["verilog", (sessionBaseUrl) => new VerilogWasmPerformer(sessionBaseUrl)],
            ["solidity", (sessionBaseUrl) => new SolidityPerformer(sessionBaseUrl)],
            ["vimscript", (sessionBaseUrl) => new VimWasmPerformer(sessionBaseUrl)],
            ["go", (sessionBaseUrl) => new GoWasmPerformer(sessionBaseUrl)],
            ["logo", (sessionBaseUrl) => new LogoPerformer(sessionBaseUrl)],
            ["gwbasic", (sessionBaseUrl) => new GwBasicPerformer(sessionBaseUrl)],
            ["sml", (sessionBaseUrl) => new SmlPerformer(sessionBaseUrl)],
            ["m6502", (sessionBaseUrl) => new M6502Performer(sessionBaseUrl)],
            ["zig", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["swift", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["kotlin", (sessionBaseUrl) => new KotlinJsPerformer(sessionBaseUrl)],
            ["dart", (sessionBaseUrl) => new DartWasmPerformer(sessionBaseUrl)],
            ["java", (sessionBaseUrl) => new TeaVmPerformer(sessionBaseUrl)],
            ["csharp", (sessionBaseUrl) => new BlazorPerformer(sessionBaseUrl)],
            ["assemblyscript", (sessionBaseUrl) => new WasmPackPerformer(sessionBaseUrl)],
            ["ocaml", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["haskell", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["javascript", (sessionBaseUrl) => new JavaScriptPerformer(sessionBaseUrl)],
            ["typescript", (sessionBaseUrl) => new TypeScriptPerformer(sessionBaseUrl)],
            ["sql", (sessionBaseUrl) => new SqliteWasmPerformer(sessionBaseUrl)],
            ["duckdb", (sessionBaseUrl) => new DuckDbWasmPerformer(sessionBaseUrl)],
            ["pglite", (sessionBaseUrl) => new PglitePerformer(sessionBaseUrl)],
            ["awk", (sessionBaseUrl) => new BusyboxAwkPerformer(sessionBaseUrl)],
            ["jq", (sessionBaseUrl) => new JqWasmPerformer(sessionBaseUrl)],
            ["bash", (sessionBaseUrl) => new BusyboxShellPerformer(sessionBaseUrl)],
            ["scala", (sessionBaseUrl) => new ScalaJsPerformer(sessionBaseUrl)],
            ["fsharp", (sessionBaseUrl) => new FablePerformer(sessionBaseUrl)],
            ["elm", (sessionBaseUrl) => new ElmPerformer(sessionBaseUrl)],
            ["rescript", (sessionBaseUrl) => new ReScriptPerformer(sessionBaseUrl)],
            ["purescript", (sessionBaseUrl) => new PureScriptPerformer(sessionBaseUrl)],
            ["gleam", (sessionBaseUrl) => new GleamPerformer(sessionBaseUrl)],
            ["haxe", (sessionBaseUrl) => new HaxePerformer(sessionBaseUrl)],
        ];
        this.creatorClosures = new Map(performerEntries);
    }
    createForLanguage(
        languageIdentifier: LanguageIdentifier,
        sessionBaseUrl: string,
        _sessionDescriptor: SessionDescriptorRecord,
    ): TerminalPerformerContract {
        const creatorClosure = this.creatorClosures.get(languageIdentifier);
        if (!creatorClosure) {
            throw new Error(`No terminal performer registered for ${languageIdentifier}.`);
        }
        return creatorClosure(sessionBaseUrl);
    }
}
export { TerminalPerformerFactory };
