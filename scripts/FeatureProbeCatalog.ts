import type { LanguageIdentifier } from "@sharedKernel/LanguageIdentifier.ts";
type FeatureName = "stdin" | "arguments" | "fileIo" | "multiFile";
interface UnsupportedFeature {
    feature: FeatureName;
    reason: string;
}
interface FeatureProbeDefinition {
    languageIdentifier: LanguageIdentifier;
    entryFileName: string;
    sourceFiles: Record<string, string>;
    programArguments: ReadonlyArray<string>;
    terminalAnswers: ReadonlyArray<string>;
    expectedLines: ReadonlyArray<string>;
    exercisedFeatures: ReadonlyArray<FeatureName>;
    unsupportedFeatures: ReadonlyArray<UnsupportedFeature>;
}
const PROBE_ARGUMENTS: ReadonlyArray<string> = ["alpha", "beta"];
const PROBE_ANSWERS: ReadonlyArray<string> = ["Ada"];
const FEATURE_PROBES: ReadonlyArray<FeatureProbeDefinition> = [
    {
        languageIdentifier: "python",
        entryFileName: "main.py",
        sourceFiles: {
            "main.py":
                "import sys\n" +
                "from helper import label\n" +
                "name = input('name? ')\n" +
                "print('greet:' + label() + ':' + name)\n" +
                "print('arg0:' + (sys.argv[1] if len(sys.argv) > 1 else 'none'))\n" +
                "with open('out.txt', 'w') as handle:\n" +
                "    handle.write('written')\n" +
                "with open('out.txt') as handle:\n" +
                "    print('file:' + handle.read())\n" +
                "print('PROBE-DONE')\n",
            "helper.py": "def label():\n    return 'helper'\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "ruby",
        entryFileName: "main.rb",
        sourceFiles: {
            "main.rb":
                "require_relative 'helper'\n" +
                "name = $stdin.gets&.chomp\n" +
                'puts "greet:#{Helper.label}:#{name}"\n' +
                "puts \"arg0:#{ARGV[0] || 'none'}\"\n" +
                "File.write('out.txt', 'written')\n" +
                "puts \"file:#{File.read('out.txt')}\"\n" +
                "puts 'PROBE-DONE'\n",
            "helper.rb": "module Helper\n  def self.label\n    'helper'\n  end\nend\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "lua",
        entryFileName: "main.lua",
        sourceFiles: {
            "main.lua":
                "local helper = dofile('helper.lua')\n" +
                "local name = io.read()\n" +
                "print('greet:' .. helper.label .. ':' .. name)\n" +
                "print('arg0:' .. (arg and arg[1] or 'none'))\n" +
                "local out = io.open('out.txt', 'w')\n" +
                "out:write('written')\n" +
                "out:close()\n" +
                "local readBack = io.open('out.txt', 'r')\n" +
                "print('file:' .. readBack:read('*a'))\n" +
                "readBack:close()\n" +
                "print('PROBE-DONE')\n",
            "helper.lua": "return { label = 'helper' }\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "php",
        entryFileName: "main.php",
        sourceFiles: {
            "main.php":
                "<?php\n" +
                "require 'helper.php';\n" +
                "$name = trim(fgets(STDIN));\n" +
                "echo 'greet:' . helper_label() . ':' . $name . \"\\n\";\n" +
                "echo 'arg0:' . ($argv[1] ?? 'none') . \"\\n\";\n" +
                "file_put_contents('out.txt', 'written');\n" +
                "echo 'file:' . file_get_contents('out.txt') . \"\\n\";\n" +
                "echo 'PROBE-DONE' . \"\\n\";\n",
            "helper.php": "<?php\nfunction helper_label() {\n    return 'helper';\n}\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "rust",
        entryFileName: "main.rs",
        sourceFiles: {
            "main.rs":
                "use wasm_bindgen::prelude::*;\n" +
                "\n" +
                "#[wasm_bindgen]\n" +
                'extern "C" {\n' +
                "    fn __wasmverseReadLine() -> String;\n" +
                "    fn __wasmverseProgramArgument(index: u32) -> String;\n" +
                "    #[wasm_bindgen(js_name = __wasmverseProgramArgumentCount)]\n" +
                "    static ARGUMENT_COUNT: JsValue;\n" +
                "}\n" +
                "\n" +
                "#[wasm_bindgen]\n" +
                "pub fn run() -> String {\n" +
                "    let mut output = String::new();\n" +
                "    let name = __wasmverseReadLine();\n" +
                '    output.push_str(&format!("greet:helper:{}\\n", name));\n' +
                "    let argument_count = ARGUMENT_COUNT.as_f64().unwrap_or(0.0) as u32;\n" +
                "    let first_argument = if argument_count > 0 {\n" +
                "        __wasmverseProgramArgument(0)\n" +
                "    } else {\n" +
                '        String::from("none")\n' +
                "    };\n" +
                '    output.push_str(&format!("arg0:{}\\n", first_argument));\n' +
                '    output.push_str("PROBE-DONE\\n");\n' +
                "    output\n" +
                "}\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments"],
        unsupportedFeatures: [
            {
                feature: "fileIo",
                reason: "the wasm-bindgen scaffold has no host filesystem",
            },
            {
                feature: "multiFile",
                reason: "the scaffold compiles only the entry file",
            },
        ],
    },
    {
        languageIdentifier: "c",
        entryFileName: "main.c",
        sourceFiles: {
            "main.c":
                "#include <stdio.h>\n" +
                "#include <string.h>\n" +
                '#include "helper.h"\n' +
                "\n" +
                "int main(int argc, char **argv) {\n" +
                "    char name[128];\n" +
                "    if (fgets(name, sizeof(name), stdin) == NULL) {\n" +
                "        name[0] = '\\0';\n" +
                "    }\n" +
                "    name[strcspn(name, \"\\r\\n\")] = '\\0';\n" +
                '    printf("greet:%s:%s\\n", helper_label(), name);\n' +
                '    printf("arg0:%s\\n", argc > 1 ? argv[1] : "none");\n' +
                '    FILE *out = fopen("out.txt", "w");\n' +
                "    if (out != NULL) {\n" +
                '        fputs("written", out);\n' +
                "        fclose(out);\n" +
                "    }\n" +
                '    FILE *in = fopen("out.txt", "r");\n' +
                "    if (in != NULL) {\n" +
                "        char buffer[64];\n" +
                "        size_t length = fread(buffer, 1, sizeof(buffer) - 1, in);\n" +
                "        buffer[length] = '\\0';\n" +
                "        fclose(in);\n" +
                '        printf("file:%s\\n", buffer);\n' +
                "    }\n" +
                '    printf("PROBE-DONE\\n");\n' +
                "    return 0;\n" +
                "}\n",
            "helper.h":
                "#ifndef WASMVERSE_HELPER_H\n" +
                "#define WASMVERSE_HELPER_H\n" +
                "static const char *helper_label(void) {\n" +
                '    return "helper";\n' +
                "}\n" +
                "#endif\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "cpp",
        entryFileName: "main.cpp",
        sourceFiles: {
            "main.cpp":
                "#include <iostream>\n" +
                "#include <fstream>\n" +
                "#include <string>\n" +
                '#include "helper.hpp"\n' +
                "\n" +
                "int main(int argc, char **argv) {\n" +
                "    std::string name;\n" +
                "    std::getline(std::cin, name);\n" +
                '    std::cout << "greet:" << helper_label() << ":" << name << std::endl;\n' +
                '    std::cout << "arg0:" << (argc > 1 ? argv[1] : "none") << std::endl;\n' +
                '    std::ofstream out("out.txt");\n' +
                '    out << "written";\n' +
                "    out.close();\n" +
                '    std::ifstream in("out.txt");\n' +
                "    std::string contents;\n" +
                "    std::getline(in, contents);\n" +
                '    std::cout << "file:" << contents << std::endl;\n' +
                '    std::cout << "PROBE-DONE" << std::endl;\n' +
                "    return 0;\n" +
                "}\n",
            "helper.hpp":
                "#ifndef WASMVERSE_HELPER_HPP\n" +
                "#define WASMVERSE_HELPER_HPP\n" +
                "#include <string>\n" +
                "inline std::string helper_label() {\n" +
                '    return "helper";\n' +
                "}\n" +
                "#endif\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "go",
        entryFileName: "main.go",
        sourceFiles: {
            "main.go":
                "package main\n" +
                "\n" +
                "import (\n" +
                '    "bufio"\n' +
                '    "fmt"\n' +
                '    "os"\n' +
                '    "strings"\n' +
                ")\n" +
                "\n" +
                "func main() {\n" +
                "    reader := bufio.NewReader(os.Stdin)\n" +
                "    name, _ := reader.ReadString('\\n')\n" +
                '    name = strings.TrimRight(name, "\\r\\n")\n' +
                '    fmt.Printf("greet:%s:%s\\n", helperLabel(), name)\n' +
                '    arg0 := "none"\n' +
                "    if len(os.Args) > 1 {\n" +
                "        arg0 = os.Args[1]\n" +
                "    }\n" +
                '    fmt.Printf("arg0:%s\\n", arg0)\n' +
                '    os.WriteFile("out.txt", []byte("written"), 0644)\n' +
                '    data, _ := os.ReadFile("out.txt")\n' +
                '    fmt.Printf("file:%s\\n", string(data))\n' +
                '    fmt.Println("PROBE-DONE")\n' +
                "}\n",
            "helper.go": 'package main\n\nfunc helperLabel() string {\n    return "helper"\n}\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "zig",
        entryFileName: "main.zig",
        sourceFiles: {
            "main.zig":
                'const std = @import("std");\n' +
                'const helper = @import("helper.zig");\n' +
                "\n" +
                "pub fn main(init: std.process.Init) !void {\n" +
                "    var stdin_buffer: [1024]u8 = undefined;\n" +
                "    var stdin_reader = std.Io.File.stdin().reader(init.io, &stdin_buffer);\n" +
                "    const name = stdin_reader.interface.takeDelimiterExclusive('\\n') catch \"\";\n" +
                '    std.debug.print("greet:{s}:{s}\\n", .{ helper.label, name });\n' +
                "    var arguments = try std.process.Args.Iterator.initAllocator(init.minimal.args, init.gpa);\n" +
                "    defer arguments.deinit();\n" +
                "    _ = arguments.skip();\n" +
                '    const first_argument = arguments.next() orelse "none";\n' +
                '    std.debug.print("arg0:{s}\\n", .{first_argument});\n' +
                "    const cwd = std.Io.Dir.cwd();\n" +
                '    const out = cwd.createFile(init.io, "out.txt", .{}) catch null;\n' +
                "    if (out) |handle| {\n" +
                '        handle.writeStreamingAll(init.io, "written") catch {};\n' +
                "        handle.close(init.io);\n" +
                "    }\n" +
                "    var read_buffer: [64]u8 = undefined;\n" +
                '    const read_contents = cwd.readFile(init.io, "out.txt", &read_buffer) catch "";\n' +
                '    std.debug.print("file:{s}\\n", .{read_contents});\n' +
                '    std.debug.print("PROBE-DONE\\n", .{});\n' +
                "}\n",
            "helper.zig": 'pub const label = "helper";\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "swift",
        entryFileName: "main.swift",
        sourceFiles: {
            "main.swift":
                "import WASILibc\n" +
                "\n" +
                'let name = readLine() ?? ""\n' +
                'print("greet:\\(helperLabel()):\\(name)")\n' +
                'let firstArgument = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "none"\n' +
                'print("arg0:\\(firstArgument)")\n' +
                'if let handle = fopen("out.txt", "w") {\n' +
                '    fputs("written", handle)\n' +
                "    fclose(handle)\n" +
                "}\n" +
                'if let readHandle = fopen("out.txt", "r") {\n' +
                "    var buffer = [CChar](repeating: 0, count: 64)\n" +
                "    let readCount = fread(&buffer, 1, 63, readHandle)\n" +
                "    buffer[readCount] = 0\n" +
                '    print("file:\\(String(cString: buffer))")\n' +
                "    fclose(readHandle)\n" +
                "}\n" +
                'print("PROBE-DONE")\n',
            "helper.swift": 'func helperLabel() -> String {\n    return "helper"\n}\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "kotlin",
        entryFileName: "main.kt",
        sourceFiles: {
            "main.kt":
                "external fun wasmversePrint(text: String)\n" +
                "external fun wasmverseReadLine(): String\n" +
                "external val wasmverseProgramArguments: Array<String>\n" +
                "external fun wasmverseReadFile(path: String): String\n" +
                "\n" +
                "fun main() {\n" +
                "    val name = wasmverseReadLine()\n" +
                '    wasmversePrint("greet:${helperLabel()}:$name")\n' +
                '    wasmversePrint("arg0:${if (wasmverseProgramArguments.isNotEmpty()) wasmverseProgramArguments[0] else "none"}")\n' +
                '    wasmversePrint("file:${wasmverseReadFile("data.txt")}")\n' +
                '    wasmversePrint("PROBE-DONE")\n' +
                "}\n",
            "helper.kt": 'fun helperLabel(): String = "helper"\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "ocaml",
        entryFileName: "main.ml",
        sourceFiles: {
            "main.ml":
                "let () =\n" +
                '  let name = try input_line stdin with End_of_file -> "" in\n' +
                '  Printf.printf "greet:%s:%s\\n" (Helper.label ()) name;\n' +
                "  let first_argument =\n" +
                '    if Array.length Sys.argv > 1 then Sys.argv.(1) else "none"\n' +
                "  in\n" +
                '  Printf.printf "arg0:%s\\n" first_argument;\n' +
                '  let out_channel = open_out "out.txt" in\n' +
                '  output_string out_channel "written";\n' +
                "  close_out out_channel;\n" +
                '  let in_channel = open_in "out.txt" in\n' +
                "  let contents = really_input_string in_channel (in_channel_length in_channel) in\n" +
                "  close_in in_channel;\n" +
                '  Printf.printf "file:%s\\n" contents;\n' +
                '  print_endline "PROBE-DONE"\n',
            "helper.ml": 'let label () = "helper"\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "haskell",
        entryFileName: "main.hs",
        sourceFiles: {
            "main.hs":
                "import Helper (helperLabel)\n" +
                "import System.Environment (getArgs)\n" +
                "\n" +
                "main :: IO ()\n" +
                "main = do\n" +
                "    name <- getLine\n" +
                '    putStrLn ("greet:" ++ helperLabel ++ ":" ++ name)\n' +
                "    arguments <- getArgs\n" +
                '    putStrLn ("arg0:" ++ if null arguments then "none" else head arguments)\n' +
                '    writeFile "out.txt" "written"\n' +
                '    contents <- readFile "out.txt"\n' +
                '    putStrLn ("file:" ++ contents)\n' +
                '    putStrLn "PROBE-DONE"\n',
            "Helper.hs":
                'module Helper (helperLabel) where\n\nhelperLabel :: String\nhelperLabel = "helper"\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "dart",
        entryFileName: "main.dart",
        sourceFiles: {
            "main.dart":
                "import 'dart:js_interop';\n" +
                "import 'helper.dart';\n" +
                "\n" +
                "@JS('WasmVerseHost.readLine')\n" +
                "external String hostReadLine();\n" +
                "\n" +
                "@JS('WasmVerseHost.getArguments')\n" +
                "external JSArray<JSString> hostGetArguments();\n" +
                "\n" +
                "@JS('WasmVerseHost.readFile')\n" +
                "external JSString? hostReadFile(JSString path);\n" +
                "\n" +
                "void main() {\n" +
                "  final name = hostReadLine();\n" +
                "  print('greet:${helperLabel()}:$name');\n" +
                "  final arguments = hostGetArguments().toDart;\n" +
                "  print('arg0:${arguments.length > 1 ? arguments[1].toDart : 'none'}');\n" +
                "  final contents = hostReadFile('data.txt'.toJS)?.toDart ?? 'none';\n" +
                "  print('file:$contents');\n" +
                "  print('PROBE-DONE');\n" +
                "}\n",
            "helper.dart": "String helperLabel() {\n  return 'helper';\n}\n",
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "java",
        entryFileName: "Main.java",
        sourceFiles: {
            "Main.java":
                "import java.io.BufferedReader;\n" +
                "import java.io.InputStreamReader;\n" +
                "\n" +
                "public class Main {\n" +
                "    public static void main(String[] args) throws Exception {\n" +
                "        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));\n" +
                "        String name = reader.readLine();\n" +
                '        System.out.println("greet:" + Helper.label() + ":" + name);\n' +
                '        System.out.println("arg0:" + (args.length > 1 ? args[1] : "none"));\n' +
                '        System.out.println("PROBE-DONE");\n' +
                "    }\n" +
                "}\n",
            "Helper.java":
                "public class Helper {\n" +
                "    public static String label() {\n" +
                '        return "helper";\n' +
                "    }\n" +
                "}\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "multiFile"],
        unsupportedFeatures: [
            {
                feature: "fileIo",
                reason: "teavm exposes no host filesystem",
            },
        ],
    },
    {
        languageIdentifier: "csharp",
        entryFileName: "Program.cs",
        sourceFiles: {
            "Program.cs":
                "using System;\n" +
                "using System.IO;\n" +
                "\n" +
                "public static class Program\n" +
                "{\n" +
                "    public static void Main(string[] args)\n" +
                "    {\n" +
                "        string name = WasmVerseHost.ReadLine();\n" +
                '        Console.WriteLine($"greet:{Helper.Label()}:{name}");\n' +
                '        Console.WriteLine($"arg0:{(args.Length > 1 ? args[1] : "none")}");\n' +
                '        Console.WriteLine($"file:{File.ReadAllText("data.txt")}");\n' +
                '        Console.WriteLine("PROBE-DONE");\n' +
                "    }\n" +
                "}\n",
            "WasmVerseHost.cs":
                "using System.Runtime.InteropServices.JavaScript;\n" +
                "\n" +
                "public partial class WasmVerseHost\n" +
                "{\n" +
                '    [JSImport("readLine", "WasmVerseHost")]\n' +
                "    internal static partial string ReadLine();\n" +
                "}\n",
            "Helper.cs":
                "public static class Helper\n" +
                "{\n" +
                "    public static string Label()\n" +
                "    {\n" +
                '        return "helper";\n' +
                "    }\n" +
                "}\n",
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "assemblyscript",
        entryFileName: "main.as",
        sourceFiles: {
            "main.as":
                '@external("env", "write")\n' +
                "declare function write(pointer: usize, length: usize): void;\n" +
                "\n" +
                '@external("env", "read")\n' +
                "declare function read(pointer: usize, maxLength: usize): usize;\n" +
                "\n" +
                '@external("env", "programArgument")\n' +
                "declare function programArgument(index: i32, pointer: usize, maxLength: usize): i32;\n" +
                "\n" +
                'import { helperLabel } from "./helper";\n' +
                "\n" +
                "function emit(line: string): void {\n" +
                "    const encoded = String.UTF8.encode(line);\n" +
                "    const view = Uint8Array.wrap(encoded);\n" +
                "    write(view.dataStart, view.length);\n" +
                "}\n" +
                "\n" +
                "export function main(): void {\n" +
                "    const nameBuffer = new ArrayBuffer(256);\n" +
                "    const nameLength = read(changetype<usize>(nameBuffer), 256);\n" +
                '    const name = nameLength > 0 ? String.UTF8.decode(nameBuffer.slice(0, <i32>nameLength)).trim() : "";\n' +
                '    emit("greet:" + helperLabel() + ":" + name + "\\n");\n' +
                "    const argumentBuffer = new ArrayBuffer(256);\n" +
                "    const argumentLength = programArgument(0, changetype<usize>(argumentBuffer), 256);\n" +
                '    const firstArgument = argumentLength > 0 ? String.UTF8.decode(argumentBuffer.slice(0, argumentLength)) : "none";\n' +
                '    emit("arg0:" + firstArgument + "\\n");\n' +
                '    emit("PROBE-DONE\\n");\n' +
                "}\n",
            "helper.ts": 'export function helperLabel(): string {\n    return "helper";\n}\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "multiFile"],
        unsupportedFeatures: [
            {
                feature: "fileIo",
                reason: "assemblyscript programs have no host filesystem",
            },
        ],
    },
    {
        languageIdentifier: "javascript",
        entryFileName: "main.js",
        sourceFiles: {
            "main.js":
                'const { helperLabel } = require("./helper.js");\n' +
                'const name = readLine("name? ");\n' +
                'print("greet:" + helperLabel() + ":" + name);\n' +
                'print("arg0:" + (programArguments[0] ?? "none"));\n' +
                'print("file:" + readFile("data.txt"));\n' +
                'print("PROBE-DONE");\n',
            "helper.js": 'exports.helperLabel = () => "helper";\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "typescript",
        entryFileName: "main.ts",
        sourceFiles: {
            "main.ts":
                'import { helperLabel } from "./helper";\n' +
                "declare const programArguments: ReadonlyArray<string>;\n" +
                "declare function print(message: string): void;\n" +
                "declare function readLine(promptText: string): string;\n" +
                "declare function readFile(path: string): string;\n" +
                'const name = readLine("name? ");\n' +
                'print("greet:" + helperLabel() + ":" + name);\n' +
                'print("arg0:" + (programArguments[0] ?? "none"));\n' +
                'print("file:" + readFile("data.txt"));\n' +
                'print("PROBE-DONE");\n',
            "helper.ts": 'export function helperLabel(): string {\n    return "helper";\n}\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "sql",
        entryFileName: "main.sql",
        sourceFiles: {
            "main.sql":
                "CREATE TABLE probe (label TEXT NOT NULL, amount INTEGER NOT NULL);\n" +
                "INSERT INTO probe (label, amount) VALUES ('alpha', 7), ('beta', 12);\n" +
                "SELECT label || ':' || amount AS reading FROM probe ORDER BY label ASC;\n" +
                "SELECT 'PROBE-DONE' AS marker;\n",
        },
        programArguments: [],
        terminalAnswers: [],
        expectedLines: ["alpha:7", "beta:12", "PROBE-DONE"],
        exercisedFeatures: [],
        unsupportedFeatures: [
            {
                feature: "stdin",
                reason: "SQLite scripts have no stdin in this runtime",
            },
            {
                feature: "arguments",
                reason: "SQLite scripts have no argv in this runtime",
            },
            {
                feature: "fileIo",
                reason: "scripts run against an in-memory database with no host files",
            },
            {
                feature: "multiFile",
                reason: "scripts run against an in-memory database with no host files",
            },
        ],
    },
];
export { FEATURE_PROBES };
export type { FeatureName, FeatureProbeDefinition, UnsupportedFeature };
