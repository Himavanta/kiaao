import { defineConfig, type ViteUserConfigExport } from "vite-plus";

export default defineConfig({
  pack: {
    dts: {
      tsgo: true,
    },
    exports: true,
  },
} as unknown as ViteUserConfigExport);
