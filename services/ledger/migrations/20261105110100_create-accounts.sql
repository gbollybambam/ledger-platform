CREATE TABLE accounts (
  id             uuid PRIMARY KEY,
  client_id      uuid NOT NULL REFERENCES clients(id),
  name           text NOT NULL
                   CHECK (name = btrim(name)
                          AND char_length(name) BETWEEN 1 AND 120
                          AND name !~ '[[:cntrl:]]'),
  kind           text NOT NULL CHECK (kind IN
                   ('asset','liability','equity','revenue','expense')),
  normal_balance text NOT NULL CHECK (normal_balance IN ('debit','credit')),
  currency       char(3) NOT NULL REFERENCES currencies(code),
  allow_negative boolean NOT NULL DEFAULT false,
  external_id    text CHECK (external_id ~ '^[A-Za-z0-9._:-]{1,128}$'),
  debits_total   bigint NOT NULL DEFAULT 0 CHECK (debits_total >= 0),
  credits_total  bigint NOT NULL DEFAULT 0 CHECK (credits_total >= 0),
  version        bigint NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, currency),
  UNIQUE (client_id, external_id),
  CONSTRAINT normal_balance_follows_kind CHECK (
    normal_balance = CASE kind
      WHEN 'asset'   THEN 'debit'
      WHEN 'expense' THEN 'debit'
      ELSE                'credit'
    END),
  CONSTRAINT negative_only_for_equity CHECK (NOT allow_negative OR kind = 'equity'),
  CONSTRAINT no_overdraft CHECK (
    allow_negative OR
    (CASE normal_balance
       WHEN 'debit'  THEN debits_total - credits_total
       ELSE               credits_total - debits_total
     END) >= 0
));

GRANT SELECT ON accounts TO ledger_app;
GRANT INSERT (id, client_id, name, kind, normal_balance, currency, allow_negative, external_id)
  ON accounts TO ledger_app;
GRANT UPDATE (debits_total, credits_total, version) ON accounts TO ledger_app;

CREATE FUNCTION accounts_identity_is_final() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id             IS DISTINCT FROM OLD.id
  OR NEW.client_id      IS DISTINCT FROM OLD.client_id
  OR NEW.name           IS DISTINCT FROM OLD.name
  OR NEW.kind           IS DISTINCT FROM OLD.kind
  OR NEW.normal_balance IS DISTINCT FROM OLD.normal_balance
  OR NEW.currency       IS DISTINCT FROM OLD.currency
  OR NEW.allow_negative IS DISTINCT FROM OLD.allow_negative
  OR NEW.external_id    IS DISTINCT FROM OLD.external_id
  OR NEW.created_at     IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'account identity is final'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER accounts_identity_is_final
  BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_identity_is_final();

CREATE FUNCTION accounts_are_never_deleted() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'accounts are never deleted'
    USING ERRCODE = 'integrity_constraint_violation';
END
$$;

CREATE TRIGGER accounts_are_never_deleted
  BEFORE DELETE ON accounts
  FOR EACH ROW EXECUTE FUNCTION accounts_are_never_deleted();
