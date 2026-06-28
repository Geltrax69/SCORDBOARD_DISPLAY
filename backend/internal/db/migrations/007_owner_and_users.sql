-- Allow the new "owner" role, then seed the owner + admin accounts.
-- Login is by username (stored in the email column).
--   scorecast.hsta / hsta2113@      → super_admin (runs matches/display)
--   simpedu        / scorecast.lalit → owner (manages users + everything)
-- Passwords are bcrypt hashes (change them from the Users page after first login).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'super_admin', 'scorer', 'display'));

INSERT INTO users (email, password_hash, name, role) VALUES
  ('scorecast.hsta', '$2a$10$DIScpM61NBb7Tcm36OyRZeqmm8UG.AgwCj9U5s8aKTygxM2U0fuHu', 'ScoreCast Admin', 'super_admin'),
  ('simpedu',        '$2a$10$K/3ysJbry23aQUlnpDId0OtGxX3XiYadgwhKqZNQTlC6./WOMbvIS', 'Owner',           'owner')
ON CONFLICT (email) DO NOTHING;
