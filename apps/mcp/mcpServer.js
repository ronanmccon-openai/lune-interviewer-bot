import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import INTERVIEWER_SYSTEM_PROMPT from "../../shared/interviewerPrompt.js";
import { generateReport } from "./lib/reporting.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const reportWidgetHtml = readFileSync(
  join(moduleDir, "public", "report-widget.html"),
  "utf8",
);

export function createLuneServer() {
  const server = new McpServer({
    name: "lune-interviewer",
    version: "0.1.0",
  });

  server.registerResource(
    "lune-report-widget",
    "ui://lune/report.html",
    {
      title: "Lune Interview Report",
      mimeType: "text/html+skybridge",
    },
    async () => ({
      contents: [
        {
          uri: "ui://lune/report.html",
          text: reportWidgetHtml,
        },
      ],
    }),
  );

  server.registerTool(
    "get_interviewer_prompt",
    {
      title: "Get Lune interviewer prompt",
      description:
        "Returns the canonical Lune interview system prompt for ChatGPT Enterprise usage interviews.",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [
        {
          type: "text",
          text: INTERVIEWER_SYSTEM_PROMPT.trim(),
        },
      ],
      structuredContent: {
        prompt: INTERVIEWER_SYSTEM_PROMPT,
      },
    }),
  );

  server.registerTool(
    "generate_report",
    {
      title: "Generate Lune interview report",
      description:
        "Generates the structured Lune report from an interview transcript. Provide transcript turns in order.",
      inputSchema: z.object({
        interview_id: z.string().optional(),
        transcripts: z
          .array(
            z.object({
              role: z.string(),
              text: z.string().min(1),
            }),
          )
          .min(1),
      }),
    },
    async ({ interview_id, transcripts }) => {
      const report = await generateReport({
        interviewId: interview_id,
        transcripts,
      });

      return {
        _meta: {
          "openai/outputTemplate": "ui://lune/report.html",
          "openai/widgetPrefersBorder": true,
        },
        content: [
          {
            type: "text",
            text: "Report generated.",
          },
        ],
        structuredContent: {
          report,
        },
      };
    },
  );

  return server;
}
