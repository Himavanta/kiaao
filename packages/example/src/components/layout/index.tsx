import { RouterView, indexRoutes } from "../../router";
import Nav from "./nav";

export default function () {
  return (
    <section class="h-full w-full bg-amber-300 flex flex-col">
      <Nav />
      <main class="flex-1">
        <RouterView base="/i" routes={indexRoutes} />
      </main>
    </section>
  );
}
