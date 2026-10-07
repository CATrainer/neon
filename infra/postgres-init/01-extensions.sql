-- Duplicate detection at capture (neon_propose) matches idea titles and bodies
-- against open ideas and rejected alternatives. Trigram similarity is enough
-- and keeps the whole thing inside Postgres.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
