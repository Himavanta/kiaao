import { lazy } from "kiaao";
import { createRouter, type Route } from "kiaao/router";

export const { RouterView, Link, navigate, currentPath, currentParams } = createRouter();

export const appRoutes = [
  { path: "", component: () => (navigate("/i/apps"), null) },
  { path: "i", component: lazy(() => import("./components/layout")) },
];

export interface MainNavItem extends Route {
  title: string;
}

export const mainNavs: Array<MainNavItem> = [
  {
    title: "探索",
    path: "expore",
    component: lazy(() => import("./components/expore")),
  },
  {
    title: "工作室",
    path: "apps",
    component: lazy(() => import("./components/dashbord")),
  },
  {
    title: "知识库",
    path: "dataset",
    component: lazy(() => import("./components/dashbord")),
  },
  {
    title: "工具",
    path: "tools",
    component: lazy(() => import("./components/dashbord")),
  },
];

export const indexRoutes = [
  ...mainNavs,
  { path: "plugins", component: lazy(() => import("./components/expore")) },
];
