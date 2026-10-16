proc prime-p {candidate divisors} {
    foreach divisor $divisors {
        if {$candidate % $divisor == 0} {
            return 0
        }
    }
    return 1
}

proc collect-primes {limit} {
    set primes [list 2]
    for {set candidate 3} {$candidate <= $limit} {incr candidate 2} {
        if {[prime-p $candidate $primes]} {
            lappend primes $candidate
        }
    }
    return $primes
}

proc rolling-sums {values width} {
    set totals [list]
    set finalIndex [expr {[llength $values] - $width}]
    for {set index 0} {$index <= $finalIndex} {incr index} {
        set total 0
        foreach value [lrange $values $index [expr {$index + $width - 1}]] {
            incr total $value
        }
        lappend totals $total
    }
    return $totals
}

proc residue-count {values modulus target} {
    set total 0
    foreach value $values {
        if {$value % $modulus == $target} {
            incr total
        }
    }
    return $total
}

puts "WASMVerse Tcl showcase"
puts "Stage one: prime sieve"
set primes [collect-primes 400]
puts "prime count up to 400: [llength $primes]"
puts "largest prime: [lindex $primes end]"
puts "Stage two: rolling windows"
set windows [rolling-sums $primes 10]
puts "window count: [llength $windows]"
puts "first windows: [lrange $windows 0 3]"
puts "Stage three: residue classes"
puts "residue zero under 7: [residue-count $primes 7 0]"
puts "residue zero under 5: [residue-count $primes 5 0]"
puts "Stage four: dict-driven report"
set ledger [dict create]
foreach value [lrange $primes 0 9] {
    dict set ledger $value [expr {$value * $value}]
}
puts "ledger entries: [dict size $ledger]"
puts "square of 29: [dict get $ledger 29]"
puts "Showcase complete."
