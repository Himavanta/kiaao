**English** | [中文](README.zh.md)

# kiaao

A minimal reactive frontend framework. No virtual DOM, no compiler dependency, direct DOM manipulation.

## Core Concepts

kiaao has only 4 core APIs:

- **define** — create reactive state
- **derive** — create derived state with caching
- **effect** — run side effects with automatic dependency tracking
- **h** — create real DOM nodes

Other APIs are components and utilities built on top of these 4:

- **Show** — conditional rendering
- **List** — list rendering
- **onMount / onUnmount** — lifecycle hooks
- **mount / unmount** — mount and unmount helpers

## Getting Started

### Installation

```bash
npm install kiaao
```

### Create reactive state

```typescript
import { define } from "kiaao";

const [count, setCount] = define(0);

console.log(count()); // 0
setCount(42);
console.log(count()); // 42

// functional update
setCount((prev) => prev + 1);
```

### Selector subscription

Getters accept a selector function for granular subscriptions:

```typescript
const [user, setUser] = define({ name: "tom", age: 18 });

// returns a reactive function that only subscribes to name
const name = user((v) => v.name);
console.log(name()); // "tom"

setUser((prev) => ({ ...prev, age: 19 }));
console.log(name()); // "tom" — age change does not trigger name update

setUser((prev) => ({ ...prev, name: "jerry" }));
console.log(name()); // "jerry"
```

### Side effects

```typescript
import { define, effect } from "kiaao";

const [count, setCount] = define(0);

const stop = effect(() => {
  console.log("count is", count());
});
// logs: count is 0

setCount(1);
// logs: count is 1

// cancel the effect
stop();
setCount(2);
// no output
```

### Derived state

```typescript
import { define, derive } from "kiaao";

const [count, setCount] = define(5);
const double = derive(() => count() * 2);

console.log(double()); // 10

setCount(10);
console.log(double()); // 20
```

### Creating DOM

```typescript
import { h } from "kiaao";

// create an element
const el = h("div", { class: "container" }, h("h1", null, "Hello"), h("p", null, "World"));
// returns a real DOM node

// event handling
const btn = h("button", { onClick: () => console.log("clicked") }, "Click me");

// dynamic binding: pass a reactive function, text updates automatically
const [count, setCount] = define(0);
const display = h(
  "p",
  null,
  count((v) => `Count: ${v}`),
);
// textContent updates automatically when count changes
```

### Components

A component in kiaao is a function that returns a DOM node. Component functions run only once:

```typescript
import { define, h } from "kiaao";

function Counter() {
  const [count, setCount] = define(0);

  return h(
    "div",
    null,
    h(
      "p",
      null,
      count((v) => `Count: ${v}`),
    ),
    h("button", { onClick: () => setCount((p) => p + 1) }, "+1"),
  );
}

// use the component
const el = h(Counter, null);
```

When `h()` receives a function as its first argument, it enters component mode: creates a component instance, calls the function, and returns the generated DOM node.

### Props

Components receive props via their argument:

```typescript
function Greet(props: { name: string }) {
  return h("p", null, `Hello, ${props.name}!`);
}

const el = h(Greet, { name: "kiaao" });
```

### Lifecycle

```typescript
import { define, h, onMount, onUnmount } from "kiaao";

function Timer() {
  const [time, setTime] = define(new Date());

  const timer = setInterval(() => setTime(new Date()), 1000);
  onUnmount(() => clearInterval(timer));

  return h(
    "div",
    null,
    time((v) => v.toLocaleTimeString()),
  );
}

const root = h(Timer, null);

// mount to the page, triggers onMount
mount(root, document.body);

// unmount, triggers onUnmount and cleans up all effects
unmount(root);
```

### Conditional rendering

```typescript
import { define, h, Show } from "kiaao";

function App() {
  const [visible, setVisible] = define(true);

  return h(
    "div",
    null,
    h("button", { onClick: () => setVisible((v) => !v) }, "Toggle"),
    h(Show, {
      when: visible,
      fallback: () => h("p", null, "Hidden"),
      children: () => h("p", null, "Visible"),
    }),
  );
}
```

`when` accepts both reactive functions (getter directly) and plain functions:

```typescript
// reactive function
h(Show, { when: visible, children: () => ... })

// plain function
h(Show, { when: () => count() > 0, children: () => ... })
```

### List rendering

```typescript
import { define, h, List } from "kiaao";

function App() {
  const [items, setItems] = define(["a", "b", "c"]);

  return h(
    "ul",
    null,
    h(List, {
      each: items,
      key: (item: string) => item,
      children: (item: string) => h("li", null, item),
    }),
  );
}
```

## Setup

### npm

```bash
npm install kiaao
```

### JSX / TSX support

kiaao provides a JSX runtime for the automatic transform.

tsconfig.json:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "kiaao"
  }
}
```

vite.config.ts:

```ts
export default defineConfig({
  oxc: {
    jsx: {
      importSource: "kiaao",
    },
  },
});
```

Writing components with JSX:

```tsx
import { define, mount } from "kiaao";

function App() {
  const [count, setCount] = define(0);

  return (
    <div>
      <p>Count: {count((v) => v)}</p>
      <button onClick={() => setCount((p) => p + 1)}>+1</button>
    </div>
  );
}

mount((<App />) as HTMLElement, document.querySelector("#app")!);
```

## API Reference

| API       | Description                                            |
| --------- | ------------------------------------------------------ |
| define    | create reactive state, returns [getter, setter]        |
| derive    | create derived state with caching and dirty flag       |
| effect    | run side effects with automatic dependency tracking    |
| h         | create real DOM nodes or invoke component functions    |
| Show      | conditional rendering, when accepts reactive functions |
| List      | list rendering with key-based node management          |
| onMount   | run once after the component is mounted                |
| onUnmount | run before the component is destroyed                  |
| mount     | attach the component tree to the DOM and trigger hooks |
| unmount   | detach the component tree and clean up all effects     |

## Design Principles

- No virtual DOM
- No compiler plugin required
- No Proxy usage
- No Context / provide-inject (signals themselves are the shared channel)
- Component functions execute only once
- Update granularity is at the selector result level

## License

MIT
