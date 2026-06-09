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

> **Note**: The `when` and `each` directives can only be used on native HTML elements (e.g. `<div>`, `<section>`, `<ul>`, etc.), not on custom components. To use them in a component, place the directive on a native element inside the component's root.

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
      <p>Count: {count}</p>
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

kiaao handles control flow via native `when` and `each` attribute directives on `h()`, eliminating the need for separate components. These directives only work on native HTML elements, not on custom components.

`when` controls the mounting and unmounting of its host element's child nodes. When the condition is falsy, child nodes are removed and properly disposed. It also supports lazy evaluation functions, which execute only when the condition becomes truthy, avoiding unnecessary initialization.

`each` iterates over multiple data sources (arrays, objects, Maps, Sets, etc.), automatically creating a reactive signal for each entry. Providing a `key` function enables incremental DOM reuse, preserving input focus and state of list items.

```tsx
import { define } from "kiaao";

function App() {
  const [visible, setVisible] = define(true);
  const [items, setItems] = define(["a", "b", "c"]);

  return (
    <div>
      <button onClick={() => setVisible((v) => !v)}>Toggle</button>

      {/* display: contents 使宿主元素不参与布局，仅作为逻辑容器 */}
      <section when={visible} style="display: contents">
        <span>Visible</span>
      </section>

      <ul each={items} key={(item) => item}>
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

## Server-Side Rendering, Astro Integration, and Routing

See [`guide/router-ssr-astro.md`](guide/router-ssr-astro.md).

- **Server-Side Rendering**: Use `renderToString` to render a component to HTML (from `kiaao/server`)
- **Astro Integration**: Official `kiaao/astro` plugin, supports static and `client:only` components
- **Routing**: Lightweight client-side router (`kiaao/router`), supports nested layouts

| API            | Purpose                                                                          |
| -------------- | -------------------------------------------------------------------------------- |
| define         | Create reactive state, returns [getter, setter]                                  |
| derive         | Create derived state with caching; does not notify when unchanged                |
| effect         | Run side effects with automatic dependency tracking; returns stop                |
| h              | Create real DOM nodes, with built-in when/each directives (native elements only) |
| Teleport       | Render content into a specified container; fallback to placeholder               |
| lazy           | Async component loading; throws on failure, can be caught                        |
| onMount        | Runs once after the component is mounted                                         |
| onUnmount      | Runs before the component is destroyed                                           |
| mount          | Mount a component tree and trigger lifecycle                                     |
| unmount        | Unmount a component tree and clean up all effects                                |
| renderToString | Render to an HTML string (see `guide/router-ssr-astro.md`)                       |
| createRouter   | Client-side routing (see `guide/router-ssr-astro.md`)                            |

## License

MIT
