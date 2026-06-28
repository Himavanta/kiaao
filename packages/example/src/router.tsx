import { lazy } from "kiaao";
import { createRouter, type Route } from "kiaao/router";

export const { RouterView, Link, navigate, currentPath, currentParams } = createRouter();

export const appRoutes = [
  { path: "", component: () => (navigate("/i/apps"), null) },
  { path: "i", component: lazy(() => import("./components/layout")) },
];

export interface MainNavItem extends Route {
  title?: string;
  icon?: string;
}

export const mainNavs: Array<MainNavItem> = [
  {
    title: "探索",
    icon: "tabler:fountain-filled",
    path: "expore",
    component: lazy(() => import("./components/expore")),
  },
  {
    title: "工作室",
    icon: "solar:accumulator-bold-duotone",
    path: "apps",
    component: lazy(() => import("./components/dashbord")),
  },
  {
    title: "知识库",
    icon: "material-symbols:book-5",
    path: "dataset",
    component: lazy(() => import("./test/group-motion.tsx")),
  },
  {
    title: "工具",
    icon: "icon-park-twotone:toolkit",
    path: "tools",
    component: lazy(() => import("./test/motion.tsx")),
  },
];

export const mainNavPlugin: MainNavItem = {
  title: "插件",
  icon: "mingcute:plugin-2-line",
  path: "plugins",
  component: lazy(() => import("./components/expore")),
};

export const indexRoutes: MainNavItem[] = [...mainNavs, mainNavPlugin];
