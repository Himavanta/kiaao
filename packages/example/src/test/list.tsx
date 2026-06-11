import { use, type Getter } from "kiaao";
import { Link, currentPath } from "/src/router";

type MenuItem = {
  title: string;
  path: string;
};

const [menus, setMenus] = use<MenuItem[]>([
  { title: "探索", path: "/i/expore" },
  { title: "工作室", path: "/i/apps" },
  { title: "知识库", path: "/i/dataset" },
  { title: "工具", path: "/i/tools" },
  { title: "插件", path: "/i/plugins" },
]);

function MenuLink({ item }: { item: Getter<MenuItem> }) {
  const [itemPath] = use(item, () => item().path);
  const [isActive] = use(currentPath, () => (currentPath() === item().path ? "aa" : ""));
  const [itemTitle] = use(item, () => item().title);

  return (
    <Link to={itemPath} class={isActive}>
      {itemTitle}
    </Link>
  );
}

export default function () {
  const pop = () => setMenus((v) => [{ title: "pop", path: `/i/${crypto.randomUUID()}` }, ...v]);

  const insert = () =>
    setMenus((v) => {
      const [a, b, ...c] = v;
      return [a, b, { title: "insert", path: `/i/${crypto.randomUUID()}` }, ...c];
    });

  const push = () => setMenus((v) => [...v, { title: "push", path: `/i/${crypto.randomUUID()}` }]);

  return (
    <nav class="h-14 w-full flex border-b border-gray-200 justify-between items-center px-10">
      <aside class="flex gap-4">
        <button onClick={pop}>pop</button>
        <button onClick={insert}>insert</button>
        <button onClick={push}>push</button>
      </aside>
      <section each={menus} key={(v: MenuItem) => v.path} class="flex items-center gap-2">
        {(item: Getter<MenuItem>) => <MenuLink item={item} />}
      </section>
    </nav>
  );
}
