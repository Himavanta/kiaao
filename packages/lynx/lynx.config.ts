import { pluginQRCode } from "@lynx-js/qrcode-rsbuild-plugin";
import { defineConfig } from "@lynx-js/rspeedy";
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
});
