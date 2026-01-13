import { Routes, Route } from "react-router-dom";
import App from "./App";
import ReportPage from "./ReportPage";

export default function Root() {
  return (
    <Routes>
      <Route path="/" element={<App />} />
      <Route path="/report/:id" element={<ReportPage />} />
    </Routes>
  );
}
