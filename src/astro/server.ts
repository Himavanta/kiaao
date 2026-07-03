// kiaao — Astro server renderer

import { isFunction } from "../core/index.ts";
import { renderToString } from "../server/index.ts";

export default {
  name: "kiaao",
  supportsAstroStaticSlot: true,

  check(
    Component: unknown,
    _props?: any,
    _slots?: Record<string, string>,
    _metadata?: any,
  ): boolean {
    return isFunction(Component);
  },

  renderHydrationScript(): string {
    // kiaao 不需要额外的全局初始化脚本
    // 预留给未来可能的全局 setup 需求
    return "";
  },

  async renderToStaticMarkup(
    Component: any,
    props: any,
    { default: children, ...slotted }: Record<string, string>,
    metadata?: any,
  ) {
    const slots = { default: children, ...slotted };
    const html = renderToString(Component, props, { slots });

    // 需要水合的组件 → 附加标记用于 client entrypoint
    const willHydrate = !!metadata?.hydrate;
    const attrs = willHydrate ? { "data-kiaao-hydrate": "" } : undefined;

    return { html, attrs };
  },
};
