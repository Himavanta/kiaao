import Nav from "./nav";

interface LayoutProps {
  RouterView: any;
}

export default function ({ RouterView }: LayoutProps) {
  return (
    <section class="h-full w-full bg-gray-100 flex flex-col">
      <Nav />
      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
    </section>
  );
}
