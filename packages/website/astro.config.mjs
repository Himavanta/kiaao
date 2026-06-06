// @ts-check
import { defineConfig } from "astro/config";
import kiaao from "kiaao/astro";

// https://astro.build/config
export default defineConfig({
  integrations: [kiaao()],
});
