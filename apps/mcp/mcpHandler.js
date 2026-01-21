import crypto from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createLuneServer } from "./mcpServer.js";

const ALLOWED_METHODS = new Set(["GET", "POST", "DELETE", "HEAD"]);
const ALLOWED_PATHS = new Set(["/mcp", "/api/mcp"]);

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");
}

export async function handleMcpRequest(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "HEAD") {
    res.statusCode = 200;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (!ALLOWED_PATHS.has(url.pathname)) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }

  if (!ALLOWED_METHODS.has(req.method)) {
    res.statusCode = 405;
    res.end("Method not allowed");
    return;
  }

  // Force JSON responses for POST to avoid long-lived SSE requests on serverless runtimes.
  if (req.method === "POST") {
    req.headers.accept = "application/json";
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true,
  });

  const server = createLuneServer();
  res.on("close", () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("[mcp] request failed", err);
    if (!res.headersSent) {
      res.statusCode = 500;
    }
    res.end("MCP server error");
  }
}
