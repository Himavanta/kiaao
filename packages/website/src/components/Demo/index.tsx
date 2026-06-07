import { define } from "kiaao";
import style from "./style.module.css";

export default function Counter() {
  const [active, setActive] = define(false);

  // only render once
  console.log("render");

  return (
    <div
      class={active((v) => (v ? style.blue : style.red))}
      style={active((v) => (v ? { color: "white" } : { color: "black" }))}
      onClick={() => setActive((v) => !v)}
    >
      click to change style
    </div>
  );
}
