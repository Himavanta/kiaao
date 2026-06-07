import { lazy } from "kiaao";
import { createRouter } from "kiaao/router";

export const { RouterView, Link, navigate, currentPath, currentParams } = createRouter([
  {
    path: "/",
    component: lazy(() => import("./components/dashbord")),
  },
  {
    path: "/about",
    component: lazy(() => import("./components/dashbord/nav")),
  },
]);
