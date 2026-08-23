-- Run once after replacing the dispatch-secret placeholder below.
-- The same random dispatch secret must also be saved in Edge Function Secrets
-- as LEVEL90_DISPATCH_SECRET. Generate one with: openssl rand -hex 32

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'https://xacwgipxqujbqvhzogbd.supabase.co',
  'level90_project_url',
  'Level90 Edge Function base URL'
);

select vault.create_secret(
  'sb_publishable_-_rGsscYv3ipNd7hW23-RQ_bUCB9hTf',
  'level90_publishable_key',
  'Level90 Cron publishable API key'
);

select vault.create_secret(
  'YOUR_RANDOM_LEVEL90_DISPATCH_SECRET',
  'level90_dispatch_secret',
  'Level90 smart-notification Cron authentication'
);

select cron.schedule(
  'level90-smart-notifications',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'level90_project_url'
      ) || '/functions/v1/level90-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'level90_publishable_key'
        ),
        'x-level90-dispatch-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'level90_dispatch_secret'
        )
      ),
      body := '{"action":"dispatch"}'::jsonb
    ) as request_id;
  $$
);
