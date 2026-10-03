import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { SessionDescriptorRecord } from "@sharedKernel/SessionDescriptorRecord.ts";
import type { TerminalPerformerContract } from "@clientTheatre/runtimePerformers/TerminalPerformerContract.ts";
import { PyodidePerformer } from "@clientTheatre/runtimePerformers/PyodidePerformer.ts";
import { RubyWasmPerformer } from "@clientTheatre/runtimePerformers/RubyWasmPerformer.ts";
import { LuaWasmPerformer } from "@clientTheatre/runtimePerformers/LuaWasmPerformer.ts";
import { PhpWasmPerformer } from "@clientTheatre/runtimePerformers/PhpWasmPerformer.ts";
import { WasmPackPerformer } from "@clientTheatre/runtimePerformers/WasmPackPerformer.ts";
import { EmscriptenPerformer } from "@clientTheatre/runtimePerformers/EmscriptenPerformer.ts";
import { GoWasmPerformer } from "@clientTheatre/runtimePerformers/GoWasmPerformer.ts";
import { WasiWasmPerformer } from "@clientTheatre/runtimePerformers/WasiWasmPerformer.ts";
import { DartWasmPerformer } from "@clientTheatre/runtimePerformers/DartWasmPerformer.ts";
import { DotNetWasmPerformer } from "@clientTheatre/runtimePerformers/DotNetWasmPerformer.ts";
import { TeaVmPerformer } from "@clientTheatre/runtimePerformers/TeaVmPerformer.ts";
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
            ["ruby", (sessionBaseUrl) => new RubyWasmPerformer(sessionBaseUrl)],
            ["lua", (sessionBaseUrl) => new LuaWasmPerformer(sessionBaseUrl)],
            ["php", (sessionBaseUrl) => new PhpWasmPerformer(sessionBaseUrl)],
            ["rust", (sessionBaseUrl) => new WasmPackPerformer(sessionBaseUrl)],
            ["c", (sessionBaseUrl) => new EmscriptenPerformer(sessionBaseUrl)],
            ["cpp", (sessionBaseUrl) => new EmscriptenPerformer(sessionBaseUrl)],
            ["go", (sessionBaseUrl) => new GoWasmPerformer(sessionBaseUrl)],
            ["zig", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["swift", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["kotlin", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["dart", (sessionBaseUrl) => new DartWasmPerformer(sessionBaseUrl)],
            ["java", (sessionBaseUrl) => new TeaVmPerformer(sessionBaseUrl)],
            ["csharp", (sessionBaseUrl) => new DotNetWasmPerformer(sessionBaseUrl)],
            ["assemblyscript", (sessionBaseUrl) => new WasmPackPerformer(sessionBaseUrl)],
            ["ocaml", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
            ["haskell", (sessionBaseUrl) => new WasiWasmPerformer(sessionBaseUrl)],
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
