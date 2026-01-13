import { useEffect, useRef, useState } from "react";
import { Mic, Pause, Play, Square } from "react-feather";
import Button from "./Button";

function TranscriptBubble({ item }) {
  const isUser = item.role === "user" || item.role === "participant";
  const baseClasses =
    "max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm border";
  const toneClasses = isUser
    ? "bg-emerald-50 text-emerald-950 border-emerald-100 shadow-[0_10px_30px_rgba(16,163,127,0.12)]"
    : "bg-white/90 text-slate-900 border-slate-200";
  const draftClasses = item.status === "draft" ? "border-dashed" : "";
  const labelClasses =
    "inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500";
  const dotClasses = `h-2 w-2 rounded-full ${
    isUser ? "bg-emerald-500" : "bg-slate-400"
  }`;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`${baseClasses} ${toneClasses} ${draftClasses}`}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className={labelClasses}>
            <span className={dotClasses} />
            {isUser ? "Participant" : "Interviewer"}
          </div>
          {item.status === "draft"
            ? (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1">
                draft
              </span>
            )
            : null}
        </div>
        <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">
          {item.text}
        </p>
      </div>
    </div>
  );
}

export default function InterviewPanel({
  isSessionActive,
  isPaused,
  inputMode,
  isConnecting,
  transcripts,
  onStart,
  onPause,
  onResume,
  onSwitchToText,
  onSwitchToVoice,
  onSendText,
  onEnd,
  onDownload,
  isDownloadEnabled,
  isFinalizing,
}) {
  const endRef = useRef(null);
  const [draftText, setDraftText] = useState("");
  const isTextMode = inputMode === "text";

  function sendTypedMessage() {
    const trimmed = draftText.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    setDraftText("");
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcripts.length]);

  return (
    <section className="h-full flex flex-col gap-5 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-white/80 border border-slate-200 rounded-2xl px-4 py-4 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">
            Luné
          </h2>
          <p className="text-sm text-slate-500">
            Your AI interviewer for this session.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600 rounded-full bg-slate-100 border border-slate-200 px-3 py-1">
            <span
              className={`h-2 w-2 rounded-full ${
                isSessionActive
                  ? (isPaused ? "bg-amber-500" : "bg-emerald-500 animate-pulse")
                  : "bg-slate-300"
              }`}
            />
            {isSessionActive ? (isPaused ? "Paused" : "Live") : "Idle"}
          </span>
          {isSessionActive ? (
            isPaused ? (
              <Button
                onClick={onResume}
                className="bg-emerald-600 hover:bg-emerald-700"
                icon={<Play height={16} />}
              >
                resume interview
              </Button>
            ) : (
              <Button
                onClick={onPause}
                className="bg-amber-500 text-slate-900 hover:bg-amber-600"
                icon={<Pause height={16} />}
              >
                pause interview
              </Button>
            )
          ) : (
            <Button
              onClick={() => {
                if (!isConnecting) onStart();
              }}
              className={isConnecting
                ? "bg-slate-400 text-slate-900 hover:bg-slate-400"
                : "bg-emerald-600 hover:bg-emerald-700"}
              icon={<Mic height={16} />}
            >
              {isConnecting ? "starting..." : "start interview"}
            </Button>
          )}
          {isSessionActive ? (
            <Button
              onClick={onEnd}
              className={`${
                isFinalizing
                  ? "bg-red-300 cursor-not-allowed"
                  : "bg-red-500 hover:bg-red-600"
              }`}
              disabled={isFinalizing}
              icon={<Square height={16} />}
            >
              {isFinalizing ? "ending..." : "end interview"}
            </Button>
          ) : (
            <Button
              onClick={() => {
                if (isDownloadEnabled) onDownload();
              }}
              className={isDownloadEnabled
                ? "bg-slate-900 hover:bg-slate-800"
                : "bg-slate-200 text-slate-500 hover:bg-slate-200"}
              disabled={!isDownloadEnabled}
            >
              download csv
            </Button>
          )}
        </div>
      </header>
      <div className="flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-sm shadow-[0_20px_60px_rgba(15,23,42,0.06)] flex flex-col">
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 bg-gradient-to-b from-slate-50/80 via-white to-white">
          {transcripts.length === 0 ? (
            <div className="text-slate-500 text-sm">
              Start the session to capture the interview transcript.
            </div>
          ) : (
            transcripts.map((item) => (
              <TranscriptBubble key={item.id} item={item} />
            ))
          )}
          <div ref={endRef} />
        </div>
        {isSessionActive && !isPaused
          ? (
            isTextMode
              ? (
                <div className="border-t border-slate-200 bg-slate-50/90 px-4 py-3 flex items-end gap-3">
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendTypedMessage();
                      }
                    }}
                    placeholder="Type your answer…"
                    rows={2}
                    className="flex-1 resize-none rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white/90 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={onSwitchToVoice}
                    className="rounded-full bg-slate-200 text-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-300 border border-slate-300 transition"
                  >
                    speak instead
                  </button>
                  <button
                    type="button"
                    onClick={sendTypedMessage}
                    disabled={!draftText.trim()}
                    className={`rounded-full px-4 py-2 text-sm font-semibold text-white ${
                      draftText.trim()
                        ? "bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                        : "bg-emerald-200 cursor-not-allowed text-emerald-800"
                    }`}
                  >
                    send
                  </button>
                </div>
              )
              : (
                <div className="border-t border-slate-200 bg-slate-50/90 px-4 py-3 flex justify-end">
                  <button
                    type="button"
                    onClick={onSwitchToText}
                    className="rounded-full bg-slate-200 text-slate-900 px-4 py-2 text-sm font-semibold hover:bg-slate-300 border border-slate-300 transition"
                  >
                    type answers instead
                  </button>
                </div>
              )
          )
          : null}
      </div>
    </section>
  );
}
