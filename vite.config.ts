import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const developmentCspPlugin = {
  name: "holo-now-development-csp",
  apply: "serve" as const,
  transformIndexHtml(html: string) {
    const replacements = [
      ["script-src 'self';", "script-src 'self' 'unsafe-inline';"],
      ["style-src 'self';", "style-src 'self' 'unsafe-inline';"],
      [
        "style-src-elem 'self';",
        "style-src-elem 'self' 'unsafe-inline';",
      ],
    ] as const;

    return replacements.reduce((current, [required, development]) => {
      if (!current.includes(required)) {
        throw new Error(`Development CSP source is missing: ${required}`);
      }
      return current.replace(required, development);
    }, html);
  },
};

export default defineConfig({
  base: "./",
  plugins: [developmentCspPlugin, react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 4174,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
