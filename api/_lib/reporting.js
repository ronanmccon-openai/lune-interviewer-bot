import {
  API_KEY,
  REPORT_MODEL,
  REPORT_FALLBACK_MODEL,
  REPORT_REASONING_EFFORT,
} from "./env.js";
import { Redis } from "@upstash/redis";

const redisUrl = process.env.KV_REST_API_URL;
const redisToken = process.env.KV_REST_API_TOKEN;

const redis =
  redisUrl && redisToken
    ? new Redis({
      url: redisUrl,
      token: redisToken,
    })
    : null;

const TTL_SECONDS = 60 * 60 * 2; // 2 hours

async function redisSet(key, value) {
  if (!redis) return;
  try {
    console.log("[kv] set", { key });
    await redis.set(key, JSON.stringify(value), { ex: TTL_SECONDS });
  } catch (err) {
    console.warn("[kv] set failed", key, err?.message);
  }
}

async function redisGet(key) {
  if (!redis) return null;
  try {
    console.log("[kv] get", { key });
    const val = await redis.get(key);
    if (val === null || val === undefined) return null;
    if (typeof val === "string") return JSON.parse(val);
    return val;
  } catch (err) {
    console.warn("[kv] get failed", key, err?.message);
    return null;
  }
}

export async function saveSnapshot(id, snapshot) {
  await redisSet(`lune:snapshot:${id}`, snapshot);
}

export async function getSnapshot(id) {
  const key = `lune:snapshot:${id}`;
  const data = await redisGet(key);
  console.log("[kv] snapshot", { interviewId: id, key, found: !!data });
  return data;
}

export async function saveReport(id, reportModel, overrides = {}) {
  await redisSet(`lune:report:${id}`, {
    reportModel,
    overrides: overrides || {},
  });
}

export async function getReport(id) {
  const key = `lune:report:${id}`;
  const data = await redisGet(key);
  console.log("[kv] report", {
    interviewId: id,
    key,
    found: !!data,
  });
  return data;
}

export function mergeFinal(model, overrides) {
  if (!overrides || typeof overrides !== "object") return model;
  if (!model || typeof model !== "object") return model;
  const output = Array.isArray(model) ? [...model] : { ...model };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      output[key] = value;
    } else {
      output[key] = mergeFinal(model[key] || {}, value);
    }
  }
  return output;
}

export async function generateReportWithRetry({ interviewId, transcripts }) {
  const attempt = async (model) =>
    callOpenAIForReport({
      interviewId,
      transcripts,
      modelName: model,
      effort: REPORT_REASONING_EFFORT,
    });

  try {
    return await attempt(REPORT_MODEL);
  } catch (err) {
    console.warn("Report generation failed on primary model:", err.message);
    return await attempt(REPORT_FALLBACK_MODEL);
  }
}

