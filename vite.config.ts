import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: [
      "src/index.ts",
      "src/jsx-runtime.ts",
      "src/jsx-dev-runtime.ts",
      "src/router.ts",
      "src/server.ts",
      "src/astro/index.ts",
      "src/astro/client.ts",
      "src/astro/server.ts",
    ],
    dts: {
      tsgo: true,
    },
    platform: "neutral",
    exports: true,
    // minify: true,
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {},
});
