10 REM WASMVerse GW-BASIC showcase. Supported: line numbers, PRINT with ; and ,
20 REM separators and 14-column zones, INPUT, LET (or implied assignment),
30 REM IF/THEN/ELSE with line numbers or statements, FOR/NEXT with STEP,
40 REM GOTO/GOSUB/RETURN, REM and ', END and STOP, RND (Lehmer generator,
50 REM seed 42; RANDOMIZE n reseeds), INT/ABS/SQR/LEN/CHR$/ASC/STR$/VAL,
60 REM DATA/READ/RESTORE and DIM arrays (one or two dimensions).
70 PRINT "WASMVerse GW-BASIC showcase"
80 PRINT "Stage one: numbers and functions"
90 PRINT "int:"; 42; "negative:"; -7
100 PRINT "sqr:"; SQR(144); "abs:"; ABS(-9); "int:"; INT(3.7)
110 PRINT "Stage two: FOR/NEXT with STEP"
120 FOR I = 10 TO 1 STEP -2
130 PRINT "countdown:"; I;
140 NEXT I
150 PRINT
160 PRINT "Stage three: arrays and GOSUB"
170 DIM SQUARES(10)
180 FOR I = 1 TO 10
190 SQUARES(I) = I * I
200 NEXT I
210 GOSUB 500
220 PRINT "square total:"; TOTAL
230 PRINT "Stage four: DATA/READ and the seeded RND"
240 FOR I = 1 TO 3
250 READ COEFFICIENT
260 PRINT "coefficient:"; COEFFICIENT;
270 NEXT I
280 PRINT
290 FOR I = 1 TO 3
300 PRINT "random:"; INT(RND(1) * 1000);
310 NEXT I
320 PRINT
330 PRINT "Stage five: string functions"
340 NAME$ = "LOGO" + "-" + CHR$(66) + "ASIC"
350 PRINT NAME$; " len:"; LEN(NAME$); " asc:"; ASC(NAME$)
360 PRINT "Showcase complete."
370 END
500 TOTAL = 0
510 FOR J = 1 TO 10
520 TOTAL = TOTAL + SQUARES(J)
530 NEXT J
540 RETURN
600 DATA 1.5, 2.5, 3.5
