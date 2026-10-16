use strict;
use warnings;

sub evaluate_rpn {
    my (@tokens) = @_;
    my @stack;
    for my $token (@tokens) {
        if ($token =~ /\A-?\d+\z/) {
            push @stack, $token + 0;
            next;
        }
        my $right = pop @stack;
        my $left = pop @stack;
        if ($token eq '+') { push @stack, $left + $right; }
        elsif ($token eq '-') { push @stack, $left - $right; }
        elsif ($token eq '*') { push @stack, $left * $right; }
        elsif ($token eq '/' && $right != 0) { push @stack, int($left / $right); }
    }
    return $stack[-1];
}

sub word_frequencies {
    my ($text) = @_;
    my %counts;
    $counts{lc $1}++ while $text =~ /([A-Za-z]+)/g;
    my @ranked = sort { $counts{$b} <=> $counts{$a} || $a cmp $b } keys %counts;
    return map { [$_ => $counts{$_}] } @ranked;
}

sub running_totals {
    my ($values) = @_;
    my @totals;
    my $sum = 0;
    for my $value (@$values) {
        $sum += $value;
        push @totals, $sum;
    }
    return @totals;
}

print "WASMVerse Perl showcase\n";
print "Stage one: RPN stack machine\n";
for my $expression ("3 4 + 2 *", "10 2 / 3 -", "2 3 4 * +") {
    my $value = evaluate_rpn(split /\s+/, $expression);
    print "  $expression = $value\n";
}
print "Stage two: word frequencies\n";
my $passage = "the quick brown fox jumps over the lazy dog the fox naps";
my @frequencies = word_frequencies($passage);
for my $pair (@frequencies[0 .. 2]) {
    print "  $pair->[0]: $pair->[1]\n";
}
print "Stage three: running totals\n";
my @totals = running_totals([1, 2, 3, 5, 8, 13]);
print "  totals: ", join(", ", @totals), "\n";
print "Stage four: interactive RPN session\n";
print "Enter an RPN expression: ";
my $line = <STDIN>;
if (!defined $line || $line !~ /\S/) {
    $line = "3 4 + 2 *";
    print "Using the default expression.\n";
}
chomp $line;
my $value = evaluate_rpn(split /\s+/, $line);
print "$line = $value\n";
print "Showcase complete.\n";
