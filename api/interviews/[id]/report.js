import { mergeFinal, readState } from "../../_lib/reporting.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query;
  const state = readState(id);

  if (!state?.snapshot) {
    return res
      .status(404)
      .json({ ok: false, report_status: "pending", error: "Snapshot not found" });
  }

  if (!state.reportModel) {
    return res.json({
      ok: true,
      report_status: "pending",
      snapshot: state.snapshot,
    });
  }

  const report_final = mergeFinal(state.reportModel, state.overrides || {});
  return res.json({
    ok: true,
    report_status: "ready",
    report_model: state.reportModel,
    report_overrides: state.overrides || {},
    report_final,
    snapshot: state.snapshot,
  });
}
