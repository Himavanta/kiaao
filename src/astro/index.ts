// kiaao — Astro integration entry

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
