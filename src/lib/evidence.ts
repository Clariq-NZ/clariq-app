import { supabase } from './supabase'
import { tenantId } from './audit'

/** AICIS evidence (Architecture 21.6). A document is uploaded once to the
 * private evidence bucket, registered in documents with a kind, and then
 * attach_evidence() marks held every applicable requirement that accepts
 * that kind. The person never picks requirements by hand. */

export const DOCUMENT_KINDS: { code: string; label: string; hint: string }[] = [
  { code: 'SHIPPING_DOCUMENT', label: 'Shipping document', hint: 'Manifest, bill of lading, customs entry' },
  { code: 'SDS', label: 'Safety data sheet', hint: 'The SDS for the product' },
  { code: 'TECHNICAL_SHEET', label: 'Technical or product information sheet', hint: 'From the supplier' },
  { code: 'PROOF_OF_LISTING', label: 'Proof the chemical is on the Inventory', hint: 'Inventory search result or supplier statement' },
  { code: 'SUPPLIER_CORRESPONDENCE', label: 'Email or letter from the supplier', hint: 'Identity, particle size, who holds what' },
  { code: 'SIGNED_DECLARATION', label: 'Signed and dated declaration', hint: 'R&D only, step 1 checks, not medium to high risk' },
  { code: 'STUDY_RESULT', label: 'Study result', hint: 'Particle size, GPC, other test report' },
  { code: 'CERTIFICATE', label: 'AICIS assessment certificate', hint: '' },
  { code: 'PRE_INTRODUCTION_REPORT', label: 'Pre-introduction report', hint: 'As lodged with AICIS' },
  { code: 'DECLARATION', label: 'AICIS declaration receipt', hint: 'Annual or post-introduction' },
  { code: 'OTHER_EVIDENCE', label: 'Something else', hint: '' },
]

export async function uploadEvidence(file: File, kind: string, title?: string): Promise<{ id: string } | { error: string }> {
  if (!supabase) return { error: 'Not connected' }
  const t = await tenantId()
  const id = crypto.randomUUID()
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase()
  const path = `${t}/${id}.${ext}`
  const up = await supabase.storage.from('evidence').upload(path, file, { contentType: file.type || undefined })
  if (up.error) return { error: up.error.message }
  const { error } = await supabase.from('documents').insert({ id, tenant_id: t, file: path, title: title || file.name, kind })
  if (error) return { error: error.message }
  return { id }
}

/** Marks held every applicable requirement the document's kind satisfies. Returns how many. */
export async function attachEvidence(documentId: string, introductionId: string): Promise<number> {
  if (!supabase) return 0
  const { data, error } = await supabase.rpc('attach_evidence', { p_document: documentId, p_introduction: introductionId })
  if (error) throw error
  return (data as number) ?? 0
}

export async function signedUrl(path: string) {
  if (!supabase) return null
  const { data } = await supabase.storage.from('evidence').createSignedUrl(path, 900)
  return data?.signedUrl ?? null
}
