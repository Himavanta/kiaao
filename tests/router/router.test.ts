// @vitest-environment happy-dom

import { expect, test, describe, beforeEach } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h } from "../../src/core/index.ts";
import { triggerMount } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";
import { createRouter } from "../../src/router/index.ts";

// Reset location before each test to avoid cross-test pollution from navigate()
setAdapter(browserAdapter);

beforeEach(() => {
  window.history.pushState(null, "", "/");
});

describe("createRouter", () => {
  test("renders matched route component", () => {
    function Home() {
      return h("h1", null, "Home");
    }
    function About() {
      return h("h1", null, "About");
    }

    const { RouterView } = createRouter();

    const el = h(
      "div",
      null,
      h(RouterView, {
        routes: [
          { path: "", component: Home },
          { path: "about", component: About },
        ],
      }),
    );
    if (el.owner) triggerMount(el.owner);
    expect((el.nodes[0] as any).textContent).toBe("Home");
  });

  test("navigate switches route", () => {
    function Home() {
      return h("h1", null, "Home");
    }
    function About() {
      return h("h1", null, "About");
    }

    const { RouterView, navigate } = createRouter();

    const el = h(
      "div",
      null,
      h(RouterView, {
        routes: [
          { path: "", component: Home },
          { path: "about", component: About },
        ],
      }),
    );
    if (el.owner) triggerMount(el.owner);
    expect((el.nodes[0] as any).textContent).toBe("Home");

    navigate("/about");
    expect((el.nodes[0] as any).textContent).toBe("About");
  });

  test("fallback renders for unmatched routes", () => {
    function Home() {
      return h("h1", null, "Home");
    }

    const { RouterView, navigate } = createRouter({ fallback: () => h("div", null, "Custom 404") });

    const el = h("div", null, h(RouterView, { routes: [{ path: "", component: Home }] }));
    if (el.owner) triggerMount(el.owner);
    expect((el.nodes[0] as any).textContent).toBe("Home");

    navigate("/nonexistent");
    expect((el.nodes[0] as any).textContent).toBe("Custom 404");
  });

  test("Link navigates on click", () => {
    function Home() {
      return h("h1", null, "Home");
    }
    function About() {
      return h("h1", null, "About");
    }

    const { RouterView, Link } = createRouter();

    const el = h(
      "div",
      null,
      h(Link, { to: "/about" }, "Go to About"),
      h(RouterView, {
        routes: [
          { path: "", component: Home },
          { path: "about", component: About },
        ],
      }),
    );
    if (el.owner) triggerMount(el.owner);

    expect((el.nodes[0] as any).textContent).toBe("Go to AboutHome");

    // Click the link
    const anchor = (el.nodes[0] as any).querySelector("a")!;
    anchor.click();
    expect((el.nodes[0] as any).textContent).toBe("Go to AboutAbout");
  });
});
