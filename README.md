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
- **h** — create real DOM nodes, with built-in `when` and `each` attribute directives for control flow

All other APIs are components or utilities built on these four primitives:

- **Teleport** — portal component
- **onMount / onUnmount** — lifecycle hooks
- **mount / unmount** — explicit mounting and unmounting
- **lazy** — async component loading

## Comparison with Other Frameworks

| Aspect             | React     | Vue             | Solid      | kiaao                    |
| ------------------ | --------- | --------------- | ---------- | ------------------------ |
| Data purity        | pure      | impure (Proxy)  | pure (two) | pure (one)               |
| Component runs     | re-runs   | shell once      | shell once | shell once               |
| Virtual DOM        | yes       | yes             | no         | no                       |
| Compiler needed    | no        | optional        | required   | no                       |
| Reactivity         | none      | Proxy           | compile    | explicit selectors       |
| Control flow       | ternary   | v-if/v-for      | Show/For   | when/each directives     |
| Update granularity | component | component/block | node       | selector result          |
| Context/Provide    | yes       | yes             | yes        | no (signals are channel) |

## Installation and JSX Configuration

```bash
npm install kiaao
```

**tsconfig.json:**

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "kiaao"
  }
}
```

**vite.config.ts (using oxc):**

```ts
import { defineConfig } from "vite";

export default defineConfig({
  oxc: {
    jsx: {
      importSource: "kiaao",
    },
  },
});
```

If using esbuild as the compiler, configure `vite.config.ts` as:

```ts
export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "kiaao",
  },
});
```

After configuration, you can write components directly in `.tsx` files. The compiled output will automatically be converted to `h()` calls. If you prefer not to use JSX, you can use the `h()` function directly.

## Quick Start

### Creating Reactive State

```tsx
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

```tsx
import { define, effect } from "kiaao";

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

```tsx
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

`derive` caches its computed result and re-evaluates when upstream changes. If the new result is the same as the cached value, downstream is not notified, avoiding unnecessary updates. Unlike the plain derived function returned by `getter(selector)` (which has no caching), `derive` is suitable for expensive computations or values shared across multiple places.

```tsx
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

### Components

A component is simply a function that returns JSX. It runs only once. When state changes, the component function does not re-run—only the DOM nodes bound by reactive functions update in place.

```tsx
import { define } from "kiaao";

function Counter() {
  const [count, setCount] = define(0);

  return (
    <div>
      <p>Count: {count((v) => v)}</p>
      <button onClick={() => setCount((p) => p + 1)}>+1</button>
    </div>
  );
}

// Using the component
const el = h(Counter, null);
```

### Props

Components receive props via function parameters, just like regular functions.

```tsx
function Greet(props: { name: string }) {
  return <p>Hello, {props.name}!</p>;
}

const el = h(Greet, { name: "kiaao" });
```

### Dynamic Attributes and Events

All attributes in JSX support reactive bindings by passing a reactive function, including `class`, `style`, and any data attributes. Events use the standard `onXxx` camelCase syntax.

```tsx
import { define } from "kiaao";

function App() {
  const [isActive, setActive] = define(false);

  return (
    <div
      class={isActive((v) => (v ? "active" : "inactive"))}
      data-state={isActive}
      onClick={() => setActive((v) => !v)}
    >
      Click to toggle
    </div>
  );
}
```

### Lifecycle

Components register lifecycle callbacks via `onMount` and `onUnmount`, which must be called synchronously at the top level of the component function. `onMount` fires only after the component is mounted into the container via `mount`.

```tsx
import { define, onMount, onUnmount, mount, unmount } from "kiaao";

function Timer() {
  const [time, setTime] = define(new Date());

  onMount(() => console.log("Timer mounted"));

  const timer = setInterval(() => setTime(new Date()), 1000);
  onUnmount(() => clearInterval(timer));

  return <div>{time((v) => v.toLocaleTimeString())}</div>;
}

