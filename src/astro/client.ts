// kiaao — Astro client entry
// Handles client:only — mounts the component in the browser.

import { h, mount } from "../index.ts";

export default async (Component: any, props: any, root: HTMLElement, hydrateType: string) => {
  if (hydrateType === "only") {
    root.innerHTML = "";
    const el = h(Component, props);
    mount(el, root);
  }
};
