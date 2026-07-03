import node from "@astrojs/node";
import { defineConfig } from "astro/config";
import kiaao from "kiaao/astro";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [kiaao()],
});
