-- 0021a: load_corpus_file, created by hand on production during corpus ingestion (26 Aug 2026)
-- and never captured in a migration. Reproduced verbatim on 09-09-2026 so both projects match.
-- Already present on production; applied to clariq-demo 09-09-2026. Safe to re-run (create or replace).
CREATE OR REPLACE FUNCTION public.load_corpus_file(p_file text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_doc uuid; v_body text; v_n int;
begin
  select id into v_doc from documents where file = p_file and effective_to is null;
  if v_doc is null then raise exception 'document % not found', p_file; end if;
  select content into v_body from extensions.http_get(
    'https://raw.githubusercontent.com/Clariq-NZ/clariq-app/main/corpus/extracted/' || split_part(p_file,'/',2) || '.jsonl');
  insert into document_chunks (document_id, seq, section_ref, heading, context, text, sha1)
  select v_doc, ord, j->>'section_ref', j->>'heading', nullif(j->>'context',''), j->>'text', j->>'sha1'
  from regexp_split_to_table(v_body, E'\n') with ordinality as t(line, ord), lateral (select line::jsonb j) x
  where length(line) > 2
  on conflict (document_id, seq) do nothing;
  get diagnostics v_n = row_count;
  update documents set chunk_count = (select count(*) from document_chunks where document_id = v_doc) where id = v_doc;
  return v_n;
end $function$;
