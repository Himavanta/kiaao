// @vitest-environment happy-dom
// kiaao — Async component extreme edge case tests

import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/dom/h.ts";
import { mount, unmount } from "../../src/dom/component.ts";
import { renderToString } from "../../src/server/index.ts";

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});

afterEach(() => {
  container.remove();
});

// ── 1. 基础渲染与 wrapper ────────────────────────────

describe("async — wrapper behavior", () => {
  test("wrapper is a fresh div each time", () => {
    async function A() {
      await Promise.resolve();
      return h("span");
    }
    const e1 = h(A);
    const e2 = h(A);
    expect(e1).not.toBe(e2);
    expect(e1.tagName).toBe("DIV");
    expect(e2.tagName).toBe("DIV");
  });

  test("wrapper survives until unmount", async () => {
    async function Slow() {
      await new Promise((r) => setTimeout(r, 5));
      return h("p");
    }
    const el = h(Slow);
    mount(el as HTMLElement, container);
    expect(document.body.contains(el)).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(document.body.contains(el)).toBe(true);
    unmount(el as HTMLElement);
  });
});

// ── 2. 生命周期极限测试 ─────────────────────────────

describe("async — lifecycle extremes", () => {
  test("onMount fires exactly once after resolve", async () => {
    let count = 0;
    async function Comp(_: any, { onMount }: any) {
      onMount(() => count++);
      await Promise.resolve();
      return h("p");
    }
    const el = h(Comp);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    expect(count).toBe(1);
    unmount(el as HTMLElement);
  });

  test("onUnmount can be registered from onMount", async () => {
    let cleaned = false;
    async function Comp(_: any, { onMount, onUnmount }: any) {
      onMount(() => {
        onUnmount(() => {
          cleaned = true;
        });
      });
      await Promise.resolve();
      return h("p");
    }
    const el = h(Comp);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    unmount(el as HTMLElement);
    expect(cleaned).toBe(true);
  });

  test("multiple onMount callbacks all fire in order", async () => {
    const order: number[] = [];
    async function Comp(_: any, { onMount }: any) {
      onMount(() => order.push(1));
      onMount(() => order.push(2));
      await Promise.resolve("x");
      return h("p");
    }
    const el = h(Comp);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual([1, 2]);
    unmount(el as HTMLElement);
  });

  test("onMount inside onMount after resolve runs immediately", async () => {
    const order: string[] = [];
    async function Comp(_: any, { onMount }: any) {
      onMount(() => {
        order.push("outer");
        onMount(() => order.push("nested"));
      });
      await Promise.resolve();
      return h("p");
    }
    const el = h(Comp);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["outer", "nested"]);
    unmount(el as HTMLElement);
  });
});

// ── 3. 竞态条件 ─────────────────────────────────────

describe("async — race conditions", () => {
  test("resolve before mount is queued properly", async () => {
    // 组件在 mount 前就 resolve
    async function Fast() {
      return h("p", null, "instant");
    }
    const el = h(Fast);
    // resolve 在 mount 前
    await new Promise((r) => setTimeout(r, 0));
    mount(el as HTMLElement, container);
    expect(el.textContent).toBe("instant");
    unmount(el as HTMLElement);
  });

  test("multiple concurrent async components resolve in order", async () => {
    const results: string[] = [];
    function Track(id: string) {
      return {
        id,
        fn: async () => {
          await new Promise((r) => setTimeout(r, Math.random() * 5));
          results.push(id);
          return h("span", null, id);
        },
      };
    }

    const a = Track("A");
    const b = Track("B");
    const c = Track("C");

    const el = h("div", null, h(a.fn as any), h(b.fn as any), h(c.fn as any));
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 20));
    // 三个都应 resolve
    expect(results.length).toBe(3);
    expect(el.textContent).toContain("A");
    expect(el.textContent).toContain("B");
    expect(el.textContent).toContain("C");
    unmount(el as HTMLElement);
  });

  test("unmount during resolve does not double-free", async () => {
    let resolveNow: (v: any) => void;
    const p = new Promise((r) => {
      resolveNow = r;
    });

    async function Comp() {
      await p;
      return h("p", null, "late");
    }

    const el = h(Comp);
    mount(el as HTMLElement, container);

    // unmount 和 resolve 几乎同时发生
    resolveNow!(h("p", null, "late"));
    unmount(el as HTMLElement);

    await new Promise((r) => setTimeout(r, 0));
    // 不崩溃，内容不被追加
    expect(el.textContent).toBe("");
  });

  test("resolves after long delay", async () => {
    async function Slow() {
      await new Promise((r) => setTimeout(r, 50));
      return h("p", null, "finally");
    }
    const el = h(Slow);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe(""); // 尚未 resolve
    await new Promise((r) => setTimeout(r, 50));
    expect(el.textContent).toBe("finally");
    unmount(el as HTMLElement);
  });

  test("immediate resolve (Promise.resolve) vs setTimeout", async () => {
    const order: string[] = [];
    async function Immediate() {
      order.push("start");
      await Promise.resolve();
      order.push("resolve");
      return h("span");
    }
    const el = h(Immediate);
    order.push("after-h");
    mount(el as HTMLElement, container);
    order.push("after-mount");
    await new Promise((r) => setTimeout(r, 0));
    order.push("after-await");
    expect(order).toEqual(["start", "after-h", "after-mount", "resolve", "after-await"]);
    unmount(el as HTMLElement);
  });
});

