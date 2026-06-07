import { define } from "kiaao";

export default function Counter() {
  const [count, setCount] = define(0);

  return (
    <div class="counter-card">
      <p>Count: {count((v) => v)}</p>
      <button class="counter-btn" onClick={() => setCount((p) => p + 1)}>
        +1
      </button>
      <button class="counter-btn" onClick={() => setCount((p) => p - 1)}>
        -1
      </button>
      <button class="counter-btn reset" onClick={() => setCount(0)}>
        reset
      </button>
    </div>
  );
}
