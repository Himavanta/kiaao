import { define, derive, type Getter } from "kiaao";
import { Link, currentPath, mainNavs, mainNavPlugin, type MainNavItem } from "/src/router";
import Icon from "../icon";
import Dropdown from "../../ui/dropdown";

const [menus] = define<MainNavItem[]>(mainNavs);
const [navPlugin] = define(mainNavPlugin);

const cn = (...ns: any[]) => ns.filter((e) => typeof e === "string").join(" ");

function Logo() {
  return (
    <div class="flex items-center gap-1">
      <Icon class="text-blue-700 h-8 w-8" icon={() => "lineicons:hashnode"} />
      <span class="font-medium">OpenDifyWeb</span>
    </div>
  );
}

function UserIcon({ onClick }: { onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      class="bg-blue-600 text-white grid place-items-center justify-center w-9 h-9 rounded-full cursor-pointer"
    >
      <span>D</span>
    </div>
  );
}

function UserCard() {
  return (
    <Dropdown trigger={<UserIcon />}>
      <div class="z-50 rounded-xl border border-gray-200 bg-white shadow-lg py-3 ">
        <header class="flex items-center justify-between gap-5 pr-3 pl-4">
          <div>
            <div class="font-medium text-sm">Dify</div>
            <div class="text-xs text-gray-500">demo@demo.com</div>
          </div>
          <UserIcon />
        </header>
        <nav class="py-1 px-2">hhhh</nav>
      </div>
    </Dropdown>
  );
}

function MenuItem({ item }: { item: Getter<MainNavItem> }) {
  return (
    <Link
      to={item((v) => `/i/${v.path}`)}
      class={derive(() =>
        cn(
          "px-3 font-medium text-sm leading-8 rounded-xl flex items-center gap-2 text-gray-600 hover:bg-gray-200",
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
      <span class={derive(() => cn(currentPath() === `/i/${item().path}` && " text-blue-700"))}>
        {item((v) => v.title)}
      </span>
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
