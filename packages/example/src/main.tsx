import { createApp } from "kiaao";

import { RouterView, appRoutes } from "./router";

import "./style.css";

createApp(<RouterView routes={appRoutes} />).mount(document.querySelector<HTMLDivElement>("#app")!);
