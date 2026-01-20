import http from "node:http";
import "dotenv/config";
import { handleMcpRequest } from "./mcpHandler.js";

const PORT = Number(process.env.PORT || 4000);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/" || url.pathname === "/health") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
    res.end("Lune MCP server is running");
    return;
  }

  await handleMcpRequest(req, res);
});

server.listen(PORT, () => {
  console.log(`Lune MCP server listening on http://localhost:${PORT}/mcp`);
});
