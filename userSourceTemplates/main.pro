ledger(alpha, 7).
ledger(beta, 12).
ledger(gamma, 5).
ledger(delta, 12).
ledger(epsilon, 9).

names([alpha, beta, gamma, delta, epsilon]).
amounts([7, 12, 5, 12, 9]).

sum_amounts([], 0).
sum_amounts([Amount | Rest], Total) :-
    sum_amounts(Rest, RestTotal),
    Total is Amount + RestTotal.

largest_amount([Only], Only).
largest_amount([Amount | Rest], Maximum) :-
    largest_amount(Rest, RestMaximum),
    (Amount > RestMaximum -> Maximum = Amount ; Maximum = RestMaximum).

print_entries([]).
print_entries([Name | Rest]) :-
    ledger(Name, Amount),
    write(Name), write(' = '), write(Amount), nl,
    print_entries(Rest).

double_amounts([], []).
double_amounts([Amount | Rest], [Doubled | RestDoubled]) :-
    Doubled is Amount * 2,
    double_amounts(Rest, RestDoubled).

main :-
    write('WASMVerse Prolog showcase'), nl,
    write('Stage one: generated ledger facts'), nl,
    names(Names),
    print_entries(Names),
    write('Stage two: recursive list folding'), nl,
    amounts(Amounts),
    sum_amounts(Amounts, Total),
    write('total: '), write(Total), nl,
    largest_amount(Amounts, Maximum),
    write('largest amount: '), write(Maximum), nl,
    write('Stage three: arithmetic over the ledger'), nl,
    double_amounts(Amounts, Doubled),
    write('doubled: '), write(Doubled), nl,
    write('Showcase complete.'), nl.
