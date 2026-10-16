CREATE TABLE ledger (entry TEXT NOT NULL, amount INTEGER NOT NULL, category TEXT NOT NULL);

INSERT INTO ledger (entry, amount, category) VALUES
    ('ink', 12, 'supplies'),
    ('paper', 48, 'supplies'),
    ('lamp', 30, 'fixtures'),
    ('ledger', 60, 'fixtures'),
    ('stamps', 9, 'postage');

SELECT 'WASMVerse PGlite showcase' AS line;
SELECT 'Stage one: totals by category' AS line;

SELECT category || ': total ' || SUM(amount) || ', entries ' || COUNT(*) AS summary
FROM ledger
GROUP BY category
ORDER BY category ASC;

SELECT 'Stage two: a generated calendar of weekly windows' AS line;

WITH weeks AS (
    SELECT generate_series(1, 4) AS week_number
),
weekly AS (
    SELECT week_number, week_number * week_number AS squared
    FROM weeks
)
SELECT 'week ' || week_number || ' squared = ' || squared AS reading
FROM weekly
ORDER BY week_number ASC;

SELECT 'Stage three: ranking with a window function' AS line;

SELECT entry || ' rank ' || position || ' = ' || amount AS ranked
FROM (
    SELECT entry, amount, ROW_NUMBER() OVER (ORDER BY amount DESC, entry ASC) AS position
    FROM ledger
) AS ranked_ledger
ORDER BY position ASC
LIMIT 3;

SELECT 'Showcase complete.' AS line;
