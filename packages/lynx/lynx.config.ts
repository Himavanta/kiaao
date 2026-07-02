import { pluginQRCode } from "@lynx-js/qrcode-rsbuild-plugin";
import { defineConfig } from "@lynx-js/rspeedy";
import { LynxEncodePlugin, LynxTemplatePlugin } from "@lynx-js/template-webpack-plugin";
import { pluginTypeCheck } from "@rsbuild/plugin-type-check";
import { pluginKiaaoLynx } from "kiaao/lynx/plugin";

export default defineConfig({
  plugins: [
    pluginQRCode({
      schema(url) {
        return `${url}?fullscreen=true`;
      },
    }),
    pluginTypeCheck(),
    pluginKiaaoLynx(),
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
        new LynxTemplatePlugin({
          ...LynxTemplatePlugin.defaultOptions,
          dsl: "tt",
          filename: "main.lynx.bundle",
          intermediate: ".rspeedy/main",
        }),
        new LynxEncodePlugin(),
      ],
    },
  },
});
