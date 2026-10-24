-- Customer requirement: employee-entered Document Ref. No must be unique
-- across In-Out Register entries, compared trimmed + case-insensitively.
--
-- Partial functional index: enforces uniqueness only where a document
-- number exists. NULL documentRefNo (legacy rows) is unaffected and may
-- repeat freely — the column stays nullable, mandatory-ness is enforced
-- for new writes in the application layer.
--
-- Preflighted against production data: 0 duplicate normalized values.

CREATE UNIQUE INDEX IF NOT EXISTS "InOutRegister_documentRefNo_key"
  ON "InOutRegister" (lower(btrim("documentRefNo")))
  WHERE "documentRefNo" IS NOT NULL;
