import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

const config = defineConfig(({ mode }) => {
  const sharedPlugins = [
    viteTsConfigPaths({ projects: ["./tsconfig.json"] }),
    viteReact(),
  ];

  if (mode === "test") {
    return { plugins: sharedPlugins };
  }

  return {
    plugins: [sharedPlugins[0], tanstackStart(), nitro(), sharedPlugins[1]],
    build: {
      manifest: true,
      chunkSizeWarningLimit: 537,
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,
          manualChunks(id) {
            const normalizedId = id.replaceAll("\\", "/");
            const isRadixOverlayDependency =
              (normalizedId.includes("/node_modules/@radix-ui/") &&
                !normalizedId.includes("/node_modules/@radix-ui/react-slot/") &&
                !normalizedId.includes(
                  "/node_modules/@radix-ui/react-compose-refs/",
                )) ||
              normalizedId.includes("/node_modules/@floating-ui/") ||
              /\/node_modules\/(?:aria-hidden|react-remove-scroll(?:-bar)?|react-style-singleton|use-callback-ref|use-sidecar)\//.test(
                normalizedId,
              );
            return isRadixOverlayDependency ? "radix-overlays" : undefined;
          },
        },
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
  };
});

export default config;
