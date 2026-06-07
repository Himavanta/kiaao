[中文](README.zh.md) | **English**

# kiaao

A pure-runtime, zero-virtual-DOM reactive UI framework. No Proxy, no compiler dependency, every update is a precise DOM operation.

## Design Principles

kiaao is built upon reflection on mainstream frameworks. If you’ve felt uneasy about Vue’s Proxy magic, tired of React’s re-renders and caching rules, or confused by Solid’s compiler requirement and split primitives, kiaao might be the answer you’ve been looking for.

- **No virtual DOM** — updates are direct `textNode.textContent = newValue` or attribute assignments, without tree-diffing.
- **No Proxy interception** — state is plain JavaScript objects. What you see in the debugger is the real value, with no hidden reactive shells.
- **Explicit selector reactivity** — developers declare dependencies via `getter(selector)`, rather than relying on Proxy traps or compiler inference.
- **Components run once** — no re-rendering, no `useMemo`/`useCallback` mental overhead, only precise DOM updates.
- **No compiler plugin required** — pure `h()` calls or standard JSX transformation is all you need.
- **No Context / provide-inject** — signals are standalone value containers that can be created and shared at module level, without extra cross-level communication mechanisms.
- **Update granularity at selector-result level** — when a signal changes, only effects whose selected value has actually changed are triggered; unrelated components never re-run.

Since the getter itself is a function carrying the `IS_REACTIVE` marker, `{count}` and `{count(v => v)}` behave the same in JSX—both are recognized by the framework and establish dynamic bindings. The former subscribes to the whole value, the latter subscribes to a slice via the selector.

## Core Concepts

kiaao has only 4 core APIs that form the entire reactive system:

- **define** — create reactive state, returns a getter/setter pair
- **derive** — create derived state with caching and a dirty flag; downstream is not notified when the computed result hasn’t changed
- **effect** — run side effects, automatically tracking dependencies; returns a stop function
- **h** — create real DOM nodes, compatible with standard JSX transformation

All other APIs are components or utilities built on these four primitives:

- **Show / List / Teleport** — control-flow components
- **onMount / onUnmount** — lifecycle hooks
- **mount / unmount** — explicit mounting and unmounting
- **lazy** — async component loading

## Comparison with Other Frameworks

| Aspect               | React              | Vue                   | Solid                  | kiaao                        |
| -------------------- | ------------------ | --------------------- | ---------------------- | ---------------------------- |
| Data purity          | pure               | impure (Proxy)        | pure (two APIs)        | pure (one API)               |
| Component execution  | re-runs every time | shell runs once       | shell runs once        | shell runs once              |
| Virtual DOM          | yes                | yes                   | no                     | no                           |
| Compiler dependency  | none               | optional              | required               | none                         |
| Reactivity principle | none (full re-run) | Proxy                 | compile-time expansion | explicit selectors           |
| Update granularity   | component-level    | component/block-level | DOM node-level         | selector-result level        |
| Context/Provide      | yes                | yes                   | yes                    | no (signals are the channel) |

## Quick Start

### Installation

```bash
npm install kiaao
```

### Creating Reactive State

```typescript
import { define } from "kiaao";

const [count, setCount] = define(0);

console.log(count()); // 0
setCount(42);
console.log(count()); // 42

// supports functional updates
setCount((prev) => prev + 1);
```

### Selector Subscriptions

The getter accepts a selector function for precise subscriptions. The selector returns a derived function; dependent effects are only triggered when the selected value actually changes.

```typescript
const [user, setUser] = define({ name: "tom", age: 18 });

const name = user((v) => v.name);

effect(() => {
  console.log("name:", name());
});
// immediately prints: name: tom

setUser((prev) => ({ ...prev, age: 19 }));
// age changed, but name did not — nothing printed

setUser((prev) => ({ ...prev, name: "jerry" }));
// prints: name: jerry
```

### Side Effects

```typescript
import { define, effect } from "kiaao";

const [count, setCount] = define(0);

const stop = effect(() => {
  console.log("count is", count());
});
// immediately prints: count is 0

setCount(1); // prints: count is 1
stop();
setCount(2); // nothing printed
```

### Derived State

```typescript
import { define, derive, effect } from "kiaao";

const [count, setCount] = define(5);
const double = derive(() => count() * 2);

effect(() => {
  console.log("double:", double());
});
// immediately prints: double: 10

setCount(10); // prints: double: 20
setCount(10); // same value, double does not notify downstream, nothing printed
```

`derive` caches its result. If upstream changes but the computed value stays the same, downstream subscribers are not notified.

### Creating DOM Elements

```typescript
import { h } from "kiaao";

// static elements
const el = h("div", { class: "container" }, h("h1", null, "Hello"));

// event binding
const btn = h("button", { onClick: () => console.log("clicked") }, "Click me");

// dynamic text: pass a reactive function, it auto-updates
const [count, setCount] = define(0);
const display = h("p", null, count); // count itself is a reactive function
// or use a selector
const display2 = h(
  "p",
  null,
  count((v) => `Count: ${v}`),
);

// dynamic attributes: class, style, and arbitrary attributes support reactive binding
const [isActive, setActive] = define(false);
const box = h("div", {
  class: isActive((v) => (v ? "active" : "inactive")),
  "data-state": isActive,
});
```

