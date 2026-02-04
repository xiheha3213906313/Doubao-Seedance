import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const backendUrl = process.env.VITE_BACKEND_URL || "http://localhost:3000";

function agentationInject(): Plugin {
  return {
    name: "agentation-inject",
    apply: "serve",
    transformIndexHtml(html: string) {
      if (html.includes('src="/src/agentation-entry.tsx"')) return html;
      return html.replace(
        "</body>",
        '  <script type="module" src="/src/agentation-entry.tsx"></script>\n</body>'
      );
    }
  };
}

export default defineConfig({
  plugins: [react(), agentationInject()],
  server: {
    proxy: {
      "/api": backendUrl,
      "/data-files": backendUrl,
      "/task-files": backendUrl
    }
  }
});
