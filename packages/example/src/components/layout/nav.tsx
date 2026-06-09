import { define, derive, type Getter } from "kiaao";
import { Link, currentPath, mainNavs, type MainNavItem } from "/src/router";
import Icon from "../icon";

const [menus] = define<MainNavItem[]>(mainNavs);

const cn = (...ns: any[]) => ns.filter((e) => typeof e === "string").join(" ");

export default function () {
  return (
    <nav class="h-14 w-full flex border-b border-gray-200 justify-between items-center px-10">
      <section each={menus} key={(v: MainNavItem) => v.path} class="flex items-center gap-4">
        {(item: Getter<MainNavItem>) => {
          return (
            <Link
              to={item((v) => `/i/${v.path}`)}
              class={derive(() =>
                cn(
                  "px-3 font-bold text-sm leading-8 rounded-xl flex items-center gap-2 text-gray-600 hover:bg-gray-200",
                  currentPath() === `/i/${item().path}` &&
                    "bg-white shadow-md text-blue-700 hover:bg-white",
                ),
              )}
            >
              <Icon
                class={derive(() =>
                  cn("h-4 w-4", currentPath() === `/i/${item().path}` && " text-blue-700"),
                )}
                icon={item((v) => v.icon)}
              />
              <span
                class={derive(() => cn(currentPath() === `/i/${item().path}` && " text-blue-700"))}
              >
                {item((v) => v.title)}
              </span>
            </Link>
          );
        }}
      </section>
    </nav>
  );
}
