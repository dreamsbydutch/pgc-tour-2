import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import viteTsConfigPaths from "vite-tsconfig-paths";

const config = defineConfig({
  plugins: [
    // this is the plugin that enables path aliases
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart(),
    nitro(),
    viteReact(),
  ],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === "UNUSED_EXTERNAL_IMPORT" &&
          typeof warning.id === "string" &&
          warning.id.includes("node_modules/@tanstack/")
        ) {
          return;
        }

        warn(warning);
      },
    },
  },
});

export default config;
