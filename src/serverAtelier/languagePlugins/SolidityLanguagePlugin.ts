import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { BuildOutcomeRecord } from "@sharedKernel/BuildOutcomeRecord.ts";
import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
import type { RuntimeAssetAssemblerContract } from "@serverAtelier/runtimeAssemblers/RuntimeAssetAssemblerContract.ts";
import type { LanguagePluginContract } from "@serverAtelier/pluginHost/LanguagePluginContract.ts";
import { UserSourceFileCopier } from "@serverAtelier/pluginHost/UserSourceFileCopier.ts";
import { UserManifestWriter } from "@serverAtelier/pluginHost/UserManifestWriter.ts";
class SolidityLanguagePlugin implements LanguagePluginContract {
    readonly languageIdentifier: LanguageIdentifier = "solidity";
    readonly displayName = "Solidity";
    readonly supportedFileExtensions = [".sol"];
    private readonly compilerStrategy: CompilerStrategyContract;
    private readonly runtimeAssembler: RuntimeAssetAssemblerContract;
    private readonly sourceFileCopier: UserSourceFileCopier;
    private readonly manifestWriter: UserManifestWriter;
    constructor(
        compilerStrategy: CompilerStrategyContract,
        runtimeAssembler: RuntimeAssetAssemblerContract,
        sourceFileCopier: UserSourceFileCopier,
        manifestWriter: UserManifestWriter,
    ) {
        this.compilerStrategy = compilerStrategy;
        this.runtimeAssembler = runtimeAssembler;
        this.sourceFileCopier = sourceFileCopier;
        this.manifestWriter = manifestWriter;
    }
    async buildIntoSession(context: BuildContextRecord): Promise<BuildOutcomeRecord> {
        await this.compilerStrategy.compileSourceInto(context);
        await this.runtimeAssembler.assembleRuntimeInto(context);
        await this.sourceFileCopier.copyInto(context.sourceDirectory, context.userCodeDirectory);
        const manifest = await this.manifestWriter.writeInto(
            context.userCodeDirectory,
            context.entryFileRelativePath,
            this.languageIdentifier,
            context.programArguments,
        );
        return {
            runtimeDirectory: context.runtimeDirectory,
            userCodeDirectory: context.userCodeDirectory,
            entryFileRelativePath: context.entryFileRelativePath,
            manifest,
        };
    }
}
export { SolidityLanguagePlugin };
