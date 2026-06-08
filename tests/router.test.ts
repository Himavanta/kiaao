// @vitest-environment happy-dom

import { expect, test, describe, beforeEach } from "vite-plus/test";
import { h } from "../src/index.ts";
import { createRouter } from "../src/router/index.ts";

// Reset location before each test to avoid cross-test pollution from navigate()
beforeEach(() => {
  window.history.pushState(null, "", "/");
});

const routes = [
  { path: "", component: () => h("h1", null, "Home") },
  { path: "about", component: () => h("h1", null, "About") },
];

describe("createRouter", () => {
  test("renders matched route component", () => {
    const { RouterView } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));
    expect(el.textContent).toBe("Home");
  });

  test("navigate switches route", () => {
    const { RouterView, navigate } = createRouter();
    const el = h("div", null, h(RouterView, { routes }));
    expect(el.textContent).toBe("Home");

    navigate("/about");
    expect(el.textContent).toBe("About");
  });

  test("route params via query string", () => {
    function User() {
      const id = new URLSearchParams(window.location.search).get("id");
      return h("p", null, `User ${id ?? "unknown"}`);
    }

    const { RouterView } = createRouter();
    const el = h("div", null, h(RouterView, { routes: [{ path: "", component: User }] }));
    expect(el.textContent).toBe("User unknown");
  });

  test("fallback renders for unmatched routes", () => {
    const { RouterView, navigate } = createRouter({ fallback: () => h("div", null, "Custom 404") });
    const el = h("div", null, h(RouterView, { routes }));
    expect(el.textContent).toBe("Home");

    navigate("/nonexistent");
    expect(el.textContent).toBe("Custom 404");
  });

  test("Link navigates on click", () => {
    const { RouterView, Link } = createRouter();
    const el = h("div", null, h(Link, { to: "/about" }, "Go to About"), h(RouterView, { routes }));

    expect(el.textContent).toBe("Go to AboutHome");

    const anchor = el.querySelector("a")!;
    anchor.click();
    expect(el.textContent).toBe("Go to AboutAbout");
  });

  test("RouterView with base renders nested layout", () => {
    const dashboardRoutes = [
      { path: "", component: () => h("h2", null, "Dashboard") },
      { path: "users", component: () => h("h2", null, "Users") },
    ];

    function Layout() {
      return h("main", null, h(RouterView, { base: "/dashboard", routes: dashboardRoutes }));
    }

    const { RouterView, navigate } = createRouter();

    navigate("/dashboard");
    const el = h(
      "div",
      null,
      h(RouterView, { routes: [{ path: "dashboard", component: Layout }] }),
    );
    expect(el.textContent).toBe("Dashboard");

    navigate("/dashboard/users");
    expect(el.textContent).toBe("Users");
  });
});