// ── 4. 错误处理 ─────────────────────────────────────

describe("async — error handling", () => {
  test("rejected promise leaves empty wrapper", async () => {
    const orig = console.error;
    console.error = () => {};
    async function Fail() {
      throw new Error("fail");
    }
    const el = h(Fail);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent).toBe("");
    console.error = orig;
  });

  test("rejected promise does not affect sibling components", async () => {
    const orig = console.error;
    console.error = () => {};

    async function Fail() {
      throw new Error("fail");
    }
    function SyncOK() {
      return h("span", null, "ok");
    }

    const el = h("div", null, h(Fail as any), h(SyncOK));
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));

    // 同步组件正常渲染，异步组件空的
    expect(el.textContent).toBe("ok");
    console.error = orig;
    unmount(el as HTMLElement);
  });

  test("catch inside async component provides fallback", async () => {
    async function Safe() {
      try {
        await Promise.reject(new Error("fail"));
        return h("p", null, "never");
      } catch {
        return h("p", null, "fallback");
      }
    }
    const el = h(Safe);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent).toBe("fallback");
    unmount(el as HTMLElement);
  });

  test("async component returning undefined triggers defensive comment", async () => {
    const orig = console.warn;
    const warns: string[] = [];
    console.warn = (msg: any) => warns.push(msg);

    async function Undef() {
      return undefined as any;
    }
    h(Undef);
    await new Promise((r) => setTimeout(r, 0));
    expect(warns.some((w) => w.includes("non-Node"))).toBe(true);
    console.warn = orig;
  });

  test("async component returning string triggers defensive comment", async () => {
    const orig = console.warn;
    console.warn = () => {};

    async function Str() {
      return "string" as any;
    }
    const el = h(Str);
    await new Promise((r) => setTimeout(r, 0));
    // wrapper 内应有注释节点
    expect(el.childNodes.length).toBe(1);
    expect(el.childNodes[0].nodeType).toBe(Node.COMMENT_NODE);
    console.warn = orig;
  });
});

// ── 5. 嵌套与组合 ───────────────────────────────────

