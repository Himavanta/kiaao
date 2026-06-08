import { lazy } from "kiaao";
import { createRouter } from "kiaao/router";

export const { RouterView, Link, navigate, currentPath, currentParams } = createRouter();

export const appRoutes = [{ path: "i", component: lazy(() => import("./components/layout")) }];

export const indexRoutes = [
  { path: "apps", component: lazy(() => import("./components/dashbord")) },
  { path: "expore", component: lazy(() => import("./components/expore")) },
];
