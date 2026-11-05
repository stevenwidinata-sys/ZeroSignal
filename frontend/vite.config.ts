import { defineConfig, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      // The character catalog lives in ../shared so the backend reads the
      // exact same file.
      allow: [searchForWorkspaceRoot(process.cwd()), "../shared"],
    },
  },
});
