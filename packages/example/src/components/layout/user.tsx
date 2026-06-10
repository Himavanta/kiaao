import { define, type Getter } from "kiaao";
import { Link } from "/src/router";
import Icon from "../icon";
import Dropdown from "../../ui/dropdown";

// ── 菜单行组件 ────────────────────────────────────────
const cn = (...ns: any[]) => ns.filter((e) => typeof e === "string").join(" ");

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

// ── 主题悬浮子菜单 ────────────────────────────────────

function ThemeItem() {
  const [theme, setTheme] = define("light");

  type ThemeItem = {
    label: string;
    value: string;
    icon: string;
  };
  const themes: ThemeItem[] = [
    { label: "亮色", value: "light", icon: "lineicons:sun" },
    { label: "暗色", value: "dark", icon: "material-symbols:dark-mode-outline" },
    { label: "跟随系统", value: "system", icon: "lineicons:laptop" },
  ];

  return (
    <div class="relative flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 cursor-pointer group">
      <Icon icon="lineicons:brush" class="w-4 h-4 text-gray-700 shrink-0" />
      <span class="flex-1 text-sm text-gray-700">主题</span>
      <Icon icon="lineicons:chevron-right" class="w-3 h-3 text-gray-300 shrink-0" />

      <div
        each={themes}
        class="absolute right-full top-0 ml-2 min-w-32 rounded-lg border border-gray-200 bg-white py-1 shadow-lg hidden group-hover:block"
      >
        {(item: Getter<ThemeItem>) => (
          <div
            class={theme((v) =>
              cn(
                "flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer",
                item().value === v && "text-blue-600 hover:text-blue-600",
              ),
            )}
            onClick={() => setTheme(item().value)}
          >
            <Icon icon={item((v) => v.icon)} class="w-4 h-4" />
            <span>{item((v) => v.label)}</span>
          </div>
        )}
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

        <ThemeItem />

        <MenuSeparator />

        <MenuRow
          icon="lineicons:exit"
          onClick={() => {
            console.log("logout");
          }}
        >
          <span class="text-red-500">登出</span>
        </MenuRow>
      </div>
    </Dropdown>
  );
}
