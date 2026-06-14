// kiaao — Astro server renderer

import { renderToString } from "../server/index.ts";
import { isFunction } from "../utils/type-guards.ts";

export default {
  name: "kiaao",
  check(
    Component: unknown,
    _props?: any,
    _slots?: Record<string, string>,
    _metadata?: any,
  ): boolean {
    return isFunction(Component);
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
