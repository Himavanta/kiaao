import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: {
    entry: [
      "src/index.ts",
      "src/motion/index.ts",
      "src/router/index.ts",
      "src/server/index.ts",
      "src/astro/index.ts",
      "src/astro/client.ts",
      "src/astro/server.ts",
      "src/jsx-runtime/index.ts",
      "src/jsx-dev-runtime/index.ts",
    ],
    dts: {
      tsgo: true,
    },
    platform: "neutral",
    exports: true,
    deps: { skipNodeModulesBundle: true },
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
