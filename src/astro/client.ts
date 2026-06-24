// kiaao — Astro client entry

import { h, createApp } from "../index.ts";

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
    const mergedProps = { ...props, children: slots.default ?? props.children, slots };

    // Use createApp for component mount/unmount lifecycle
    const app = createApp(h(Component, mergedProps));
    app.mount(rootElement);

    rootElement.addEventListener(
      "astro:unmount",
      () => {
        app.unmount();
      },
      { once: true },
    );
  };
};
