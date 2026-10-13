import { build } from "esbuild";
import type { BuildContextRecord } from "@sharedKernel/BuildContextRecord.ts";
import type { CompilerStrategyContract } from "@serverAtelier/compilerStrategies/CompilerStrategyContract.ts";
class TypeScriptCompilerStrategy implements CompilerStrategyContract {
    async compileSourceInto(context: BuildContextRecord): Promise<void> {
        try {
            await build({
                entryPoints: [`${context.sourceDirectory}/${context.entryFileRelativePath}`],
                outfile: `${context.runtimeDirectory}/app.js`,
                bundle: true,
                format: "esm",
                platform: "browser",
                target: "es2020",
                minify: false,
                logLevel: "silent",
            });
        } catch (compilationError) {
            const compilationMessage =
                compilationError instanceof Error
                    ? compilationError.message
                    : String(compilationError);
            throw new Error(`TypeScript compilation failed: ${compilationMessage}`);
        }
    }
}
export { TypeScriptCompilerStrategy };
