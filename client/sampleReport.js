export const SAMPLE_REPORT_ID = "example";

const SAMPLE_TRANSCRIPTS = [
  {
    role: "assistant",
    text: "Hi - I'm Lune, an AI interviewer... Are you happy to continue?",
    timestampIso: "2024-08-12T10:00:00Z",
  },
  {
    role: "user",
    text: "Yes - happy to continue. I'll keep things high-level and avoid confidential details.",
    timestampIso: "2024-08-12T10:00:07Z",
  },
  {
    role: "assistant",
    text: "At a few points I may ask a quick 1-5 rating to summarise - totally optional. Is that okay?",
    timestampIso: "2024-08-12T10:00:12Z",
  },
  {
    role: "user",
    text: "Yes, that's fine.",
    timestampIso: "2024-08-12T10:00:16Z",
  },
  {
    role: "assistant",
    text: "To start, at a high level, what's your role and what kind of work fills most of your week?",
    timestampIso: "2024-08-12T10:00:24Z",
  },
  {
    role: "user",
    text: "I'm a Customer Success Manager. Most of my week is customer calls, adoption planning, QBR prep, and follow-ups.",
    timestampIso: "2024-08-12T10:00:45Z",
  },
  {
    role: "assistant",
    text: "Tell me about the last time you used ChatGPT Enterprise for a real work task - ideally something you had to think through.",
    timestampIso: "2024-08-12T10:01:02Z",
  },
  {
    role: "user",
    text: "Yesterday after a customer check-in, I needed to turn the discussion into a crisp follow-up with recap, risks, and next steps.",
    timestampIso: "2024-08-12T10:01:25Z",
  },
  {
    role: "assistant",
    text: "In that workflow, did you use any specific features in ChatGPT Enterprise - for example Canvas, Deep Research, Codex, or a custom GPT - or was it mainly standard chat?",
    timestampIso: "2024-08-12T10:01:50Z",
  },
  {
    role: "user",
    text: "Mainly standard chat, but I used Canvas to polish the email and action-plan formatting.",
    timestampIso: "2024-08-12T10:02:05Z",
  },
];