describe("async — nesting", () => {
  test("sync wrapping async", async () => {
    async function Inner() {
      await Promise.resolve();
      return h("b", null, "inner");
    }
    function Outer() {
      return h("div", null, h(Inner));
    }
    const el = h(Outer);
    expect(el.tagName).toBe("DIV");
    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent).toBe("inner");
  });

  test("async wrapping sync then async", async () => {
    const order: string[] = [];
    function Sync() {
      order.push("sync");
      return h("span", null, "s");
    }
    async function Inner() {
      await Promise.resolve();
      order.push("inner");
      return h("b", null, "i");
    }
    async function Outer() {
      order.push("outer-start");
      await Promise.resolve();
      order.push("outer-end");
      return h("div", null, h(Sync), h(Inner));
    }
    const el = h(Outer);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 10));
    expect(order).toContain("sync");
    expect(order).toContain("inner");
    expect(el.textContent).toContain("s");
    expect(el.textContent).toContain("i");
    unmount(el as HTMLElement);
  });

  test("three levels of async nesting", async () => {
    async function L3() {
      await Promise.resolve();
      return h("span", null, "L3");
    }
    async function L2() {
      await Promise.resolve();
      return h("div", null, h(L3));
    }
    async function L1() {
      await Promise.resolve();
      return h("section", null, h(L2));
    }
    const el = h(L1);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe("L3");
    unmount(el as HTMLElement);
  });

  test("async component that returns DocumentFragment", async () => {
    function Comp() {
      const frag = document.createDocumentFragment();
      frag.append(h("span", null, "a"), h("span", null, "b"));
      return frag;
    }
    const el = h(Comp);
    expect(el.children.length).toBe(2);
  });
});

// ── 6. 资源清理 ─────────────────────────────────────

describe("async — resource cleanup", () => {
  test("signal updates inside async component stop after unmount", async () => {
    const [count, setCount] = use(0);
    let resolveNow: (v: any) => void;
    const p = new Promise((r) => {
      resolveNow = r;
    });

    async function Comp() {
      await p;
      return h("p", null, count);
    }

    const el = h(Comp);
    mount(el as HTMLElement, container);
    resolveNow!(h("p", null, "done"));
    await new Promise((r) => setTimeout(r, 0));

    expect(el.textContent).toBe("0");
    unmount(el as HTMLElement);

    // unmount 后信号不应再影响已移除的 DOM
    setCount(99);
    expect(el.textContent).toBe("0");
  });

  test("onUnmount cleanup prevents memory leak of unresolved promise", async () => {
    let leaked = false;
    async function Comp(_: any, { onUnmount }: any) {
      onUnmount(() => {
        leaked = true;
      });
      await new Promise(() => {}); // never resolves
      return h("p");
    }
    const el = h(Comp);
    mount(el as HTMLElement, container);
    unmount(el as HTMLElement);
    expect(leaked).toBe(true);
  });

  test("async component with interval cleanup", async () => {
    let intervalCleared = false;
    async function Comp(_: any, { onMount, onUnmount }: any) {
      onMount(() => {
        const id = setInterval(() => {}, 1000);
        onUnmount(() => {
          clearInterval(id);
          intervalCleared = true;
        });
      });
      await Promise.resolve();
      return h("p");
    }
    const el = h(Comp);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    unmount(el as HTMLElement);
    expect(intervalCleared).toBe(true);
  });
});

// ── 7. 与 when/each 协作 ─────────────────────────────

describe("async — directives interaction", () => {
  test("async component inside when renders after resolve", async () => {
    const [visible] = use(true);
    async function Inner() {
      await Promise.resolve();
      return h("span", null, "loaded");
    }

    const el = h("div", { when: visible }, h(Inner));
    expect(el.children.length).toBe(1);

    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe("loaded");
  });

  test("async component in child position renders", async () => {
    async function Inner() {
      await Promise.resolve();
      return h("span", null, "loaded");
    }

    const div = h("div", null, h(Inner));
    expect(div.children.length).toBe(1);

    await new Promise((r) => setTimeout(r, 10));
    expect(div.textContent).toBe("loaded");
  });

  test("async component inside each item", async () => {
    const [items] = use([1, 2]);
    async function Item({ val }: { val: number }) {
      await Promise.resolve();
      return h("li", null, String(val));
    }
    const el = h("ul", { each: items, key: (v: number) => v }, (item: () => number) =>
      h(Item as any, { val: item() }),
    );
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 10));
    expect(el.children.length).toBe(2);
    expect(el.textContent).toContain("1");
    expect(el.textContent).toContain("2");
    unmount(el as HTMLElement);
  });

  test("each with sync items renders sync children", () => {
    const [items] = use(["x", "y"]);
    const el = h("ul", { each: items, key: (v: string) => v }, (item: () => string) =>
      h("li", null, item),
    );
    expect(el.children.length).toBe(2);
  });
});

