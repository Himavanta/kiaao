// @ts-check
import { LynxEncodePlugin, LynxTemplatePlugin } from "@lynx-js/template-webpack-plugin";
import { defineConfig } from "@rspack/cli";

export default defineConfig({
  entry: "./src/index.tsx",
  output: {
    publicPath: "/",
  },
  devServer: {
    client: false,
  },
  resolve: {
    extensions: ["...", ".ts", ".tsx", ".jsx"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              transform: {
                react: {
                  runtime: "automatic",
                  importSource: "kiaao/lynx",
                },
              },
            },
          },
        },
        type: "javascript/auto",
      },
      {
        test: /\.css$/,
        type: "css",
      },
    ],
  },
  plugins: [
    new LynxEncodePlugin(),
    new LynxTemplatePlugin({
      ...LynxTemplatePlugin.defaultOptions,
      filename: "main.lynx.bundle",
      intermediate: "main",
    }),
    {
      apply(/** @type {import("@rspack/core").Compiler} */ compiler) {
        const { RuntimeGlobals } = compiler.webpack;
        const PLUGIN_NAME = "MarkMainThreadPlugin";

        compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (/** @type {any} */ compilation) => {
          compilation.hooks.additionalTreeRuntimeRequirements.tap(
            PLUGIN_NAME,
            (/** @type {any} */ chunk, /** @type {Set<string>} */ set) => {
              set.add(RuntimeGlobals.startup);
              set.add(RuntimeGlobals.require);
            },
          );

          compilation.hooks.processAssets.tap(PLUGIN_NAME, () => {
            const asset = compilation.getAsset("main.js");
            if (asset) {
              compilation.updateAsset(asset.name, asset.source, {
                ...asset.info,
                "lynx:main-thread": true,
              });
            }
          });
        });

        compiler.hooks.done.tap(PLUGIN_NAME, () => {
          console.log("Lynx Bundle: /main.lynx.bundle");
          // console.log("Lynx Bundle: /main.lynx.bundle?fullscreen=true");
        });
      },
    },
  ],
  experiments: {
    css: true,
  },
});
