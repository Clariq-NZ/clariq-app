// ask: the Ask Clariq assistant. Architecture 0.3, section 20.
//
// Retrieval-only. The model phrases what the corpus says; it does not answer
// from memory. Every answer carries citations and the fixed disclaimer, every
// exchange is logged, and out-of-scope questions are refused before any model
// call is made.
//
// Deployed with JWT verification on (default): the caller must be a signed-in
// app user. Secrets: ANTHROPIC_API_KEY (required), ASK_MODEL (optional).
import { createClient } from "npm:@supabase/supabase-js@2";

const embedder = new Supabase.ai.Session("gte-small");
const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const TOP_K = 8;
const MIN_SIMILARITY = 0.72;

export const DISCLAIMER =
  "General information drawn from published sources held by Clariq. Not legal, medical or safety advice. " +
  "Confirm with the Safety Data Sheet, your regulator or a qualified person before acting.";

const EMERGENCY: Record<string, string> = {
  AU: "call 000",
  NZ: "call 111",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Refusal = { code: string; message: (j: string) => string };

// Scope gate (20.4). Rules run before retrieval and before any model call.
const REFUSALS: { code: string; test: RegExp; message: (j: string) => string }[] = [
  {
    code: "MEDICAL",
    test: /\b(swallow(ed)?|ingest(ed)?|drank|inhal(ed|ing|ation)|in (my|his|her|their|the) eyes?|on (my|his|her|their) skin|burn(ed|ing|s)?|rash|dizzy|nausea|vomit|unconscious|breathing|poison(ed|ing)?|overdose|symptom|first aid|antidote|treat(ment)?|hospital|doctor)\b/i,
    message: (j) =>
      `I can't give medical or exposure advice. If someone is hurt or unwell, ${EMERGENCY[j] ?? "call emergency services"} now, ` +
      `and have the product's Safety Data Sheet ready: section 4 (First-aid measures) is written for exactly this.`,
  },
  {
    code: "COMPLIANCE_STATUS",
    test: /\b(are we|am i|is (our|my|the) (site|company|business|workplace)|is clariq)\b.*\b(compliant|compliance|legal|allowed|breaking the law|in breach|meet(ing)? (the )?(requirements|obligations))\b/i,
    message: () =>
      "I can't tell you whether you or your site are compliant; that's a determination for you, your regulator or a qualified adviser. " +
      "I can explain what a specific section of the legislation requires, so ask about the requirement itself.",
  },
  {
    code: "DRAFTING",
    test: /\b(draft|write|prepare|fill (in|out)|complete)\b.*\b(declaration|submission|application|notification|manifest|register|certificate|form)\b/i,
    message: () =>
      "I don't draft regulatory declarations, submissions or forms. I can explain what a section requires and where the obligation sits, " +
      "and the Customer Chemical Inventory Report gives you the container and quantity data for your own records.",
  },
];

const SYSTEM_PROMPT = `You are Ask Clariq, an assistant inside the Clariq container tracking platform used by chemical suppliers and their customers in Australia and New Zealand.

Rules, in priority order:
1. Answer ONLY from the numbered source passages provided. If the passages do not contain the answer, say "The documents I hold don't cover that" and stop. Never use outside knowledge, never guess at thresholds, dates, quantities or penalties.
2. Cite every factual statement with the passage number in square brackets, e.g. [2]. A sentence without a citation must be a plain connective, not a fact.
3. Never state or imply that the user, their site or Clariq is compliant, certified, or meets requirements. Describe what the section requires; the user decides.
4. Use the jurisdiction's own vocabulary. Australia: "hazardous chemicals register", "AICIS", "introduction category", "annual declaration". New Zealand: "hazardous substances inventory", "EPA", "HSNO approval", "WorkSafe", "location compliance certificate".
5. Model law note: the Australian model WHS Act and Regulations have no legal force by themselves; each state and territory enacts its own version. When citing them, say "under the model WHS Regulations (as enacted in your state or territory)".
6. Be brief and plain. Short paragraphs. No headings, no bullet lists unless listing statutory items. No em dashes. Do not repeat the question. Do not add a disclaimer; the interface adds one.
7. If the question is about a specific Clariq container, product or site and context is provided, connect the requirement to that context in one sentence.

Respond with JSON only, no code fence:
{"answer": "<the answer with [n] citations>", "cited": [<passage numbers actually cited>], "covered": <true if the passages answered the question, false if you had to say the documents don't cover it>}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const started = Date.now();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  // Identify the caller from their JWT.
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return json({ error: "Sign in to use Ask Clariq." }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: appUser } = await admin
    .from("app_users")
    .select("id, tenant_id, customer_id, roles(code)")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser) return json({ error: "Your account isn't activated yet." }, 403);
  const roleCode = (Array.isArray(appUser.roles) ? appUser.roles[0]?.code : (appUser.roles as { code?: string } | null)?.code) ?? "";

  const { data: tenant } = await admin.from("tenants").select("settings").eq("id", appUser.tenant_id).maybeSingle();
  const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
  if (roleCode === "CUSTOMER" && settings.ask_customers_enabled === false) {
    return json({ error: "Ask Clariq isn't switched on for customer accounts yet." }, 403);
  }

  let body: { question?: string; jurisdiction?: string; context?: Record<string, unknown>; context_text?: string };
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const question = (body.question ?? "").trim().slice(0, 1000);
  if (question.length < 3) return json({ error: "Ask a question first." }, 400);
  const jurisdiction = (body.jurisdiction ?? settings.jurisdiction ?? "NZ") === "AU" ? "AU" : "NZ";

  // Daily cap per user (20.8).
  const cap = Number(settings.ask_daily_cap ?? 50);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count: used } = await admin
    .from("assistant_exchanges").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).gte("asked_at", since);
  if ((used ?? 0) >= cap) {
    return json({ error: `You've reached today's limit of ${cap} questions. Try again tomorrow.` }, 429);
  }

  const log = async (row: Record<string, unknown>) => {
    const { data } = await admin.from("assistant_exchanges").insert({
      tenant_id: appUser.tenant_id, user_id: user.id, context: body.context ?? null,
      jurisdiction, question, latency_ms: Date.now() - started, ...row,
    }).select("id").single();
    return data?.id as string | undefined;
  };

  // Scope gate.
  const refusal = REFUSALS.find((r) => r.test.test(question));
  if (refusal) {
    const answer = refusal.message(jurisdiction);
    const id = await log({ in_scope: false, refusal_code: refusal.code, answer });
    return json({ exchange_id: id, answer, citations: [], refused: true, disclaimer: DISCLAIMER });
  }

  // Retrieve.
  const qvec = (await embedder.run(question, { mean_pool: true, normalize: true })) as number[];
  const { data: hits, error: rpcErr } = await admin.rpc("match_chunks", {
    query_embedding: JSON.stringify(qvec), p_jurisdiction: jurisdiction,
    p_tenant: appUser.tenant_id, p_as_at: new Date().toISOString().slice(0, 10), p_limit: TOP_K,
  });
  if (rpcErr) return json({ error: "Search failed. Please try again." }, 500);
  type Hit = { chunk_id: string; title: string; section_ref: string; heading: string; context: string | null; text: string; source_url: string; version: string; similarity: number };
  const passages = ((hits ?? []) as Hit[]).filter((h) => h.similarity >= MIN_SIMILARITY);

  if (passages.length === 0) {
    const answer = "The documents I hold don't cover that. Try asking about a specific requirement, section or product, or check the source documents listed in the glossary.";
    const id = await log({ in_scope: true, chunk_ids: [], answer, citations: [] });
    return json({ exchange_id: id, answer, citations: [], refused: false, disclaimer: DISCLAIMER });
  }

  // Build the model input.
  const sources = passages.map((p, i) =>
    `[${i + 1}] ${p.title}, ${p.section_ref}${p.heading ? ` (${p.heading})` : ""}${p.context ? ` in ${p.context}` : ""}\n${p.text}`
  ).join("\n\n");
  const ctx = body.context_text ? `\n\nContext for this question (from the Clariq record the user was viewing):\n${body.context_text.slice(0, 1500)}` : "";
  const userMsg = `Jurisdiction: ${jurisdiction === "AU" ? "Australia" : "New Zealand"}${ctx}\n\nSource passages:\n\n${sources}\n\nQuestion: ${question}`;

  const model = Deno.env.get("ASK_MODEL") ?? DEFAULT_MODEL;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model, max_tokens: 700, temperature: 0.2, system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMsg }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error("anthropic", res.status, detail.slice(0, 300));
    return json({ error: "The assistant is unavailable right now. Please try again shortly." }, 502);
  }
  const out = await res.json();
  const raw = (out.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
  let parsed: { answer: string; cited?: number[]; covered?: boolean };
  try {
    parsed = JSON.parse(raw.replace(/^```(json)?/m, "").replace(/```$/m, "").trim());
  } catch {
    parsed = { answer: raw, cited: [], covered: true };
  }
  const citedNums = new Set<number>((parsed.cited ?? []).filter((n) => n >= 1 && n <= passages.length));
  // Also pick up any [n] the model wrote inline but forgot to list.
  for (const m of parsed.answer.matchAll(/\[(\d+)\]/g)) { const n = Number(m[1]); if (n >= 1 && n <= passages.length) citedNums.add(n); }
  const citations = [...citedNums].sort((a, b) => a - b).map((n) => {
    const p = passages[n - 1];
    return { n, title: p.title, section_ref: p.section_ref, heading: p.heading, source_url: p.source_url, version: p.version };
  });

  const id = await log({
    in_scope: true, chunk_ids: passages.map((p) => p.chunk_id), answer: parsed.answer, citations, model,
    input_tokens: out.usage?.input_tokens ?? null, output_tokens: out.usage?.output_tokens ?? null,
  });
  return json({ exchange_id: id, answer: parsed.answer, citations, refused: false, covered: parsed.covered !== false, disclaimer: DISCLAIMER });
});
