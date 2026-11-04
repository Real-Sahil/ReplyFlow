-- The autopilot and reminder migrations that follow schedule jobs with pg_cron and call
-- functions through pg_net. The hosted project already has both, so this changes nothing there.
-- A fresh local database (used by CI to test isolation) needs them enabled first.
create extension if not exists pg_cron;
create extension if not exists pg_net;
