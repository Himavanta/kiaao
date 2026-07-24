import { lazy, type ComponentFunction } from "kiaao";
import { createRouter } from "kiaao/router";

const { Router, Link, push, current, search } = createRouter({
  routes: {
    "": ({ RouterView }: { RouterView: ComponentFunction }) => <RouterView />,
    i: {
      "": lazy(() => import("./components/layout")),
      expore: lazy(() => import("./components/expore")),
      apps: lazy(() => import("./components/dashbord")),
      dataset: lazy(() => import("./test/group-motion.tsx")),
      tools: lazy(() => import("./test/motion.tsx")),
      plugins: lazy(() => import("./components/expore")),
    },
  },
  onRoute: (to) => {
    if (to === "/") return "/i/apps";
  },
});

export { Router, Link, push, current, search };

export interface MainNavItem {
  title?: string;
  icon?: string;
  path: string;
  component: ReturnType<typeof lazy>;
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
