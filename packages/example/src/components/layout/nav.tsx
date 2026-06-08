import { define, derive, type Getter } from "kiaao";
import { Link, currentPath, mainNavs, type MainNavItem } from "/src/router";

const [menus] = define<MainNavItem[]>(mainNavs);

const cn = (...ns: any[]) => ns.filter((e) => typeof e === "string").join(" ");

export default function () {
  return (
    <nav class="h-14 w-full flex border-b border-gray-200 justify-between items-center px-10">
      <section each={menus} key={(v: MainNavItem) => v.path} class="flex items-center">
        {(item: Getter<MainNavItem>) => {
          return (
            <Link
              to={item((v) => `/i/${v.path}`)}
              class={derive(() =>
                cn(
                  "px-4 font-bold text-sm leading-8 rounded-xl",
                  currentPath() === `/i/${item().path}` && "bg-amber-500",
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
