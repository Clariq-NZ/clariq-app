-- 0039: documents carries evidence files as well as corpus material.
-- Widens the kind check. Corpus kinds unchanged; evidence kinds added.
-- Evidence documents are not ingested into the RAG corpus (chunk_count 0).
alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents add constraint documents_kind_check check (kind in (
  'LEGISLATION','GUIDANCE','SDS','OPERATIONAL',
  'SHIPPING_DOCUMENT','TECHNICAL_SHEET','PROOF_OF_LISTING','SUPPLIER_CORRESPONDENCE',
  'SIGNED_DECLARATION','STUDY_RESULT','CERTIFICATE','PRE_INTRODUCTION_REPORT','DECLARATION','OTHER_EVIDENCE'));
comment on column public.documents.kind is
  'Corpus kinds (LEGISLATION, GUIDANCE, SDS, OPERATIONAL) are embedded for Ask Clariq. Evidence kinds are held for AICIS record-keeping and never embedded.';
