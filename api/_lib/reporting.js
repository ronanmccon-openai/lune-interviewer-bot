import {
  API_KEY,
  REPORT_MODEL,
  REPORT_FALLBACK_MODEL,
  REPORT_REASONING_EFFORT,
} from "./env.js";
import { Redis } from "@upstash/redis";
import { REPORT_PROMPT } from "../../shared/reportingPrompt.js";
import { buildReportSchema } from "../../shared/reportSchema.js";

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
const TTL_MS = TTL_SECONDS * 1000;

// Memory fallback store (best-effort) to handle missing/misconfigured Redis.
const memoryStore = new Map();

function memorySet(key, value) {
  memoryStore.set(key, { value, expires: Date.now() + TTL_MS });
}

function memoryGet(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

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
  const key = `lune:snapshot:${id}`;
  memorySet(key, snapshot);
  await redisSet(key, snapshot);
}

export async function getSnapshot(id) {
  const key = `lune:snapshot:${id}`;
  let data = await redisGet(key);
  if (!data) {
    data = memoryGet(key);
    if (data) {
      console.log("[kv] snapshot (memory fallback)", {
        interviewId: id,
        key,
        found: true,
      });
    }
  }
  console.log("[kv] snapshot", { interviewId: id, key, found: !!data });
  return data;
}

export async function saveReport(id, reportModel, overrides = {}) {
  const key = `lune:report:${id}`;
  const payload = {
    reportModel,
    overrides: overrides || {},
  };
  memorySet(key, payload);
  await redisSet(key, payload);
}

export async function getReport(id) {
  const key = `lune:report:${id}`;
  let data = await redisGet(key);
  if (!data) {
    data = memoryGet(key);
    if (data) {
      console.log("[kv] report (memory fallback)", {
        interviewId: id,
        key,
        found: true,
      });
    }
  }
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
  const schema = buildReportSchema();
  const joinedTranscript = transcripts
    .map((t, idx) => `${idx + 1}. [${t.role}] ${t.text}`)
    .join("\n");
  const prompt = REPORT_PROMPT;

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
