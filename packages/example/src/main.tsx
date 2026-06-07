import { mount } from "kiaao";
import { RouterView } from "./router";
import "./style.css";

mount((<RouterView />) as HTMLElement, document.querySelector<HTMLDivElement>("#app")!);
