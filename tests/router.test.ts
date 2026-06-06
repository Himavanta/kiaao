// @vitest-environment happy-dom

import { expect, test, describe, beforeEach } from "vite-plus/test";
import { h } from "../src/index.ts";
import { createRouter } from "../src/router.ts";

// Reset location before each test to avoid cross-test pollution from navigate()
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

    const { RouterView } = createRouter([
      { path: "/", component: Home },
      { path: "/about", component: About },
    ]);

    const el = h("div", null, h(RouterView));
    expect(el.textContent).toBe("Home");
  });

  test("navigate switches route", () => {
    function Home() {
      return h("h1", null, "Home");
    }
    function About() {
      return h("h1", null, "About");
    }

    const { RouterView, navigate } = createRouter([
      { path: "/", component: Home },
      { path: "/about", component: About },
    ]);

    const el = h("div", null, h(RouterView));
    expect(el.textContent).toBe("Home");

    navigate("/about");
    expect(el.textContent).toBe("About");
  });

  test("route params are passed as props", () => {
    function User(props: { id: string }) {
      return h("p", null, `User ${props.id}`);
    }

    const { RouterView, navigate } = createRouter([{ path: "/users/:id", component: User }]);

    const el = h("div", null, h(RouterView));

    navigate("/users/42");
    expect(el.textContent).toBe("User 42");
  });

  test("fallback renders for unmatched routes", () => {
    function Home() {
      return h("h1", null, "Home");
    }

    const { RouterView, navigate } = createRouter([{ path: "/", component: Home }], {
      fallback: () => h("div", null, "Custom 404"),
    });

    const el = h("div", null, h(RouterView));
    expect(el.textContent).toBe("Home");

    navigate("/nonexistent");
    expect(el.textContent).toBe("Custom 404");
  });

  test("Link navigates on click", () => {
    function Home() {
      return h("h1", null, "Home");
    }
    function About() {
      return h("h1", null, "About");
    }

    const { RouterView, Link } = createRouter([
      { path: "/", component: Home },
      { path: "/about", component: About },
    ]);

    const el = h("div", null, h(Link, { to: "/about" }, "Go to About"), h(RouterView));

    expect(el.textContent).toBe("Go to AboutHome");

    // Click the link
    const anchor = el.querySelector("a")!;
    anchor.click();
    expect(el.textContent).toBe("Go to AboutAbout");
  });
});
