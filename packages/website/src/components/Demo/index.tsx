import { use } from "kiaao";

import style from "./style.module.css";

export default function () {
  const active = use(false);

  // only render once
  console.log("render");

  const background = use(active, () => (active() ? "blue" : "red"));
  const currentClass = use(background, () => style[background()]);
  const currentStyle = use(active, () => (active() ? { color: "white" } : { color: "black" }));
  const color = use(currentStyle, () => currentStyle().color);

  return (
    <div class={currentClass} style={currentStyle} onClick={() => active((v) => !v)}>
      click to change style
      <div>current background: {background()}</div>
      <div>current color: {color()}</div>
    </div>
  );
}
