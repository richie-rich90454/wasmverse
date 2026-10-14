(ns main
  (:require [clojure.string :as string]))

(defn sieve [limit]
  (loop [flags (vec (concat [false false] (repeat (- limit 1) true)))
         number 2]
    (if (> (* number number) limit)
      (keep-indexed (fn [index keep] (when keep index)) flags)
      (if (get flags number)
        (recur (reduce (fn [state multiple] (assoc state multiple false))
                       flags
                       (range (* number number) (inc limit) number))
               (inc number))
        (recur flags (inc number))))))

(defn rolling-sums [values width]
  (mapv (fn [window] (reduce + window)) (partition width 1 values)))

(defn classify [value]
  (cond
    (zero? (mod value 15)) :fizzbuzz
    (zero? (mod value 3)) :fizz
    (zero? (mod value 5)) :buzz
    :else :plain))

(defn tally [values]
  (reduce (fn [counts value] (update counts value (fnil inc 0))) {} values))

(println "WASMVerse ClojureScript showcase")
(println "Stage one: immutable prime sieve")
(def primes (sieve 500))
(println "prime count up to 500:" (count primes))
(println "largest prime:" (last primes))
(println "first primes:" (string/join ", " (take 10 primes)))
(println "Stage two: rolling windows over the prime stream")
(def windows (rolling-sums primes 8))
(println "window count:" (count windows))
(println "first windows:" (string/join ", " (take 4 windows)))
(println "Stage three: classification ledger")
(def labels (mapv classify (range 1 31)))
(def tally-result (tally labels))
(doseq [label [:fizz :buzz :fizzbuzz :plain]]
  (println (name label) "count:" (get tally-result label 0)))
(println "Stage four: higher-order pipelines")
(def squares (->> primes (take 12) (map (fn [value] (* value value))) (into [])))
(println "square heads:" (string/join ", " squares))
(println "sum of square heads:" (reduce + squares))
(println "Showcase complete.")
