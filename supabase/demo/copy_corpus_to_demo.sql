-- Copy the Ask Clariq corpus from production to clariq-demo.
-- RUN THIS IN THE clariq-demo PROJECT'S SQL EDITOR (project yuwpakqhcwjheibfaeof), not production.
-- Replace the two placeholders below before running. Nothing on production is changed;
-- dblink only reads from it.
--
-- POOLER_HOST : from the production project, click "Connect" (top bar), choose
--               "Session pooler", and copy the host, e.g. aws-0-ap-southeast-2.pooler.supabase.com
-- DB_PASSWORD : the production database password (Project Settings > Database).
--               If you do not know it, click "Reset database password" there and use the new one.

do $$
declare
  conn text := 'host=POOLER_HOST port=5432 dbname=postgres user=postgres.oksxzvomjjsjhjqifqhk password=DB_PASSWORD sslmode=require';
  n_docs int; n_chunks int;
begin
  perform extensions.dblink_connect('prod', conn);

  -- Documents first (chunks reference them). Same ids as production.
  insert into public.documents (id, tenant_id, file, title, kind, jurisdiction, publisher, source_url, version,
                                effective_from, effective_to, licence, notes, product_id, ingested_at, chunk_count)
  select * from extensions.dblink('prod', $q$
    select id, tenant_id, file, title, kind, jurisdiction, publisher, source_url, version,
           effective_from, effective_to, licence, notes, product_id, ingested_at, chunk_count
    from public.documents
  $q$) as t(id uuid, tenant_id uuid, file text, title text, kind text, jurisdiction text, publisher text,
            source_url text, version text, effective_from date, effective_to date, licence text, notes text,
            product_id uuid, ingested_at timestamptz, chunk_count int)
  on conflict (id) do nothing;

  -- Chunks with their embeddings. The vector travels as text and is cast back on insert.
  insert into public.document_chunks (id, document_id, tenant_id, seq, section_ref, heading, context, text, sha1, embedding)
  select id, document_id, tenant_id, seq, section_ref, heading, context, text, sha1, embedding::extensions.vector(384)
  from extensions.dblink('prod', $q$
    select id, document_id, tenant_id, seq, section_ref, heading, context, text, sha1, embedding::text
    from public.document_chunks
  $q$) as t(id uuid, document_id uuid, tenant_id uuid, seq int, section_ref text, heading text,
            context text, text text, sha1 text, embedding text)
  on conflict (id) do nothing;

  perform extensions.dblink_disconnect('prod');

  select count(*) into n_docs from public.documents;
  select count(*) into n_chunks from public.document_chunks where embedding is not null;
  raise notice 'documents: %, embedded chunks: % (expected 5 and 3257)', n_docs, n_chunks;
  if n_docs <> 5 or n_chunks <> 3257 then
    raise exception 'corpus copy incomplete: % documents, % embedded chunks', n_docs, n_chunks;
  end if;
end $$;
