CREATE TABLE currencies (
  code           char(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
  minor_exponent smallint NOT NULL CHECK (minor_exponent BETWEEN 0 AND 4)
);

INSERT INTO currencies (code, minor_exponent) VALUES
  ('EUR', 2),
  ('GBP', 2),
  ('GHS', 2),
  ('KES', 2),
  ('NGN', 2),
  ('USD', 2),
  ('ZAR', 2);

GRANT SELECT ON currencies TO ledger_app;
