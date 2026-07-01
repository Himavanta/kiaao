import { Link } from "/src/router";
import { cns } from "/src/ui/cns";
import Dropdown from "/src/ui/dropdown";
import Icon from "/src/ui/icon";
import { use, Each, type Signal } from "kiaao";

const cn = cns.bind(use);

function MenuRow({
  icon,
  children,
  href,
  external,
  onClick,
}: {
  icon: string;
  children: any;
  href?: string;
  external?: boolean;
  onClick?: () => void;
}) {
  const classNames =
    "flex items-center gap-3 px-3 py-1.5 mx-1 rounded-md hover:bg-gray-100 cursor-pointer no-underline";

  const inner = (
    <div class="contents">
      <Icon icon={icon} class="w-4 h-4 text-gray-700 shrink-0" />
      <span class="flex-1 text-sm text-gray-700">{children}</span>
      {external && <Icon icon="lineicons:arrow-top-right" class="w-3 h-3 text-gray-300 shrink-0" />}
    </div>
  );

  if (href && !external) {
    return (
      <Link to={href} class={classNames}>
        {inner}
      </Link>
    );
  }
  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" class={classNames}>
        {inner}
      </a>
    );
  }
  return (
    <div onClick={onClick} class={classNames}>
      {inner}
    </div>
  );
}

function MenuSeparator() {
  return <hr class="border-t border-gray-100 my-1" />;
}

// ── 主题悬浮子菜单 ────────────────────────────────

interface ThemeItem {
  label: string;
  value: string;
  icon: string;
}

const themeOptions = use<ThemeItem[]>([
  { label: "亮色", value: "light", icon: "lineicons:sun" },
  { label: "暗色", value: "dark", icon: "material-symbols:dark-mode-outline" },
  { label: "跟随系统", value: "system", icon: "lineicons:laptop" },
]);

/** 共享主题信号，所有 ThemeItemRow 共用 */
const currentTheme = use("light");

function ThemeItemRow({ item }: { item: Signal<ThemeItem> }) {
  const rowClass = cn(currentTheme, item, () => [
    "flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-100",
    { "text-blue-600 hover:text-blue-600": currentTheme() === item().value },
  ]);

  return (
    <div class={rowClass} onClick={() => currentTheme(item().value)}>
      <Icon icon={item().icon} class="w-4 h-4" />
      <span>{item().label}</span>
    </div>
  );
}

function ThemeMenu() {
  return (
    <div class="relative flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 cursor-pointer group mx-1">
      <Icon icon="lineicons:brush" class="w-4 h-4 text-gray-700 shrink-0" />
      <span class="flex-1 text-sm text-gray-700">主题</span>
      <Icon icon="lineicons:chevron-right" class="w-3 h-3 text-gray-300 shrink-0" />

      <div class="absolute right-full top-0 ml-2 min-w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg hidden group-hover:block">
        <Each value={themeOptions} keyed={(v: ThemeItem) => v.value}>
          {ThemeItemRow}
        </Each>
      </div>
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

// ── UserCard ──────────────────────────────────────────

export function UserCard() {
  return (
    <Dropdown trigger={<UserIcon />}>
      {() => (
        <div class="z-50 rounded-xl border border-gray-200 bg-white shadow-lg py-3 flex flex-col w-60">
          <header class="flex items-center justify-between gap-5 pr-3 pl-4 pb-2">
            <div>
              <div class="font-medium text-sm">Dify</div>
              <div class="text-xs text-gray-500">demo@demo.com</div>
            </div>
            <UserIcon />
          </header>

          <MenuRow icon="lineicons:user" href="/i/settings/account">
            账户
          </MenuRow>
          <MenuRow icon="lineicons:cog" href="/i/settings/general">
            设置
          </MenuRow>

          <MenuSeparator />

          <MenuRow icon="lineicons:book" href="https://docs.example.com" external>
            查看帮助文档
          </MenuRow>
          <MenuRow icon="lineicons:headphone" href="https://support.example.com" external>
            支持
          </MenuRow>
          <MenuRow icon="lineicons:shield" href="https://example.com/compliance" external>
            合规
          </MenuRow>

          <MenuSeparator />

          <MenuRow icon="lineicons:map" href="https://roadmap.example.com" external>
            路线图
          </MenuRow>
          <MenuRow icon="lineicons:github" href="https://github.com" external>
            Github
          </MenuRow>
          <MenuRow icon="lineicons:info" href="/about">
            关于
          </MenuRow>

          <MenuSeparator />

          <ThemeMenu />

          <MenuSeparator />

          <MenuRow icon="lineicons:exit" onClick={() => console.log("logout")}>
            <span class="text-red-500">登出</span>
          </MenuRow>
        </div>
      )}
    </Dropdown>
  );
}
