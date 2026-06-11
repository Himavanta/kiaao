import { use, type Getter } from "kiaao";
import { Link, currentPath, mainNavs, mainNavPlugin, type MainNavItem } from "/src/router";
import Icon from "../icon";
import { UserCard } from "./user";

const [menus] = use<MainNavItem[]>(mainNavs);
const [navPlugin] = use(mainNavPlugin);

const cn = (...ns: any[]) => ns.filter((e) => typeof e === "string").join(" ");

function Logo() {
  return (
    <div class="flex items-center gap-1">
      <Icon class="text-blue-700 h-8 w-8" icon="lineicons:hashnode" />
      <span class="font-medium">OpenDifyWeb</span>
    </div>
  );
}

function MenuItem({ item }: { item: Getter<MainNavItem> }) {
  const [itemPath] = use(item, () => `/i/${item().path}`);
  const [linkClass] = use(currentPath, item, () =>
    cn(
      "px-3 font-medium text-sm leading-8 rounded-xl flex items-center gap-2 text-gray-600 hover:bg-gray-200",
      currentPath() === `/i/${item().path}` && "bg-white shadow-md text-blue-700 hover:bg-white",
    ),
  );
  const [iconClass] = use(currentPath, item, () =>
    cn("h-4 w-4", currentPath() === `/i/${item().path}` && " text-blue-700"),
  );
  const [itemIcon] = use(item, () => item().icon);
  const [spanClass] = use(currentPath, item, () =>
    cn(currentPath() === `/i/${item().path}` && " text-blue-700"),
  );
  const [itemTitle] = use(item, () => item().title);

  return (
    <Link to={itemPath} class={linkClass}>
      <Icon class={iconClass} icon={itemIcon} />
      <span class={spanClass}>{itemTitle}</span>
    </Link>
  );
}

export default function () {
  return (
    <nav class="h-14 w-full flex border-b border-gray-200 justify-between items-center px-4">
      <Logo />

      <section each={menus} key={(v: MainNavItem) => v.path} class="flex items-center gap-4 ">
        {(item: Getter<MainNavItem>) => <MenuItem item={item} />}
      </section>

      <section class="flex items-center gap-4">
        <MenuItem item={navPlugin} />
        <UserCard />
      </section>
    </nav>
  );
}
