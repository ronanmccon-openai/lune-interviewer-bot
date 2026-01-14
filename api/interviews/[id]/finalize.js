import {
  generateReportWithRetry,
  mergeFinal,
  saveReport,
  saveSnapshot,
} from "../../_lib/reporting.js";

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "OPTIONS, POST");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  const { transcripts } = req.body || {};

  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing interview id" });
  }

  if (!Array.isArray(transcripts) || transcripts.length === 0) {
    return res.status(400).json({ ok: false, error: "Missing transcripts" });
  }

  const snapshot = {
    interview_id: id,
    transcripts,
    saved_at: new Date().toISOString(),
  };
  saveSnapshot(id, snapshot);

  try {
    const reportModel = await generateReportWithRetry({
      interviewId: id,
      transcripts,
    });
    const overrides = {};
    const report_final = mergeFinal(reportModel, overrides);
    saveReport(id, reportModel, overrides);

    return res.json({
      ok: true,
      report_status: "ready",
      report_model: reportModel,
      report_overrides: overrides,
      report_final,
      snapshot,
    });
  } catch (err) {
    console.error("Report generation failed:", err);
    return res.status(500).json({
      ok: false,
      report_status: "failed",
      error: err.message,
    });
  }
}
