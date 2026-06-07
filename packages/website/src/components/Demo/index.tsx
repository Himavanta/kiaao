import { define, derive } from "kiaao";
import style from "./style.module.css";

export default function () {
  const [active, setActive] = define(false);

  // only render once
  console.log("render");

  const background = active((v) => (v ? "blue" : "red"));
  const currentClass = derive(() => style[background()]);
  const currentStyle = active((v) => (v ? { color: "white" } : { color: "black" }));

  return (
    <div class={currentClass} style={currentStyle} onClick={() => setActive((v) => !v)}>
      click to change style
      <div>current background: {background}</div>
      <div>current color: {derive(() => currentStyle().color)}</div>
    </div>
  );
}
