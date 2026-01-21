import { z } from "zod";
import { createMcpHandler } from "mcp-handler";
import INTERVIEWER_SYSTEM_PROMPT from "../../../../shared/interviewerPrompt.js";
import { generateReport } from "../../../lib/reporting.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = createMcpHandler((server) => {
  server.tool(
    "get_interviewer_prompt",
    "Returns the canonical Lune interview system prompt for ChatGPT Enterprise usage interviews.",
    z.object({}),
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

  server.tool(
    "generate_report",
    "Generates the structured Lune report from an interview transcript.",
    z.object({
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
    async ({ interview_id, transcripts }) => {
      const report = await generateReport({
        interviewId: interview_id,
        transcripts,
      });

      return {
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
});

export { handler as GET, handler as POST, handler as DELETE };
