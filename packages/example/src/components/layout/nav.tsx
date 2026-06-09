import { define, derive, type Getter } from "kiaao";
import { Link, currentPath, mainNavs, type MainNavItem } from "/src/router";

const [menus] = define<MainNavItem[]>(mainNavs);

const cn = (...ns: any[]) => ns.filter((e) => typeof e === "string").join(" ");

export default function () {
  return (
    <nav class="h-14 w-full flex border-b border-gray-200 justify-between items-center px-10">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="32"
        height="32"
        viewBox="0 0 24 24"
        class="text-blue-800 h-10 w-10"
      >
        <path
          fill="currentColor"
          fill-rule="evenodd"
          d="M3.213 3.213a4.14 4.14 0 0 0 0 5.858L14.93 20.787a4.142 4.142 0 0 0 5.858-5.858L9.07 3.213a4.14 4.14 0 0 0-5.858 0m6.132 5.018A.788.788 0 1 0 8.23 9.345A.788.788 0 0 0 9.345 8.23m2.784.928a.787.787 0 1 0-1.114 1.114a.787.787 0 0 0 1.114-1.114m3.712 3.712a.788.788 0 1 1-1.114 1.114a.788.788 0 0 1 1.114-1.114m.929 3.899a.787.787 0 1 0-1.114-1.114a.787.787 0 0 0 1.114 1.114m-3.713-3.713a.787.787 0 1 0-1.113-1.114a.787.787 0 0 0 1.113 1.114m.928 1.67a.788.788 0 1 1-1.114 1.114a.788.788 0 0 1 1.114-1.113M9.16 11.016a.787.787 0 1 1 1.114 1.114a.787.787 0 0 1-1.114-1.114"
          clip-rule="evenodd"
        />
        <path
          fill="currentColor"
          d="M20.787 9.071a4.142 4.142 0 0 0-5.858-5.858L12 6.143L17.858 12zM12 17.858L6.142 12l-2.929 2.929a4.142 4.142 0 0 0 5.858 5.858z"
          opacity=".5"
        />
      </svg>
      <section each={menus} key={(v: MainNavItem) => v.path} class="flex items-center">
        {(item: Getter<MainNavItem>) => {
          return (
            <Link
              to={item((v) => `/i/${v.path}`)}
              class={derive(() =>
                cn(
                  "px-4 font-bold text-sm leading-8 rounded-xl",
                  currentPath() === `/i/${item().path}` && "bg-white shadow-md text-blue-700",
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
