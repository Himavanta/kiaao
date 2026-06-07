import { lazy } from "kiaao";
import { createRouter } from "kiaao/router";

export const { RouterView, Link, navigate, currentPath, currentParams } = createRouter([
  {
    path: "/apps",
    component: lazy(() => import("./components/dashbord")),
  },
  {
    path: "/expore",
    component: lazy(() => import("./components/dashbord/nav")),
  },
]);
