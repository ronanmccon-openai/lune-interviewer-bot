export default function Home() {
  return (
    <main style={{ padding: "32px", fontFamily: "ui-sans-serif, system-ui" }}>
      <h1 style={{ marginBottom: "8px" }}>Lune MCP Server</h1>
      <p>This service powers the Lune ChatGPT app.</p>
      <p>Health check: <code>/api/health</code></p>
      <p>MCP endpoints: <code>/mcp</code> or <code>/api/mcp</code></p>
    </main>
  );
}
