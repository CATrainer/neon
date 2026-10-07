-- Neon core schema.
--
-- Nothing here is specific to one kind of engineering team. Adapter-specific
-- configuration lives in opaque jsonb columns; the core does not interpret it.
--
-- Neon stores references and content hashes, never the content git can answer
-- for: no file text, no spec bodies, no commit metadata, no PR state beyond a
-- cached url.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE users (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  email         text NOT NULL UNIQUE,
  github_login  text,
  avatar_url    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE repos (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  remote_url      text NOT NULL UNIQUE,
  kind            text NOT NULL CHECK (kind IN ('code', 'knowledge', 'config')),
  -- Opaque to the core: how sensitive this repo is, interpreted by policy.
  access_class    text NOT NULL DEFAULT 'internal',
  default_branch  text NOT NULL DEFAULT 'main',
  -- Where this repo is checked out on this machine, when known. A local
  -- convenience for running checks, not a fact about the repo.
  local_path      text,
  registered_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE components (
  id           text PRIMARY KEY,
  repo_id      text NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  name         text NOT NULL,
  path_globs   text[] NOT NULL DEFAULT '{}',
  description  text NOT NULL DEFAULT '',
  UNIQUE (repo_id, name)
);

CREATE TABLE interface_contracts (
  id                      text PRIMARY KEY,
  name                    text NOT NULL,
  version                 text NOT NULL,
  publisher_component_id  text NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  consumer_component_ids  text[] NOT NULL DEFAULT '{}',
  -- Reference into git. Never the contract text.
  artifact_ref            text NOT NULL DEFAULT '',
  UNIQUE (name, version)
);
CREATE INDEX interface_contracts_consumers_idx
  ON interface_contracts USING gin (consumer_component_ids);

-- The front door. Requires a title and a body and nothing else: if capture
-- demands a component, a repo or a rationale, people stop capturing.
CREATE TABLE ideas (
  id                        text PRIMARY KEY,
  title                     text NOT NULL,
  body                      text NOT NULL DEFAULT '',
  source                    text NOT NULL DEFAULT 'manual'
                              CHECK (source IN ('chat', 'session', 'scheduled', 'manual')),
  captured_by               text NOT NULL REFERENCES users(id),
  captured_at               timestamptz NOT NULL DEFAULT now(),
  -- Expiry is measured from the last touch, not from capture.
  touched_at                timestamptz NOT NULL DEFAULT now(),
  state                     text NOT NULL DEFAULT 'open'
                              CHECK (state IN ('open', 'promoted', 'expired', 'discarded')),
  expires_at                timestamptz NOT NULL,
  tags                      text[] NOT NULL DEFAULT '{}',
  related_ids               text[] NOT NULL DEFAULT '{}',
  promoted_to_work_order_id text,
  -- Optional on purpose: capture must work with no repo context at all.
  repo_id                   text REFERENCES repos(id) ON DELETE SET NULL,
  -- Denormalised title+body, maintained on write, for duplicate detection at
  -- capture. Not a generated column: the expression would have to be immutable.
  search_text               text NOT NULL DEFAULT ''
);
CREATE INDEX ideas_search_trgm_idx ON ideas USING gin (search_text gin_trgm_ops);
CREATE INDEX ideas_state_idx ON ideas (state);
CREATE INDEX ideas_expires_idx ON ideas (expires_at) WHERE state = 'open';

CREATE TABLE work_orders (
  id                      text PRIMARY KEY,
  key                     text NOT NULL UNIQUE,
  -- `code` targets a code repo and produces commits; `inquiry` targets a
  -- knowledge repo and produces records. Same machinery either way.
  kind                    text NOT NULL CHECK (kind IN ('code', 'inquiry')),
  title                   text NOT NULL,
  intent                  text NOT NULL DEFAULT '',
  state                   text NOT NULL DEFAULT 'draft'
                            CHECK (state IN ('draft', 'ready', 'in_progress', 'review',
                                             'done', 'blocked', 'abandoned')),
  acceptance_criteria     jsonb NOT NULL DEFAULT '[]',
  done_when               jsonb NOT NULL DEFAULT '[]',
  -- A hint for context assembly only. What was actually touched is derived
  -- from the diff.
  declared_component_ids  text[] NOT NULL DEFAULT '{}',
  created_by              text NOT NULL REFERENCES users(id),
  blocked_by              text[] NOT NULL DEFAULT '{}',
  supersedes              text,
  origin_idea_id          text REFERENCES ideas(id) ON DELETE SET NULL,
  repo_id                 text REFERENCES repos(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  -- The ladder's last gate, in the database as well as the domain service:
  -- a commitment without a definition of done is a wish.
  CONSTRAINT work_orders_committed_needs_done_when CHECK (
    state IN ('draft', 'abandoned', 'blocked') OR jsonb_array_length(done_when) > 0
  )
);
CREATE INDEX work_orders_components_idx ON work_orders USING gin (declared_component_ids);
CREATE INDEX work_orders_state_idx ON work_orders (state);

CREATE TABLE changes (
  id                 text PRIMARY KEY,
  work_order_id      text NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  repo_id            text NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  branch             text NOT NULL,
  pr_url             text,
  -- Path to the spec or record in git, plus a hash for drift detection.
  spec_ref           text,
  spec_content_hash  text,
  depends_on         text[] NOT NULL DEFAULT '{}',
  -- Only `claimed` and `abandoned` are Neon's to know; the rest is a cache of
  -- what git and the forge already say.
  state              text NOT NULL DEFAULT 'claimed'
                       CHECK (state IN ('claimed', 'open', 'in_review', 'merged',
                                        'closed', 'abandoned')),
  claimed_by         text REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, branch)
);
-- One live change per work order per repo. Finished and abandoned ones don't
-- count, so a work order can be reopened.
CREATE UNIQUE INDEX changes_one_active_per_work_order
  ON changes (work_order_id, repo_id)
  WHERE state NOT IN ('merged', 'closed', 'abandoned');

CREATE TABLE checks (
  id                   text PRIMARY KEY,
  -- null = global, available in every repo.
  repo_id              text REFERENCES repos(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  kind                 text NOT NULL CHECK (kind IN ('noop', 'command', 'schema', 'prompt')),
  -- Opaque to the core; the adapter interprets it.
  runner_ref           text NOT NULL DEFAULT '',
  requires_environment boolean NOT NULL DEFAULT false,
  requires_fixture     boolean NOT NULL DEFAULT false,
  description          text NOT NULL DEFAULT '',
  default_params       jsonb NOT NULL DEFAULT '{}',
  result_schema        jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);
-- Check names are resolved per repo, falling back to global.
CREATE UNIQUE INDEX checks_repo_name_idx ON checks (COALESCE(repo_id, ''), name);

CREATE TABLE runs (
  id               text PRIMARY KEY,
  check_id         text NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  change_id        text REFERENCES changes(id) ON DELETE SET NULL,
  work_order_id    text REFERENCES work_orders(id) ON DELETE SET NULL,
  environment_id   text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  -- The pins. Their presence is what makes a run citable.
  artifact_version text,
  config_commit    text,
  fixture_version  text,
  params_resolved  jsonb NOT NULL DEFAULT '{}',
  params_hash      text,
  result           text NOT NULL CHECK (result IN ('pass', 'fail', 'error')),
  score            double precision,
  baseline_run_id  text REFERENCES runs(id) ON DELETE SET NULL,
  delta            double precision,
  artifacts        jsonb NOT NULL DEFAULT '[]',
  trigger          text NOT NULL DEFAULT 'local' CHECK (trigger IN ('local', 'ci', 'scheduled')),
  triggered_by     text REFERENCES users(id),
  -- Derived on write, never supplied by a caller.
  citable          boolean NOT NULL DEFAULT false,
  failure_summary  text,
  -- `prompt` runs record the model so a result stays interpretable when the
  -- model changes underneath it.
  evaluator_model  text
);
CREATE INDEX runs_change_idx ON runs (change_id, started_at DESC);
CREATE INDEX runs_check_idx ON runs (check_id, started_at DESC);

CREATE TABLE decisions (
  id                    text PRIMARY KEY,
  key                   text NOT NULL UNIQUE,
  title                 text NOT NULL,
  rationale             text NOT NULL DEFAULT '',
  -- The highest-yield material in the system: things already reasoned about
  -- and discarded, for reasons that may since have expired.
  rejected_alternatives jsonb NOT NULL DEFAULT '[]',
  component_ids         text[] NOT NULL DEFAULT '{}',
  state                 text NOT NULL DEFAULT 'proposed'
                          CHECK (state IN ('proposed', 'accepted', 'contested', 'superseded')),
  superseded_by         text REFERENCES decisions(id) ON DELETE SET NULL,
  supersedes            text,
  settling_condition    text,
  positions             jsonb NOT NULL DEFAULT '[]',
  author_id             text NOT NULL REFERENCES users(id),
  decided_at            timestamptz NOT NULL DEFAULT now(),
  work_order_ids        text[] NOT NULL DEFAULT '{}',
  -- Reference into git for the full record; Neon holds the hash, not the text.
  record_ref            text,
  record_content_hash   text,
  search_text           text NOT NULL DEFAULT ''
);
CREATE INDEX decisions_search_trgm_idx ON decisions USING gin (search_text gin_trgm_ops);
CREATE INDEX decisions_components_idx ON decisions USING gin (component_ids);
CREATE INDEX decisions_state_idx ON decisions (state);

CREATE TABLE decision_evidence (
  decision_id  text NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  run_id       text NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  attached_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (decision_id, run_id)
);

-- A run that isn't citable cannot be attached to a decision as evidence. The
-- domain service refuses it with a readable reason; this is the backstop that
-- makes the rule true of the data rather than of one code path.
CREATE FUNCTION assert_evidence_is_citable() RETURNS trigger AS $$
BEGIN
  IF NOT (SELECT citable FROM runs WHERE id = NEW.run_id) THEN
    RAISE EXCEPTION 'run % is not citable and cannot be evidence for a decision', NEW.run_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER decision_evidence_citable
  BEFORE INSERT OR UPDATE ON decision_evidence
  FOR EACH ROW EXECUTE FUNCTION assert_evidence_is_citable();

CREATE TABLE targets (
  id              text PRIMARY KEY,
  name            text NOT NULL UNIQUE,
  -- Adapter key. The core does not know what kinds exist.
  kind            text NOT NULL,
  config          jsonb NOT NULL DEFAULT '{}',
  credentials_ref text
);

CREATE TABLE environments (
  id               text PRIMARY KEY,
  name             text NOT NULL,
  target_id        text NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  topology         text NOT NULL DEFAULT '',
  claimed_by       text REFERENCES users(id),
  claimed_at       timestamptz,
  ttl_seconds      integer NOT NULL DEFAULT 3600,
  expires_at       timestamptz,
  state            text NOT NULL DEFAULT 'provisioning'
                     CHECK (state IN ('provisioning', 'ready', 'in_use', 'reaping', 'destroyed')),
  artifact_version text,
  config_commit    text,
  work_order_id    text REFERENCES work_orders(id) ON DELETE SET NULL
);

CREATE TABLE open_questions (
  id            text PRIMARY KEY,
  component_id  text NOT NULL REFERENCES components(id) ON DELETE CASCADE,
  question      text NOT NULL,
  raised_by     text NOT NULL REFERENCES users(id),
  raised_at     timestamptz NOT NULL DEFAULT now(),
  work_order_id text REFERENCES work_orders(id) ON DELETE SET NULL,
  answered_at   timestamptz
);
CREATE INDEX open_questions_component_idx ON open_questions (component_id) WHERE answered_at IS NULL;

-- Append-only. Every domain mutation writes one of these in the same
-- transaction as the projection it updates, so state produced offline merges
-- rather than conflicts.
CREATE TABLE events (
  id              text PRIMARY KEY,
  kind            text NOT NULL,
  subject_type    text NOT NULL,
  subject_id      text NOT NULL,
  actor_id        text REFERENCES users(id),
  source          text NOT NULL DEFAULT 'api',
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  payload         jsonb NOT NULL DEFAULT '{}',
  -- Replaying the same event twice is a no-op rather than a duplicate.
  idempotency_key text UNIQUE
);
CREATE INDEX events_subject_idx ON events (subject_type, subject_id, occurred_at);

-- Every assembled context pack, logged in full. This is the input to the
-- retrieval evaluation later, and it is unrecoverable if not captured now.
CREATE TABLE context_packs (
  id                text PRIMARY KEY,
  work_order_id     text REFERENCES work_orders(id) ON DELETE SET NULL,
  repo_id           text REFERENCES repos(id) ON DELETE SET NULL,
  requested_by      text REFERENCES users(id),
  purpose           text NOT NULL DEFAULT 'execution'
                      CHECK (purpose IN ('execution', 'generative')),
  assembler_version text NOT NULL DEFAULT '1',
  budget_tokens     integer NOT NULL,
  used_tokens       integer NOT NULL,
  -- The items served, with their relevance scores and stated reasons.
  items             jsonb NOT NULL DEFAULT '[]',
  -- What was dropped and why, so a retrieval miss can be diagnosed.
  omitted           jsonb NOT NULL DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX context_packs_work_order_idx ON context_packs (work_order_id, created_at DESC);

-- Path-scoped rule files generated from decisions. Neon holds the hash for
-- drift detection; the repo holds the text, and a human confirms every write.
CREATE TABLE generated_rules (
  id            text PRIMARY KEY,
  repo_id       text NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
  component_id  text REFERENCES components(id) ON DELETE SET NULL,
  decision_id   text NOT NULL REFERENCES decisions(id) ON DELETE CASCADE,
  path          text NOT NULL,
  path_globs    text[] NOT NULL DEFAULT '{}',
  content_hash  text NOT NULL,
  state         text NOT NULL DEFAULT 'proposed'
                  CHECK (state IN ('proposed', 'applied', 'removal_proposed', 'removed')),
  generated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (repo_id, path, decision_id)
);

-- Encrypted at rest. Nothing writes a token in plain text, including before
-- GitHub exists.
CREATE TABLE secrets (
  id         text PRIMARY KEY,
  scope      text NOT NULL,
  name       text NOT NULL,
  -- base64 of AES-256-GCM output. Text rather than bytea so the encoding is
  -- explicit at every boundary rather than depending on a driver's default.
  ciphertext text NOT NULL,
  iv         text NOT NULL,
  auth_tag   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, name)
);
