CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS minecraft_account_links (
    account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    minecraft_uuid uuid NOT NULL UNIQUE,
    minecraft_name text NOT NULL CHECK (
        length(minecraft_name) BETWEEN 3 AND 16
        AND minecraft_name ~ '^[A-Za-z0-9_]+$'
    ),
    minecraft_name_normalized text GENERATED ALWAYS AS (lower(minecraft_name)) STORED,
    linked_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (minecraft_name_normalized)
);

CREATE TABLE IF NOT EXISTS presence_updates (
    account_id uuid PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
    state text NOT NULL CHECK (state IN ('online', 'idle', 'playing')),
    pack_id text,
    server_id text,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (state <> 'playing' OR pack_id IS NOT NULL),
    CHECK (server_id IS NULL OR pack_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS friend_requests (
    requester_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    target_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (requester_account_id, target_account_id),
    CHECK (requester_account_id <> target_account_id)
);

CREATE INDEX IF NOT EXISTS friend_requests_target_idx
    ON friend_requests (target_account_id);

CREATE TABLE IF NOT EXISTS friendships (
    left_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    right_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (left_account_id, right_account_id),
    CHECK (left_account_id < right_account_id)
);

CREATE INDEX IF NOT EXISTS friendships_right_account_idx
    ON friendships (right_account_id);

CREATE TABLE IF NOT EXISTS account_blocks (
    blocker_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    blocked_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_account_id, blocked_account_id),
    CHECK (blocker_account_id <> blocked_account_id)
);

CREATE INDEX IF NOT EXISTS account_blocks_blocked_idx
    ON account_blocks (blocked_account_id);

CREATE TABLE IF NOT EXISTS account_mutes (
    muter_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    muted_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (muter_account_id, muted_account_id),
    CHECK (muter_account_id <> muted_account_id)
);

CREATE INDEX IF NOT EXISTS account_mutes_muted_idx
    ON account_mutes (muted_account_id);
