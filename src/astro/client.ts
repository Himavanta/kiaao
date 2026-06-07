import { h, mount } from "../index.ts";

export default (rootElement: HTMLElement) => {
  return async (Component: any, props: any, slots: any, { client }: { client: string }) => {
    // 第一阶段仅完整支持 client:only，其余策略降级并警告
    if (client !== "only") {
      console.warn(
        `[kiaao] Hydration "${client}" is not yet supported. Falling back to client:only behavior.`,
      );
    }

    // 清空 Astro 可能生成的静态占位，并完整挂载
    rootElement.innerHTML = "";
    const el = h(Component, props);
    mount(el, rootElement);
  };
};
