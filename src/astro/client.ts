// kiaao — Astro client entry

import { h, mount, unmount } from "../index.ts";

export default (rootElement: HTMLElement) => {
  return async (
    Component: any,
    props: any,
    slots: Record<string, string>,
    { client }: { client: string },
  ) => {
    if (client !== "only") {
      console.warn(
        `[kiaao] Hydration "${client}" is not yet supported. Falling back to client:only behavior.`,
      );
    }

    rootElement.innerHTML = "";
    const mergedProps = { ...props, children: slots.default ?? props.children };
    const el = h(Component, mergedProps);
    mount(el, rootElement);

    rootElement.addEventListener(
      "astro:unmount",
      () => {
        unmount(el);
      },
      { once: true },
    );
  };
};
