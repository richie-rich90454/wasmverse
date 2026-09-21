main :: IO ()
main = do
    putStrLn "=== Hello from the Universal WASM Platform ==="
    putStr "Your name? "
    name <- getLine
    putStrLn ("Hello, " ++ name ++ "!")
