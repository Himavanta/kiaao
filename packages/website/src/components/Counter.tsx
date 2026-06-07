import { define } from "kiaao";
import style from "./style.module.css";

export default function Counter() {
  const [count, setCount] = define(0);

  console.log(count);
  console.log(count());
  console.log(count((v) => v));
  console.log(count((v) => v)());

  return (
    <div class={style.counter_card}>
      <p>Count: {count((v) => v)}</p>
      <p>Count: {count}</p>
      <button class={style.counter_btn} onClick={() => setCount((p) => p + 1)}>
        +1
      </button>
      <button class={style.counter_btn} onClick={() => setCount((p) => p - 1)}>
        -1
      </button>
      <button class={[style.counter_btn, style.reset]} onClick={() => setCount(0)}>
        reset
      </button>
    </div>
  );
}
