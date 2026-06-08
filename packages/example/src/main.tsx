import { mount } from "kiaao";
import { RouterView, appRoutes } from "./router";
import "./style.css";

mount(
  (<RouterView routes={appRoutes} />) as HTMLElement,
  document.querySelector<HTMLDivElement>("#app")!,
);
