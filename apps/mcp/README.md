# Lune ChatGPT App (MCP server)

This folder hosts the MCP server for the ChatGPT App experience.

## Local dev

```
cd apps/mcp
npm install
npm run dev
```

The MCP endpoint runs at:

```
http://localhost:3000/mcp
http://localhost:3000/api/mcp
```

Health check:

```
http://localhost:3000/api/health
```

## Vercel

Set the Vercel project root to `apps/mcp`.

Add env vars:

- `OPENAI_API_KEY` (required)
- `REPORT_MODEL` (optional)
- `REPORT_FALLBACK_MODEL` (optional)
- `REPORT_REASONING_EFFORT` (optional)

The MCP endpoint will be available at:

```
https://<your-project>.vercel.app/mcp
https://<your-project>.vercel.app/api/mcp
```
