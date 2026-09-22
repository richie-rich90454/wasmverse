protocol Summarizable {
    func summary() -> String
}

struct Window: Summarizable {
    let start: Int
    let end: Int
    func summary() -> String {
        return "window[\(start)..<\(end)] size \(max(0, end - start))"
    }
}

enum PipelineError: Error {
    case emptyInput
    case badToken(String)
}

func parseTotal(_ text: String) -> Result<Int, PipelineError> {
    let trimmed = text.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty {
        return .failure(.emptyInput)
    }
    var total = 0
    for part in trimmed.split(separator: " ") {
        guard let value = Int(part) else {
            return .failure(.badToken(String(part)))
        }
        total += value
    }
    return .success(total)
}

func transform<T, U>(_ values: [T], using work: (T) -> U) -> [U] {
    return values.map(work)
}

func sieve(_ limit: Int) -> [Int] {
    if limit < 2 {
        return []
    }
    var flags = [Bool](repeating: true, count: limit + 1)
    flags[0] = false
    flags[1] = false
    var number = 2
    while number * number <= limit {
        if flags[number] {
            var multiple = number * number
            while multiple <= limit {
                flags[multiple] = false
                multiple += number
            }
        }
        number += 1
    }
    return (2...limit).filter { flags[$0] }
}

print("WASMVerse Swift showcase")
print("Stage one: protocol summaries over compute windows")
let windows = [Window(start: 0, end: 500), Window(start: 500, end: 1200), Window(start: 1200, end: 2600)]
for window in windows {
    print(window.summary())
}
print("Stage two: result types across a parsing pipeline")
let inputs = ["40 1 2", "10 20", "", "7 oops 3"]
for text in inputs {
    switch parseTotal(text) {
    case .success(let total):
        print("parsed \"\(text)\": \(total)")
    case .failure(.emptyInput):
        print("parsed \"\(text)\": empty input")
    case .failure(.badToken(let token)):
        print("parsed \"\(text)\": bad token \(token)")
    }
}
print("Stage three: generics over a prime stream")
let primes = sieve(400)
let doubled = transform(Array(primes.prefix(8))) { $0 * 2 }
print("prime count up to 400: \(primes.count)")
print("largest prime: \(primes.last ?? 0)")
print("doubled head primes: \(doubled)")
print("Showcase complete.")
