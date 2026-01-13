import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import "dotenv/config";

const app = express();
app.use(express.text({ limit: "10mb" }));
app.use(express.json({ limit: "10mb" }));
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;
const reportModel = process.env.REPORT_MODEL || "gpt-5.2";
const reportFallbackModel = process.env.REPORT_FALLBACK_MODEL || "gpt-5-mini";
const reportReasoningEffort = process.env.REPORT_REASONING_EFFORT || "medium";

const dataDir = path.join(process.cwd(), "data");
const interviewsDir = path.join(dataDir, "interviews");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(interviewsDir);

// Ignore /.well-known/* requests (e.g., DevTools probes) to avoid Vite attempting to transform them
app.use("/.well-known", (req, res) => {
  res.status(404).end();
});

// Debug helper to confirm API routing
app.use("/api", (req, res, next) => {
  console.log("[api]", req.method, req.url);
  next();
});

const sessionConfig = JSON.stringify({
  session: {
    type: "realtime",
    model: "gpt-realtime",
    audio: {
      output: {
        voice: "alloy",
      },
      input: {
        transcription: {
          model: "gpt-4o-transcribe",
        },
      },
    },
  },
});

function mergeFinal(model, overrides) {
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

async function callOpenAIForReport({
  interviewId,
  transcripts,
  modelName,
  effort,
}) {
  if (!apiKey) {
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
      Authorization: `Bearer ${apiKey}`,
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

async function generateReportWithRetry({ interviewId, transcripts }) {
  const attempt = async (model) =>
    callOpenAIForReport({
      interviewId,
      transcripts,
      modelName: model,
      effort: reportReasoningEffort,
    });

  try {
    return await attempt(reportModel);
  } catch (err) {
    console.warn("Report generation failed on primary model:", err.message);
    return await attempt(reportFallbackModel);
  }
}

function reportPaths(id) {
  const dir = path.join(interviewsDir, id);
  return {
    dir,
    snapshot: path.join(dir, "snapshot.json"),
    model: path.join(dir, "report_model.json"),
    overrides: path.join(dir, "report_overrides.json"),
  };
}

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// All-in-one SDP request (experimental)
app.post("/session", async (req, res) => {
  const fd = new FormData();
  fd.set("sdp", req.body);
  fd.set("session", sessionConfig);

  const r = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      "OpenAI-Beta": "realtime=v1",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: fd,
  });
  const sdp = await r.text();

  // Send back the SDP we received from the OpenAI REST API
  res.send(sdp);
});

// API route for ephemeral token generation
app.get("/token", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          "OpenAI-Beta": "realtime=v1",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: sessionConfig,
      },
    );

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch (parseError) {
      data = { error: { message: raw } };
    }

    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.json(data);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

app.post("/api/interviews/:id/finalize", async (req, res) => {
  try {
    const interviewId = req.params.id;
    const { transcripts } = req.body || {};
    if (!Array.isArray(transcripts) || transcripts.length === 0) {
      return res.status(400).json({ ok: false, error: "Missing transcripts" });
    }

    const paths = reportPaths(interviewId);
    ensureDir(paths.dir);

    const existingModel = loadJSON(paths.model);
    const existingOverrides = loadJSON(paths.overrides) || {};
    const snapshot = loadJSON(paths.snapshot);

    if (existingModel && snapshot) {
      const report_final = mergeFinal(existingModel, existingOverrides);
      return res.json({
        ok: true,
        report_status: "ready",
        report_model: existingModel,
        report_overrides: existingOverrides,
        report_final,
        snapshot,
      });
    }

    const snapshotData = {
      interview_id: interviewId,
      transcripts,
      saved_at: new Date().toISOString(),
    };
    writeJSON(paths.snapshot, snapshotData);

    let reportModelJson;
    try {
      reportModelJson = await generateReportWithRetry({
        interviewId,
        transcripts,
      });
    } catch (err) {
      console.error("Report generation failed:", err);
      return res.status(500).json({
        ok: false,
        report_status: "failed",
        error: err.message,
      });
    }

    writeJSON(paths.model, reportModelJson);
    writeJSON(paths.overrides, {});
    const report_final = mergeFinal(reportModelJson, {});

    res.json({
      ok: true,
      report_status: "ready",
      report_model: reportModelJson,
      report_overrides: {},
      report_final,
      snapshot: snapshotData,
    });
  } catch (err) {
    console.error("Finalize error", err);
    res.status(500).json({ ok: false, error: "Failed to finalize interview" });
  }
});

app.get("/api/interviews/:id/report", (req, res) => {
  const interviewId = req.params.id;
  const paths = reportPaths(interviewId);
  const report_model = loadJSON(paths.model);
  const report_overrides = loadJSON(paths.overrides) || {};
  const snapshot = loadJSON(paths.snapshot);

  if (!snapshot) {
    return res
      .status(404)
      .json({ ok: false, report_status: "pending", error: "Snapshot not found" });
  }

  if (!report_model) {
    return res.json({
      ok: true,
      report_status: "pending",
      snapshot,
    });
  }

  const report_final = mergeFinal(report_model, report_overrides);
  res.json({
    ok: true,
    report_status: "ready",
    report_model,
    report_overrides,
    report_final,
    snapshot,
  });
});

app.patch("/api/interviews/:id/report_overrides", (req, res) => {
  const interviewId = req.params.id;
  const paths = reportPaths(interviewId);
  const existingModel = loadJSON(paths.model);
  if (!existingModel) {
    return res
      .status(404)
      .json({ ok: false, error: "Report not generated for this interview" });
  }
  const snapshot = loadJSON(paths.snapshot) || null;
  const patch = req.body;
  if (!patch || typeof patch !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid overrides payload" });
  }
  const currentOverrides = loadJSON(paths.overrides) || {};

  const newOverrides = mergeFinal(currentOverrides, patch);
  writeJSON(paths.overrides, newOverrides);
  const report_final = mergeFinal(existingModel, newOverrides);

  res.json({
    ok: true,
    report_model: existingModel,
    report_overrides: newOverrides,
    report_final,
    snapshot,
  });
});

// Configure Vite middleware for React client (after API routes)
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});
app.use(vite.middlewares);

// Render the React client
app.use("*", async (req, res, next) => {
  const url = req.originalUrl;

  try {
    const template = await vite.transformIndexHtml(
      url,
      fs.readFileSync("./client/index.html", "utf-8"),
    );
    const { render } = await vite.ssrLoadModule("./client/entry-server.jsx");
    const appHtml = await render(url);
    const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Express server running on *:${port}`);
});
