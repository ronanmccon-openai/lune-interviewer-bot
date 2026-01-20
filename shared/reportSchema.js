export function buildReportSchema() {
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
