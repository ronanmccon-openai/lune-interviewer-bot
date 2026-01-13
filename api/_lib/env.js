export const API_KEY = process.env.OPENAI_API_KEY;

export const REPORT_MODEL = process.env.REPORT_MODEL || "gpt-5.2";
export const REPORT_FALLBACK_MODEL =
  process.env.REPORT_FALLBACK_MODEL || "gpt-5-mini";
export const REPORT_REASONING_EFFORT =
  process.env.REPORT_REASONING_EFFORT || "medium";

export const SESSION_CONFIG = JSON.stringify({
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
