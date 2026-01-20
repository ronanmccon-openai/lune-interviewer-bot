import { REPORT_PROMPT } from "../../../shared/reportingPrompt.js";
import { buildReportSchema } from "../../../shared/reportSchema.js";

const API_KEY = process.env.OPENAI_API_KEY;
const REPORT_MODEL = process.env.REPORT_MODEL || "gpt-5.2";
const REPORT_FALLBACK_MODEL = process.env.REPORT_FALLBACK_MODEL || "gpt-5-mini";
const REPORT_REASONING_EFFORT = process.env.REPORT_REASONING_EFFORT || "medium";

export async function generateReport({ interviewId, transcripts }) {
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
    console.warn("Report generation failed on primary model:", err?.message || err);
    return await attempt(REPORT_FALLBACK_MODEL);
  }
}

async function callOpenAIForReport({ interviewId, transcripts, modelName, effort }) {
  if (!API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const schema = buildReportSchema();
  const joinedTranscript = (transcripts || [])
    .map((t, idx) => `${idx + 1}. [${t.role}] ${t.text}`)
    .join("\n");

  const body = {
    model: modelName,
    input: [
      { role: "system", content: REPORT_PROMPT },
      {
        role: "user",
        content: `Interview ID: ${interviewId || "unknown"}\nTranscript turns:\n${joinedTranscript}`,
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
