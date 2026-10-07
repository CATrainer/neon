-- Human-facing keys. Work orders and decisions are referred to by key in
-- commit trailers, PR bodies and conversation, so they need to be short,
-- stable and typeable.

-- One global sequence rather than per-repo counters: a work order can exist
-- before anyone knows which repo it touches, and gaps are harmless.
CREATE SEQUENCE work_order_key_seq START 1;
CREATE SEQUENCE decision_key_seq START 1;

-- Prefix for keys minted against this repo, e.g. 'DSP' -> DSP-412.
ALTER TABLE repos ADD COLUMN key_prefix text NOT NULL DEFAULT 'WO';
