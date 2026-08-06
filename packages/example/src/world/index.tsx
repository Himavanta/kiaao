import { use } from "kiaao";
import type { Context, UseFunction, Signal } from "kiaao";

function createGame({ time }: { time?: number } = { time: 50 }) {
  const timer = use(0);
  setInterval(() => timer(timer() + 1), time);
  return timer;
}

const timer = createGame();

function defineCompose<T>(fn: (state: T) => void) {
  return (use: UseFunction, state: T) => {
    use(timer, () => fn(state));
  };
}

const move = defineCompose((state: Signal<{ name: string; age: number }>) => {
  state({ ...state(), age: state().age + 1 });
});

export default function App() {
  return (
    <div style="position:fixed;height:100vh;width:100vw">
      <Count top={100} />
      <Count top={300} />
    </div>
  );
}

function Count({ top }: { top: number }, { use }: Context) {
  const people = use({
    name: "tom",
    age: 18,
  });

  move(use, people);

  const name = use(people, () => people().name);
  const age = use(people, () => people().age);
  const style = use(people, () => ({
    position: "fixed",
    background: "green",
    height: "100px",
    width: "100px",
    top: `${top}px`,
    left: `${people().age}px`,
  }));

  return (
    <div style={style}>
      <div>name:{name}</div>
      <div>age:{age}</div>
    </div>
  );
}
