sieve() {
    limit=$1
    index=2
    prime_list=""
    while [ "$index" -le "$limit" ]; do
        is_prime=1
        divisor=2
        while [ $((divisor * divisor)) -le "$index" ]; do
            if [ $((index % divisor)) -eq 0 ]; then
                is_prime=0
                break
            fi
            divisor=$((divisor + 1))
        done
        if [ "$is_prime" -eq 1 ]; then
            prime_list="$prime_list $index"
        fi
        index=$((index + 1))
    done
    printf '%s' "$prime_list"
}

echo "WASMVerse shell showcase"
echo "Stage one: trial division in ash"
primes=$(sieve 120)
prime_count=0
largest_prime=0
for prime in $primes; do
    prime_count=$((prime_count + 1))
    largest_prime=$prime
done
echo "prime count up to 120: $prime_count"
echo "largest prime: $largest_prime"
echo "Stage two: pipelines and awk arithmetic"
seq 1 12 | awk '{ total += $1 } END { print total }' > total.txt
total=$(cat total.txt)
echo "sum of 1..12 via awk: $total"
echo "Stage three: sorting, truncating, and case dispatch"
printf '%s\n' 4 9 2 7 5 | sort -rn | head -n 3 > top.txt
top_three=$(tr '\n' ',' < top.txt)
echo "top three of 4 9 2 7 5: ${top_three%,}"
report=""
for value in 1 2 3 4 5 15; do
    case $((value % 3)) in
        0) report="$report fizz" ;;
        1) report="$report one" ;;
        *) report="$report two" ;;
    esac
done
echo "dispatch sequence:$report"
echo "Showcase complete."
