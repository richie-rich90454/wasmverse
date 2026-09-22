use wasm_bindgen::prelude::*;

const WINDOW_SIZE: usize = 12;

fn sieve(limit: usize) -> Vec<usize> {
    if limit < 2 {
        return Vec::new();
    }
    let mut flags = vec![true; limit + 1];
    flags[0] = false;
    flags[1] = false;
    let mut number = 2;
    while number * number <= limit {
        if flags[number] {
            let mut multiple = number * number;
            while multiple <= limit {
                flags[multiple] = false;
                multiple += number;
            }
        }
        number += 1;
    }
    flags
        .iter()
        .enumerate()
        .skip(2)
        .filter(|(_, keep)| **keep)
        .map(|(index, _)| index)
        .collect()
}

fn window_sums(values: &[usize], width: usize) -> Vec<usize> {
    values
        .windows(width.max(1))
        .map(|slice| slice.iter().sum())
        .collect()
}

#[wasm_bindgen]
pub fn run() -> String {
    let mut output = String::new();
    output.push_str("WASMVerse Rust showcase\n");
    output.push_str("Stage one: iterator pipelines over a prime sieve\n");
    let primes = sieve(2000);
    let sums = window_sums(&primes, WINDOW_SIZE);
    let largest = primes.last().copied().unwrap_or(0);
    output.push_str(&format!("prime count up to 2000: {}\n", primes.len()));
    output.push_str(&format!("largest prime: {}\n", largest));
    let head: Vec<String> = sums.iter().take(6).map(|value| value.to_string()).collect();
    output.push_str(&format!("first window sums: {}\n", head.join(", ")));
    let doubled: Vec<String> = primes.iter().take(10).map(|value| (value * 2).to_string()).collect();
    output.push_str(&format!("doubled head primes: {}\n", doubled.join(", ")));
    output.push_str("Stage two: ownership transfer across a compute graph\n");
    let labels = vec!["parse", "lower", "render"];
    let upper: Vec<String> = labels.into_iter().map(|label| label.to_uppercase()).collect();
    output.push_str(&format!("labels: {}\n", upper.join(" -> ")));
    output.push_str("Showcase complete.\n");
    output
}
