// embed_chunks: fills document_chunks.embedding using Supabase's built-in
// gte-small model (384 dimensions). Architecture 0.3, section 20.3.
//
// Each call embeds up to `batch` chunks that have no embedding yet and returns
// how many remain, so the caller loops until remaining is 0. No external
// embedding service and no extra API key: the model runs inside the edge
// runtime, which keeps the platform transferable.
//
// Caller must present the EMBED_TOKEN secret (set with `supabase secrets set`)
// in the x-embed-token header. Deployed with --no-verify-jwt.
import { createClient } from "npm:@supabase/supabase-js@2";

const model = new Supabase.ai.Session("gte-small");
const MAX_CHARS = 2000; // gte-small context is 512 tokens; chunks are cut at 2200 chars

Deno.serve(async (req) => {
  const token = Deno.env.get("EMBED_TOKEN");
  if (!token || req.headers.get("x-embed-token") !== token) {
    return new Response("forbidden", { status: 403 });
  }
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const url = new URL(req.url);
  const batch = Math.min(Number(url.searchParams.get("batch") ?? 40), 100);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const { data: rows, error } = await sb
    .from("document_chunks")
    .select("id, heading, text")
    .is("embedding", null)
    .order("seq")
    .limit(batch);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let done = 0;
  for (const r of rows ?? []) {
    // Heading first so the section title informs the vector.
    const input = `${r.heading ?? ""}\n${r.text}`.slice(0, MAX_CHARS);
    const emb = (await model.run(input, { mean_pool: true, normalize: true })) as number[];
    const { error: upErr } = await sb
      .from("document_chunks")
      .update({ embedding: JSON.stringify(emb) })
      .eq("id", r.id);
    if (upErr) return Response.json({ error: upErr.message, done }, { status: 500 });
    done++;
  }

  const { count } = await sb
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  return Response.json({ embedded: done, remaining: count ?? 0 });
});
