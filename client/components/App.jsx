import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import logo from "/assets/openai-logomark.svg";
import EventLog from "./EventLog";
import InterviewPanel from "./InterviewPanel";
import SessionControls from "./SessionControls";
import ToolPanel from "./ToolPanel";
import INTERVIEWER_SYSTEM_PROMPT from "../interviewerPrompt";
import { SAMPLE_REPORT_ID } from "../sampleReport";

const INTERVIEW_MODEL = "gpt-realtime";
const INTERVIEW_VOICE = "shimmer";
const TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const CONSENT_QUESTION = "Are you happy to continue?";
const CONSENT_FALLBACK_DELAY_MS = 200;
const COLOR_PALETTE_TOOL = {
  type: "function",
  name: "display_color_palette",
  description: "Call this function when a user asks for a color palette.",
  parameters: {
    type: "object",
    strict: true,
    properties: {
      theme: {
        type: "string",
        description: "Description of the theme for the color scheme.",
      },
      colors: {
        type: "array",
        description: "Array of five hex color codes based on the theme.",
        items: {
          type: "string",
          description: "Hex color code",
        },
      },
    },
    required: ["theme", "colors"],
  },
};

const ASSISTANT_DELTA_TYPES = new Set([
  "response.output_audio_transcript.delta",
]);
const ASSISTANT_DONE_TYPES = new Set([
  "response.output_audio_transcript.done",
]);
const USER_TRANSCRIPT_TYPES = new Set([
  "conversation.item.input_audio_transcription.completed",
  "input_audio_transcription.completed",
]);

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isInterviewPaused, setIsInterviewPaused] = useState(false);
  const [inputMode, setInputMode] = useState("voice");
  const [events, setEvents] = useState([]);
  const [transcripts, setTranscripts] = useState([]);
  const [interviewId, setInterviewId] = useState(() => `${Date.now()}`);
  const [interviewEnded, setInterviewEnded] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState(null);
  const navigate = useNavigate();
  const [dataChannel, setDataChannel] = useState(null);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);
  const localAudioTrackRef = useRef(null);
  const interviewConfiguredRef = useRef(false);
  const hasSentInitialQuestionRef = useRef(false);
  const pendingInitialResponseRef = useRef(false);
  const initialResponseTimeoutRef = useRef(null);
  const sessionReadyRef = useRef(false);
  const sessionUpdateRetryCountRef = useRef(0);
  const assistantDraftsRef = useRef(new Map());
  const userTranscriptIdsRef = useRef(new Set());
  const hasAutoDownloadedRef = useRef(false);
  const hasMarkedInterviewEndedRef = useRef(false);
  const firstAssistantAudioDoneRef = useRef(false);
  const consentFollowupSentRef = useRef(false);
  const consentFallbackTimerRef = useRef(null);
  const initialGreetingSeenRef = useRef(false);

  function hasConsentQuestion(text) {
    if (typeof text !== "string") return false;
    const normalized = text.toLowerCase().replace(/[?.!]/g, "").trim();
    return normalized.includes(CONSENT_QUESTION.toLowerCase().replace(/\?/g, "").trim());
  }

  function clearConsentFallbackTimer() {
    if (consentFallbackTimerRef.current) {
      clearTimeout(consentFallbackTimerRef.current);
      consentFallbackTimerRef.current = null;
    }
  }

  function logTranscriptionEvent(event, text) {
    const snippet = (text || "").slice(0, 120);
    const itemId =
      event.item_id ||
      event.item?.id ||
      event.input_audio_transcription?.item_id ||
      event.id ||
      "no-item-id";
    console.log("[transcription]", {
      type: event.type,
      item_id: itemId,
      text: snippet,
    });
  }

  function clearInitialResponseTimeout() {
    if (initialResponseTimeoutRef.current) {
      clearTimeout(initialResponseTimeoutRef.current);
      initialResponseTimeoutRef.current = null;
    }
  }

  function sessionHasExpectedInstructions(instructions) {
    if (typeof instructions !== "string") return false;
    const normalized = instructions.trim();
    return (
      /You are [“"]Lune[”"]/.test(normalized) ||
      normalized.startsWith(INTERVIEWER_SYSTEM_PROMPT.trim().slice(0, 48))
    );
  }

  function handleSessionUpdated(event) {
    const serverSession = event.session;
    const instructions = serverSession?.instructions;
    const hasExpected = sessionHasExpectedInstructions(instructions);
    const preview = typeof instructions === "string"
      ? instructions.trim().slice(0, 80)
      : null;
    console.log("[session.updated]", {
      has_instructions: typeof instructions === "string",
      has_expected_instructions: hasExpected,
      instructions_preview: preview,
    });
    if (hasExpected) {
      sessionReadyRef.current = true;
      clearInitialResponseTimeout();
      sendInitialResponseIfReady("session.updated");
    }
  }

  function transcriptToCSV(transcriptTurns) {
    const headers = [
      "interview_id",
      "turn_index",
      "speaker",
      "text",
      "iso_time",
    ];
    const escapeCell = (value) => {
      if (value === null || value === undefined) return "";
      const stringValue = String(value);
      const needsQuotes = /[",\n]/.test(stringValue);
      const escaped = stringValue.replace(/"/g, '""');
      return needsQuotes ? `"${escaped}"` : escaped;
    };

    const rows = transcriptTurns.map((turn, index) => {
      const speaker = turn.role === "assistant" ? "INTERVIEWER" : "PARTICIPANT";
      const isoTime = turn.timestampIso || "";
      return [
        interviewId,
        index + 1,
        speaker,
        turn.text,
        isoTime,
      ].map(escapeCell);
    });

    return [headers.map(escapeCell).join(","), ...rows.map((r) => r.join(","))]
      .join("\n");
  }

  function downloadTranscriptCSV() {
    const finalTurns = transcripts.filter((turn) => turn.status !== "draft");
    if (finalTurns.length === 0) return;
    const csv = transcriptToCSV(finalTurns);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chatgpt-enterprise-interview_${interviewId}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function markInterviewEnded() {
    if (hasMarkedInterviewEndedRef.current) return;
    hasMarkedInterviewEndedRef.current = true;
    setInterviewEnded(true);
  }

  function isClosingLine(text) {
    if (!text) return false;
    const normalized = text.toLowerCase();
    const hasAnythingElse =
      normalized.includes("anything else you want to add") ||
      normalized.includes("anything else you'd like to add");
    const hasThanks = normalized.includes("thank you") ||
      normalized.includes("thanks");
    const hasWrap =
      normalized.includes("wrap") ||
      normalized.includes("that's all") ||
      normalized.includes("that concludes") ||
      normalized.includes("we're done") ||
      normalized.includes("we are done");
    return hasAnythingElse || (hasThanks && hasWrap);
  }

  async function startSession() {
    if (isConnecting || isSessionActive) return;
    console.log("START clicked");
    setIsConnecting(true);
    setIsInterviewPaused(false);
    setInputMode("voice");
    setEvents([]);
    setTranscripts([]);
    assistantDraftsRef.current.clear();
    userTranscriptIdsRef.current.clear();
    interviewConfiguredRef.current = false;
    hasSentInitialQuestionRef.current = false;
    pendingInitialResponseRef.current = false;
    sessionReadyRef.current = false;
    sessionUpdateRetryCountRef.current = 0;
    clearInitialResponseTimeout();
    localAudioTrackRef.current = null;
    hasAutoDownloadedRef.current = false;
    hasMarkedInterviewEndedRef.current = false;
    setInterviewEnded(false);
    setInterviewId(`${Date.now()}`);
    firstAssistantAudioDoneRef.current = false;
    consentFollowupSentRef.current = false;
    initialGreetingSeenRef.current = false;
    clearConsentFallbackTimer();
    // Get a session token for OpenAI Realtime API
    try {
      const tokenResponse = await fetch("/api/token");
      if (!tokenResponse.ok) {
        throw new Error(`Token request failed: ${tokenResponse.status}`);
      }
      const data = await tokenResponse.json();
      const EPHEMERAL_KEY =
        data?.value || data?.client_secret?.value || data?.client_secret;
      if (!EPHEMERAL_KEY) {
        throw new Error("Token response missing client secret");
      }

      // Create a peer connection
      const pc = new RTCPeerConnection();

      // Set up to play remote audio from the model
      audioElement.current = document.createElement("audio");
      audioElement.current.autoplay = true;
      pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);

      // Add local audio track for microphone input in the browser
      const ms = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      const [audioTrack] = ms.getAudioTracks();
      if (audioTrack) {
        localAudioTrackRef.current = audioTrack;
        audioTrack.enabled = true;
        pc.addTrack(audioTrack);
      } else {
        console.warn("No audio track available from getUserMedia");
      }

      // Set up data channel for sending and receiving events
      const dc = pc.createDataChannel("oai-events");
      setDataChannel(dc);

      // Start the session using the Session Description Protocol (SDP)
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const baseUrl = "https://api.openai.com/v1/realtime/calls";
      const sdpResponse = await fetch(`${baseUrl}?model=${INTERVIEW_MODEL}`, {
        method: "POST",
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${EPHEMERAL_KEY}`,
          "Content-Type": "application/sdp",
        },
      });

      const sdp = await sdpResponse.text();
      const answer = { type: "answer", sdp };
      await pc.setRemoteDescription(answer);

      peerConnection.current = pc;
    } catch (error) {
      console.error("Failed to start session:", error);
      setIsConnecting(false);
    }
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    setIsConnecting(false);
    setIsInterviewPaused(false);
    setInputMode("voice");
    if (dataChannel) {
      dataChannel.close();
    }

    if (peerConnection.current) {
      peerConnection.current.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.track.stop();
        }
      });
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
    interviewConfiguredRef.current = false;
    hasSentInitialQuestionRef.current = false;
    pendingInitialResponseRef.current = false;
    sessionReadyRef.current = false;
    sessionUpdateRetryCountRef.current = 0;
    clearInitialResponseTimeout();
    localAudioTrackRef.current = null;
    firstAssistantAudioDoneRef.current = false;
    consentFollowupSentRef.current = false;
    initialGreetingSeenRef.current = false;
    clearConsentFallbackTimer();
    markInterviewEnded();
    assistantDraftsRef.current.clear();
    userTranscriptIdsRef.current.clear();
  }

  async function finalizeInterview() {
    if (isFinalizing) return;
    const snapshotTranscripts = transcripts
      .filter((t) => t?.text && t.text.trim())
      .map((t) => ({
        id: t.id,
        role: t.role,
        text: t.text,
        timestamp: t.timestamp,
        timestampIso: t.timestampIso,
      }));
    if (snapshotTranscripts.length === 0) {
      setFinalizeError("No transcript available to finalize.");
      return;
    }
    setIsFinalizing(true);
    setFinalizeError(null);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcripts: snapshotTranscripts }),
      });
      if (!res.ok) {
        let message = "Failed to finalize interview.";
        try {
          const data = await res.json();
          message = data.error || message;
        } catch {
          // ignore parse errors
        }
        setFinalizeError(message);
        setIsFinalizing(false);
        return;
      }
      stopSession();
      navigate(`/report/${interviewId}`);
    } catch (err) {
      console.error("Finalize failed", err);
      setFinalizeError("Failed to finalize interview. Please try again.");
      setIsFinalizing(false);
    }
  }

  function pauseInterview() {
    if (!isSessionActive) return;
    if (isInterviewPaused) return;
    setIsInterviewPaused(true);
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.enabled = false;
    }
  }

  function switchToTextMode() {
    if (!isSessionActive) return;
    setInputMode("text");
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.enabled = false;
    }
  }

  function switchToVoiceMode() {
    if (!isSessionActive) return;
    setInputMode("voice");
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.enabled = !isInterviewPaused;
    }
  }

  function resumeInterview() {
    if (!isSessionActive) return;
    if (!isInterviewPaused) return;
    setIsInterviewPaused(false);
    if (localAudioTrackRef.current) {
      localAudioTrackRef.current.enabled = inputMode === "voice";
    }

    const lastUserTurn = [...transcripts]
      .reverse()
      .find(
        (turn) =>
          turn.role === "user" && turn.status !== "draft" && turn.text?.trim(),
      );
    const lastUserText = lastUserTurn?.text?.trim().slice(0, 600);
    const resumeInstructions = lastUserText
      ? `You are resuming a paused ChatGPT Enterprise usage interview.
Start your next message with: "Welcome back — previously we were discussing …"
In 1–2 sentences, briefly recap (do not repeat verbatim) the participant's most recent answer:
"${lastUserText}"
Then continue the interview exactly where you left off: if you had asked a question that has not been answered yet, repeat that single question; otherwise ask the next best single interview question. Do not restart the interview.`
      : `You are resuming a paused ChatGPT Enterprise usage interview.
Start your next message with: "Welcome back — previously we were discussing …"
In 1 sentence, briefly recap where we left off, then continue exactly where you left off by asking the next best single interview question. Do not restart the interview.`;

    sendClientEvent({
      type: "response.create",
      response: {
        instructions: resumeInstructions,
      },
    });
  }

  function addTranscript(role, text, status = "final", idOverride) {
    if (!text || !text.trim()) return null;
    const id = idOverride || crypto.randomUUID();
    const timestamp = new Date().toLocaleTimeString();
    setTranscripts((prev) => [
      ...prev,
      {
        id,
        role,
        text: text.trim(),
        status,
        timestamp,
        timestampIso: new Date().toISOString(),
      },
    ]);
    return id;
  }

  function upsertUserTranscript(itemId, text) {
    if (!text || !text.trim()) return;
    const id = itemId || crypto.randomUUID();
    setTranscripts((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === id);
      if (existingIndex !== -1) {
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          text: text.trim(),
          status: "final",
        };
        return updated;
      }
      return [
        ...prev,
        {
          id,
          role: "user",
          text: text.trim(),
          status: "final",
          timestamp: new Date().toLocaleTimeString(),
          timestampIso: new Date().toISOString(),
        },
      ];
    });
    userTranscriptIdsRef.current.add(id);
  }

  function appendAssistantDelta(key, delta) {
    if (!delta) return;
    const draftKey = key || "assistant";
    setTranscripts((prev) => {
      const existingId = assistantDraftsRef.current.get(draftKey);
      if (existingId) {
        return prev.map((item) =>
          item.id === existingId
            ? { ...item, text: `${item.text}${delta}`, status: "draft" }
            : item,
        );
      }
      const id = crypto.randomUUID();
      assistantDraftsRef.current.set(draftKey, id);
      console.log("ADD ASSISTANT MESSAGE", id);
      return [
        ...prev,
        {
          id,
          role: "assistant",
          text: delta,
          status: "draft",
          timestamp: new Date().toLocaleTimeString(),
          timestampIso: new Date().toISOString(),
          sourceKey: draftKey,
        },
      ];
    });
  }

  function finalizeAssistantText(key, finalText) {
    const draftKey = key || "assistant";
    setTranscripts((prev) => {
      const existingId = assistantDraftsRef.current.get(draftKey);
      if (existingId) {
        return prev.map((item) =>
          item.id === existingId
            ? {
                ...item,
                text: finalText || item.text,
                status: "final",
              }
            : item,
        );
      }
      const existingItem = prev.find((item) => item.sourceKey === draftKey);
      if (existingItem) {
        return prev.map((item) =>
          item.id === existingItem.id
            ? {
                ...item,
                text: finalText || item.text,
                status: "final",
              }
            : item,
        );
      }
      if (!finalText) return prev;
      const newId = crypto.randomUUID();
      console.log("ADD ASSISTANT MESSAGE", newId);
      return [
        ...prev,
        {
          id: newId,
          role: "assistant",
          text: finalText,
          status: "final",
          timestamp: new Date().toLocaleTimeString(),
          timestampIso: new Date().toISOString(),
          sourceKey: draftKey,
        },
      ];
    });
    assistantDraftsRef.current.delete(draftKey);
    if (finalText && isClosingLine(finalText)) {
      markInterviewEnded();
    }
  }

  function extractTextContent(payload) {
    if (!payload) return null;
    if (typeof payload.text === "string") return payload.text;
    if (typeof payload.transcript === "string") return payload.transcript;
    const content = payload.content || payload.parts;
    if (Array.isArray(content)) {
      const textPart = content.find(
        (part) =>
          typeof part.text === "string" ||
          typeof part.transcript === "string",
      );
      return textPart?.text || textPart?.transcript || null;
    }
    return null;
  }

  function getAssistantTranscriptKey(event) {
    const responseId = event.response_id || event.response?.id;
    const itemId = event.item_id || event.output_item_id;
    const outputIndex = event.output_index;
    const contentIndex = event.content_index;

    if (
      responseId ||
      itemId ||
      outputIndex !== undefined ||
      contentIndex !== undefined
    ) {
      return [
        responseId ?? "response",
        itemId ?? "item",
        outputIndex ?? "output",
        contentIndex ?? "content",
      ].join(":");
    }

    return event.id || "assistant";
  }

  function extractUserTranscriptFromItem(item) {
    if (!item || item.role !== "user") return null;
    if (item.input_audio_transcription) {
      const transcript =
        item.input_audio_transcription.transcript ||
        item.input_audio_transcription.text;
      if (transcript) return transcript;
    }
    if (Array.isArray(item.content)) {
      for (const part of item.content) {
        if (part?.input_audio_transcription) {
          const transcript =
            part.input_audio_transcription.transcript ||
            part.input_audio_transcription.text;
          if (transcript) return transcript;
        }
        if (
          part.type === "input_audio" ||
          part.type === "input_audio_transcription"
        ) {
          const transcript = part.transcript || part.text;
          if (transcript) return transcript;
        }
      }
      const inputTextPart = item.content.find(
        (part) => part.type === "input_text" && typeof part.text === "string",
      );
      if (inputTextPart) return inputTextPart.text;
    }
    return null;
  }

  function getUserTranscriptFromEvent(event) {
    const transcriptionPayload = event.input_audio_transcription;
    if (transcriptionPayload?.transcript || transcriptionPayload?.text) {
      return {
        text: transcriptionPayload.transcript || transcriptionPayload.text,
        id:
          transcriptionPayload.item_id ||
          event.item_id ||
          event.item?.id ||
          event.id,
      };
    }

    if (event.item && event.item.role === "user") {
      const transcript = extractUserTranscriptFromItem(event.item);
      if (transcript) {
        return {
          text: transcript,
          id: event.item.id || event.item_id || event.id,
        };
      }
    }

    if (
      typeof event.type === "string" &&
      event.type.includes("input_audio_transcription") &&
      (event.transcript || event.text)
    ) {
      return {
        text: event.transcript || event.text,
        id: event.item_id || event.item?.id || event.id,
      };
    }

    if (
      typeof event.type === "string" &&
      event.type.includes("input_audio_transcript") &&
      !event.type.includes("output_audio_transcript") &&
      (event.transcript || event.text)
    ) {
      return {
        text: event.transcript || event.text,
        id: event.item_id || event.item?.id || event.id,
      };
    }

    return null;
  }

  function handleTranscriptEvent(event) {
    if (USER_TRANSCRIPT_TYPES.has(event.type)) {
      const payload = getUserTranscriptFromEvent(event);
      if (payload?.text) {
        logTranscriptionEvent(event, payload.text);
        const userId = payload.id || crypto.randomUUID();
        upsertUserTranscript(userId, payload.text);
      }
      return;
    }

    if (
      event?.item?.role === "user" &&
      Array.isArray(event.item.content) &&
      event.item.content.some(
        (part) => part?.type === "input_text" && typeof part.text === "string",
      )
    ) {
      return;
    }

    const userPayload = getUserTranscriptFromEvent(event);
    if (userPayload?.text) {
      logTranscriptionEvent(event, userPayload.text);
      const userId = userPayload.id || crypto.randomUUID();
      upsertUserTranscript(userId, userPayload.text);
      return;
    }

    if (ASSISTANT_DELTA_TYPES.has(event.type)) {
      const delta = event.delta || event.text || event.transcript;
      const assistantKey = getAssistantTranscriptKey(event);
      appendAssistantDelta(assistantKey, delta);
      return;
    }

    if (ASSISTANT_DONE_TYPES.has(event.type)) {
      const finalText = event.text || event.transcript || event.delta;
      const assistantKey = getAssistantTranscriptKey(event);
      finalizeAssistantText(assistantKey, finalText);
      const greetingHasConsent = hasConsentQuestion(finalText);
      if (greetingHasConsent && !initialGreetingSeenRef.current) {
        initialGreetingSeenRef.current = true;
        clearConsentFallbackTimer();
        consentFallbackTimerRef.current = setTimeout(() => {
          if (!consentFollowupSentRef.current) {
            consentFollowupSentRef.current = true;
            sendClientEvent({
              type: "response.create",
              response: {
                temperature: 0,
                max_output_tokens: 40,
                instructions: `${CONSENT_QUESTION} Wait for the participant's reply.`,
              },
            });
          }
        }, CONSENT_FALLBACK_DELAY_MS);
      }
      // If the first assistant audio finished but skipped the consent question,
      // send a short follow-up to speak it so users hear it.
      const isAudioDone =
        typeof event.type === "string" &&
        event.type.includes("output_audio") &&
        event.type.includes("transcript") &&
        event.type.includes("done");
      if (!isAudioDone) return;
      if (firstAssistantAudioDoneRef.current) return;
      firstAssistantAudioDoneRef.current = true;
      const consentPresent = hasConsentQuestion(finalText);
      if (consentPresent || consentFollowupSentRef.current) return;
      consentFollowupSentRef.current = true;
      setTimeout(() => {
        sendClientEvent({
          type: "response.create",
          response: {
            temperature: 0,
            max_output_tokens: 40,
            instructions: `${CONSENT_QUESTION} Wait for the participant's reply.`,
          },
        });
      }, CONSENT_FALLBACK_DELAY_MS);
      return;
    }

    return;
  }

  function queueInitialResponse() {
    if (hasSentInitialQuestionRef.current) return;
    pendingInitialResponseRef.current = true;
    clearInitialResponseTimeout();
    initialResponseTimeoutRef.current = setTimeout(() => {
      if (
        !hasSentInitialQuestionRef.current &&
        !sessionReadyRef.current &&
        pendingInitialResponseRef.current
      ) {
        if (sessionUpdateRetryCountRef.current >= 2) {
          console.warn(
            "[session.update] not confirmed; holding initial response to prevent prompt drift",
          );
          return;
        }
        sessionUpdateRetryCountRef.current += 1;
        console.warn("[session.update] retry", sessionUpdateRetryCountRef.current);
        sendSessionUpdate();
        queueInitialResponse();
      }
    }, 2000);
  }

  function sendInitialResponseIfReady(trigger) {
    if (!pendingInitialResponseRef.current) return;
    if (hasSentInitialQuestionRef.current) return;
    if (!sessionReadyRef.current) return;
    hasSentInitialQuestionRef.current = true;
    pendingInitialResponseRef.current = false;
    clearInitialResponseTimeout();
    console.log("SENDING INITIAL QUESTION", trigger);
    firstAssistantAudioDoneRef.current = false;
    consentFollowupSentRef.current = false;
    initialGreetingSeenRef.current = false;
    clearConsentFallbackTimer();
    sendClientEvent({ type: "response.create" });
  }

  function sendSessionUpdate() {
    console.log("[session.update] sending", {
      instructions_preview: INTERVIEWER_SYSTEM_PROMPT.trim().slice(0, 80),
      transcription_model: TRANSCRIPTION_MODEL,
    });
    sendClientEvent({
      type: "session.update",
      session: {
        type: "realtime",
        model: INTERVIEW_MODEL,
        instructions: INTERVIEWER_SYSTEM_PROMPT.trim(),
        tools: [COLOR_PALETTE_TOOL],
        tool_choice: "auto",
        audio: {
          output: {
            voice: INTERVIEW_VOICE,
          },
          input: {
            transcription: {
              model: TRANSCRIPTION_MODEL,
              language: "en",
              prompt:
                "This is an interview about ChatGPT Enterprise usage at work. Vocabulary includes: ChatGPT Enterprise, prompts, GPTs, connectors, knowledge base, workspace, governance, compliance, policy, enablement, adoption, ROI, time saved, quality, accuracy, security.",
            },
          },
        },
      },
    });
  }

  function configureInterviewSession() {
    if (interviewConfiguredRef.current) return;
    interviewConfiguredRef.current = true;
    sessionReadyRef.current = false;
    sessionUpdateRetryCountRef.current = 0;
    sendSessionUpdate();
    queueInitialResponse();
  }

  // Send a message to the model
  function sendClientEvent(message) {
    if (dataChannel) {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      // send event before setting timestamp since the backend peer doesn't expect this field
      dataChannel.send(JSON.stringify(message));

      // if guard just in case the timestamp exists by miracle
      if (!message.timestamp) {
        message.timestamp = timestamp;
      }
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        "Failed to send message - no data channel available",
        message,
      );
    }
  }

  // Send a text message to the model
  function sendTextMessage(message) {
    if (!message.trim()) return;
    const itemId = crypto.randomUUID();
    addTranscript("user", message, "final", itemId);
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    if (sessionReadyRef.current) {
      sendClientEvent({ type: "response.create" });
    } else {
      console.warn(
        "[response.create] held until session is ready to prevent prompt drift",
      );
      queueInitialResponse();
    }
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      const handleMessage = (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }

        setEvents((prev) => [event, ...prev]);
        handleTranscriptEvent(event);
        if (event.type === "session.created") {
          configureInterviewSession();
        }
        if (event.type === "session.updated") {
          handleSessionUpdated(event);
        }
        if (event.type === "error") {
          console.error("[realtime error]", event);
        }
      };

      const handleOpen = () => {
        console.log("CONNECTED");
        setIsSessionActive(true);
        setIsConnecting(false);
        setIsInterviewPaused(false);
        setInputMode("voice");
        setEvents([]);
        setTranscripts([]);
        assistantDraftsRef.current.clear();
        userTranscriptIdsRef.current.clear();
        interviewConfiguredRef.current = false;
        hasSentInitialQuestionRef.current = false;
        pendingInitialResponseRef.current = false;
        sessionReadyRef.current = false;
        sessionUpdateRetryCountRef.current = 0;
        clearInitialResponseTimeout();
        firstAssistantAudioDoneRef.current = false;
        consentFollowupSentRef.current = false;
        initialGreetingSeenRef.current = false;
        clearConsentFallbackTimer();
      };

      const handleClose = () => {
        setIsSessionActive(false);
        setIsConnecting(false);
        setIsInterviewPaused(false);
        setInputMode("voice");
        interviewConfiguredRef.current = false;
        hasSentInitialQuestionRef.current = false;
        pendingInitialResponseRef.current = false;
        sessionReadyRef.current = false;
        sessionUpdateRetryCountRef.current = 0;
        clearInitialResponseTimeout();
        markInterviewEnded();
        assistantDraftsRef.current.clear();
        userTranscriptIdsRef.current.clear();
        firstAssistantAudioDoneRef.current = false;
        consentFollowupSentRef.current = false;
        initialGreetingSeenRef.current = false;
        clearConsentFallbackTimer();
      };

      // Append new server events to the list
      dataChannel.addEventListener("message", handleMessage);

      // Set session active when the data channel is opened
      dataChannel.addEventListener("open", handleOpen);
      dataChannel.addEventListener("close", handleClose);

      return () => {
        dataChannel.removeEventListener("message", handleMessage);
        dataChannel.removeEventListener("open", handleOpen);
        dataChannel.removeEventListener("close", handleClose);
      };
    }
  }, [dataChannel]);

  useEffect(() => {
    if (!interviewEnded || hasAutoDownloadedRef.current) return;
    hasAutoDownloadedRef.current = true;
    downloadTranscriptCSV();
  }, [interviewEnded, transcripts]);

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center backdrop-blur-md bg-white/70 border-b border-slate-200/80 shadow-[0_8px_30px_rgba(15,23,42,0.06)] z-10">
        <div className="flex items-center justify-between gap-3 w-full max-w-6xl mx-auto px-6">
          <div className="flex items-center gap-3">
            <img style={{ width: "24px" }} src={logo} />
            <div className="flex flex-col leading-tight">
              <h1 className="text-base font-semibold text-slate-900">
                Interview Mode
              </h1>
              <p className="text-xs text-slate-500">
                ChatGPT Enterprise Impact Survey
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/report/${SAMPLE_REPORT_ID}`)}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white px-3 py-2 text-xs font-semibold hover:bg-slate-800"
            >
              See example report
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Session tools ready
            </div>
          </div>
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0 flex flex-col">
        <section className="flex-1 px-6 py-6 overflow-hidden">
          <InterviewPanel
            isSessionActive={isSessionActive}
            isPaused={isInterviewPaused}
            inputMode={inputMode}
            isConnecting={isConnecting}
          transcripts={transcripts}
          onStart={startSession}
          onPause={pauseInterview}
          onResume={resumeInterview}
          onSwitchToText={switchToTextMode}
          onSwitchToVoice={switchToVoiceMode}
          onSendText={sendTextMessage}
          onEnd={finalizeInterview}
          onDownload={downloadTranscriptCSV}
          isDownloadEnabled={interviewEnded}
          isFinalizing={isFinalizing}
        />
        {finalizeError
          ? (
            <div className="text-red-600 text-sm mt-2">
              {finalizeError}
            </div>
          )
          : null}
      </section>
      <section className="border-t border-slate-200/80 bg-white/70 backdrop-blur-sm shadow-[0_-12px_32px_rgba(15,23,42,0.05)]">
        <details className="px-6 py-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Developer Tools
            </summary>
            <div className="mt-4 max-h-[45vh] overflow-y-auto pb-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="bg-slate-900/90 text-slate-100 rounded-2xl p-4 flex flex-col gap-4 border border-slate-800 shadow-inner">
                  <h2 className="text-sm font-semibold text-slate-100">
                    Event Log
                  </h2>
                  <div className="flex-1 overflow-y-auto custom-scroll">
                    <EventLog events={events} />
                  </div>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="bg-white/80 rounded-2xl p-4 border border-slate-200 shadow-sm">
                    <h2 className="text-sm font-semibold text-slate-800 mb-3">
                      Session Controls
                    </h2>
                    <div className="h-28">
                      <SessionControls
                        startSession={startSession}
                        stopSession={stopSession}
                        sendClientEvent={sendClientEvent}
                        sendTextMessage={sendTextMessage}
                        events={events}
                        isSessionActive={isSessionActive}
                      />
                    </div>
                  </div>
                  <ToolPanel
                    sendClientEvent={sendClientEvent}
                    sendTextMessage={sendTextMessage}
                    events={events}
                    isSessionActive={isSessionActive}
                  />
                </div>
              </div>
            </div>
          </details>
        </section>
      </main>
    </>
  );
}
