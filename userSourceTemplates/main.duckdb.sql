CREATE TABLE ledger (entry TEXT NOT NULL, amount INTEGER NOT NULL, category TEXT NOT NULL);

INSERT INTO ledger (entry, amount, category) VALUES
    ('ink', 12, 'supplies'),
    ('paper', 48, 'supplies'),
    ('lamp', 30, 'fixtures'),
    ('ledger', 60, 'fixtures'),
    ('stamps', 9, 'postage');

SELECT 'WASMVerse DuckDB showcase' AS line;
SELECT 'Stage one: totals by category' AS line;

SELECT category || ': total ' || SUM(amount) || ', entries ' || COUNT(*) AS summary
FROM ledger
GROUP BY category
ORDER BY category ASC;

SELECT 'Stage two: ranking by amount' AS line;

WITH ranked AS (
    SELECT entry, amount, ROW_NUMBER() OVER (ORDER BY amount DESC, entry ASC) AS position
    FROM ledger
)
SELECT entry || ' rank ' || position || ' = ' || amount AS ranked
FROM ranked
ORDER BY position ASC
LIMIT 3;

SELECT 'Stage three: running totals over sorted entries' AS line;

SELECT entry || ' -> ' || SUM(amount) OVER (ORDER BY entry ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
FROM ledger
ORDER BY entry ASC;

SELECT 'Showcase complete.' AS line;
