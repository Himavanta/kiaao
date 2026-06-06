// kiaao — Astro server renderer
// Handles static SSR rendering for components without client directives.

import { renderToString } from "../server.ts";

export default {
  check(Component: unknown): boolean {
    return typeof Component === "function";
  },
  async renderToStaticMarkup(Component: any, props: any, { slots }: any) {
    const html = renderToString(Component, props, { slots });
    return { html };
  },
};
