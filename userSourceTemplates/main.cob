>>SOURCE FORMAT FREE
identification division.
program-id. wasmverse-cobol-showcase.

data division.
working-storage section.
01 ledger-table.
   05 ledger-entry occurs 3 times.
      10 ledger-label pic x(8).
      10 ledger-amount pic s9(6).
01 ledger-index pic 9(2).
01 ledger-total pic s9(8) value 0.
01 displayed-amount pic zzzzz9.
01 displayed-total pic zzzzzzz9.
01 generated-value pic zzzzz9.
01 generated-index pic 9(2).
01 interactive-doubling pic s9(8).
01 requested-number pic s9(8).

procedure division.
display 'WASMVerse COBOL showcase'
display 'Stage one: records in a table'
move 'alpha' to ledger-label(1)
move 7 to ledger-amount(1)
move 'beta' to ledger-label(2)
move 12 to ledger-amount(2)
move 'gamma' to ledger-label(3)
move 21 to ledger-amount(3)
perform varying ledger-index from 1 by 1 until ledger-index > 3
    move ledger-amount(ledger-index) to displayed-amount
    display '  ' ledger-label(ledger-index) ' holds ' displayed-amount
    add ledger-amount(ledger-index) to ledger-total
end-perform
move ledger-total to displayed-total
display '  total: ' displayed-total
display 'Stage two: computed sequence'
perform varying generated-index from 1 by 1 until generated-index > 6
    compute generated-value = generated-index * generated-index
    display '  square ' generated-index ' = ' generated-value
end-perform
display 'Stage three: interactive doubling'
display 'Enter a number to double: '
accept requested-number
if requested-number = 0
    display '  using the default input'
    move 21 to requested-number
end-if
compute interactive-doubling = requested-number * 2
display '  doubled: ' interactive-doubling
display 'Showcase complete.'
stop run.