const SAMPLE_REPORT_FINAL = {
  meta: {
    interview_id: SAMPLE_REPORT_ID,
    generated_at_iso: "2024-08-12T10:05:00Z",
    model: "gpt-5.2",
    reasoning_effort: "medium",
  },
  exec_summary: {
    bullets: [
      "Uses ChatGPT Enterprise to turn meeting notes into customer-ready recaps and 30-day action plans faster (about 20-30 minutes vs 30-45 minutes before).",
      "Main constraint is handling confidentiality and precision; sensitive contract or pricing details stay manual, which adds some friction.",
      "Impact rated 4/5: faster turnaround, clearer structure; wants role-based templates and clearer safety guidance to reduce reinvention.",
    ],
    overall_sentiment: "mixed",
  },
  use_case: {
    title: "Post-meeting customer follow-up to structured recap + 30-day action plan",
    goal: "Create a customer-actionable follow-up with clear priorities, owners, and timeline.",
    workflow_steps: [
      "Sanitize notes to remove sensitive specifics.",
      "Ask ChatGPT Enterprise for a recap and 30-day action plan.",
      "Edit draft for tone and accuracy, keeping sensitive parts manual.",
      "Send customer follow-up and share an internal summary.",
    ],
    chatgpt_enterprise_role: "Drafting structured recaps and action plans that are then edited before sending.",
    outcome_positive: [
      "Sends follow-ups the same day instead of slipping.",
      "Cleaner structure and wording for customers.",
      "Faster to prepare internal updates for the team.",
    ],
    outcome_negative: [
      "Still needs manual edits for tone and sensitive details.",
      "Avoids using it for precise contract language or pricing.",
    ],
  },
  ratings: {
    dimensions: [
      { key: "frequency", label: "How often used in a typical week (1-5)", value: 4 },
      { key: "workflow_fit", label: "How well it fit into the workflow (1-5)", value: 4 },
      { key: "impact", label: "Overall impact (1-5)", value: 4 },
      { key: "barrier_handling", label: "Barrier-handling while using it (1-5)", value: 3 },
      { key: "enablement_support", label: "Enablement/support (1-5)", value: 3 },
    ],
    notes: "Self-reported weekly time savings: about 2-5 hours depending on follow-ups and QBRs.",
  },
  tools_used: ["ChatGPT (chat)", "Canvas", "Deep Research"],
  themes: {
    wins: [
      "Faster drafting for customer follow-ups and success plans.",
      "Canvas helps polish formatting for customer-ready drafts.",
      "Consistent structure reduces back-and-forth with stakeholders.",
    ],
    blockers: [
      "Avoids using ChatGPT Enterprise for sensitive contract or pricing details.",
      "Manual sanitization of inputs adds friction.",
    ],
    feature_requests: [
      "Role-based templates for CSM workflows.",
      "Safer way to reference internal context without pasting details.",
    ],
    enablement_needs: [
      "Clear guidance on what is safe to include.",
      "Examples for common CSM tasks.",
      "Short office hours to share workflows and pitfalls.",
    ],
    risks_or_caveats: [
      "Relies on the user to strip sensitive content before prompting.",
      "Impact depends on the volume of customer follow-ups and QBRs.",
    ],
  },
  key_quotes: [
    {
      when: "00:01:25",
      quote: "Yesterday after a customer check-in, I needed to turn the discussion into a crisp follow-up with recap, risks, and next steps.",
      topic: "Use case",
    },
    {
      when: "00:02:05",
      quote: "Mainly standard chat, but I used Canvas to polish the email and action-plan formatting.",
      topic: "Tools",
    },
    {
      when: "00:02:30",
      quote: "I get a solid draft in about 10 minutes, then spend another 10-15 editing for accuracy and tone.",
      topic: "Impact",
    },
    {
      when: "00:03:00",
      quote: "I keep sensitive contract language and pricing out of prompts; those parts stay manual.",
      topic: "Safety",
    },
    {
      when: "00:03:30",
      quote: "I use Canvas a couple times a week when I want a cleaner, more readable customer-ready draft.",
      topic: "Adoption",
    },
    {
      when: "00:04:00",
      quote: "It would help to have role-based templates so people stop reinventing the wheel.",
      topic: "Enablement need",
    },
  ],
  evidence: {
    quotes: [
      {
        when: "turn 2",
        quote: "I'm a Customer Success Manager. Most of my week is customer calls, adoption planning, QBR prep, and follow-ups.",
        topic: "Role context",
      },
      {
        when: "turn 8",
        quote: "Yesterday after a customer check-in, I needed to turn the discussion into a crisp follow-up with recap, risks, and next steps.",
        topic: "Use case",
      },
      {
        when: "turn 10",
        quote: "Mainly standard chat, but I used Canvas to polish the email and action-plan formatting.",
        topic: "Tools used",
      },
      {
        when: "00:02:30",
        quote: "I get a solid draft in about 10 minutes, then spend another 10-15 editing for accuracy and tone.",
        topic: "Impact",
      },
      {
        when: "00:03:00",
        quote: "I keep sensitive contract language and pricing out of prompts; those parts stay manual.",
        topic: "Safety boundary",
      },
    ],
  },
  quality: {
    transcript_quality: "good",
    ambiguity_notes: ["Sensitive contract and pricing details are intentionally kept out of prompts."],
  },
};

export const SAMPLE_REPORT_PAYLOAD = {
  report_status: "ready",
  report_model: SAMPLE_REPORT_FINAL,
  report_overrides: {},
  report_final: SAMPLE_REPORT_FINAL,
  snapshot: {
    interview_id: SAMPLE_REPORT_ID,
    transcripts: SAMPLE_TRANSCRIPTS,
  },
};

export default SAMPLE_REPORT_PAYLOAD;
