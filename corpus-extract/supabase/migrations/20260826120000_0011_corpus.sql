-- 0011 Ask Clariq corpus (Architecture 0.3, section 20)
-- Public legislation chunks are shared (tenant_id null). SDS and operational
-- chunks are tenant-scoped. Embeddings are gte-small, 384 dimensions, computed
-- by the embed_chunks edge function after rows are loaded.

create extension if not exists vector with schema extensions;

create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references public.tenants(id),          -- null = shared public document
  file            text not null,                               -- path in corpus/ or storage
  title           text not null,
  kind            text not null check (kind in ('LEGISLATION','GUIDANCE','SDS','OPERATIONAL')),
  jurisdiction    text check (jurisdiction in ('AU','NZ')),    -- null = universal
  publisher       text,
  source_url      text,
  version         text,
  effective_from  date,
  effective_to    date,                                        -- set when a newer version is ingested
  licence         text,
  notes           text,
  product_id      uuid references public.products(id),         -- SDS only
  ingested_at     timestamptz not null default now(),
  chunk_count     int not null default 0,
  unique (file, version)
);

create table if not exists public.document_chunks (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  tenant_id     uuid references public.tenants(id),
  seq           int not null,
  section_ref   text not null,     -- e.g. 's 99', 'reg 346', 'reg 9.27(2)'
  heading       text,
  context       text,              -- Part / Division breadcrumb
  text          text not null,
  sha1          text not null,
  embedding     extensions.vector(384),
  unique (document_id, seq)
);
create index if not exists document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists document_chunks_document_idx on public.document_chunks (document_id);

create table if not exists public.assistant_exchanges (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id),
  user_id       uuid not null,
  asked_at      timestamptz not null default now(),
  context       jsonb,             -- page, container, product, site the question was asked from
  jurisdiction  text,
  question      text not null,
  in_scope      boolean not null,
  refusal_code  text,              -- MEDICAL, NOT_OUR_PRODUCT, COMPLIANCE_STATUS, DRAFTING, OTHER
  chunk_ids     uuid[],
  answer        text,
  citations     jsonb,
  model         text,
  input_tokens  int,
  output_tokens int,
  latency_ms    int
);
create index if not exists assistant_exchanges_tenant_idx on public.assistant_exchanges (tenant_id, asked_at desc);

create table if not exists public.assistant_feedback (
  id            uuid primary key default gen_random_uuid(),
  exchange_id   uuid not null references public.assistant_exchanges(id) on delete cascade,
  user_id       uuid not null,
  helpful       boolean not null,
  note          text,
  created_at    timestamptz not null default now()
);

-- Similarity search used by the ask edge function. Filters by jurisdiction,
-- documents in force on the given date, and tenant visibility.
create or replace function public.match_chunks(
  query_embedding extensions.vector(384),
  p_jurisdiction  text,
  p_tenant        uuid,
  p_as_at         date default current_date,
  p_limit         int  default 8
) returns table (
  chunk_id uuid, document_id uuid, title text, section_ref text, heading text,
  context text, text text, source_url text, version text, similarity float
) language sql stable security invoker as $$
  select c.id, d.id, d.title, c.section_ref, c.heading, c.context, c.text, d.source_url, d.version,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.embedding is not null
    and (d.jurisdiction is null or d.jurisdiction = p_jurisdiction)
    and (d.effective_from is null or d.effective_from <= p_as_at)
    and (d.effective_to is null or d.effective_to > p_as_at)
    and (c.tenant_id is null or c.tenant_id = p_tenant)
  order by c.embedding <=> query_embedding
  limit p_limit;
$$;

-- RLS: shared documents readable by any signed-in user; tenant rows by tenant members.
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.assistant_exchanges enable row level security;
alter table public.assistant_feedback enable row level security;

create policy documents_read on public.documents for select to authenticated
  using (tenant_id is null or tenant_id = (select tenant_id from public.app_users where id = auth.uid()));
create policy chunks_read on public.document_chunks for select to authenticated
  using (tenant_id is null or tenant_id = (select tenant_id from public.app_users where id = auth.uid()));
create policy exchanges_own on public.assistant_exchanges for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.app_users u join public.roles r on r.id = u.role_id
    where u.id = auth.uid() and u.tenant_id = assistant_exchanges.tenant_id and r.code = 'ADMIN'));
create policy feedback_insert on public.assistant_feedback for insert to authenticated
  with check (user_id = auth.uid());
create policy feedback_own on public.assistant_feedback for select to authenticated
  using (user_id = auth.uid());

-- Writes to documents, chunks and exchanges happen only through edge functions
-- using the service role. Explicit revokes: Supabase hosted Postgres does not
-- reach anon/authenticated via "revoke from public".
revoke insert, update, delete on public.documents, public.document_chunks, public.assistant_exchanges from anon, authenticated;
revoke all on public.documents, public.document_chunks, public.assistant_exchanges, public.assistant_feedback from anon;
