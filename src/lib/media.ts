import { supabase } from './supabase'

/** Photo ingestion - Architecture section 11. Resized on the device to
 * 1600 px longest edge, JPEG 0.8, so a phone photo of 4 MB lands as roughly
 * 300 to 500 KB before it leaves the handset. */
export async function shrinkImage(file: File, maxEdge = 1600, quality = 0.8): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale), h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return new Promise((res, rej) =>
    canvas.toBlob(b => b ? res(b) : rej(new Error('Could not encode photo')), 'image/jpeg', quality))
}

/** Uploads to event-media/{tenant}/{container}/{event}/{time}.jpg and records
 * the event_media row. Media is always linked to an event, never a container. */
export async function attachPhoto(opts: { tenantId: string; containerId: string; eventId: string; file: File; caption?: string }) {
  if (!supabase) throw new Error('No backend')
  const blob = await shrinkImage(opts.file)
  if (blob.size > 5 * 1024 * 1024) throw new Error('Photo is over the 5 MB limit')
  const path = `${opts.tenantId}/${opts.containerId}/${opts.eventId}/${Date.now()}.jpg`
  const up = await supabase.storage.from('event-media').upload(path, blob, { contentType: 'image/jpeg' })
  if (up.error) throw up.error
  const row = await supabase.from('event_media').insert({
    tenant_id: opts.tenantId, event_id: opts.eventId, kind: 'PHOTO',
    storage_path: path, size_bytes: blob.size, caption: opts.caption ?? null,
  })
  if (row.error) throw row.error
  return path
}

export async function photoUrl(path: string) {
  if (!supabase) return ''
  const { data } = await supabase.storage.from('event-media').createSignedUrl(path, 3600)
  return data?.signedUrl ?? ''
}
