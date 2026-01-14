import { mergeFinal, readState, saveReport } from "../../_lib/reporting.js";

export default function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "OPTIONS, PATCH");
    return res.status(200).end();
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id } = req.query || req.params || {};
  const state = readState(id);
  if (!state?.reportModel) {
    return res
      .status(404)
      .json({ ok: false, error: "Report not generated for this interview" });
  }

  const patch = req.body;
  if (!patch || typeof patch !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid overrides payload" });
  }

  const newOverrides = mergeFinal(state.overrides || {}, patch);
  const report_final = mergeFinal(state.reportModel, newOverrides);
  saveReport(id, state.reportModel, newOverrides);

  return res.json({
    ok: true,
    report_model: state.reportModel,
    report_overrides: newOverrides,
    report_final,
    snapshot: state.snapshot || null,
  });
}
