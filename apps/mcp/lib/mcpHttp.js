import { randomUUID } from "crypto";
import INTERVIEWER_SYSTEM_PROMPT from "../../../shared/interviewerPrompt.js";
import { generateReport } from "./reporting.js";

const JSONRPC_VERSION = "2.0";
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

const TOOL_DEFS = [
  {
    name: "get_interviewer_prompt",
    description:
      "Returns the canonical Lune interview system prompt for ChatGPT Enterprise usage interviews.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "generate_report",
    description: "Generates the structured Lune report from an interview transcript.",
    inputSchema: {
      type: "object",
      properties: {
        interview_id: { type: "string" },
        transcripts: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              role: { type: "string" },
              text: { type: "string" },
            },
            required: ["role", "text"],
            additionalProperties: false,
          },
        },
      },
      required: ["transcripts"],
      additionalProperties: false,
    },
  },
];

function jsonResponse(body, { status = 200, sessionId } = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  };

  if (sessionId) {
    headers["Mcp-Session-Id"] = sessionId;
  }

  return new Response(JSON.stringify(body), { status, headers });
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: JSONRPC_VERSION,
    id: id ?? null,
    error: { code, message },
  };
}

function jsonRpcResult(id, result) {
  return {
    jsonrpc: JSONRPC_VERSION,
    id,
    result,
  };
}

function resolveSessionId(req) {
  const headerSession =
    req.headers.get("mcp-session-id") || req.headers.get("Mcp-Session-Id");
  return headerSession || randomUUID();
}

function isNotification(message) {
  return message.id === undefined || message.id === null;
}

function normalizeText(value) {
  return typeof value === "string" ? value : "";
}

async function handleToolCall(params) {
  const name = params?.name;
  const args = params?.arguments || {};

  if (name === "get_interviewer_prompt") {
    const prompt = INTERVIEWER_SYSTEM_PROMPT || "";
    return {
      content: [{ type: "text", text: prompt.trim() }],
      structuredContent: { prompt },
    };
  }

  if (name === "generate_report") {
    const transcripts = Array.isArray(args.transcripts) ? args.transcripts : null;
    if (!transcripts || transcripts.length === 0) {
      throw new Error("generate_report requires transcripts[].");
    }

    const cleaned = transcripts.map((entry) => ({
      role: normalizeText(entry?.role) || "user",
      text: normalizeText(entry?.text),
    }));

    if (cleaned.some((entry) => !entry.text)) {
      throw new Error("Each transcript entry must include text.");
    }

    const report = await generateReport({
      interviewId: normalizeText(args.interview_id) || undefined,
      transcripts: cleaned,
    });

    return {
      content: [{ type: "text", text: "Report generated." }],
      structuredContent: { report },
    };
  }

  throw new Error(`Unknown tool: ${name || "(missing name)"}`);
}

async function handleMessage(message) {
  const id = message.id;
  const method = message.method;

  if (!method || typeof method !== "string") {
    return jsonRpcError(id, -32600, "Invalid Request");
  }

  try {
    switch (method) {
      case "initialize": {
        const requestedVersion = message.params?.protocolVersion;
        const protocolVersion =
          typeof requestedVersion === "string"
            ? requestedVersion
            : DEFAULT_PROTOCOL_VERSION;

        return jsonRpcResult(id, {
          protocolVersion,
          capabilities: {
            tools: { listChanged: false },
            prompts: { listChanged: false },
            resources: { listChanged: false },
          },
          serverInfo: {
            name: "lune-interviewer-mcp",
            version: "1.0.0",
          },
        });
      }
      case "initialized": {
        return null;
      }
      case "tools/list": {
        return jsonRpcResult(id, { tools: TOOL_DEFS });
      }
      case "tools/call": {
        const result = await handleToolCall(message.params || {});
        return jsonRpcResult(id, result);
      }
      case "prompts/list": {
        return jsonRpcResult(id, { prompts: [] });
      }
      case "resources/list": {
        return jsonRpcResult(id, { resources: [] });
      }
      case "ping": {
        return jsonRpcResult(id, {});
      }
      default:
        return jsonRpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (err) {
    const messageText = err?.message || "Server error";
    return jsonRpcError(id, -32000, messageText);
  }
}

export async function handleMcpHttpRequest(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Mcp-Session-Id",
      },
    });
  }

  if (req.method === "GET") {
    return jsonResponse({ status: "ok" }, { sessionId: resolveSessionId(req) });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      jsonRpcError(null, -32600, `Unsupported method: ${req.method}`),
      { status: 405, sessionId: resolveSessionId(req) },
    );
  }

  const sessionId = resolveSessionId(req);
  let payload;

  try {
    payload = await req.json();
  } catch {
    return jsonResponse(jsonRpcError(null, -32700, "Parse error"), {
      status: 400,
      sessionId,
    });
  }

  const messages = Array.isArray(payload) ? payload : [payload];
  const responses = [];

  for (const message of messages) {
    const response = await handleMessage(message || {});
    if (!response || isNotification(message || {})) {
      continue;
    }
    responses.push(response);
  }

  if (responses.length === 0) {
    return new Response(null, {
      status: 204,
      headers: {
        "Mcp-Session-Id": sessionId,
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const body = Array.isArray(payload) ? responses : responses[0];
  return jsonResponse(body, { sessionId });
}
