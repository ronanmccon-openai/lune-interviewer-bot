import { getReport, getSnapshot, mergeFinal } from "../../_lib/reporting.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query || req.params || {};
  return handleReport(id, res);
}

async function handleReport(id, res) {
  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing interview id" });
  }

  const snapshot = await getSnapshot(id);
  if (!snapshot) {
    return res.status(404).json({
      ok: false,
      report_status: "pending",
      error: "Snapshot not found",
    });
  }

  const reportState = await getReport(id);

  if (!reportState?.reportModel) {
    return res.json({
      ok: true,
      report_status: "pending",
      snapshot,
    });
  }

  const report_final = mergeFinal(reportState.reportModel, reportState.overrides || {});
  return res.json({
    ok: true,
    report_status: "ready",
    report_model: reportState.reportModel,
    report_overrides: reportState.overrides || {},
    report_final,
    snapshot,
  });
}