const root = h(Timer, null);
mount(root, document.body); // mount and trigger onMount
// ...
unmount(root); // unmount, trigger onUnmount, and clean up all effects
```

### Conditional and List Rendering

kiaao handles control flow via native `when` and `each` attribute directives on `h()`, eliminating the need for separate components.

`when` controls the mounting and unmounting of its host element's child nodes. When the condition is falsy, child nodes are removed and properly disposed. It also supports lazy evaluation functions, which execute only when the condition becomes truthy, avoiding unnecessary initialization.

`each` generates child nodes inside its host element from an array. Old nodes are cleaned up and new ones are created on every change. It's recommended to provide a `key` for future optimizations.

```tsx
import { define } from "kiaao";

function App() {
  const [visible, setVisible] = define(true);
  const [items, setItems] = define(["a", "b", "c"]);

  return (
    <div>
      <button onClick={() => setVisible((v) => !v)}>Toggle</button>

      <section when={visible}>
        <span>Visible</span>
      </section>

      <ul each={() => items()} key={(item) => item}>
        {(item) => <li>{item}</li>}
      </ul>
    </div>
  );
}
```

### Teleport

Render content into a specified DOM container while logically remaining inside the current component tree. Content is automatically removed from the target when the component unmounts. If the target container does not exist, Teleport returns a placeholder comment node and no content is rendered.

```tsx
import { Teleport } from "kiaao";

function Modal() {
  return (
    <Teleport to="#modal-root">
      <div class="modal">Teleported content</div>
    </Teleport>
  );
}
```

### Async Components (lazy)

Combine with dynamic imports for code splitting. Shows a placeholder comment while loading, then automatically swaps in the real component once loaded. If loading fails, the error is thrown and can be caught by an error boundary.

```tsx
import { lazy } from "kiaao";
const HeavyProfile = lazy(() => import("./HeavyProfile.tsx"));
const el = h(HeavyProfile, { userId: 42 });
```

## Server-Side Rendering and Astro Integration

Use `renderToString` to render a component to an HTML string.

```tsx
import { renderToString } from "kiaao/server";
const html = renderToString(MyComponent, { name: "kiaao" });
```

In SSR mode, `effect` is disabled, `derive` computes once, and `onMount`/`onUnmount` do not fire.

kiaao provides an official Astro integration. Purely static components output zero JavaScript; `client:only` components are fully mounted in the browser.

```bash
npm install kiaao astro
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "kiaao"
  }
}
```

```ts
// astro.config.ts
import { defineConfig } from "astro/config";
import kiaao from "kiaao/astro";

export default defineConfig({
  integrations: [kiaao()],
});
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

```tsx
import { createRouter } from "kiaao/router";

const { RouterView, navigate, Link, currentParams } = createRouter(
  [
    { path: "/", component: Home },
    { path: "/users/:id", component: UserProfile },
  ],
  { fallback: () => <div>404 Not Found</div> },
);

function App() {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
        <Link to="/users/1">User 1</Link>
      </nav>
      <RouterView />
    </div>
  );
}
```

Route parameters are passed to the matched component as props, and are also available via `currentParams()`.

## API Reference

| API            | Purpose                                                            |
| -------------- | ------------------------------------------------------------------ |
| define         | Create reactive state, returns [getter, setter]                    |
| derive         | Create derived state with caching; does not notify when unchanged  |
| effect         | Run side effects with automatic dependency tracking; returns stop  |
| h              | Create real DOM nodes, with built-in when/each directives          |
| Teleport       | Render content into a specified container; fallback to placeholder |
| lazy           | Async component loading; throws on failure, can be caught          |
| onMount        | Runs once after the component is mounted                           |
| onUnmount      | Runs before the component is destroyed                             |
| mount          | Mount a component tree and trigger lifecycle                       |
| unmount        | Unmount a component tree and clean up all effects                  |
| renderToString | Render to an HTML string (from kiaao/server)                       |
| createRouter   | Client-side routing (from kiaao/router)                            |

## License

MIT
