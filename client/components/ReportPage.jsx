import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SAMPLE_REPORT_PAYLOAD, { SAMPLE_REPORT_ID } from "../sampleReport";

function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function transcriptToCSV(snapshot) {
  const transcripts = snapshot?.transcripts || [];
  const headers = ["turn_index", "speaker", "text", "timestamp_iso"];
  const escapeCell = (value) => {
    if (value === null || value === undefined) return "";
    const stringValue = String(value);
    const needsQuotes = /[",\n]/.test(stringValue);
    const escaped = stringValue.replace(/"/g, '""');
    return needsQuotes ? `"${escaped}"` : escaped;
  };

  const rows = transcripts.map((turn, index) => {
    const speaker = turn.role === "assistant" ? "INTERVIEWER" : "PARTICIPANT";
    const isoTime = turn.timestampIso || "";
    return [index + 1, speaker, turn.text, isoTime].map(escapeCell).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function valueAtPath(obj, path) {
  return path.reduce(
    (acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined),
    obj,
  );
}

function buildPatch(path, value) {
  return path.reduceRight((acc, key) => ({ [key]: acc }), value);
}

function hasOverride(overrides, path) {
  return valueAtPath(overrides, path) !== undefined;
}

function setNestedValue(obj, path, value) {
  if (!Array.isArray(path) || path.length === 0) return obj;
  const [head, ...rest] = path;
  const base = obj && typeof obj === "object" ? obj : {};
  const clone = Array.isArray(base) ? [...base] : { ...base };
  if (rest.length === 0) {
    clone[head] = value;
    return clone;
  }
  clone[head] = setNestedValue(base[head], rest, value);
  return clone;
}

function EditableField({
  label,
  value,
  type = "text",
  isEdited,
  onSave,
  parser,
}) {
  const normalizedValue = type === "list" && Array.isArray(value)
    ? value.join("\n")
    : value || "";
  const [draft, setDraft] = useState(normalizedValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDraft(normalizedValue);
  }, [normalizedValue]);

  async function handleAutoSave() {
    if (saving) return;
    if (draft === normalizedValue) return;
    setSaving(true);
    setError(null);
    try {
      let nextValue = draft;
      if (parser) {
        nextValue = parser(draft);
      } else if (type === "list") {
        nextValue = draft
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean);
      }
      await onSave(nextValue);
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const isTextarea = type === "textarea" || type === "list" || type === "text";
  const commonProps = {
    value: draft,
    onChange: (e) => setDraft(e.target.value),
    onBlur: handleAutoSave,
  };
  const baseClass =
    "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const textareaClass = `${baseClass} resize-y min-h-[64px]`;
  const inputClass = baseClass;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {isEdited
          ? (
            <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-1">
              Edited
            </span>
          )
          : null}
      </div>
      {isTextarea
        ? (
          <textarea
            {...commonProps}
            rows={type === "list" ? 4 : 2}
            className={textareaClass}
          />
        )
        : (
          <input
            {...commonProps}
            className={inputClass}
          />
        )}
      <div className="text-xs text-slate-500 min-h-[18px]">
        {saving ? "Saving..." : error ? <span className="text-red-600">{error}</span> : "Auto-saves on blur"}
      </div>
    </div>
  );
}

function RadarChart({ dimensions }) {
  if (!dimensions || dimensions.length === 0) return null;
  const maxValue = 5;
  const values = dimensions.map((d) => d.value ?? 0);
  const hasValues = values.some((v) => v && v > 0);
  if (!hasValues) {
    return <p className="text-sm text-slate-500">No ratings captured.</p>;
  }
  const size = 420;
  const center = size / 2;
  const radius = size / 2 - 56;
  const labelRadius = radius + 42;
  const angleStep = (Math.PI * 2) / dimensions.length;

  function wrapLabel(label, maxChars = 18) {
    if (!label) return [""];
    const words = label.split(" ");
    const lines = [];
    let current = "";
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (next.length <= maxChars) {
        current = next;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    });
    if (current) lines.push(current);
    return lines.slice(0, 3);
  }

  const points = values
    .map((value, idx) => {
      const angle = angleStep * idx - Math.PI / 2;
      const r = (Math.max(0, Math.min(maxValue, value)) / maxValue) * radius;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto"
      style={{ overflow: "visible" }}
    >
      {[1, 2, 3, 4, 5].map((level) => {
        const r = (level / maxValue) * radius;
        return (
          <circle
            key={level}
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        );
      })}
      {dimensions.map((dim, idx) => {
        const angle = angleStep * idx - Math.PI / 2;
        const x = center + labelRadius * Math.cos(angle);
        const y = center + labelRadius * Math.sin(angle);
        const cos = Math.cos(angle);
        let textAnchor = "middle";
        if (cos > 0.1) textAnchor = "start";
        if (cos < -0.1) textAnchor = "end";
        const lines = wrapLabel(dim.label, 22);
        return (
          <g key={dim.key}>
            <line
              x1={center}
              y1={center}
              x2={center + radius * Math.cos(angle)}
              y2={center + radius * Math.sin(angle)}
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <text
              x={x}
              y={y}
              dy={4}
              className="text-[11px] fill-slate-600"
              textAnchor={textAnchor}
            >
              {lines.map((line, i) => (
                <tspan key={`${dim.key}-line-${i}`} x={x} dy={i === 0 ? 0 : 13}>
                  {line}
                </tspan>
              ))}
            </text>
          </g>
        );
      })}
      <polygon points={points} fill="rgba(16,185,129,0.2)" stroke="#10b981" strokeWidth="2" />
    </svg>
  );
}

export default function ReportPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isSample = id === SAMPLE_REPORT_ID;
  const [status, setStatus] = useState("loading");
  const [reportModel, setReportModel] = useState(null);
  const [reportOverrides, setReportOverrides] = useState({});
  const [reportFinal, setReportFinal] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyHeight = document.body.style.height;
    const prevHtmlHeight = document.documentElement.style.height;
    document.body.style.overflow = "auto";
    document.documentElement.style.overflow = "auto";
    document.body.style.height = "auto";
    document.documentElement.style.height = "auto";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.height = prevBodyHeight;
      document.documentElement.style.height = prevHtmlHeight;
    };
  }, []);

  async function fetchReport() {
    if (isSample) {
      setSnapshot(SAMPLE_REPORT_PAYLOAD.snapshot || null);
      setReportModel(SAMPLE_REPORT_PAYLOAD.report_model || {});
      setReportOverrides(SAMPLE_REPORT_PAYLOAD.report_overrides || {});
      setReportFinal(SAMPLE_REPORT_PAYLOAD.report_final || {});
      setStatus("ready");
      setError(null);
      return;
    }
    try {
      const res = await fetch(`/api/interviews/${id}/report`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load report");
        setStatus("error");
        return;
      }
      setSnapshot(data.snapshot || null);
      if (data.report_status === "ready") {
        setReportModel(data.report_model);
        setReportOverrides(data.report_overrides || {});
        setReportFinal(data.report_final);
        setStatus("ready");
      } else {
        setStatus("pending");
      }
    } catch (err) {
      setError(err.message || "Failed to load report");
      setStatus("error");
    }
  }

  useEffect(() => {
    fetchReport();
  }, [id]);

  useEffect(() => {
    if (status === "pending") {
      const timer = setTimeout(() => fetchReport(), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status]);

  async function saveOverride(path, value) {
    if (isSample) {
      setReportOverrides((prev) => setNestedValue(prev, path, value));
      setReportFinal((prev) => setNestedValue(prev || {}, path, value));
      setReportModel((prev) => setNestedValue(prev || {}, path, value));
      return;
    }
    const patch = buildPatch(path, value);
    const res = await fetch(`/api/interviews/${id}/report_overrides`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Failed to save");
    }
    setReportModel(data.report_model);
    setReportOverrides(data.report_overrides || {});
    setReportFinal(data.report_final);
  }

  const isReady = status === "ready" && reportFinal;

  const toolsUsed = useMemo(() => {
    const tools = reportFinal?.tools_used;
    if (!tools || !Array.isArray(tools) || tools.length === 0) {
      return ["Unknown"];
    }
    return tools;
  }, [reportFinal]);

  const transcriptText = useMemo(() => {
    if (!snapshot?.transcripts) return "";
    return snapshot.transcripts
      .map(
        (t, idx) => `${idx + 1}. [${t.role === "assistant" ? "Interviewer" : "Participant"}] ${t.text}`,
      )
      .join("\n");
  }, [snapshot]);

  useEffect(() => {
    function resizeTextareas() {
      document.querySelectorAll("textarea").forEach((el) => {
        el.style.height = "auto";
        el.style.overflow = "visible";
        el.style.height = `${el.scrollHeight + 4}px`;
      });
    }

    function resetTextareas() {
      document.querySelectorAll("textarea").forEach((el) => {
        el.style.height = "";
        el.style.overflow = "";
      });
    }

    function handleMediaQuery(e) {
      if (e.matches) {
        resizeTextareas();
      } else {
        resetTextareas();
      }
    }

    window.addEventListener("beforeprint", resizeTextareas);
    window.addEventListener("afterprint", resetTextareas);
    const mediaQuery = window.matchMedia ? window.matchMedia("print") : null;
    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener("change", handleMediaQuery);
    } else if (mediaQuery?.addListener) {
      mediaQuery.addListener(handleMediaQuery);
    }

    return () => {
      window.removeEventListener("beforeprint", resizeTextareas);
      window.removeEventListener("afterprint", resetTextareas);
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener("change", handleMediaQuery);
      } else if (mediaQuery?.removeListener) {
        mediaQuery.removeListener(handleMediaQuery);
      }
    };
  }, [isReady]);

  return (
    <main className="min-h-screen overflow-auto bg-[radial-gradient(circle_at_20%_20%,#e9f8f3_0,#f7f9fb_38%),radial-gradient(circle_at_80%_0%,#eef2ff_0,#f6f7fb_42%),#f6f7fb]">
      <style>
        {`
        @media print {
          html, body { height: auto !important; overflow: visible !important; background: white !important; }
          main, .print-container { height: auto !important; overflow: visible !important; padding: 0 !important; }
          button, .no-print { display: none !important; }
          .card { break-inside: avoid; }
        }
        `}
      </style>
      <div className="max-w-5xl mx-auto px-6 py-8 print-container">
        <header className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Interview Report
            </p>
            <h1 className="text-3xl font-bold text-slate-900">
              Report: {id}
            </h1>
            <p className="text-sm text-slate-500">
              Generated with model snapshot; edit key fields inline.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate("/")}
              className="no-print rounded-full bg-slate-200 text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-300 border border-slate-300"
            >
              Back to interview
            </button>
            <button
              onClick={() => window.print()}
              className="no-print rounded-full bg-slate-900 text-white px-3 py-2 text-sm font-semibold hover:bg-slate-800"
            >
              Print / Save PDF
            </button>
          </div>
        </header>

        {status === "loading"
          ? (
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <p className="text-sm text-slate-600">Loading report…</p>
            </div>
          )
          : null}

        {status === "pending"
          ? (
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <p className="text-sm text-slate-600">
                Generating report… this usually takes a few seconds.
              </p>
            </div>
          )
          : null}

        {status === "error"
          ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-2xl shadow-sm text-red-700">
              <p className="text-sm font-semibold">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )
          : null}

        {isReady
          ? (
            <div className="space-y-4">
              <section className="grid md:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm md:col-span-2">
                  <EditableField
                    label="Executive Summary (bullets)"
                    type="list"
                    value={reportFinal.exec_summary?.bullets || []}
                    isEdited={hasOverride(reportOverrides, ["exec_summary", "bullets"])}
                    onSave={(val) => saveOverride(["exec_summary", "bullets"], val)}
                  />
                  <div className="mt-4">
                    <EditableField
                      label="Overall Sentiment"
                      value={reportFinal.exec_summary?.overall_sentiment || ""}
                      isEdited={hasOverride(reportOverrides, ["exec_summary", "overall_sentiment"])}
                      onSave={(val) =>
                        saveOverride(["exec_summary", "overall_sentiment"], val)}
                    />
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-3">
                    Tools used
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {toolsUsed.map((tool, idx) => (
                      <span
                        key={`${tool}-${idx}`}
                        className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-100 px-3 py-1 text-xs font-semibold"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                  {(!toolsUsed || toolsUsed.length === 0)
                    ? (
                      <p className="text-sm text-slate-500 mt-2">
                        No tools detected.
                      </p>
                    )
                    : null}
                </div>
              </section>

              <section className="grid md:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm md:col-span-2">
                  <h2 className="text-lg font-semibold text-slate-900 mb-3">
                    Ratings
                  </h2>
                  <RadarChart dimensions={reportFinal.ratings?.dimensions || []} />
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-900 mb-3">
                    Ratings notes
                  </h2>
                  <EditableField
                    label="Notes"
                    type="textarea"
                    value={reportFinal.ratings?.notes || ""}
                    onSave={(val) => saveOverride(["ratings", "notes"], val)}
                    isEdited={hasOverride(reportOverrides, ["ratings", "notes"])}
                  />
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">
                  Use case
                </h2>
                {reportFinal.use_case
                  ? (
                    <div className="grid md:grid-cols-2 gap-4">
                      <EditableField
                        label="Title"
                        value={reportFinal.use_case?.title || ""}
                        onSave={(val) => saveOverride(["use_case", "title"], val)}
                        isEdited={hasOverride(reportOverrides, ["use_case", "title"])}
                      />
                      <EditableField
                        label="Goal"
                        value={reportFinal.use_case?.goal || ""}
                        onSave={(val) => saveOverride(["use_case", "goal"], val)}
                        isEdited={hasOverride(reportOverrides, ["use_case", "goal"])}
                      />
                      <EditableField
                        label="Workflow steps"
                        type="list"
                        value={reportFinal.use_case?.workflow_steps || []}
                        onSave={(val) => saveOverride(["use_case", "workflow_steps"], val)}
                        isEdited={hasOverride(reportOverrides, ["use_case", "workflow_steps"])}
                      />
                      <EditableField
                        label="ChatGPT Enterprise role"
                        value={reportFinal.use_case?.chatgpt_enterprise_role || ""}
                        onSave={(val) =>
                          saveOverride(["use_case", "chatgpt_enterprise_role"], val)}
                        isEdited={hasOverride(reportOverrides, ["use_case", "chatgpt_enterprise_role"])}
                      />
                      <EditableField
                        label="Outcome (positive)"
                        type="list"
                        value={reportFinal.use_case?.outcome_positive || []}
                        onSave={(val) =>
                          saveOverride(["use_case", "outcome_positive"], val)}
                        isEdited={hasOverride(reportOverrides, ["use_case", "outcome_positive"])}
                      />
                      <EditableField
                        label="Outcome (negative)"
                        type="list"
                        value={reportFinal.use_case?.outcome_negative || []}
                        onSave={(val) =>
                          saveOverride(["use_case", "outcome_negative"], val)}
                        isEdited={hasOverride(reportOverrides, ["use_case", "outcome_negative"])}
                      />
                    </div>
                  )
                  : (
                    <p className="text-sm text-slate-500">
                      No use case captured.
                    </p>
                  )}
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">
                  Themes
                </h2>
                <div className="grid md:grid-cols-2 gap-4">
                  {["wins", "blockers", "feature_requests", "enablement_needs", "risks_or_caveats"].map(
                    (key) => (
                      <div className="mt-1" key={key}>
                        <EditableField
                          label={key.replace(/_/g, " ")}
                          type="list"
                          value={reportFinal.themes?.[key] || []}
                          onSave={(val) => saveOverride(["themes", key], val)}
                          isEdited={hasOverride(reportOverrides, ["themes", key])}
                        />
                      </div>
                    ),
                  )}
                </div>
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">
                  Key quotes (5–8 impactful lines)
                </h2>
                <EditableField
                  label="Key quotes (format: when — quote — topic)"
                  type="list"
                  value={
                    (reportFinal.key_quotes || []).map(
                      (q) => `${q.when} — ${q.quote} — ${q.topic}`,
                    ) || []
                  }
                  onSave={(val) => {
                    const parsed = val.map((line) => {
                      const parts = line.split("—").map((p) => p.trim());
                      return {
                        when: parts[0] || "",
                        quote: parts[1] || "",
                        topic: parts[2] || "",
                      };
                    });
                    return saveOverride(["key_quotes"], parsed);
                  }}
                  isEdited={hasOverride(reportOverrides, ["key_quotes"])}
                />
              </section>

              <section className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-3">
                  Exports
                </h2>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => downloadText(`transcript_${id}.txt`, transcriptText)}
                    className="rounded-full bg-slate-200 text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-300 border border-slate-300"
                  >
                    Download Transcript (txt)
                  </button>
                  <button
                    onClick={() =>
                      downloadText(`transcript_${id}.json`, JSON.stringify(snapshot, null, 2))}
                    className="rounded-full bg-slate-200 text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-300 border border-slate-300"
                  >
                    Download Transcript (json)
                  </button>
                  <button
                    onClick={() =>
                      downloadText(`transcript_${id}.csv`, transcriptToCSV(snapshot || {}))}
                    className="rounded-full bg-slate-200 text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-300 border border-slate-300"
                  >
                    Download CSV
                  </button>
                  <button
                    onClick={() => downloadJSON(`report_model_${id}.json`, reportModel)}
                    className="rounded-full bg-slate-200 text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-300 border border-slate-300"
                  >
                    Report JSON (model)
                  </button>
                  <button
                    onClick={() => downloadJSON(`report_overrides_${id}.json`, reportOverrides)}
                    className="rounded-full bg-slate-200 text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-300 border border-slate-300"
                  >
                    Report JSON (overrides)
                  </button>
                  <button
                    onClick={() => downloadJSON(`report_final_${id}.json`, reportFinal)}
                    className="rounded-full bg-slate-200 text-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-300 border border-slate-300"
                  >
                    Report JSON (final)
                  </button>
                </div>
              </section>
            </div>
          )
          : null}
      </div>
    </main>
  );
}
