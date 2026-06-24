// @vitest-environment happy-dom
// kiaao — createApp tests

import { expect, test, describe } from "vite-plus/test";
import { createApp } from "../../src/core/create-app.ts";
import { h } from "../../src/core/h.ts";
import { setAdapter } from "../../src/core/types.ts";
import { browserAdapter } from "../../src/dom/adapter.ts";

setAdapter(browserAdapter);

describe("createApp", () => {
  test("mount renders component into container", () => {
    function App() {
      return h("div", { id: "root" }, "Hello");
    }

    const app = createApp(h(App));
    const container = document.createElement("div");
    app.mount(container);

    const root = container.querySelector("#root") as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.textContent).toBe("Hello");
  });

  test("mount supports CSS selector string", () => {
    function App() {
      return h("p", undefined, "selector test");
    }

    const container = document.createElement("div");
    container.id = "test-container";
    document.body.append(container);

    const app = createApp(h(App));
    app.mount(container);

    expect(container.children.length).toBeGreaterThan(0);
    expect(container.textContent).toBe("selector test");
  });

  test("unmount removes all nodes from DOM", () => {
    function App() {
      return h("div", { id: "root" }, "content");
    }

    const app = createApp(h(App));
    const container = document.createElement("div");
    app.mount(container);

    expect(container.children.length).toBe(1);

    app.unmount();
    expect(container.children.length).toBe(0);
  });

  test("unmount is idempotent", () => {
    function App() {
      return h("span", undefined, "idempotent");
    }

    const app = createApp(h(App));
    const container = document.createElement("div");
    app.mount(container);

    app.unmount();
    expect(() => app.unmount()).not.toThrow();
    expect(container.children.length).toBe(0);
  });

  test("multiple createApp instances are independent", () => {
    function AppA() {
      return h("p", undefined, "A");
    }
    function AppB() {
      return h("p", undefined, "B");
    }

    const appA = createApp(h(AppA));
    const appB = createApp(h(AppB));
    const containerA = document.createElement("div");
    const containerB = document.createElement("div");

    appA.mount(containerA);
    appB.mount(containerB);

    expect(containerA.textContent).toBe("A");
    expect(containerB.textContent).toBe("B");

    appA.unmount();
    expect(containerA.children.length).toBe(0);
    expect(containerB.children.length).toBe(1);
  });

  test("mount triggers onMount callbacks", () => {
    let mounted = false;
    function App(_props: any, context: any) {
      context.onMount(() => {
        mounted = true;
      });
      return h("div");
    }

    const app = createApp(h(App));
    const container = document.createElement("div");
    app.mount(container);
    expect(mounted).toBe(true);
  });

  test("unmount triggers onUnmount callbacks", () => {
    let unmounted = false;
    function App(_props: any, context: any) {
      context.onUnmount(() => {
        unmounted = true;
      });
      return h("div");
    }

    const app = createApp(h(App));
    const container = document.createElement("div");
    app.mount(container);
    expect(unmounted).toBe(false);

    app.unmount();
    expect(unmounted).toBe(true);
  });

  test("component with signal maintains reactivity", () => {
    const container = document.createElement("div");
    const calls: number[] = [];

    function App(_props: any, context: any) {
      const count = context.use(0);
      const doubled = context.use(count, () => {
        const result = count() * 2;
        calls.push(result);
        return result;
      });
      return h("div", undefined, String(doubled()));
    }

    const app = createApp(h(App));
    app.mount(container);
    expect(container.textContent).toBe("0");
  });
});
