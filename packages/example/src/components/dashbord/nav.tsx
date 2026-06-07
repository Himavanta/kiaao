import { List } from "kiaao";
import { Link, currentPath } from "/src/router";

const menus = [
  {
    title: "探索",
    path: "expore",
  },
  {
    title: "工作室",
    path: "/",
  },
  {
    title: "知识库",
    path: "dataset",
  },
  {
    title: "工具",
    path: "tools",
  },
  {
    title: "插件",
    path: "plugins",
  },
];

export default function () {
  return (
    <nav class="h-10 w-full bg-amber-600 flex justify-center items-center">
      <aside></aside>
      <section class="flex items-center gap-2">
        <List each={() => menus} key={(v) => v}>
          {(item) => (
            <Link to={item.path} class={currentPath((v) => (v === item.path ? "aa" : ""))}>
              {item.title}
            </Link>
          )}
        </List>
      </section>
    </nav>
  );
}