// ── 8. SSR 中的异步组件 ─────────────────────────────

describe("async — SSR", () => {
  test("renderToString throws for async component", () => {
    const { renderToString } = require("../../src/server/index.ts");
    async function AsyncComp() {
      return h("p", null, "async");
    }
    expect(() => renderToString(AsyncComp)).toThrow("Async components");
  });

  test("renderToString still works after async throw (mode restored)", () => {
    async function Bad() {
      return h("p");
    }
    function Good() {
      return h("p", null, "ok");
    }

    expect(() => renderToString(Bad)).toThrow();

    const html = renderToString(Good);
    expect(html).toBe("<p>ok</p>");
  });
});

// ── 9. 内存泄漏压力测试 ─────────────────────────────

describe("async — memory stress", () => {
  test("create and destroy 100 async components", async () => {
    const orig = console.error;
    console.error = () => {};

    for (let i = 0; i < 100; i++) {
      async function N() {
        if (i % 3 === 0) throw new Error("fail");
        await Promise.resolve();
        return h("span", null, String(i));
      }
      const el = h(N);
      mount(el as HTMLElement, container);
      await new Promise((r) => setTimeout(r, 0));
      unmount(el as HTMLElement);
    }
    // 不爆内存、不崩溃
    console.error = orig;
  });

  test("rapid mount/unmount cycle", async () => {
    const orig = console.error;
    console.error = () => {};

    async function Quick() {
      await Promise.resolve();
      return h("p", null, "x");
    }

    for (let i = 0; i < 50; i++) {
      const el = h(Quick);
      mount(el as HTMLElement, container);
      unmount(el as HTMLElement);
      // 不给微任务机会——测试 unmount 在 resolve 前
    }

    await new Promise((r) => setTimeout(r, 10));
    console.error = orig;
  });
});

// ── 10. 信号与推导 ──────────────────────────────────

describe("async — signals & derivations", () => {
  test("async component can read signals from outer scope", async () => {
    const [msg] = use("hello");
    async function Comp() {
      await Promise.resolve();
      return h("p", null, msg);
    }
    const el = h(Comp);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent).toBe("hello");
    unmount(el as HTMLElement);
  });

  test("async component creates derivation that updates after resolve", async () => {
    const [count, setCount] = use(0);
    async function Comp() {
      await Promise.resolve();
      const [doubled] = use(count, () => count() * 2);
      return h("p", null, doubled);
    }
    const el = h(Comp);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent).toBe("0");

    setCount(5);
    expect(el.textContent).toBe("10");
    unmount(el as HTMLElement);
  });

  test("signal binding from async component updates after resolve", async () => {
    const [count, setCount] = use(0);
    const [doubled] = use(count, () => count() * 2);

    async function Comp() {
      await Promise.resolve();
      return h("p", null, doubled);
    }

    const el = h(Comp);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent).toBe("0");

    setCount(5);
    expect(el.textContent).toBe("10");
    unmount(el as HTMLElement);
  });
});

// ── 11. onMount 已挂载后调用 ─────────────────────────

describe("async — onMount after mount", () => {
  test("onMount called after resolve fires immediately", async () => {
    const order: string[] = [];
    async function Comp(_: any, { onMount }: any) {
      onMount(() => {
        order.push("first");
        // 已挂载后调用 → 立即执行
        onMount(() => order.push("immediate"));
      });
      await Promise.resolve();
      return h("p");
    }
    const el = h(Comp);
    mount(el as HTMLElement, container);
    await new Promise((r) => setTimeout(r, 0));
    expect(order).toEqual(["first", "immediate"]);
    unmount(el as HTMLElement);
  });
});

// ── 12. 非函数返回值 ────────────────────────────────

describe("async — non-function returns", () => {
  test("async function that returns a Promise directly", async () => {
    function Comp() {
      return Promise.resolve(h("p", null, "promise"));
    }
    const el = h(Comp);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.textContent).toBe("promise");
  });

  test("async function with .then() chain", async () => {
    function Comp() {
      return fetch("data:text/plain,hello")
        .then((r) => r.text())
        .then((t) => h("p", null, t));
    }
    const el = h(Comp);
    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe("hello");
  });
});
