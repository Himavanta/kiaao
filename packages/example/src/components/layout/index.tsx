import { RouterView, indexRoutes } from "../../router";
import Nav from "./nav";

export default function () {
  return (
    <section class="h-full w-full bg-gray-100 flex flex-col">
      <Nav />
      <main class="flex-1 overflow-auto">
        <RouterView base="/i" routes={indexRoutes} />
      </main>
    </section>
  );
}
