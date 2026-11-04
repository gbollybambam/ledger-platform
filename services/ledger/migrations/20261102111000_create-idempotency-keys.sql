CREATE TABLE idempotency_keys (
  client_id     uuid NOT NULL REFERENCES clients(id),
  key           text NOT NULL CHECK (key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  request_hash  text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  response_code integer CHECK (response_code BETWEEN 200 AND 299),
  response_body jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, key),
  CHECK ((response_code IS NULL) = (response_body IS NULL))
);

GRANT SELECT, INSERT ON idempotency_keys TO ledger_app;
GRANT UPDATE (response_code, response_body) ON idempotency_keys TO ledger_app;

-- Once a response is stored, it never changes.
CREATE FUNCTION idempotency_keys_freeze() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.response_code IS NOT NULL THEN
    RAISE EXCEPTION 'idempotency response is final'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER idempotency_keys_freeze
  BEFORE UPDATE ON idempotency_keys
  FOR EACH ROW EXECUTE FUNCTION idempotency_keys_freeze();

-- A key that is committed always has a response.
CREATE FUNCTION idempotency_keys_require_response() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM idempotency_keys
     WHERE client_id = NEW.client_id AND key = NEW.key AND response_code IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'idempotency key committed without a response'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END
$$;

CREATE CONSTRAINT TRIGGER idempotency_keys_require_response
  AFTER INSERT ON idempotency_keys
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION idempotency_keys_require_response();