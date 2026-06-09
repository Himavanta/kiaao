import { define, derive, type Getter } from "kiaao";
import { Link, currentPath, mainNavs, type MainNavItem } from "/src/router";
import Icon from "/src/icon.tsx";

const [menus] = define<MainNavItem[]>(mainNavs);

const cn = (...ns: any[]) => ns.filter((e) => typeof e === "string").join(" ");

export default function () {
  return (
    <nav class="h-14 w-full flex border-b border-gray-200 justify-between items-center px-10">
      <Icon icon="mdi:home" class="text-blue-500 h-6 w-6" />
      <section each={menus} key={(v: MainNavItem) => v.path} class="flex items-center">
        {(item: Getter<MainNavItem>) => {
          return (
            <Link
              to={item((v) => `/i/${v.path}`)}
              class={derive(() =>
                cn(
                  "px-4 font-bold text-sm leading-8 rounded-xl",
                  currentPath() === `/i/${item().path}` && "bg-white shadow-md text-blue-700",
                ),
              )}
            >
              {item((v) => v.title)}
            </Link>
          );
        }}
      </section>
    </nav>
  );
}
