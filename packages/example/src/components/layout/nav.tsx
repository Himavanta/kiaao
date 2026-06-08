import { define, type Getter } from "kiaao";
import { Link, currentPath } from "/src/router";

type MenuItem = {
  title: string;
  path: string;
};

const [menus, setMenus] = define<MenuItem[]>([
  {
    title: "探索",
    path: "/i/expore",
  },
  {
    title: "工作室",
    path: "/i/apps",
  },
  {
    title: "知识库",
    path: "/i/dataset",
  },
  {
    title: "工具",
    path: "/i/tools",
  },
  {
    title: "插件",
    path: "/i/plugins",
  },
]);

export default function () {
  const pop = () =>
    setMenus((v) => [
      {
        title: "pop",
        path: `/i/${crypto.randomUUID()}`,
      },
      ...v,
    ]);

  const insert = () =>
    setMenus((v) => {
      const [a, b, ...c] = v;
      return [
        a,
        b,
        {
          title: "insert",
          path: `/i/${crypto.randomUUID()}`,
        },
        ...c,
      ];
    });

  const push = () =>
    setMenus((v) => [
      ...v,
      {
        title: "push",
        path: `/i/${crypto.randomUUID()}`,
      },
    ]);

  return (
    <nav class="h-10 w-full bg-amber-600 flex justify-between items-center px-10">
      <aside class="flex gap-4">
        <button onClick={pop}>pop</button>
        <button onClick={insert}>insert</button>
        <button onClick={push}>push</button>
      </aside>
      <section class="flex items-center gap-2" each={menus} key={(v: MenuItem) => v.path}>
        {(item: Getter<MenuItem>) => (
          <Link
            to={item((v) => v.path)}
            class={currentPath((v: string) => (v === item().path ? "aa" : ""))}
          >
            {item((v) => v.title)}
          </Link>
        )}
      </section>
    </nav>
  );
}
