-- EF001: ampliacion aditiva del I001. No altera ni elimina datos del esquema original.
-- Un hecho es una afirmacion de una fuente, no una verdad demostrada ni un estado mundial completo.
CREATE TABLE IF NOT EXISTS laplace_fin_entity_versions (
  revision_sha text PRIMARY KEY CHECK (length(revision_sha)=64),
  entity_id text NOT NULL, entity_kind text NOT NULL, display_name text NOT NULL,
  jurisdiction text, identifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb, source_id text NOT NULL,
  source_url text NOT NULL, observed_at timestamptz NOT NULL,
  known_at timestamptz NOT NULL, classification text NOT NULL DEFAULT 'asserted'
    CHECK (classification IN ('asserted','verified','uncertain')),
  CHECK (known_at>=observed_at)
);
CREATE INDEX IF NOT EXISTS laplace_fin_entities_asof
  ON laplace_fin_entity_versions(entity_id,known_at DESC);

CREATE TABLE IF NOT EXISTS laplace_fin_observations (
  assertion_sha text PRIMARY KEY CHECK (length(assertion_sha)=64),
  family text NOT NULL, domain text NOT NULL, subject_id text NOT NULL,
  variable text NOT NULL, instrument_id text, market_id text,
  counterparty_id text, jurisdiction text, currency text, population_id text,
  observed_at timestamptz NOT NULL, known_at timestamptz NOT NULL,
  published_at timestamptz, valid_from timestamptz, valid_to timestamptz,
  value_text text, value_kind text NOT NULL CHECK
    (value_kind IN ('exact_decimal','float64_approx','none')),
  value_status text NOT NULL CHECK
    (value_status IN ('observed','estimated','missing','suppressed','unavailable','unknown')),
  missing_reason text, unit text NOT NULL, source_id text NOT NULL,
  source_url text NOT NULL, source_record_id text NOT NULL,
  source_revision text NOT NULL, raw_sha256 text,
  parent_event_key text, capture_sha256 text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (known_at>=observed_at),
  CHECK (published_at IS NULL OR published_at<=known_at),
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to>valid_from),
  CHECK ((value_status IN ('observed','estimated') AND value_text IS NOT NULL
          AND value_kind<>'none' AND missing_reason IS NULL)
      OR (value_status NOT IN ('observed','estimated') AND value_text IS NULL
          AND value_kind='none' AND missing_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS laplace_fin_obs_asof ON laplace_fin_observations
  (family,subject_id,variable,source_id,observed_at DESC,known_at DESC);
CREATE INDEX IF NOT EXISTS laplace_fin_obs_known ON laplace_fin_observations
  (known_at,observed_at);
CREATE INDEX IF NOT EXISTS laplace_fin_obs_parent ON laplace_fin_observations(parent_event_key);

CREATE TABLE IF NOT EXISTS laplace_fin_relations (
  relation_sha text PRIMARY KEY CHECK (length(relation_sha)=64),
  from_id text NOT NULL, to_id text NOT NULL, relation_kind text NOT NULL,
  evidence_type text NOT NULL CHECK
    (evidence_type IN ('source_assertion','hypothesis','precedence','model_inference')),
  amount_text text, unit text, population_id text, observed_at timestamptz NOT NULL,
  known_at timestamptz NOT NULL, source_id text NOT NULL, source_url text NOT NULL,
  source_record_id text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (known_at>=observed_at), CHECK (from_id<>to_id),
  CHECK ((amount_text IS NULL AND unit IS NULL) OR (amount_text IS NOT NULL AND unit IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS laplace_fin_relations_asof
  ON laplace_fin_relations(from_id,relation_kind,known_at DESC);

CREATE TABLE IF NOT EXISTS laplace_fin_captures (
  capture_sha text PRIMARY KEY CHECK (length(capture_sha)=64),
  snapshot_sha text NOT NULL, capture_kind text NOT NULL,
  captured_at timestamptz NOT NULL, cutoff_at timestamptz NOT NULL,
  state_count integer NOT NULL CHECK (state_count>=0 AND state_count<=4096),
  manifest jsonb NOT NULL, provenance jsonb NOT NULL,
  CHECK (captured_at>=cutoff_at)
);
CREATE INDEX IF NOT EXISTS laplace_fin_capture_time
  ON laplace_fin_captures(captured_at DESC);

CREATE TABLE IF NOT EXISTS laplace_fin_coverage (
  coverage_sha text PRIMARY KEY CHECK (length(coverage_sha)=64),
  capture_sha text REFERENCES laplace_fin_captures(capture_sha),
  family text NOT NULL, source_id text NOT NULL,
  availability text NOT NULL CHECK
    (availability IN ('observed','partial','unavailable','restricted','requires_credentials','requires_license','not_connected','unknown')),
  observed_count integer NOT NULL CHECK (observed_count>=0),
  known_at timestamptz NOT NULL, reason text, scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  license_ref text, CHECK (availability<>'observed' OR observed_count>0)
);
CREATE INDEX IF NOT EXISTS laplace_fin_coverage_asof
  ON laplace_fin_coverage(family,known_at DESC);

CREATE TABLE IF NOT EXISTS laplace_fin_rules (
  rule_sha text PRIMARY KEY CHECK (length(rule_sha)=64),
  rule_kind text NOT NULL CHECK (rule_kind IN ('deterministic','probabilistic','structural','learned')),
  execution_engine text NOT NULL CHECK (execution_engine IN ('xi_ether','classical','analytical','external')),
  code_sha256 text NOT NULL CHECK (length(code_sha256)=64),
  discovered_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL,
  law jsonb NOT NULL, assumptions jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification text NOT NULL DEFAULT 'unverified'
    CHECK (verification IN ('unverified','synthetic_only','backtested','prospective')),
  CHECK (recorded_at>=discovered_at)
);

CREATE TABLE IF NOT EXISTS laplace_fin_scenarios (
  scenario_id text PRIMARY KEY, parent_id text REFERENCES laplace_fin_scenarios(scenario_id),
  scenario_kind text NOT NULL CHECK (scenario_kind IN ('counterfactual','stress','simulation','observational')),
  base_cutoff timestamptz NOT NULL, created_at timestamptz NOT NULL,
  assumptions jsonb NOT NULL, initial_state_sha text,
  CHECK (created_at>=base_cutoff)
);

CREATE TABLE IF NOT EXISTS laplace_fin_sparse_deltas (
  delta_sha text PRIMARY KEY CHECK (length(delta_sha)=64),
  state_key text NOT NULL, logical_address text,
  rule_sha text REFERENCES laplace_fin_rules(rule_sha),
  scenario_id text REFERENCES laplace_fin_scenarios(scenario_id),
  operation text NOT NULL CHECK (operation IN ('set','unset','unknown')),
  state_value text, state_unit text, state_kind text NOT NULL
    CHECK (state_kind IN ('exact','approximate','symbolic','unknown')),
  observed_at timestamptz NOT NULL, known_at timestamptz NOT NULL,
  origin text NOT NULL CHECK (origin IN ('observation','derived','assumption')),
  evidence_sha text NOT NULL CHECK (length(evidence_sha)=64),
  CHECK (known_at>=observed_at),
  CHECK (logical_address IS NULL OR (length(logical_address) BETWEEN 1 AND 300
        AND logical_address ~ '^(0|[1-9][0-9]*)$')),
  CHECK ((operation='set' AND state_value IS NOT NULL AND state_kind<>'unknown')
      OR (operation<>'set' AND state_value IS NULL))
);
CREATE INDEX IF NOT EXISTS laplace_fin_sparse_asof
  ON laplace_fin_sparse_deltas(state_key,scenario_id,known_at DESC);

CREATE TABLE IF NOT EXISTS laplace_fin_interventions (
  intervention_sha text PRIMARY KEY CHECK (length(intervention_sha)=64),
  scenario_id text NOT NULL REFERENCES laplace_fin_scenarios(scenario_id),
  state_key text NOT NULL, action text NOT NULL,
  value_text text, unit text, effective_at timestamptz NOT NULL,
  declared_at timestamptz NOT NULL, assumptions jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS laplace_fin_forecasts (
  forecast_sha text PRIMARY KEY CHECK (length(forecast_sha)=64),
  rule_sha text NOT NULL REFERENCES laplace_fin_rules(rule_sha),
  scenario_id text REFERENCES laplace_fin_scenarios(scenario_id),
  target_subject text NOT NULL, target_variable text NOT NULL,
  unit text NOT NULL, decision_at timestamptz NOT NULL,
  sealed_at timestamptz NOT NULL, target_at timestamptz NOT NULL,
  input_cutoff timestamptz NOT NULL, input_snapshot_sha text NOT NULL,
  estimate_text text, distribution jsonb,
  prediction_kind text NOT NULL CHECK
    (prediction_kind IN ('deterministic','probabilistic','baseline','abstention')),
  status text NOT NULL CHECK (status IN ('candidate','abstained')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (input_cutoff<=decision_at AND sealed_at<=decision_at AND target_at>decision_at),
  CHECK ((status='abstained' AND estimate_text IS NULL AND distribution IS NULL)
      OR (status='candidate' AND (estimate_text IS NOT NULL OR distribution IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS laplace_fin_forecasts_maturity
  ON laplace_fin_forecasts(target_at,decision_at);

CREATE TABLE IF NOT EXISTS laplace_fin_evaluations (
  evaluation_sha text PRIMARY KEY CHECK (length(evaluation_sha)=64),
  forecast_sha text NOT NULL REFERENCES laplace_fin_forecasts(forecast_sha),
  actual_assertion_sha text NOT NULL REFERENCES laplace_fin_observations(assertion_sha),
  baseline_forecast_sha text REFERENCES laplace_fin_forecasts(forecast_sha),
  evaluated_at timestamptz NOT NULL,
  scores jsonb NOT NULL, evidence jsonb NOT NULL,
  model_selected_using_evaluation boolean NOT NULL DEFAULT false
    CHECK (model_selected_using_evaluation=false)
);

-- Las identidades y relaciones P001 originales siguen siendo una parte del mundo EF001.
-- Se exponen como vistas sin copiar ni reescribir sus versiones ya archivadas.
CREATE OR REPLACE VIEW laplace_fin_entity_index AS
  SELECT v.entity_id, v.entity->>'name' AS display_name,
    v.entity->>'jurisdiction' AS jurisdiction,
    i.source_known_at AS known_at, 'P001'::text AS family,
    v.registry_sha256 AS source_revision
  FROM input_entity_versions v JOIN input_registry_imports i
    ON i.registry_sha256=v.registry_sha256
  UNION ALL
  SELECT e.entity_id,e.display_name,e.jurisdiction,e.known_at,
    'EF001'::text AS family,e.revision_sha AS source_revision
  FROM laplace_fin_entity_versions e;
CREATE OR REPLACE VIEW laplace_fin_relation_index AS
  SELECT a.assertion_id AS relation_id,
    a.assertion->>'from' AS from_id,a.assertion->>'to' AS to_id,
    COALESCE(a.assertion->>'relation',a.assertion->>'kind','assertion') AS relation_kind,
    a.known_at,'P001'::text AS family
  FROM input_institution_assertions a
  UNION ALL
  SELECT r.relation_sha,r.from_id,r.to_id,r.relation_kind,r.known_at,
    'EF001'::text AS family FROM laplace_fin_relations r;
