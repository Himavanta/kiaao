import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: [
    {
      entry: [
        "src/index.ts",
        "src/*/index.ts",
        "src/astro/client.ts",
        "src/astro/server.ts",
        "src/lynx/jsx-runtime.ts",
        "src/lynx/jsx-dev-runtime.ts",
        "src/lynx/plugin/entry-main.ts",
        "src/lynx/plugin/index.ts",
      ],
      dts: true,
      platform: "neutral",
      exports: true,
      deps: { skipNodeModulesBundle: true },
      // minify: true,
    },
    // {
    //   entry: ["src/lynx/plugin/entry-main.ts", "src/lynx/plugin/index.ts"],
    //   dts: true,
    //   platform: "node",
    //   exports: true,
    //   deps: { skipNodeModulesBundle: true },
    //   // minify: true,
    // },
  ],
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    sortImports: {},
  },
});