### Components

A component is simply a function that returns a DOM node. It runs only once. When state changes, the component function does not re-run—only the DOM nodes bound by reactive functions update in place.

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

const el = h(Counter, null);
```

### Props

Components receive props via function parameters, just like regular functions.

```typescript
function Greet(props: { name: string }) {
  return h("p", null, `Hello, ${props.name}!`);
}

const el = h(Greet, { name: "kiaao" });
```

### Lifecycle

```typescript
import { h, onMount, onUnmount, mount, unmount } from "kiaao";

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
mount(root, document.body); // mount and trigger onMount
// ...
unmount(root); // unmount, trigger onUnmount, and clean up all effects
```

### Conditional Rendering and List Rendering

```typescript
import { define, h, Show, List } from "kiaao";

function App() {
  const [visible, setVisible] = define(true);
  const [items, setItems] = define(["a", "b", "c"]);

  return h(
    "div",
    null,
    h("button", { onClick: () => setVisible((v) => !v) }, "Toggle"),
    h(Show, {
      when: visible,
      fallback: () => h("p", null, "Hidden"),
      children: () => h("p", null, "Visible"),
    }),
    h(
      "ul",
      null,
      h(List, {
        each: items,
        key: (item) => item,
        children: (item) => h("li", null, item),
      }),
    ),
  );
}
```

`Show`'s `when` accepts either a reactive function or a plain function. When the branch switches, old DOM nodes are cleaned up and new ones trigger the mount lifecycle.

### Teleport

Render content into a specified DOM container while logically remaining inside the current component tree. Content is automatically removed from the target when the component unmounts.

```typescript
import { h, Teleport } from "kiaao";

h(Teleport, {
  to: "#modal-root",
  children: () => h("div", { class: "modal" }, "Teleported content"),
});
```

`children` can be either a JSX expression or a function returning content.

### Async Components (lazy)

Combine with dynamic imports for code splitting. Shows a placeholder comment while loading, then automatically swaps in the real component once loaded.

```typescript
import { lazy } from "kiaao";
const HeavyProfile = lazy(() => import("./HeavyProfile.ts"));
h(HeavyProfile, { userId: 42 });
```

## Server-Side Rendering and Astro Integration

Use `renderToString` to render a component to an HTML string.

```typescript
import { renderToString } from "kiaao/server";
const html = renderToString(MyComponent, { name: "kiaao" });
```

In SSR mode, `effect` is disabled, `derive` computes once, and `onMount`/`onUnmount` do not fire.

kiaao provides an official Astro integration. Purely static components output zero JavaScript; `client:only` components are fully mounted in the browser.

```bash
npm install kiaao astro
```

```astro
---
import Counter from "../components/Counter.tsx";
---

<!-- pure static HTML -->
<Counter />

<!-- full client-side interactivity -->
<Counter client:only />
```

## Routing

A lightweight client-side router is available as the separate package `kiaao/router`, built entirely on the core primitives.

```typescript
import { createRouter } from "kiaao/router";

const { RouterView, navigate, Link, currentParams } = createRouter([
  { path: "/", component: Home },
  { path: "/users/:id", component: UserProfile },
]);

function App() {
  return h(
    "div",
    null,
    h("nav", null, h(Link, { to: "/" }, "Home"), h(Link, { to: "/users/1" }, "User 1")),
    h(RouterView),
  );
}
```

Route parameters are passed to the matched component as props, and are also available via `currentParams()`. A fallback component can be provided for 404s.

## Installation and JSX Configuration

```bash
npm install kiaao
```

tsconfig.json:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "kiaao"
  }
}
```

Writing components with JSX:

```tsx
import { define, mount } from "kiaao";

function App() {
  const [count, setCount] = define(0);
  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={() => setCount((p) => p + 1)}>+1</button>
    </div>
  );
}

mount((<App />) as HTMLElement, document.querySelector("#app")!);
```

If you prefer not to use JSX, you can use the `h()` function directly.

## API Reference

| API            | Purpose                                                                               |
| -------------- | ------------------------------------------------------------------------------------- |
| define         | Create reactive state, returns [getter, setter]                                       |
| derive         | Create derived state with caching; does not notify downstream when value is unchanged |
| effect         | Run side effects with automatic dependency tracking; returns a stop function          |
| h              | Create real DOM nodes or invoke component functions                                   |
| Show           | Conditional rendering; `when` supports reactive functions                             |
| List           | List rendering with key-based node management                                         |
| Teleport       | Render content into a specified DOM container while preserving lifecycle              |
| lazy           | Async component loading for use with dynamic imports                                  |
| onMount        | Runs once after the component is mounted                                              |
| onUnmount      | Runs before the component is destroyed                                                |
| mount          | Mount a component tree into a container and trigger lifecycle                         |
| unmount        | Unmount a component tree and clean up all effects                                     |
| renderToString | Render a component to an HTML string (from kiaao/server)                              |
| createRouter   | Client-side routing (from kiaao/router)                                               |

## License

MIT