async function callOpenAIForReport({
  interviewId,
  transcripts,
  modelName,
  effort,
}) {
  if (!API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const schema = buildSchema();
  const joinedTranscript = transcripts
    .map((t, idx) => `${idx + 1}. [${t.role}] ${t.text}`)
    .join("\n");
  const prompt = `You are generating a structured research report about ChatGPT Enterprise usage from an interview transcript. 

NON-NEGOTIABLE RULES
- Do not invent facts.
- If a field is missing or not clearly supported by the transcript, set it to null (or ["Unknown"] for tools_used, per rules below).
- Keep language concrete and specific; avoid generic claims.
- Prefer verbatim evidence over inference. If you infer, label it clearly as interpretation and keep it conservative.
- Output must match the exact existing report structure required by the downstream system. Do not add, remove, rename, or reorder top-level fields.

GOAL
Produce a report that reads like an internal researcher's synthesis: it should reflect the actual workflow, constraints, and impact described, grounded in evidence and phrased to fit each report "box" cleanly.

BOX-BY-BOX EXPECTATIONS (LINE UP WITH THE REPORT UI)
1) Executive Summary (3-6 bullets)
- Decision-useful bullets only.
- Each bullet should map to one of:
  (a) primary use case + workflow outcome,
  (b) measurable/claimed impact (only if stated),
  (c) key constraint/trust boundary,
  (d) enablement/integration ask,
  (e) overall rating signal (if provided).
- No fluff. If impact is described without numbers, still be concrete (e.g., "same-day follow-ups" vs "more efficient").

2) Overall Sentiment
- Use a single concise label aligned to the UI (e.g., positive / mixed / negative).
- Base this on explicit sentiment cues plus the balance of wins vs blockers.

3) Tools used
- Identify tools_used only from: ["ChatGPT (chat)", "Canvas", "Deep Research", "Custom GPTs", "API", "Voice", "Connectors"].
- Include only tools explicitly mentioned or unambiguously implied.
- If unclear, use ["Unknown"].

4) Ratings (numeric 1-5 fields)
Populate these only if the transcript clearly provides a rating or a direct numeric proxy.
Otherwise set each rating field to null.
- How often used in a typical week (1-5)
- How well it fit into the workflow (1-5)
- Barrier-handling while using it (1-5)
- Overall impact (1-5)
- Enablement/support (1-5)
Also include:
- Ratings notes: capture any stated rationale for ratings, trade-offs, or context (brief).

5) Notes
- Capture high-signal factual details that don't fit elsewhere (e.g., time saved, frequency, volumes, artifacts).
- If numbers are stated (minutes/hours per week), include them here verbatim.

6) Use case (Title + Goal)
- Title: one crisp line describing the job-to-be-done in plain language.
- Goal: the intended outcome (who it serves, what "good" looks like), not the method.

7) Workflow steps
- 3-6 steps, written as concrete actions (verbs), reflecting actual described sequence.
- Include any explicit "sanitization / checks / approvals / handoffs" steps if stated.

8) ChatGPT Enterprise role
- One concise description of where ChatGPT fits (drafting, summarizing, ideation, analysis, rewriting, formatting, etc.).
- Be explicit about human-in-the-loop and editing if described.

9) Outcomes
- Outcome (positive): 2-5 bullets of concrete outcomes (speed, clarity, same-day turnaround, better structure), only if supported.
- Outcome (negative): 1-4 bullets of constraints/costs (manual edits, limitations, avoided tasks), only if supported.

10) Themes
Provide short, box-friendly bullets split into:
- wins: patterns that explain what drives value and adoption.
- blockers: patterns that explain friction, risk, and non-use.
Each bullet should be a "pattern statement" (not a one-off) and must be supportable by at least one quote in the evidence/key quotes sets.

11) Feature requests
- 1-4 bullets capturing explicit asks (templates, integrations, safer context access, etc.).
- Only include what was requested or strongly implied.

12) Enablement needs
- 1-4 bullets describing training/guardrails/templates/examples/office hours requested or clearly needed (if stated).
- Keep actionable and specific.

13) Risks or caveats
- 1-4 bullets describing trust boundaries, policy constraints, dependency on sanitization, and "impact depends on..." conditions.
- Prefer "what could go wrong" and "what they avoid" based on transcript.

EVIDENCE REQUIREMENTS
- Provide 3-7 short evidence quotes with timestamps OR turn indices.
- Provide 5-8 key quotes that best support the executive summary, themes, outcomes, and risks.
- Quotes should be short, non-redundant, and high-signal.
- Format key quotes as:
  <timestamp/turn> — "<quote>" — <topic label>
- Topic labels should align to report sections (e.g., Use case, Tools, Impact, Safety, Adoption, Enablement need, Blocker).

QUALITY BAR (DEPTH WITHOUT INVENTION)
- Capture workflow reality: trigger -> steps -> artifact(s) produced -> edits/checks -> output sent -> downstream effect.
- Call out trust boundaries: what they won't put into prompts, what they verify, what stays manual.
- Surface nuance: trade-offs, contradictions, conditions ("only when...", "depends on...").
- If something is not in the transcript, leave it null rather than guessing.

OUTPUT
Return the report in the exact existing structure expected by the application. Do not add new top-level fields.`;

  const body = {
    model: modelName,
    input: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `Interview ID: ${interviewId}\nTranscript turns:\n${joinedTranscript}`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: schema.name || "interview_report",
        strict: true,
        schema: schema.schema || schema,
      },
    },
    reasoning: { effort },
    max_output_tokens: 2000,
    stream: false,
  };

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      "OpenAI-Beta": "responses=v1",
    },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(
      `OpenAI error: ${resp.status} ${resp.statusText} ${JSON.stringify(data)}`,
    );
  }

  if (process.env.DEV_LOG_RESPONSES === "1") {
    const contentTypes = Array.isArray(data.output)
      ? data.output.flatMap((o) =>
        Array.isArray(o?.content) ? o.content.map((c) => c?.type) : [],
      )
      : [];
    console.log("[report debug]", {
      status: data?.status,
      error: data?.error,
      incomplete: data?.incomplete_details,
      content_types: contentTypes,
    });
  }

  if (Array.isArray(data.output)) {
    for (const output of data.output) {
      if (!Array.isArray(output?.content)) continue;
      for (const part of output.content) {
        if (part?.type === "refusal") {
          throw new Error(`OpenAI refusal: ${part?.text || JSON.stringify(part)}`);
        }
        if (part?.type === "output_text" && typeof part.text === "string") {
          return JSON.parse(part.text);
        }
        if (typeof part?.text === "string") {
          try {
            return JSON.parse(part.text);
          } catch {
            // fall through
          }
        }
      }
    }
  }

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return JSON.parse(data.output_text);
  }

  throw new Error("No text content in OpenAI response");
}

