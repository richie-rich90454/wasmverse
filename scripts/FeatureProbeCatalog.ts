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
        languageIdentifier: "r",
        entryFileName: "main.r",
        sourceFiles: {
            "main.r":
                "source('helper.r')\n" +
                "cat(paste0('greet:', helper_label(), ':offline'), '\\n')\n" +
                "cat(paste0('arg0:', argv[1]), '\\n')\n" +
                "cat(paste0('file:', readLines('data.txt')), '\\n')\n" +
                "cat('PROBE-DONE\\n')\n",
            "helper.r": "helper_label <- function() 'helper'\n",
            "data.txt": "probe-data\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: [],
        expectedLines: ["greet:helper:offline", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [
            {
                feature: "stdin",
                reason: "webR reads stdin only through its shared-memory channel; a static host without cross-origin isolation falls back to the PostMessage channel, which cannot block for input",
            },
        ],
    },
    {
        languageIdentifier: "clojurescript",
        entryFileName: "main.cljs",
        sourceFiles: {
            "main.cljs":
                "(ns main (:require [helper :as h]))\n" +
                '(println (str "greet:" (h/label) ":" (js/wasmverseReadLine)))\n' +
                '(println (str "arg0:" (aget js/wasmverseProgramArguments 0)))\n' +
                '(println (str "file:" (js/wasmverseReadFile "data.txt")))\n' +
                '(println "PROBE-DONE")\n',
            "helper.cljs": '(ns helper)\n\n(defn label [] "helper")\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "scheme",
        entryFileName: "main.scm",
        sourceFiles: {
            "main.scm":
                '(load "helper.scm")\n' +
                "(define name (read-line))\n" +
                '(display "greet:") (display (helper-label)) (display ":") (display name) (newline)\n' +
                '(display "arg0:") (display (car wasmverse-arguments)) (newline)\n' +
                '(define data-port (open-input-file "data.txt"))\n' +
                '(display "file:") (display (read-line data-port)) (newline)\n' +
                '(display "PROBE-DONE") (newline)\n',
            "helper.scm": '(define (helper-label) "helper")\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "prolog",
        entryFileName: "main.pl",
        sourceFiles: {
            "main.pl":
                "main :-\n" +
                "    read_input_line(NameLine),\n" +
                "    atom_chars(Name, NameLine),\n" +
                "    helper(Label),\n" +
                "    write('greet:'), write(Label), write(':'), write(Name), nl,\n" +
                "    wasmverse_argument(0, Argument),\n" +
                "    write('arg0:'), write(Argument), nl,\n" +
                "    read_file_chars('data.txt', FileCharacters),\n" +
                "    atom_chars(FileText, FileCharacters),\n" +
                "    write('file:'), write(FileText), nl,\n" +
                "    write('PROBE-DONE'), nl.\n" +
                "\n" +
                "read_input_line(Line) :-\n" +
                "    get_char(Character),\n" +
                "    read_line_chars(Character, Line).\n" +
                "\n" +
                "read_line_chars(end_of_file, []) :- !.\n" +
                "read_line_chars('\\n', []) :- !.\n" +
                "read_line_chars(Character, [Character | Rest]) :-\n" +
                "    get_char(Next),\n" +
                "    read_line_chars(Next, Rest).\n" +
                "\n" +
                "read_file_chars(Path, Characters) :-\n" +
                "    open(Path, read, Stream),\n" +
                "    get_char(Stream, First),\n" +
                "    read_stream_chars(Stream, First, Characters),\n" +
                "    close(Stream).\n" +
                "\n" +
                "read_stream_chars(_, end_of_file, []) :- !.\n" +
                "read_stream_chars(Stream, Character, [Character | Rest]) :-\n" +
                "    get_char(Stream, Next),\n" +
                "    read_stream_chars(Stream, Next, Rest).\n",
            "helper.pl": "helper(helper).\n",
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
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
        languageIdentifier: "perl",
        entryFileName: "main.pl",
        sourceFiles: {
            "main.pl":
                "chdir '/'; $| = 1;\n" +
                "require './helper.pl';\n" +
                "my $name = <STDIN>;\n" +
                "chomp $name;\n" +
                'print "greet:" . helper_label() . ":" . $name . "\\n";\n' +
                'print "arg0:" . ($ARGV[0] // "none") . "\\n";\n' +
                "open(my $out, '>', 'out.txt') or die \"open failed: $!\";\n" +
                "print $out 'written';\n" +
                "close $out;\n" +
                "open(my $in, '<', 'out.txt') or die \"read failed: $!\";\n" +
                "my $contents = do { local $/; <$in> };\n" +
                "close $in;\n" +
                'print "file:" . $contents . "\\n";\n' +
                'print "PROBE-DONE\\n";\n',
            "helper.pl": "sub helper_label { return 'helper'; }\n1;\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "pascal",
        entryFileName: "main.pas",
        sourceFiles: {
            "main.pas":
                "program main;\n" +
                "uses helper;\n" +
                "var\n" +
                "    nameText: AnsiString;\n" +
                "    contents: AnsiString;\n" +
                "    outputFile: TextFile;\n" +
                "    inputFile: TextFile;\n" +
                "begin\n" +
                "    ReadLn(nameText);\n" +
                "    WriteLn('greet:', helper_label, ':', nameText);\n" +
                "    WriteLn('arg0:', ParamStr(1));\n" +
                "    Assign(outputFile, 'out.txt');\n" +
                "    Rewrite(outputFile);\n" +
                "    Write(outputFile, 'written');\n" +
                "    Close(outputFile);\n" +
                "    Assign(inputFile, 'out.txt');\n" +
                "    Reset(inputFile);\n" +
                "    ReadLn(inputFile, contents);\n" +
                "    Close(inputFile);\n" +
                "    WriteLn('file:', contents);\n" +
                "    WriteLn('PROBE-DONE');\n" +
                "end.\n",
            "helper.pas":
                "unit helper;\n" +
                "interface\n" +
                "function helper_label: AnsiString;\n" +
                "implementation\n" +
                "function helper_label: AnsiString;\n" +
                "begin\n" +
                "    helper_label := 'helper';\n" +
                "end;\n" +
                "end.\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "cobol",
        entryFileName: "main.cob",
        sourceFiles: {
            "main.cob":
                ">>SOURCE FORMAT FREE\n" +
                "identification division.\n" +
                "program-id. main.\n" +
                "environment division.\n" +
                "input-output section.\n" +
                "file-control.\n" +
                "    select probe-file assign to 'out.txt'\n" +
                "        organization is line sequential.\n" +
                "data division.\n" +
                "file section.\n" +
                "fd probe-file.\n" +
                "01 probe-record pic x(64).\n" +
                "working-storage section.\n" +
                "copy 'helper.cpy'.\n" +
                "01 command-line-text pic x(128).\n" +
                "01 program-token pic x(64).\n" +
                "01 first-argument pic x(64).\n" +
                "01 remaining-tokens pic x(64).\n" +
                "01 entered-name pic x(64).\n" +
                "procedure division.\n" +
                "accept entered-name\n" +
                "display 'greet:' function trim(helper-label-text) ':' function trim(entered-name)\n" +
                "accept command-line-text from command-line\n" +
                "unstring command-line-text delimited by all spaces\n" +
                "    into program-token first-argument remaining-tokens\n" +
                "display 'arg0:' function trim(first-argument)\n" +
                "open output probe-file\n" +
                "move 'written' to probe-record\n" +
                "write probe-record\n" +
                "close probe-file\n" +
                "open input probe-file\n" +
                "read probe-file\n" +
                "close probe-file\n" +
                "display 'file:' function trim(probe-record)\n" +
                "display 'PROBE-DONE'\n" +
                "stop run.\n",
            "helper.cpy": "01 helper-label-text pic x(7) value 'helper'.\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "fortran",
        entryFileName: "main.f90",
        sourceFiles: {
            "main.f90":
                "program main\n" +
                "    use helper_module\n" +
                "    implicit none\n" +
                "    character(len=64) :: name\n" +
                "    character(len=64) :: contents\n" +
                "    integer :: unit\n" +
                "    read(*, '(A)') name\n" +
                "    print '(A)', 'greet:' // helper_label() // ':' // trim(name)\n" +
                "    call get_command_argument(1, name)\n" +
                "    print '(A)', 'arg0:' // trim(name)\n" +
                "    open(newunit=unit, file='out.txt', status='replace', action='write')\n" +
                "    write(unit, '(A)') 'written'\n" +
                "    close(unit)\n" +
                "    open(newunit=unit, file='out.txt', status='old', action='read')\n" +
                "    read(unit, '(A)') contents\n" +
                "    close(unit)\n" +
                "    print '(A)', 'file:' // trim(contents)\n" +
                "    print '(A)', 'PROBE-DONE'\n" +
                "end program main\n",
            "helper.f90":
                "module helper_module\n" +
                "    implicit none\n" +
                "contains\n" +
                "    function helper_label() result(label_text)\n" +
                "        character(len=6) :: label_text\n" +
                "        label_text = 'helper'\n" +
                "    end function helper_label\n" +
                "end module helper_module\n",
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
        languageIdentifier: "scala",
        entryFileName: "main.scala",
        sourceFiles: {
            "main.scala":
                "import scala.scalajs.js\n" +
                "\n" +
                "@main def main(): Unit =\n" +
                "    val name = Helper.readLine()\n" +
                '    Helper.emit("greet:" + Helper.label + ":" + name)\n' +
                "    val firstArgument =\n" +
                '        if Helper.programArguments.length > 0 then Helper.programArguments(0) else "none"\n' +
                '    Helper.emit("arg0:" + firstArgument)\n' +
                '    Helper.emit("file:" + Helper.readFile("data.txt"))\n' +
                '    Helper.emit("PROBE-DONE")\n',
            "helper.scala":
                "import scala.scalajs.js\n" +
                "\n" +
                "object Helper:\n" +
                '    def label: String = "helper"\n' +
                "\n" +
                "    def readLine(): String =\n" +
                "        js.Dynamic.global.wasmverseReadLine().asInstanceOf[String]\n" +
                "\n" +
                "    def emit(text: String): Unit =\n" +
                "        js.Dynamic.global.wasmversePrint(text)\n" +
                "\n" +
                "    def programArguments: js.Array[String] =\n" +
                "        js.Dynamic.global.wasmverseProgramArguments.asInstanceOf[js.Array[String]]\n" +
                "\n" +
                "    def readFile(path: String): String =\n" +
                "        js.Dynamic.global.wasmverseReadFile(path).asInstanceOf[String]\n",
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "fsharp",
        entryFileName: "Main.fs",
        sourceFiles: {
            "Main.fs":
                "module Main\n" +
                "\n" +
                "open Fable.Core\n" +
                "\n" +
                '[<Emit("globalThis.wasmversePrint($0)")>]\n' +
                "let emitPrint (text: string): unit = jsNative\n" +
                "\n" +
                '[<Emit("globalThis.wasmverseReadLine()")>]\n' +
                "let readLine (): string = jsNative\n" +
                "\n" +
                '[<Emit("globalThis.wasmverseProgramArguments")>]\n' +
                "let programArguments: string[] = jsNative\n" +
                "\n" +
                '[<Emit("globalThis.wasmverseReadFile($0)")>]\n' +
                "let readFile (path: string): string = jsNative\n" +
                "\n" +
                "[<EntryPoint>]\n" +
                "let main (_: string[]): int =\n" +
                "    let name = readLine ()\n" +
                '    emitPrint (sprintf "greet:%s:%s" Helper.label name)\n' +
                "    let firstArgument =\n" +
                '        if programArguments.Length > 0 then programArguments.[0] else "none"\n' +
                '    emitPrint (sprintf "arg0:%s" firstArgument)\n' +
                '    emitPrint (sprintf "file:%s" (readFile "data.txt"))\n' +
                '    emitPrint "PROBE-DONE"\n' +
                "    0\n",
            "Helper.fs": 'module Helper\n\nlet label: string = "helper"\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "elm",
        entryFileName: "Main.elm",
        sourceFiles: {
            "Main.elm":
                "port module Main exposing (main)\n" +
                "\n" +
                "import Helper\n" +
                "\n" +
                "port wasmverseStdout : String -> Cmd msg\n" +
                "\n" +
                "port wasmverseStdinRequest : String -> Cmd msg\n" +
                "\n" +
                "port wasmverseStdin : (String -> msg) -> Sub msg\n" +
                "\n" +
                "port wasmverseFileRequest : String -> Cmd msg\n" +
                "\n" +
                "port wasmverseFileResponse : (( String, String ) -> msg) -> Sub msg\n" +
                "\n" +
                "port wasmverseDone : String -> Cmd msg\n" +
                "\n" +
                "type alias Flags =\n" +
                "    { programArguments : List String }\n" +
                "\n" +
                "type alias Model =\n" +
                "    { arguments : List String }\n" +
                "\n" +
                "type Msg\n" +
                "    = GotName String\n" +
                "    | GotFile String String\n" +
                "\n" +
                "main : Program Flags Model Msg\n" +
                "main =\n" +
                "    Platform.worker\n" +
                "        { init =\n" +
                '            \\flags -> ( { arguments = flags.programArguments }, wasmverseStdinRequest "read" )\n' +
                "        , update = update\n" +
                "        , subscriptions =\n" +
                "            \\_ ->\n" +
                "                Sub.batch\n" +
                "                    [ wasmverseStdin GotName\n" +
                "                    , wasmverseFileResponse (\\( path, contents ) -> GotFile path contents)\n" +
                "                    ]\n" +
                "        }\n" +
                "\n" +
                "update : Msg -> Model -> ( Model, Cmd Msg )\n" +
                "update msg model =\n" +
                "    case msg of\n" +
                "        GotName name ->\n" +
                "            ( model\n" +
                "            , Cmd.batch\n" +
                '                [ wasmverseStdout ("greet:" ++ Helper.label ++ ":" ++ name)\n' +
                "                , wasmverseStdout\n" +
                '                    ("arg0:" ++ (List.head model.arguments |> Maybe.withDefault "none"))\n' +
                '                , wasmverseFileRequest "data.txt"\n' +
                "                ]\n" +
                "            )\n" +
                "\n" +
                "        GotFile _ contents ->\n" +
                "            ( model\n" +
                "            , Cmd.batch\n" +
                '                [ wasmverseStdout ("file:" ++ contents)\n' +
                '                , wasmverseStdout "PROBE-DONE"\n' +
                '                , wasmverseDone "done"\n' +
                "                ]\n" +
                "            )\n",
            "Helper.elm":
                'module Helper exposing (label)\n\n\nlabel : String\nlabel =\n    "helper"\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
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
        languageIdentifier: "rescript",
        entryFileName: "Main.res",
        sourceFiles: {
            "Main.res":
                '@val external wasmversePrint: string => unit = "wasmversePrint"\n' +
                '@val external wasmverseReadLine: unit => string = "wasmverseReadLine"\n' +
                '@val external wasmverseProgramArguments: array<string> = "wasmverseProgramArguments"\n' +
                '@val external wasmverseReadFile: string => string = "wasmverseReadFile"\n' +
                "\n" +
                "let name = wasmverseReadLine()\n" +
                'wasmversePrint("greet:" ++ Helper.label ++ ":" ++ name)\n' +
                'wasmversePrint("arg0:" ++ wasmverseProgramArguments[0]->Option.getOr("none"))\n' +
                'wasmversePrint("file:" ++ wasmverseReadFile("data.txt"))\n' +
                'wasmversePrint("PROBE-DONE")\n',
            "Helper.res": 'let label = "helper"\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "purescript",
        entryFileName: "Main.purs",
        sourceFiles: {
            "Main.purs":
                "module Main where\n" +
                "\n" +
                "import Prelude\n" +
                "\n" +
                "import Effect (Effect)\n" +
                "import Helper (helperLabel)\n" +
                "import WasmverseHost (wasmversePrint, wasmverseReadLine, wasmverseProgramArguments, wasmverseReadFile)\n" +
                "\n" +
                "firstArgument :: Array String -> String\n" +
                "firstArgument arguments = case arguments of\n" +
                "    [first, _] -> first\n" +
                "    [first] -> first\n" +
                '    _ -> "none"\n' +
                "\n" +
                "main :: Effect Unit\n" +
                "main = do\n" +
                "    name <- wasmverseReadLine\n" +
                '    wasmversePrint ("greet:" <> helperLabel <> ":" <> name)\n' +
                "    arguments <- wasmverseProgramArguments\n" +
                '    wasmversePrint ("arg0:" <> firstArgument arguments)\n' +
                '    contents <- wasmverseReadFile "data.txt"\n' +
                '    wasmversePrint ("file:" <> contents)\n' +
                '    wasmversePrint "PROBE-DONE"\n',
            "Helper.purs":
                "module Helper where\n" +
                "\n" +
                "helperLabel :: String\n" +
                'helperLabel = "helper"\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "gleam",
        entryFileName: "main.gleam",
        sourceFiles: {
            "main.gleam":
                "import helper\n" +
                "\n" +
                '@external(javascript, "./wasmverse_host.mjs", "wasmversePrint")\n' +
                "fn wasmverse_print(text: String) -> Nil\n" +
                "\n" +
                '@external(javascript, "./wasmverse_host.mjs", "wasmverseReadLine")\n' +
                "fn wasmverse_read_line() -> String\n" +
                "\n" +
                '@external(javascript, "./wasmverse_host.mjs", "wasmverseProgramArguments")\n' +
                "fn wasmverse_program_arguments() -> List(String)\n" +
                "\n" +
                '@external(javascript, "./wasmverse_host.mjs", "wasmverseReadFile")\n' +
                "fn wasmverse_read_file(path: String) -> String\n" +
                "\n" +
                "fn first_argument(arguments: List(String)) -> String {\n" +
                "  case arguments {\n" +
                "    [first, ..] -> first\n" +
                '    [] -> "none"\n' +
                "  }\n" +
                "}\n" +
                "\n" +
                "pub fn main() {\n" +
                "  let name = wasmverse_read_line()\n" +
                '  wasmverse_print("greet:" <> helper.label() <> ":" <> name)\n' +
                '  wasmverse_print("arg0:" <> first_argument(wasmverse_program_arguments()))\n' +
                '  wasmverse_print("file:" <> wasmverse_read_file("data.txt"))\n' +
                '  wasmverse_print("PROBE-DONE")\n' +
                "}\n",
            "helper.gleam": 'pub fn label() -> String {\n  "helper"\n}\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "haxe",
        entryFileName: "Main.hx",
        sourceFiles: {
            "Main.hx":
                "class Main {\n" +
                "    static function main() {\n" +
                '        var name: String = js.Syntax.code("wasmverseReadLine()");\n' +
                '        js.Syntax.code("wasmversePrint({0})", "greet:" + Helper.label() + ":" + name);\n' +
                '        var arguments: Array<String> = js.Syntax.code("wasmverseProgramArguments");\n' +
                '        js.Syntax.code("wasmversePrint({0})", "arg0:" + (arguments.length > 0 ? arguments[0] : "none"));\n' +
                '        js.Syntax.code("wasmversePrint({0})", "file:" + js.Syntax.code("wasmverseReadFile({0})", "data.txt"));\n' +
                '        js.Syntax.code("wasmversePrint({0})", "PROBE-DONE");\n' +
                "    }\n" +
                "}\n",
            "Helper.hx":
                "class Helper {\n" +
                "    public static function label(): String {\n" +
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
        languageIdentifier: "commonlisp",
        entryFileName: "main.lisp",
        sourceFiles: {
            "main.lisp":
                '(load "helper.lisp")\n' +
                "(defparameter *probe-name* (read-line))\n" +
                '(format t "greet:~a:~a~%" (helper-label) *probe-name*)\n' +
                '(format t "arg0:~a~%" (first *wasmverse-arguments*))\n' +
                '(format t "file:~a~%" (wasmverse-read-file "data.txt"))\n' +
                '(format t "PROBE-DONE~%")\n',
            "helper.lisp": '(defun helper-label () "helper")\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "tcl",
        entryFileName: "main.tcl",
        sourceFiles: {
            "main.tcl":
                "source helper.tcl\n" +
                "set name [gets stdin]\n" +
                'puts "greet:[helper-label]:$name"\n' +
                'puts "arg0:[lindex $argv 0]"\n' +
                "set handle [open data.txt r]\n" +
                "set data [read -nonewline $handle]\n" +
                "close $handle\n" +
                'puts "file:$data"\n' +
                "puts PROBE-DONE\n",
            "helper.tcl": "proc helper-label {} { return helper }\n",
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "forth",
        entryFileName: "main.fth",
        sourceFiles: {
            "main.fth":
                "INCLUDE helper.fth\n" +
                "0 64 ACCEPT\n" +
                '." greet:" helper-label TYPE\n' +
                '." :" 0 SWAP TYPE CR\n' +
                '." arg0:" 0 ARG TYPE CR\n' +
                '." file:" READ-FILE TYPE CR\n' +
                '." PROBE-DONE" CR\n',
            "helper.fth": ': helper-label ( -- addr len ) S" helper" ;\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "smalltalk",
        entryFileName: "main.st",
        sourceFiles: {
            "main.st":
                "Compiler evaluate: ((FileStream readOnlyFileNamed: 'helper.st') contentsOfEntireFile).\n" +
                "Transcript\n" +
                "    show: 'greet:';\n" +
                "    show: helperLabel;\n" +
                "    show: ':';\n" +
                "    showCr: StandardInput nextLine.\n" +
                "Transcript showCr: 'arg0:', SmalltalkArguments first.\n" +
                "(FileStream fileNamed: 'out.txt') nextPutAll: 'written'; close.\n" +
                "Transcript showCr: 'file:', ((FileStream readOnlyFileNamed: 'out.txt') contentsOfEntireFile).\n" +
                "Transcript showCr: 'PROBE-DONE'.\n",
            "helper.st": "Smalltalk at: #helperLabel put: 'helper'.\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
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
        languageIdentifier: "brainfuck",
        entryFileName: "main.bf",
        sourceFiles: {
            "main.bf":
                "+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.+++++++++++.-------------..+++++++++++++++.----------------------------------------------------------.++++++++++++++++++++++++++++++++++++++++++++++.---.+++++++.++++.-----------.+++++++++++++.--------------------------------------------------------.+++++++.+++++++++++++++++++++++++++++++++++.---.---------------------------------------------------------------------------------------.+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.--.+++++.+++++++.-----------------------------------------------------.,.,.,.[-]++++++++++.++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++.++.---.-------------.+++.------------------------.+++++++++++++++++++++++.+++++++++++.-.---------.-----------------------------------------------------------.",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "echo:Ada", "PROBE-DONE"],
        exercisedFeatures: ["stdin"],
        unsupportedFeatures: [
            {
                feature: "arguments",
                reason: "brainfuck has no program arguments; the tape and the stdin byte stream are its only inputs",
            },
            {
                feature: "fileIo",
                reason: "the brainfuck tape is the only memory; there is no file API",
            },
            {
                feature: "multiFile",
                reason: "brainfuck programs are single flat instruction streams with no include mechanism",
            },
        ],
    },
    {
        languageIdentifier: "befunge",
        entryFileName: "main.bef",
        sourceFiles: {
            "main.bef": '"adA:repleh:teerg">:#,_55+,":ohce">:#,_~,~,~,55+,"ENOD-EBORP">:#,_@\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "echo:Ada", "PROBE-DONE"],
        exercisedFeatures: ["stdin"],
        unsupportedFeatures: [
            {
                feature: "arguments",
                reason: "befunge-93 programs read stdin only; the playfield and stack are its entire state",
            },
            {
                feature: "fileIo",
                reason: "befunge-93 has no file instructions; only the playfield and stdin exist",
            },
            {
                feature: "multiFile",
                reason: "a befunge-93 program is one 80x25 playfield; there is no include mechanism",
            },
        ],
    },
    {
        languageIdentifier: "lolcode",
        entryFileName: "main.lol",
        sourceFiles: {
            "main.lol":
                "HAI 1.2\n" +
                "I HAS A NAME\n" +
                'VISIBLE "name> "!\n' +
                "GIMMEH NAME\n" +
                'VISIBLE SMOOSH "greet:helper::" AN NAME MKAY\n' +
                'VISIBLE "PROBE-DONE"\n' +
                "KTHXBYE\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "PROBE-DONE"],
        exercisedFeatures: ["stdin"],
        unsupportedFeatures: [
            {
                feature: "arguments",
                reason: "the LOLCODE interpreter has no argv; GIMMEH is the only input",
            },
            {
                feature: "fileIo",
                reason: "the LOLCODE interpreter has no file API",
            },
            {
                feature: "multiFile",
                reason: "the LOLCODE interpreter runs the entry program only",
            },
        ],
    },
    {
        languageIdentifier: "apl",
        entryFileName: "main.apl",
        sourceFiles: {
            "main.apl":
                "\u235d probe: stdin, arguments, and evaluated helper files\n" +
                "name\u2190\u2395\n" +
                "\u2395\u2190'greet:',helperLabel,':',name\n" +
                "\u2395\u2190'arg0:',\u2283wasmverseArguments\n" +
                "\u2395\u2190'PROBE-DONE'\n",
            "helper.apl": "helperLabel\u2190'helper'\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "multiFile"],
        unsupportedFeatures: [
            {
                feature: "fileIo",
                reason: "the ngn/apl interpreter exposes no filesystem; only quad input feeds data into a program",
            },
        ],
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
        languageIdentifier: "riscv",
        entryFileName: "main.s",
        sourceFiles: {
            "main.s":
                '.include "helper.s"\n' +
                ".data\n" +
                'greet_word:  .asciz "greet:"\n' +
                'colon:       .asciz ":"\n' +
                'arg_word:    .asciz "arg0:"\n' +
                'file_word:   .asciz "file:"\n' +
                'none_word:   .asciz "none"\n' +
                'newline:     .asciz "\\n"\n' +
                'done_word:   .asciz "PROBE-DONE"\n' +
                'path_word:   .asciz "data.txt"\n' +
                "name_buffer: .space 64\n" +
                "file_buffer: .space 64\n" +
                ".text\n" +
                "_start:\n" +
                "    mv s8, a0\n" +
                "    mv s9, a1\n" +
                "    la a1, greet_word\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    la a1, helper_label\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    la a1, colon\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    la a1, name_buffer\n" +
                "    li a2, 64\n" +
                "    li a7, 8\n" +
                "    ecall\n" +
                "    mv s2, a0\n" +
                "    la a1, name_buffer\n" +
                "    mv a2, s2\n" +
                "    li a7, 4\n" +
                "    ecall\n" +
                "    la a1, newline\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    la a1, arg_word\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    beqz s8, probe_no_argument\n" +
                "    lw a1, 0(s9)\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    j probe_argument_done\n" +
                "probe_no_argument:\n" +
                "    la a1, none_word\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "probe_argument_done:\n" +
                "    la a1, newline\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    la a1, file_word\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    la a1, path_word\n" +
                "    li a7, 13\n" +
                "    ecall\n" +
                "    mv t0, a0\n" +
                "    mv a0, t0\n" +
                "    la a1, file_buffer\n" +
                "    li a2, 63\n" +
                "    li a7, 14\n" +
                "    ecall\n" +
                "    mv a2, a0\n" +
                "    la a1, file_buffer\n" +
                "    li a7, 4\n" +
                "    ecall\n" +
                "    la a1, newline\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    mv a0, t0\n" +
                "    li a7, 15\n" +
                "    ecall\n" +
                "    la a1, done_word\n" +
                "    li a7, 20\n" +
                "    ecall\n" +
                "    li a0, 0\n" +
                "    li a7, 10\n" +
                "    ecall\n",
            "helper.s": '.data\nhelper_label: .asciz "helper"\n',
            "data.txt": "probe-data",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
    {
        languageIdentifier: "verilog",
        entryFileName: "main.v",
        sourceFiles: {
            "main.v":
                "`timescale 1ns/1ps\n" +
                "module tb;\n" +
                "    wire [47:0] helper_label;\n" +
                "    helper label_source(.label_text(helper_label));\n" +
                "    integer data_handle;\n" +
                "    integer read_count;\n" +
                "    reg [8*16-1:0] line_buffer;\n" +
                "    reg [8*16-1:0] first_argument;\n" +
                "    initial begin\n" +
                '        $display("greet:%0s:Ada", helper_label);\n' +
                '        if ($value$plusargs("arg0=%s", first_argument)) begin\n' +
                '            $display("arg0:%0s", first_argument);\n' +
                "        end else begin\n" +
                '            $display("arg0:none");\n' +
                "        end\n" +
                '        data_handle = $fopen("data.txt", "r");\n' +
                "        if (data_handle != 0) begin\n" +
                "            read_count = $fgets(line_buffer, data_handle);\n" +
                '            $display("file:%0s", line_buffer);\n' +
                "            $fclose(data_handle);\n" +
                "        end else begin\n" +
                '            $display("file:missing");\n' +
                "        end\n" +
                '        $display("PROBE-DONE");\n' +
                "        $finish;\n" +
                "    end\n" +
                "endmodule\n",
            "helper.v":
                "module helper(output [47:0] label_text);\n" +
                '    assign label_text = "helper";\n' +
                "endmodule\n",
            "data.txt": "probe-data\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: [],
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [
            {
                feature: "stdin",
                reason: "the Icarus Verilog WASM engine exposes no stdin; testbenches drive stimuli with time delays and timeouts instead",
            },
        ],
    },
    {
        languageIdentifier: "solidity",
        entryFileName: "main.sol",
        sourceFiles: {
            "main.sol":
                "// SPDX-License-Identifier: MIT\n" +
                "pragma solidity ^0.8.0;\n" +
                'import {Helper} from "./helper.sol";\n' +
                "contract Main {\n" +
                "    function main(string[] memory args) public pure returns (string[] memory) {\n" +
                "        string[] memory lines = new string[](3);\n" +
                '        lines[0] = string.concat("greet:", Helper.label(), ":Ada");\n' +
                '        lines[1] = string.concat("arg0:", args[0]);\n' +
                '        lines[2] = "PROBE-DONE";\n' +
                "        return lines;\n" +
                "    }\n" +
                "}\n",
            "helper.sol":
                "// SPDX-License-Identifier: MIT\n" +
                "pragma solidity ^0.8.0;\n" +
                "library Helper {\n" +
                '    function label() internal pure returns (string memory) { return "helper"; }\n' +
                "}\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: [],
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "PROBE-DONE"],
        exercisedFeatures: ["arguments", "multiFile"],
        unsupportedFeatures: [
            {
                feature: "stdin",
                reason: "contracts have no stdin channel; inputs arrive through ABI encoded function arguments",
            },
            {
                feature: "fileIo",
                reason: "the in-memory EVM has no host filesystem; compile-time imports are the only cross-file channel",
            },
        ],
    },
    {
        languageIdentifier: "vimscript",
        entryFileName: "main.vim",
        sourceFiles: {
            "main.vim":
                "call writefile([], '/result.txt')\n" +
                "source /helper.vim\n" +
                "call writefile(['greet:' . Label() . ':Ada'], '/result.txt', 'a')\n" +
                "let s:arguments = readfile('/wasmverse-args.txt')\n" +
                "call writefile(['arg0:' . s:arguments[0]], '/result.txt', 'a')\n" +
                "call writefile(['file:' . readfile('data.txt')[0]], '/result.txt', 'a')\n" +
                "call writefile(['PROBE-DONE'], '/result.txt', 'a')\n" +
                "qall!\n",
            "helper.vim": "function! Label() abort\n    return 'helper'\nendfunction\n",
            "data.txt": "probe-data\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: [],
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:probe-data", "PROBE-DONE"],
        exercisedFeatures: ["arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [
            {
                feature: "stdin",
                reason: "the vim.wasm build replaces stdin with an end-of-file stub, so Ex mode cannot read interactive input",
            },
        ],
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
        languageIdentifier: "logo",
        entryFileName: "main.logo",
        sourceFiles: {
            "main.logo":
                "PRINT WORD |greet:helper:| READWORD\n" +
                "PRINT WORD |arg0:| FIRST :WASMVERSE.ARGUMENTS\n" +
                "PRINT |PROBE-DONE|\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments"],
        unsupportedFeatures: [
            {
                feature: "fileIo",
                reason: "the Logo interpreter keeps values in memory only; host files are not mapped",
            },
            {
                feature: "multiFile",
                reason: "the interpreter loads the entry file only; helper procedures live inside the entry program",
            },
        ],
    },
    {
        languageIdentifier: "gwbasic",
        entryFileName: "main.bas",
        sourceFiles: {
            "main.bas":
                '10 INPUT "name? "; N$\n' +
                "20 GOSUB 100\n" +
                '30 PRINT "greet:"; LABEL$; ":"; N$\n' +
                '40 PRINT "PROBE-DONE"\n' +
                "50 END\n" +
                '100 LABEL$ = "helper"\n' +
                "110 RETURN\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "PROBE-DONE"],
        exercisedFeatures: ["stdin"],
        unsupportedFeatures: [
            {
                feature: "arguments",
                reason: "GW-BASIC has no argv channel in this interpreter; programs take input through INPUT and DATA",
            },
            {
                feature: "fileIo",
                reason: "the interpreter keeps variables in memory only; host files are not mapped",
            },
            {
                feature: "multiFile",
                reason: "only the entry listing is loaded; helper logic lives in GOSUB subroutines inside one listing",
            },
        ],
    },
    {
        languageIdentifier: "sml",
        entryFileName: "main.sml",
        sourceFiles: {
            "main.sml":
                'fun helperLabel () = "helper"\n' +
                'val () = print ("greet:" ^ helperLabel() ^ ":sml\\n")\n' +
                'val () = print "PROBE-DONE\\n"\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: [],
        expectedLines: ["PROBE-DONE"],
        exercisedFeatures: [],
        unsupportedFeatures: [
            {
                feature: "stdin",
                reason: "no verified Standard ML browser runtime exists; the SMLtoJs toolchain is not provisioned under ./.tools/sml/",
            },
            {
                feature: "arguments",
                reason: "no verified Standard ML browser runtime exists; the SMLtoJs toolchain is not provisioned under ./.tools/sml/",
            },
            {
                feature: "fileIo",
                reason: "no verified Standard ML browser runtime exists; the SMLtoJs toolchain is not provisioned under ./.tools/sml/",
            },
            {
                feature: "multiFile",
                reason: "no verified Standard ML browser runtime exists; use-based loading is unverified",
            },
        ],
    },
    {
        languageIdentifier: "m6502",
        entryFileName: "main.6502",
        sourceFiles: {
            "main.6502":
                "        .org $0200\n" +
                "\n" +
                "start:\n" +
                "        lda #<greetText\n" +
                "        sta $00\n" +
                "        lda #>greetText\n" +
                "        sta $01\n" +
                "        jsr printString\n" +
                "        lda #<helperText\n" +
                "        sta $00\n" +
                "        lda #>helperText\n" +
                "        sta $01\n" +
                "        jsr printString\n" +
                "        lda #<colonText\n" +
                "        sta $00\n" +
                "        lda #>colonText\n" +
                "        sta $01\n" +
                "        jsr printString\n" +
                "        ldx #0\n" +
                "readLoop:\n" +
                "        lda $F004\n" +
                "        cmp #13\n" +
                "        beq readDone\n" +
                "        sta nameBuffer,x\n" +
                "        inx\n" +
                "        cpx #60\n" +
                "        bcc readLoop\n" +
                "readDone:\n" +
                "        stx nameLength\n" +
                "        ldx #0\n" +
                "echoLoop:\n" +
                "        cpx nameLength\n" +
                "        beq echoDone\n" +
                "        lda nameBuffer,x\n" +
                "        sta $F001\n" +
                "        inx\n" +
                "        jmp echoLoop\n" +
                "echoDone:\n" +
                "        lda #10\n" +
                "        sta $F001\n" +
                "        lda #<doneText\n" +
                "        sta $00\n" +
                "        lda #>doneText\n" +
                "        sta $01\n" +
                "        jsr printString\n" +
                "        lda #0\n" +
                "        sta $F002\n" +
                "\n" +
                "printString:\n" +
                "        ldy #0\n" +
                "printStringLoop:\n" +
                "        lda ($00),y\n" +
                "        beq printStringDone\n" +
                "        sta $F001\n" +
                "        iny\n" +
                "        jmp printStringLoop\n" +
                "printStringDone:\n" +
                "        rts\n" +
                "\n" +
                "greetText:\n" +
                '        .byte "greet:", 0\n' +
                "colonText:\n" +
                '        .byte ":", 0\n' +
                "doneText:\n" +
                '        .byte "PROBE-DONE", 10, 0\n' +
                "\n" +
                "nameBuffer:\n" +
                "        .res 64\n" +
                "nameLength:\n" +
                "        .byte 0\n" +
                "\n" +
                '        .include "helper.6502"\n',
            "helper.6502": 'helperText:\n        .byte "helper", 0\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "multiFile"],
        unsupportedFeatures: [
            {
                feature: "arguments",
                reason: "the emulator exposes no argv channel; programs read data through $F004 and memory-mapped IO",
            },
            {
                feature: "fileIo",
                reason: "the emulator maps only terminal IO ($F001 output, $F004 input); there is no host filesystem",
            },
        ],
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
    {
        languageIdentifier: "duckdb",
        entryFileName: "main.duckdb.sql",
        sourceFiles: {
            "main.duckdb.sql":
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
                reason: "DuckDB scripts have no stdin in this runtime",
            },
            {
                feature: "arguments",
                reason: "DuckDB scripts have no argv in this runtime",
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
    {
        languageIdentifier: "pglite",
        entryFileName: "main.pglite.sql",
        sourceFiles: {
            "main.pglite.sql":
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
                reason: "PGlite scripts have no stdin in this runtime",
            },
            {
                feature: "arguments",
                reason: "PGlite scripts have no argv in this runtime",
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
    {
        languageIdentifier: "awk",
        entryFileName: "main.awk",
        sourceFiles: {
            "main.awk":
                'BEGIN { helper = "helper" }\n' +
                'NR == 1 { print "greet:" helper ":" $0; exit }\n' +
                "END {\n" +
                '    print "arg0:" (arg0 == "" ? "none" : arg0)\n' +
                '    print "written" > "out.txt"\n' +
                '    close("out.txt")\n' +
                '    getline written < "out.txt"\n' +
                '    close("out.txt")\n' +
                '    print "file:" written\n' +
                '    print "PROBE-DONE"\n' +
                "}\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo"],
        unsupportedFeatures: [
            {
                feature: "multiFile",
                reason: "busybox awk has no include directive; the performer runs the entry program only",
            },
        ],
    },
    {
        languageIdentifier: "jq",
        entryFileName: "main.jq",
        sourceFiles: {
            "main.jq": '"greet:" + .name, ("arg0:" + $arg0), "PROBE-DONE"\n',
            "data.json": '{"name": "probe-data"}\n',
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: [],
        expectedLines: ["greet:probe-data", "arg0:alpha", "PROBE-DONE"],
        exercisedFeatures: ["arguments"],
        unsupportedFeatures: [
            {
                feature: "stdin",
                reason: "the jq runtime takes its input document as one string; there is no interactive read",
            },
            {
                feature: "fileIo",
                reason: "jq filters write only to stdout and cannot name input files",
            },
            {
                feature: "multiFile",
                reason: "the jq runtime exposes no module include path to the filter",
            },
        ],
    },
    {
        languageIdentifier: "bash",
        entryFileName: "main.sh",
        sourceFiles: {
            "main.sh":
                "read name\n" +
                ". /helper.sh\n" +
                'echo "greet:$(helper_label):$name"\n' +
                'echo "arg0:$1"\n' +
                "echo written > out.txt\n" +
                'echo "file:$(cat out.txt)"\n' +
                "echo PROBE-DONE\n",
            "helper.sh": "helper_label() {\n    printf helper\n}\n",
        },
        programArguments: PROBE_ARGUMENTS,
        terminalAnswers: PROBE_ANSWERS,
        expectedLines: ["greet:helper:Ada", "arg0:alpha", "file:written", "PROBE-DONE"],
        exercisedFeatures: ["stdin", "arguments", "fileIo", "multiFile"],
        unsupportedFeatures: [],
    },
];
export { FEATURE_PROBES };
export type { FeatureName, FeatureProbeDefinition, UnsupportedFeature };
