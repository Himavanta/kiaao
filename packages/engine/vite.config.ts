import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    // 开发期 exports 直接指向 src（零构建）；发布前改回 dist 并开启 exports: true
    entry: ["src/index.ts"],
    dts: true,
  },
});
