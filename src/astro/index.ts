// kiaao — Astro integration entry
//
// Usage in astro.config.ts:
//   import kiaao from "kiaao/astro";
//   export default defineConfig({
//     integrations: [kiaao()],
//   });

export default function createIntegration() {
  return {
    name: "kiaao",
    hooks: {
      "astro:config:setup": ({ addRenderer }: any) => {
        addRenderer({
          name: "kiaao",
          serverEntrypoint: "kiaao/astro/server",
          clientEntrypoint: "kiaao/astro/client",
          jsxImportSource: "kiaao",
        });
      },
    },
  };
}
