import { ServerConfiguration } from "@serverAtelier/ServerConfiguration.ts";
import { ScopedLogger } from "@serverAtelier/ScopedLogger.ts";
import { HttpServerHost } from "@serverAtelier/HttpServerHost.ts";
import { HttpRequestRouter } from "@serverAtelier/HttpRequestRouter.ts";
import { SessionRegistry } from "@serverAtelier/SessionRegistry.ts";
import { StaticSiteExporter } from "@serverAtelier/StaticSiteExporter.ts";
import { BuildOrchestrator } from "@serverAtelier/BuildOrchestrator.ts";
import { ZipArchiveExtractor } from "@serverAtelier/ZipArchiveExtractor.ts";
import { LanguageIdentifierResolver } from "@serverAtelier/LanguageIdentifierResolver.ts";
import { FileSystemOperations } from "@serverAtelier/utilities/FileSystemOperations.ts";
import { ProcessRunner } from "@serverAtelier/utilities/ProcessRunner.ts";
import { PathGuard } from "@serverAtelier/utilities/PathGuard.ts";
import { IdentifierGenerator } from "@serverAtelier/utilities/IdentifierGenerator.ts";
import { LocalToolchainProvisioner } from "@serverAtelier/LocalToolchainProvisioner.ts";
import { LanguagePluginRegistry } from "@serverAtelier/pluginHost/LanguagePluginRegistry.ts";
import { UserSourceFileCopier } from "@serverAtelier/pluginHost/UserSourceFileCopier.ts";
import { UserManifestWriter } from "@serverAtelier/pluginHost/UserManifestWriter.ts";
import { NullCompilerStrategy } from "@serverAtelier/compilerStrategies/NullCompilerStrategy.ts";
import { EmscriptenCompilerStrategy } from "@serverAtelier/compilerStrategies/EmscriptenCompilerStrategy.ts";
import { WasmPackCompilerStrategy } from "@serverAtelier/compilerStrategies/WasmPackCompilerStrategy.ts";
import { GoWasmCompilerStrategy } from "@serverAtelier/compilerStrategies/GoWasmCompilerStrategy.ts";
import { TypeScriptCompilerStrategy } from "@serverAtelier/compilerStrategies/TypeScriptCompilerStrategy.ts";
import { ZigWasmCompilerStrategy } from "@serverAtelier/compilerStrategies/ZigWasmCompilerStrategy.ts";
import { SwiftWasmCompilerStrategy } from "@serverAtelier/compilerStrategies/SwiftWasmCompilerStrategy.ts";
import { KotlinWasmCompilerStrategy } from "@serverAtelier/compilerStrategies/KotlinWasmCompilerStrategy.ts";
import { DartWasmCompilerStrategy } from "@serverAtelier/compilerStrategies/DartWasmCompilerStrategy.ts";
import { TeaVmCompilerStrategy } from "@serverAtelier/compilerStrategies/TeaVmCompilerStrategy.ts";
import { DotNetBlazorCompilerStrategy } from "@serverAtelier/compilerStrategies/DotNetBlazorCompilerStrategy.ts";
import { AssemblyScriptCompilerStrategy } from "@serverAtelier/compilerStrategies/AssemblyScriptCompilerStrategy.ts";
import { OcamlWasmCompilerStrategy } from "@serverAtelier/compilerStrategies/OcamlWasmCompilerStrategy.ts";
import { GhcWasmCompilerStrategy } from "@serverAtelier/compilerStrategies/GhcWasmCompilerStrategy.ts";
import { PyodideRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/PyodideRuntimeAssembler.ts";
import { NullRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/NullRuntimeAssembler.ts";
import { TypeScriptLoaderRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/TypeScriptLoaderRuntimeAssembler.ts";
import { KotlinJsGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/KotlinJsGlueRuntimeAssembler.ts";
import { SqliteWasmRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/SqliteWasmRuntimeAssembler.ts";
import { RubyWasmRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/RubyWasmRuntimeAssembler.ts";
import { LuaWasmRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/LuaWasmRuntimeAssembler.ts";
import { PhpWasmRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/PhpWasmRuntimeAssembler.ts";
import { WasmPackGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/WasmPackGlueRuntimeAssembler.ts";
import { EmscriptenGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/EmscriptenGlueRuntimeAssembler.ts";
import { GoWasmExecRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/GoWasmExecRuntimeAssembler.ts";
import { WasiWasmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/WasiWasmGlueRuntimeAssembler.ts";
import { DartWasmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/DartWasmGlueRuntimeAssembler.ts";
import { BlazorGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/BlazorGlueRuntimeAssembler.ts";
import { TeaVmGlueRuntimeAssembler } from "@serverAtelier/runtimeAssemblers/TeaVmGlueRuntimeAssembler.ts";
import { PythonLanguagePlugin } from "@serverAtelier/languagePlugins/PythonLanguagePlugin.ts";
import { RubyLanguagePlugin } from "@serverAtelier/languagePlugins/RubyLanguagePlugin.ts";
import { LuaLanguagePlugin } from "@serverAtelier/languagePlugins/LuaLanguagePlugin.ts";
import { PhpLanguagePlugin } from "@serverAtelier/languagePlugins/PhpLanguagePlugin.ts";
import { RustLanguagePlugin } from "@serverAtelier/languagePlugins/RustLanguagePlugin.ts";
import { CLanguagePlugin } from "@serverAtelier/languagePlugins/CLanguagePlugin.ts";
import { CppLanguagePlugin } from "@serverAtelier/languagePlugins/CppLanguagePlugin.ts";
import { GoLanguagePlugin } from "@serverAtelier/languagePlugins/GoLanguagePlugin.ts";
import { ZigLanguagePlugin } from "@serverAtelier/languagePlugins/ZigLanguagePlugin.ts";
import { SwiftLanguagePlugin } from "@serverAtelier/languagePlugins/SwiftLanguagePlugin.ts";
import { KotlinLanguagePlugin } from "@serverAtelier/languagePlugins/KotlinLanguagePlugin.ts";
import { DartLanguagePlugin } from "@serverAtelier/languagePlugins/DartLanguagePlugin.ts";
import { JavaLanguagePlugin } from "@serverAtelier/languagePlugins/JavaLanguagePlugin.ts";
import { CSharpLanguagePlugin } from "@serverAtelier/languagePlugins/CSharpLanguagePlugin.ts";
import { AssemblyScriptLanguagePlugin } from "@serverAtelier/languagePlugins/AssemblyScriptLanguagePlugin.ts";
import { OcamlLanguagePlugin } from "@serverAtelier/languagePlugins/OcamlLanguagePlugin.ts";
import { HaskellLanguagePlugin } from "@serverAtelier/languagePlugins/HaskellLanguagePlugin.ts";
import { JavaScriptLanguagePlugin } from "@serverAtelier/languagePlugins/JavaScriptLanguagePlugin.ts";
import { TypeScriptLanguagePlugin } from "@serverAtelier/languagePlugins/TypeScriptLanguagePlugin.ts";
import { SqlLanguagePlugin } from "@serverAtelier/languagePlugins/SqlLanguagePlugin.ts";
class ServerApplication {
    private readonly serverConfiguration: ServerConfiguration;
    private readonly scopedLogger: ScopedLogger;
    private readonly httpServerHost: HttpServerHost;
    private readonly fileSystemOperations: FileSystemOperations;
    constructor() {
        this.serverConfiguration = new ServerConfiguration();
        this.scopedLogger = new ScopedLogger("ServerApplication");
        this.fileSystemOperations = new FileSystemOperations();
        const processRunner = new ProcessRunner();
        const pathGuard = new PathGuard();
        const identifierGenerator = new IdentifierGenerator();
        const toolchainProvisioner = new LocalToolchainProvisioner(
            this.fileSystemOperations,
            processRunner,
            new ScopedLogger("LocalToolchainProvisioner"),
        );
        void toolchainProvisioner;
        const languageIdentifierResolver = new LanguageIdentifierResolver();
        const zipArchiveExtractor = new ZipArchiveExtractor(this.fileSystemOperations, pathGuard);
        const sessionRegistry = new SessionRegistry(
            this.serverConfiguration.sessionsDirectory,
            this.serverConfiguration.sessionTimeToLiveMilliseconds,
            this.fileSystemOperations,
            identifierGenerator,
            new ScopedLogger("SessionRegistry"),
        );
        const nullCompilerStrategy = new NullCompilerStrategy();
        const emscriptenCompilerStrategy = new EmscriptenCompilerStrategy(
            processRunner,
            this.fileSystemOperations,
        );
        const sourceFileCopier = new UserSourceFileCopier(this.fileSystemOperations);
        const manifestWriter = new UserManifestWriter(this.fileSystemOperations);
        const languagePluginRegistry = new LanguagePluginRegistry([
            new PythonLanguagePlugin(
                nullCompilerStrategy,
                new PyodideRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new RubyLanguagePlugin(
                nullCompilerStrategy,
                new RubyWasmRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new LuaLanguagePlugin(
                nullCompilerStrategy,
                new LuaWasmRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new PhpLanguagePlugin(
                nullCompilerStrategy,
                new PhpWasmRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new RustLanguagePlugin(
                new WasmPackCompilerStrategy(processRunner, this.fileSystemOperations),
                new WasmPackGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new CLanguagePlugin(
                emscriptenCompilerStrategy,
                new EmscriptenGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new CppLanguagePlugin(
                new EmscriptenCompilerStrategy(
                    processRunner,
                    this.fileSystemOperations,
                    undefined,
                    true,
                ),
                new EmscriptenGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new GoLanguagePlugin(
                new GoWasmCompilerStrategy(processRunner),
                new GoWasmExecRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new ZigLanguagePlugin(
                new ZigWasmCompilerStrategy(processRunner, this.fileSystemOperations),
                new WasiWasmGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new SwiftLanguagePlugin(
                new SwiftWasmCompilerStrategy(processRunner, this.fileSystemOperations),
                new WasiWasmGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new KotlinLanguagePlugin(
                new KotlinWasmCompilerStrategy(processRunner, this.fileSystemOperations),
                new KotlinJsGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new DartLanguagePlugin(
                new DartWasmCompilerStrategy(processRunner, this.fileSystemOperations),
                new DartWasmGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new JavaLanguagePlugin(
                new TeaVmCompilerStrategy(processRunner, this.fileSystemOperations),
                new TeaVmGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new CSharpLanguagePlugin(
                new DotNetBlazorCompilerStrategy(processRunner, this.fileSystemOperations),
                new BlazorGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new AssemblyScriptLanguagePlugin(
                new AssemblyScriptCompilerStrategy(processRunner),
                new WasmPackGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new OcamlLanguagePlugin(
                new OcamlWasmCompilerStrategy(processRunner, this.fileSystemOperations),
                new WasiWasmGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new HaskellLanguagePlugin(
                new GhcWasmCompilerStrategy(processRunner, this.fileSystemOperations),
                new WasiWasmGlueRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new JavaScriptLanguagePlugin(
                nullCompilerStrategy,
                new NullRuntimeAssembler(),
                sourceFileCopier,
                manifestWriter,
            ),
            new TypeScriptLanguagePlugin(
                new TypeScriptCompilerStrategy(),
                new TypeScriptLoaderRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
            new SqlLanguagePlugin(
                nullCompilerStrategy,
                new SqliteWasmRuntimeAssembler(this.fileSystemOperations),
                sourceFileCopier,
                manifestWriter,
            ),
        ]);
        const buildOrchestrator = new BuildOrchestrator(
            languageIdentifierResolver,
            sessionRegistry,
            zipArchiveExtractor,
            languagePluginRegistry,
            this.fileSystemOperations,
            new ScopedLogger("BuildOrchestrator"),
        );
        const staticSiteExporter = new StaticSiteExporter(
            this.fileSystemOperations,
            new ScopedLogger("StaticSiteExporter"),
        );
        const httpRequestRouter = new HttpRequestRouter(
            buildOrchestrator,
            sessionRegistry,
            staticSiteExporter,
            languagePluginRegistry,
            this.serverConfiguration,
            new ScopedLogger("HttpRequestRouter"),
            pathGuard,
        );
        this.httpServerHost = new HttpServerHost(
            httpRequestRouter,
            this.serverConfiguration,
            new ScopedLogger("HttpServerHost"),
        );
    }
    async run(): Promise<void> {
        await this.fileSystemOperations.ensureDirectoryExists(
            this.serverConfiguration.sessionsDirectory,
        );
        this.scopedLogger.logInformation("Universal WASM Platform server starting.");
        this.httpServerHost.start();
        const shutdownHandler = async () => {
            this.scopedLogger.logInformation("Shutting down.");
            await this.httpServerHost.stop();
            process.exit(0);
        };
        process.on("SIGINT", () => void shutdownHandler());
        process.on("SIGTERM", () => void shutdownHandler());
    }
}
export { ServerApplication };