function buildSchema() {
  return {
    name: "interview_report",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "meta",
        "exec_summary",
        "use_case",
        "ratings",
        "themes",
        "evidence",
        "quality",
        "tools_used",
        "key_quotes",
      ],
      properties: {
        meta: {
          type: "object",
          additionalProperties: false,
          required: ["interview_id", "generated_at_iso", "model", "reasoning_effort"],
          properties: {
            interview_id: { type: "string" },
            generated_at_iso: { type: "string" },
            model: { type: "string" },
            reasoning_effort: { type: "string", enum: ["medium", "high", "unknown"] },
          },
        },
        exec_summary: {
          type: "object",
          additionalProperties: false,
          required: ["bullets", "overall_sentiment"],
          properties: {
            bullets: { type: "array", items: { type: "string" } },
            overall_sentiment: {
              type: "string",
              enum: ["positive", "mixed", "negative", "unknown"],
            },
          },
        },
        use_case: {
          type: "object",
          additionalProperties: false,
          required: [
            "title",
            "goal",
            "workflow_steps",
            "chatgpt_enterprise_role",
            "outcome_positive",
            "outcome_negative",
          ],
          properties: {
            title: { type: "string" },
            goal: { type: ["string", "null"] },
            workflow_steps: { type: "array", items: { type: "string" } },
            chatgpt_enterprise_role: { type: ["string", "null"] },
            outcome_positive: { type: "array", items: { type: "string" } },
            outcome_negative: { type: "array", items: { type: "string" } },
          },
        },
        ratings: {
          type: "object",
          additionalProperties: false,
          required: ["dimensions", "notes"],
          properties: {
            dimensions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["key", "label", "value"],
                properties: {
                  key: { type: "string" },
                  label: { type: "string" },
                  value: { type: ["number", "null"] },
                },
              },
            },
            notes: { type: ["string", "null"] },
          },
        },
        tools_used: {
          type: "array",
          items: { type: "string" },
        },
        themes: {
          type: "object",
          additionalProperties: false,
          required: [
            "wins",
            "blockers",
            "feature_requests",
            "enablement_needs",
            "risks_or_caveats",
          ],
          properties: {
            wins: { type: "array", items: { type: "string" } },
            blockers: { type: "array", items: { type: "string" } },
            feature_requests: { type: "array", items: { type: "string" } },
            enablement_needs: { type: "array", items: { type: "string" } },
            risks_or_caveats: { type: "array", items: { type: "string" } },
          },
        },
        key_quotes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["when", "quote", "topic"],
            properties: {
              when: { type: "string" },
              quote: { type: "string" },
              topic: { type: "string" },
            },
          },
        },
        evidence: {
          type: "object",
          additionalProperties: false,
          required: ["quotes"],
          properties: {
            quotes: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["when", "quote", "topic"],
                properties: {
                  when: { type: "string" },
                  quote: { type: "string" },
                  topic: { type: "string" },
                },
              },
            },
          },
        },
        quality: {
          type: "object",
          additionalProperties: false,
          required: ["transcript_quality", "ambiguity_notes"],
          properties: {
            transcript_quality: {
              type: "string",
              enum: ["good", "mixed", "poor", "unknown"],
            },
            ambiguity_notes: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}
