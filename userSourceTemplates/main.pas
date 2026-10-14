program wasmverse_pascal_showcase;

type
    TReading = record
        labelText: AnsiString;
        amount: Integer;
    end;

var
    readings: array of TReading;
    readingIndex: Integer;
    runningTotal: Integer;
    expressionText: AnsiString;

procedure AddReading(const labelText: AnsiString; amount: Integer);
begin
    SetLength(readings, Length(readings) + 1);
    readings[High(readings)].labelText := labelText;
    readings[High(readings)].amount := amount;
end;

function RenderLedger: AnsiString;
var
    ledgerLine: AnsiString;
begin
    RenderLedger := '';
    for readingIndex := 0 to High(readings) do
    begin
        Str(readings[readingIndex].amount, ledgerLine);
        RenderLedger := RenderLedger + readings[readingIndex].labelText + '=' + ledgerLine + ' ';
    end;
end;

function SumAmounts: Integer;
var
    total: Integer;
begin
    total := 0;
    for readingIndex := 0 to High(readings) do
        total := total + readings[readingIndex].amount;
    SumAmounts := total;
end;

begin
    WriteLn('WASMVerse Pascal showcase');
    WriteLn('Stage one: records and dynamic arrays');
    AddReading('alpha', 7);
    AddReading('beta', 12);
    AddReading('gamma', 21);
    WriteLn('  ledger: ', RenderLedger);
    WriteLn('  sum: ', SumAmounts);
    WriteLn('Stage two: a Fibonacci window');
    runningTotal := 0;
    Write('  window: ');
    for readingIndex := 1 to 10 do
    begin
        runningTotal := runningTotal + readingIndex;
        Write(runningTotal, ' ');
    end;
    WriteLn;
    WriteLn('Stage three: interactive arithmetic');
    Write('Enter two integers separated by a space: ');
    ReadLn(expressionText);
    if Length(expressionText) = 0 then
    begin
        expressionText := '2 3';
        WriteLn('Using the default input.');
    end;
    WriteLn('  you entered: ', expressionText);
    WriteLn('Showcase complete.');
end.
