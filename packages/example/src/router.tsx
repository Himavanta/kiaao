import { lazy, type ComponentFunction } from "kiaao";
import { createRouter } from "kiaao/router";

// ── 导航数据（与路由解耦，通过 path 关联）─────────────

export interface MainNavItem {
  title?: string;
  icon?: string;
  path: string;
}

export const mainNavs: MainNavItem[] = [
  { title: "探索", icon: "tabler:fountain-filled", path: "expore" },
  { title: "工作室", icon: "solar:accumulator-bold-duotone", path: "apps" },
  { title: "知识库", icon: "material-symbols:book-5", path: "dataset" },
  { title: "工具", icon: "icon-park-twotone:toolkit", path: "tools" },
];

export const bottomNav: MainNavItem = {
  title: "插件",
  icon: "mingcute:plugin-2-line",
  path: "plugins",
};

export const { Router, Link, push, current, search } = createRouter({
  onRoute(to) {
    if (to === "/") return "/i/apps";
  },
  routes: {
    "": ({ RouterView }: { RouterView: ComponentFunction }) => (
      <RouterView>{() => <div>NotFound</div>}</RouterView>
    ),
    i: {
      "": lazy(() => import("./components/layout")),
      expore: lazy(() => import("./components/expore")),
      apps: lazy(() => import("./components/dashbord")),
      dataset: lazy(() => import("./test/group-motion.tsx")),
      tools: lazy(() => import("./test/motion.tsx")),
      plugins: lazy(() => import("./components/expore")),
    },
  },
});
