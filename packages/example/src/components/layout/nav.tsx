import { Link, current, mainNavs, mainNavPlugin, type MainNavItem } from "/src/router";
import { cns } from "/src/ui/cns";
import Icon from "/src/ui/icon";
import { use, Each, type Signal } from "kiaao";

import { UserCard } from "./user";

const cn = cns.bind(use);

const menus = use<MainNavItem[]>(mainNavs);
const navPlugin = use(mainNavPlugin);

function Logo() {
  return (
    <div class="flex items-center gap-1">
      <Icon class="text-blue-700 h-8 w-8" icon="lineicons:hashnode" />
      <span class="font-medium">OpenDifyWeb</span>
    </div>
  );
}

function MenuItem({ item }: { item: Signal<MainNavItem> }) {
  const itemTitle = use(item, () => item().title);
  const itemIcon = use(item, () => item().icon);
  const itemPath = use(item, () => `/i/${item().path}`);

  const linkClass = cn(current, item, () => [
    "px-3 font-medium text-sm leading-8 rounded-xl flex items-center gap-2 text-gray-600 hover:bg-gray-200",
    { "bg-white shadow-md text-blue-700 hover:bg-white": current() === `/i/${item().path}` },
  ]);
  const iconClass = cn(current, item, () => [
    "h-4 w-4",
    { "text-blue-700": current() === `/i/${item().path}` },
  ]);
  const spanClass = cn(current, item, () => ({
    "text-blue-700": current() === `/i/${item().path}`,
  }));

  return (
    <Link to={itemPath} class={linkClass}>
      <Icon class={iconClass} icon={itemIcon} />
      <span class={spanClass}>{itemTitle}</span>
    </Link>
  );
}

export default function () {
  return (
    <nav class="h-14 w-full flex border-b border-gray-200 justify-between items-center px-4 z-1">
      <Logo />

      <section class="flex items-center gap-4">
        <Each value={menus} keyed={(v: MainNavItem) => v.path}>
          {MenuItem}
        </Each>
      </section>

      <section class="flex items-center gap-4">
        <MenuItem item={navPlugin as unknown as Signal<MainNavItem>} />
        <UserCard />
      </section>
    </nav>
  );
}
