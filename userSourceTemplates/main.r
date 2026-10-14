sieve <- function(limit) {
    flags <- rep(TRUE, limit)
    flags[1] <- FALSE
    number <- 2
    while (number * number <= limit) {
        if (flags[number]) {
            multiples <- seq(number * number, limit, by = number)
            flags[multiples] <- FALSE
        }
        number <- number + 1
    }
    which(flags)
}

rolling_means <- function(values, width) {
    window_sums <- numeric(length(values) - width + 1)
    running_total <- 0
    for (index in seq_along(values)) {
        running_total <- running_total + values[index]
        if (index > width) {
            running_total <- running_total - values[index - width]
        }
        if (index >= width) {
            window_sums[index - width + 1] <- running_total / width
        }
    }
    window_sums
}

make_counter <- function() {
    state <- 0
    function(step = 1) {
        state <<- state + step
        state
    }
}

cat("WASMVerse R showcase\n")
cat("Stage one: vectorized prime sieve\n")
primes <- sieve(600)
cat("prime count up to 600:", length(primes), "\n")
cat("largest prime:", max(primes), "\n")
cat("first primes:", paste(head(primes, 10), collapse = ", "), "\n")
cat("Stage two: rolling window statistics\n")
windows <- rolling_means(primes, 12)
cat("window count:", length(windows), "\n")
cat("first window means:", paste(round(head(windows, 4), 2), collapse = ", "), "\n")
cat("Stage three: closures and data frames\n")
counter <- make_counter()
counter(3)
counter(4)
cat("counter state:", counter(0), "\n")
ledger <- data.frame(
    account = c("alpha", "beta", "alpha", "beta", "alpha"),
    amount = c(120, 75, -40, 25, -15),
    stringsAsFactors = FALSE
)
totals <- aggregate(amount ~ account, data = ledger, FUN = sum)
for (row in seq_len(nrow(totals))) {
    cat(totals$account[row], "balance:", totals$amount[row], "\n")
}
cat("Stage four: functional pipeline\n")
residues <- sapply(primes, function(value) value %% 7)
frequent <- sort(table(residues), decreasing = TRUE)
cat("most common residue:", names(frequent)[1], "\n")
cat("residue spread:", length(frequent), "classes\n")
cat("Showcase complete.\n")
