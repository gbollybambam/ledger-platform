CREATE TABLE clients (
  id          uuid PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  key_prefix  text NOT NULL,
  key_hash    bytea NOT NULL UNIQUE,
  scopes      text[] NOT NULL
                CHECK (cardinality(scopes) > 0
                       AND scopes <@ ARRAY['ledger:read','ledger:write']::text[]),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz,
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

GRANT SELECT ON clients TO ledger_app;
