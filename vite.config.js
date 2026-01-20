import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";

const path = fileURLToPath(import.meta.url);
const repoRoot = dirname(path);

export default {
  root: join(repoRoot, "client"),
  plugins: [react()],
  server: {
    fs: {
      allow: [repoRoot],
    },
  },
};
