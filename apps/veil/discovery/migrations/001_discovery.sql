-- Isolated read model: never modifies veil_portable or relay tables.
CREATE SCHEMA IF NOT EXISTS veil_discovery;
CREATE TABLE IF NOT EXISTS veil_discovery.profiles (
 controller text PRIMARY KEY, revision bigint NOT NULL, digest text NOT NULL,
 created bigint NOT NULL, visibility text NOT NULL, expires bigint NOT NULL,
 token text, category text, search_text text NOT NULL DEFAULT '',
 state_revision bigint NOT NULL DEFAULT 0, state_digest text, policy_version bigint NOT NULL DEFAULT 0,
 policy_digest text,
 document tsvector GENERATED ALWAYS AS (to_tsvector('simple', search_text)) STORED
);
CREATE INDEX IF NOT EXISTS discovery_terms ON veil_discovery.profiles USING gin(document);
CREATE INDEX IF NOT EXISTS discovery_public ON veil_discovery.profiles(category, expires) WHERE visibility='PUBLIC';
CREATE TABLE IF NOT EXISTS veil_discovery.blocks (controller text PRIMARY KEY, reason text NOT NULL);
CREATE TABLE IF NOT EXISTS veil_discovery.reports (
 controller text NOT NULL, reason text NOT NULL, day bigint NOT NULL, count bigint NOT NULL,
 PRIMARY KEY(controller, reason, day)
);
