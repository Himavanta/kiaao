import { pluginQRCode } from "@lynx-js/qrcode-rsbuild-plugin";
import { defineConfig } from "@lynx-js/rspeedy";
import { LynxEncodePlugin, LynxTemplatePlugin } from "@lynx-js/template-webpack-plugin";
import { pluginTypeCheck } from "@rsbuild/plugin-type-check";

export default defineConfig({
  plugins: [
    pluginQRCode({
      schema(url) {
        return `${url}?fullscreen=true`;
      },
    }),
    pluginTypeCheck(),
  ],
  tools: {
    swc(config: any) {
      config.jsc = config.jsc ?? {};
      config.jsc.transform = config.jsc.transform ?? {};
      config.jsc.transform.react = {
        runtime: "automatic",
        importSource: "kiaao/lynx",
      };
    },
    rspack: {
      plugins: [
        new LynxEncodePlugin(),
        new LynxTemplatePlugin({
          ...LynxTemplatePlugin.defaultOptions,
          filename: "main.lynx.bundle",
          intermediate: "main",
          dsl: "tt",
        }),
        {
          apply(compiler: any): void {
            compiler.hooks.thisCompilation.tap("MarkMainThreadPlugin", (compilation: any) => {
              compilation.hooks.processAssets.tap("MarkMainThreadPlugin", () => {
                const asset = compilation.getAsset("main.js");
                if (asset) {
                  compilation.updateAsset(asset.name, asset.source, {
                    ...asset.info,
                    "lynx:main-thread": true,
                  });
                }
              });
            });
          },
        },
      ],
    },
  },
});
