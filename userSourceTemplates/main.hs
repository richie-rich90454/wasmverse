primes :: [Int]
primes = sieve [2..]
  where
    sieve (p:xs) = p : sieve [x | x <- xs, x `mod` p /= 0]
    sieve [] = []

class Summarize a where
  summary :: a -> String

data Window = Window Int Int

instance Summarize Window where
  summary (Window start end) = "window[" ++ show start ++ ".." ++ show end ++ "]"

windows :: [Window]
windows = [Window 0 500, Window 500 1200, Window 1200 2600]

rollingSums :: Int -> [Int] -> [Int]
rollingSums width values
  | length values < width = []
  | otherwise = sum (take width values) : rollingSums width (tail values)

main :: IO ()
main = do
    putStrLn "WASMVerse Haskell showcase"
    putStrLn "Stage one: type classes summarize compute windows"
    mapM_ (putStrLn . summary) windows
    putStrLn "Stage two: infinite lazy lists meet a prime sieve"
    let firstPrimes = take 12 primes
    putStrLn ("first primes: " ++ show firstPrimes)
    putStrLn ("prime count below 100: " ++ show (length (takeWhile (< 100) primes)))
    putStrLn "Stage three: pure folds over rolling windows"
    let sums = take 6 (rollingSums 6 (take 60 primes))
    putStrLn ("window sums: " ++ show sums)
    putStrLn "Showcase complete."
