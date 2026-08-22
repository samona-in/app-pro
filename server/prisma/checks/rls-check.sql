-- Row-level-security regression check.
--
-- RLS failures are silent: a policy that grants too much looks identical to one
-- that is correct until someone exploits it. This script asserts the boundary
-- explicitly. An earlier revision of the migration passed review and still let a
-- Pro set their own `is_verified` and `role`, because Postgres cannot subtract a
-- column privilege from a table-level grant.
--
-- Run against a database with both migrations applied:
--
--   psql "$DIRECT_URL" -f prisma/checks/rls-check.sql
--
-- Every assertion raises on failure, so a non-zero exit means RLS regressed.

BEGIN;

-- Two professionals; we act as the first and try to reach the second.
INSERT INTO auth.users (id, phone) VALUES
  ('dddddddd-0000-0000-0000-00000000000a', '+910000000001'),
  ('dddddddd-0000-0000-0000-00000000000b', '+910000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO pro_profiles (id, user_id, updated_at) VALUES
  ('eeeeeeee-0000-0000-0000-00000000000a', 'dddddddd-0000-0000-0000-00000000000a', NOW()),
  ('eeeeeeee-0000-0000-0000-00000000000b', 'dddddddd-0000-0000-0000-00000000000b', NOW())
ON CONFLICT (id) DO NOTHING;

DO $check$
DECLARE
  affected int;
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-00000000000a', true);

  -- A Pro must see only their own row.
  SELECT count(*) INTO affected FROM pro_profiles;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'RLS: expected 1 visible pro profile, saw %', affected;
  END IF;

  -- A Pro must not modify another Pro's row.
  UPDATE pro_profiles SET bio = 'intrusion'
    WHERE user_id = 'dddddddd-0000-0000-0000-00000000000b';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN
    RAISE EXCEPTION 'RLS: a Pro updated another Pro''s profile';
  END IF;

  -- A Pro must not verify themselves.
  BEGIN
    UPDATE pro_profiles SET is_verified = true
      WHERE user_id = 'dddddddd-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'RLS: a Pro set their own is_verified';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A Pro must not inflate their own reputation.
  BEGIN
    UPDATE pro_profiles SET rating = 5, completed_jobs = 999
      WHERE user_id = 'dddddddd-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'RLS: a Pro set their own rating/completed_jobs';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A Pro must not promote themselves.
  BEGIN
    UPDATE profiles SET role = 'ADMIN' WHERE id = 'dddddddd-0000-0000-0000-00000000000a';
    RAISE EXCEPTION 'RLS: a Pro promoted themselves to ADMIN';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A Pro must still be able to edit their own editable fields.
  UPDATE pro_profiles SET bio = 'legitimate edit'
    WHERE user_id = 'dddddddd-0000-0000-0000-00000000000a';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'RLS: a Pro could not edit their own bio';
  END IF;

  PERFORM set_config('role', 'postgres', true);
  RAISE NOTICE 'RLS check passed: ownership, column privileges and self-edit all correct.';
END
$check$;

ROLLBACK;
