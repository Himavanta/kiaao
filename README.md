**English** | [中文](README.zh.md)

# kiaao

A minimal reactive frontend framework. No virtual DOM, no compiler dependency, no Proxy, direct DOM manipulation.

## Core Concepts

kiaao has only 4 core APIs:

- **define** — create reactive state
- **derive** — create derived state with caching
- **effect** — run side effects with automatic dependency tracking
- **h** — create real DOM nodes

Other APIs are components and utilities built on top of these 4:

- **Show** — conditional rendering
- **List** — list rendering
- **Teleport** — render content to a different DOM container
- **onMount / onUnmount** — lifecycle hooks
- **mount / unmount** — mount and unmount helpers
- **lazy** — async component loading

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

### Teleport

Render content to a different DOM container. The content stays logically part of the current component tree -- lifecycle hooks work normally, and cleanup is automatic.

```typescript
import { h, Teleport } from "kiaao";

function Modal() {
  return h("div", { class: "modal" }, "This is rendered in a different container");
}

// in a component
h(Teleport, {
  to: "#modal-root", // CSS selector
  children: () => h(Modal, null),
});

// or pass a DOM element directly
document.body.appendChild(
  h(Teleport, {
    to: document.querySelector("#portal")!,
    children: () => h("span", null, "teleported"),
  }),
);
```

### Async components (lazy)

Wrap a dynamic import for code splitting. Renders nothing (comment placeholder) while loading, then switches to the real component.

```typescript
import { lazy } from "kiaao";

const HeavyProfile = lazy(() => import("./HeavyProfile.ts"));

// use like any other component
h(HeavyProfile, { userId: 42 });
```

Loading errors can be handled via an optional callback:

```typescript
const Profile = lazy(() => import("./Profile.ts"), {
  onError: (err) => console.error("Failed to load profile", err),
});
```

If no `onError` is provided, the error is stored internally and thrown during rendering, allowing it to be caught by an error boundary.

## Server-side rendering

kiaao can render components to HTML strings on the server via `renderToString`.

```typescript
import { renderToString } from "kiaao/server";

const html = renderToString(MyComponent, { name: "kiaao" });
// "<div>Hello, kiaao!</div>"
```

During SSR:

- `effect` is disabled (returns a noop stop function)
- `derive` computes once and returns a fixed value with `IS_REACTIVE` marker
- `onMount` / `onUnmount` do not fire (they only run inside `mount()`)
- Reactive bindings in `h()` are evaluated once for their current value

## Astro integration

kiaao provides an official Astro integration for static SSR and `client:only` components.

```bash
npm install kiaao astro
```

Add JSX configuration to your tsconfig.json:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "kiaao"
  }
}
```

Configure Astro:

```ts
// astro.config.mjs
import kiaao from "kiaao/astro";

export default defineConfig({
  integrations: [kiaao()],
});
```

```astro
---
import Counter from "../components/Counter.tsx";
---

<!-- Static HTML, zero JavaScript -->
<Counter />

<!-- Fully interactive, mounted in the browser -->
<Counter client:only />
```

Static components render to HTML during build with no client JavaScript. Components with `client:only` are mounted entirely in the browser with full reactive behavior.

## Routing

kiaao provides a simple client-side router as a separate entry point. It is built entirely on the core primitives (define, h, Show) with no extra concepts.

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

Route params are passed as props to the matched component, and also available via `currentParams`:

```typescript
function UserProfile(props: { id: string }) {
  return h("div", null, `User ${props.id}`);
}

// alternatively, outside the component
console.log(currentParams()); // { id: "42" }
```

A fallback component can be provided for unmatched routes:

```typescript
const { RouterView } = createRouter(routes, { fallback: () => h("div", null, "Custom 404") });
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

| API            | Description                                            |
| -------------- | ------------------------------------------------------ |
| define         | create reactive state, returns [getter, setter]        |
| derive         | create derived state with caching and dirty flag       |
| effect         | run side effects with automatic dependency tracking    |
| h              | create real DOM nodes or invoke component functions    |
| Show           | conditional rendering, when accepts reactive functions |
| List           | list rendering with key-based node management          |
| Teleport       | render content to a different DOM container            |
| lazy           | async component loading with dynamic import            |
| onMount        | run once after the component is mounted                |
| onUnmount      | run before the component is destroyed                  |
| mount          | attach the component tree to the DOM and trigger hooks |
| unmount        | detach the component tree and clean up all effects     |
| renderToString | render a component to HTML string (from kiaao/server)  |
| createRouter   | client-side router (from kiaao/router)                 |

## Design Principles

- **No virtual DOM** — updates are direct `textNode.textContent` replacements, no diffing
- **No compiler plugin required** — works with plain `h()` calls or standard JSX transform
- **No Proxy, no setters, no getters** — state is pure plain objects, no interception layer
- **Explicit selector-based reactivity** — dependency is declared by the developer through `getter(selector)`, not inferred through Proxy traps
- **No Context / provide-inject** — signals are value containers that can be imported directly anywhere
- **Component functions execute only once** — no re-rendering, only targeted DOM updates
- **Update granularity is at the selector result level** — signal change triggers only effects whose selected value actually changed

## License

MIT
