use std::fmt::Write as _;

#[derive(Debug, Clone, Copy)]
struct Window {
    start: usize,
    end: usize,
}

impl Window {
    fn size(&self) -> usize {
        self.end.saturating_sub(self.start)
    }
}

trait Describe {
    fn summary(&self) -> String;
}

impl Describe for Window {
    fn summary(&self) -> String {
        format!("window[{}..{}) size {}", self.start, self.end, self.size())
    }
}

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

fn ownership_transfer(items: Vec<String>) -> (Vec<String>, usize) {
    let total_length: usize = items.iter().map(|item| item.len()).sum();
    let consumed = items;
    let labels: Vec<String> = consumed
        .into_iter()
        .map(|item| item.to_uppercase())
        .collect();
    (labels, total_length)
}

fn main() {
    let mut output = String::new();
    let _ = writeln!(output, "WASMVerse Rust showcase");
    let _ = writeln!(output, "Stage one: trait summaries over compute windows");
    let windows = vec![
        Window { start: 0, end: 500 },
        Window { start: 500, end: 1200 },
        Window { start: 1200, end: 2600 },
    ];
    for window in &windows {
        let _ = writeln!(output, "{}", window.summary());
    }
    let _ = writeln!(output, "Stage two: iterator pipelines over a prime sieve");
    let primes = sieve(2000);
    let sums = window_sums(&primes, 12);
    let largest = primes.last().copied().unwrap_or(0);
    let _ = writeln!(output, "prime count up to 2000: {}", primes.len());
    let _ = writeln!(output, "largest prime: {}", largest);
    let first_sums: Vec<String> = sums.iter().take(6).map(|value| value.to_string()).collect();
    let _ = writeln!(output, "first window sums: {}", first_sums.join(", "));
    let even_twins: Vec<usize> = primes.iter().take(10).map(|value| value * 2).collect();
    let _ = writeln!(output, "doubled head primes: {:?}", even_twins);
    let _ = writeln!(output, "Stage three: ownership transfer across a compute graph");
    let (labels, total_length) = ownership_transfer(vec![
        String::from("parse"),
        String::from("lower"),
        String::from("render"),
    ]);
    let _ = writeln!(output, "labels: {}", labels.join(" -> "));
    let _ = writeln!(output, "total label bytes: {}", total_length);
    let _ = writeln!(output, "Showcase complete.");
    print!("{}", output);
}
