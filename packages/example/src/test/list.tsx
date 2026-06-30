import { Link, currentPath } from "/src/router";
import { use, Each, type Signal } from "kiaao";

type MenuItem = {
  title: string;
  path: string;
};

const menus = use<MenuItem[]>([
  { title: "探索", path: "/i/expore" },
  { title: "工作室", path: "/i/apps" },
  { title: "知识库", path: "/i/dataset" },
  { title: "工具", path: "/i/tools" },
  { title: "插件", path: "/i/plugins" },
]);

function MenuLink({ item }: { item: Signal<MenuItem> }) {
  const itemPath = use(item, () => item().path);
  const isActive = use(currentPath, () => (currentPath() === item().path ? "aa" : ""));
  const itemTitle = use(item, () => item().title);

  return (
    <Link to={itemPath} class={isActive}>
      {itemTitle}
    </Link>
  );
}

export default function () {
  const pop = () => menus([{ title: "pop", path: `/i/${crypto.randomUUID()}` }, ...menus()]);

  const insert = () => {
    const [a, b, ...c] = menus();
    menus([a, b, { title: "insert", path: `/i/${crypto.randomUUID()}` }, ...c]);
  };

  const push = () => menus([...menus(), { title: "push", path: `/i/${crypto.randomUUID()}` }]);

  return (
    <nav class="h-14 w-full flex border-b border-gray-200 justify-between items-center px-10">
      <aside class="flex gap-4">
        <button onClick={pop}>pop</button>
        <button onClick={insert}>insert</button>
        <button onClick={push}>push</button>
      </aside>
      <section class="flex items-center gap-2">
        <Each value={menus} keyed={(v: MenuItem) => v.path}>
          {({ item }) => <MenuLink item={item as Signal<MenuItem>} />}
        </Each>
      </section>
    </nav>
  );
}
