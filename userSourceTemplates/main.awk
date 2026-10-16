BEGIN {
    print "WASMVerse AWK showcase"
    print "Stage one: sieve over integers"
    limit = 120
    prime_count = 0
    largest_prime = 0
    for (candidate = 2; candidate <= limit; candidate++) {
        prime = 1
        for (divisor = 2; divisor * divisor <= candidate; divisor++) {
            if (candidate % divisor == 0) {
                prime = 0
                break
            }
        }
        if (prime) {
            prime_count++
            largest_prime = candidate
        }
    }
    print "prime count up to 120: " prime_count
    print "largest prime: " largest_prime
    print "Stage two: rolling sums over the prime stream"
    window = 3
    position = 0
    rolling = 0
    report = ""
    for (candidate = 2; candidate <= 30; candidate++) {
        prime = 1
        for (divisor = 2; divisor * divisor <= candidate; divisor++) {
            if (candidate % divisor == 0) {
                prime = 0
                break
            }
        }
        if (!prime) {
            continue
        }
        position++
        slot = position % window
        if (position > window) {
            rolling -= ring[slot]
        }
        rolling += candidate
        ring[slot] = candidate
        if (position >= window) {
            report = report (report == "" ? "" : ", ") rolling
        }
    }
    print "window sums: " report
    print "Stage three: associative array tallies"
    tally["alpha"] = 3
    tally["beta"] = 5
    tally["alpha"] += 2
    print "alpha tally: " tally["alpha"]
    print "beta tally: " tally["beta"]
    print "Showcase complete."
}
