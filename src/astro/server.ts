// kiaao — Astro server renderer

import { renderToString } from "../server.ts";

export default {
  name: "kiaao",
  check(
    Component: unknown,
    _props?: any,
    _slots?: Record<string, string>,
    _metadata?: any,
  ): boolean {
    return typeof Component === "function";
  },
  async renderToStaticMarkup(
    Component: any,
    props: any,
    { default: children, ...slotted }: Record<string, string>,
    _metadata?: any,
  ) {
    const slots = { default: children, ...slotted };
    const html = renderToString(Component, props, { slots });
    return { html };
  },
};
