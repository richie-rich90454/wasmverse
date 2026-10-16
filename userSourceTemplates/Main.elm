port module Main exposing (main)

import Task

port wasmverseStdout : String -> Cmd msg


port wasmverseStdinRequest : String -> Cmd msg


port wasmverseStdin : (String -> msg) -> Sub msg


port wasmverseFileRequest : String -> Cmd msg


port wasmverseFileResponse : (( String, String ) -> msg) -> Sub msg


port wasmverseDone : String -> Cmd msg


type alias Flags =
    { programArguments : List String }


type alias Model =
    { pending : List String }


type Msg
    = Tick


main : Program Flags Model Msg
main =
    Platform.worker
        { init = \_ -> ( { pending = showcaseLines }, Task.perform (\_ -> Tick) (Task.succeed ()) )
        , update = update
        , subscriptions = \_ -> Sub.none
        }


showcaseLines : List String
showcaseLines =
    [ "WASMVerse Elm showcase"
    , "fibonacci sum: " ++ String.fromInt (List.sum [ 3, 5, 8, 13, 21 ])
    , "ranking: " ++ rank [ "parse", "render", "tokenize" ]
    , "Showcase complete."
    ]


rank : List String -> String
rank words =
    words
        |> List.sortBy (\word -> negate (String.length word))
        |> List.map (\word -> word ++ "(" ++ String.fromInt (String.length word) ++ ")")
        |> String.join " > "


update : Msg -> Model -> ( Model, Cmd Msg )
update _ model =
    case model.pending of
        next :: remaining ->
            ( { model | pending = remaining }
            , Cmd.batch
                [ wasmverseStdout next
                , Task.perform (\_ -> Tick) (Task.succeed ())
                ]
            )

        [] ->
            ( model, wasmverseDone "done" )
