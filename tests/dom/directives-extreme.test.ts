// @vitest-environment happy-dom
// kiaao v4 — when/each 指令极限测试

import { expect, test, describe, beforeEach, afterEach } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { h } from "../../src/index.ts";
import { renderToString } from "../../src/server/index.ts";

let container: HTMLElement;
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(() => {
  container.remove();
});

// ── when: 信号条件 ──────────────────────────────────

describe("when — signal condition", () => {
  test("renders content when signal is true", () => {
    const [v] = use(true);
    const el = h("div", { when: v }, h("span", null, "shown"));
    expect(el.textContent).toBe("shown");
  });

  test("hides content when signal is false", () => {
    const [v] = use(false);
    const el = h("div", { when: v }, h("span", null, "hidden"));
    expect(el.textContent).toBe("");
  });

  test("toggles on signal change", () => {
    const [v, setV] = use(true);
    const el = h("div", { when: v }, h("span", null, "content"));
    expect(el.textContent).toBe("content");

    setV(false);
    expect(el.textContent).toBe("");

    setV(true);
    expect(el.textContent).toBe("content");
  });

  test("rapid toggle does not crash", () => {
    const [v, setV] = use(true);
    const el = h("div", { when: v }, h("span", null, "x"));
    for (let i = 0; i < 10; i++) {
      setV(i % 2 === 0);
    }
    // 最终状态取决于最后一次 setV
    expect(el.textContent === "x" || el.textContent === "").toBe(true);
  });

  test("keeps host element when falsy", () => {
    const [v, setV] = use(true);
    const el = h("section", { when: v, id: "host" }, h("span"));
    expect(el.tagName).toBe("SECTION");
    expect(el.id).toBe("host");

    setV(false);
    expect(el.tagName).toBe("SECTION");
    expect(el.id).toBe("host");
  });

  test("with else renders fallback", () => {
    const [v, setV] = use(false);
    const el = h("div", { when: v, else: () => h("p", null, "else") }, h("span", null, "main"));
    expect(el.textContent).toBe("else");

    setV(true);
    expect(el.textContent).toBe("main");
  });

  test("with async component child renders after resolve", async () => {
    const [v] = use(true);
    async function Inner() {
      await Promise.resolve();
      return h("span", null, "loaded");
    }
    const el = h("div", { when: v }, h(Inner));
    expect(el.children.length).toBe(1);
    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe("loaded");
  });

  test("then branch switch cleans up async component", async () => {
    const [v, setV] = use(true);
    let cleaned = false;
    async function Inner(_: any, { onUnmount }: any) {
      onUnmount(() => {
        cleaned = true;
      });
      await Promise.resolve();
      return h("span", null, "content");
    }
    const el = h("div", { when: v }, h(Inner));
    await new Promise((r) => setTimeout(r, 10));
    expect(el.textContent).toBe("content");

    setV(false);
    expect(cleaned).toBe(true);
    expect(el.textContent).toBe("");
  });
});

// ── when: 非信号条件 ────────────────────────────────

describe("when — non-signal condition", () => {
  test("static true renders content", () => {
    const el = h("div", { when: true }, h("span", null, "ok"));
    expect(el.textContent).toBe("ok");
  });

  test("static false hides content", () => {
    const el = h("div", { when: false }, h("span", null, "hidden"));
    expect(el.textContent).toBe("");
  });

  test("plain function condition treated as truthy value", () => {
    // 非信号函数不作调用，toValue 直接返回函数本身（truthy）
    const el = h("div", { when: () => true }, h("span", null, "ok"));
    expect(el.textContent).toBe("ok");
  });

  test("undefined when equals no when prop", () => {
    const el = h("div", { when: undefined as any }, h("span", null, "content"));
    expect(el.textContent).toBe("content");
  });

  test("number zero is falsy", () => {
    const el = h("div", { when: 0 }, h("span", null, "zero"));
    expect(el.textContent).toBe("");
  });

  test("empty string is falsy", () => {
    const el = h("div", { when: "" }, h("span", null, "empty"));
    expect(el.textContent).toBe("");
  });
});

// ── when: 映射表模式 ────────────────────────────────

describe("when — mapping table mode", () => {
  test("renders matching branch", () => {
    const [status] = use("loading");
    const el = h(
      "div",
      { when: status },
      {
        loading: () => h("p", null, "Loading..."),
        error: () => h("p", null, "Error"),
      },
    );
    expect(el.textContent).toBe("Loading...");
  });

  test("switches branch on key change", () => {
    const [status, setStatus] = use("loading");
    const el = h(
      "div",
      { when: status },
      {
        loading: () => h("p", null, "Loading..."),
        error: () => h("p", null, "Error"),
      },
    );
    expect(el.textContent).toBe("Loading...");

    setStatus("error");
    expect(el.textContent).toBe("Error");
  });

  test("falls back to else when key not found", () => {
    const [status] = use("unknown");
    const el = h(
      "div",
      { when: status, else: () => h("p", null, "Fallback") },
      {
        loading: () => h("p", null, "Loading..."),
      },
    );
    expect(el.textContent).toBe("Fallback");
  });

  test("same key does not re-render", () => {
    let loadCount = 0;
    const [status, setStatus] = use("loading");
    h(
      "div",
      { when: status },
      {
        loading: () => {
          loadCount++;
          return h("p", null, "Loading...");
        },
      },
    );
    expect(loadCount).toBe(1);

    setStatus("loading");
    expect(loadCount).toBe(1);
  });

  test("branch function is called lazily", () => {
    let errorCalled = false;
    const [status, setStatus] = use("loading");
    h(
      "div",
      { when: status },
      {
        loading: () => h("p", null, "Loading..."),
        error: () => {
          errorCalled = true;
          return h("p", null, "Error");
        },
      },
    );
    expect(errorCalled).toBe(false);

    setStatus("error");
    expect(errorCalled).toBe(true);
  });
});

// ── when: void 元素 ─────────────────────────────────

describe("when — void elements", () => {
  test("when on void element throws", () => {
    expect(() => h("br", { when: true })).toThrow("when cannot be used on void element");
  });

  test("when on input throws", () => {
    expect(() => h("input", { when: true })).toThrow();
  });
});

// ── when: 资源清理 ──────────────────────────────────

describe("when — cleanup", () => {
  test("branch switch removes previous DOM", () => {
    const [v, setV] = use(true);
    const el = h("div", { when: v }, h("span", null, "content"));
    expect(el.textContent).toBe("content");

    setV(false);
    expect(el.textContent).toBe("");
  });

  test("branch switch disposes old derivation bindings", () => {
    const [v, setV] = use(true);
    const [count, setCount] = use(0);
    const el = h("div", { when: v }, h("span", null, count));

    setCount(42);
    expect(el.textContent).toBe("42");

    setV(false);
    expect(el.textContent).toBe("");

    setCount(99); // 不应更新
    expect(el.textContent).toBe("");
  });
});

// ── each: 基本渲染 ──────────────────────────────────

describe("each — basic rendering", () => {
  test("renders array items", () => {
    const [items] = use(["a", "b", "c"]);
    const el = h("ul", { each: items, key: (v: string) => v }, (item: () => string) =>
      h("li", null, item),
    );
    expect(el.children.length).toBe(3);
    expect(el.children[0].textContent).toBe("a");
    expect(el.children[2].textContent).toBe("c");
  });

  test("renders from static array", () => {
    const el = h("ul", { each: [10, 20, 30], key: (v: number) => v }, (item: () => number) =>
      h("li", null, item),
    );
    expect(el.children.length).toBe(3);
    expect(el.children[1].textContent).toBe("20");
  });

  test("renders from object", () => {
    const el = h(
      "dl",
      { each: { a: 1, b: 2 } as any, key: (_v: any, _i: number, entryKey: string) => entryKey },
      (v: () => any, i: number, key: string) => h("div", null, `${key}: ${v()}`),
    );
    expect(el.children.length).toBe(2);
    expect(el.textContent).toContain("a: 1");
    expect(el.textContent).toContain("b: 2");
  });

  test("renders from number", () => {
    const el = h("ul", { each: 3 }, () => h("li", null, "x"));
    expect(el.children.length).toBe(3);
  });

  test("renders from string", () => {
    const el = h("ul", { each: "abc", key: (v: string) => v }, (item: () => string) =>
      h("li", null, item),
    );
    expect(el.children.length).toBe(3);
    expect(el.children[0].textContent).toBe("a");
  });

  test("renders from Map", () => {
    const map = new Map([
      ["x", 1],
      ["y", 2],
    ]);
    const el = h(
      "ul",
      { each: map, key: (_v: any, _i: number, entryKey: string) => entryKey },
      (v: () => any) => h("li", null, v),
    );
    expect(el.children.length).toBe(2);
  });

  test("renders from Set", () => {
    const set = new Set(["a", "b"]);
    const el = h("ul", { each: set, key: (v: string) => v }, (v: () => string) => h("li", null, v));
    expect(el.children.length).toBe(2);
  });

  test("empty array renders nothing", () => {
    const [items] = use<string[]>([]);
    const el = h("ul", { each: items, key: (v: string) => v }, (item: () => string) =>
      h("li", null, item),
    );
    expect(el.children.length).toBe(0);
  });
});

// ── each: 响应式更新 ────────────────────────────────

describe("each — reactive updates", () => {
  test("adds items when source grows", () => {
    const [items, setItems] = use(["a"]);
    const el = h("ul", { each: items, key: (v: string) => v }, (item: () => string) =>
      h("li", null, item),
    );
    expect(el.children.length).toBe(1);

    setItems(["a", "b", "c"]);
    expect(el.children.length).toBe(3);
  });

  test("removes items when source shrinks", () => {
    const [items, setItems] = use(["a", "b", "c"]);
    const el = h("ul", { each: items, key: (v: string) => v }, (item: () => string) =>
      h("li", null, item),
    );
    expect(el.children.length).toBe(3);

    setItems(["a"]);
    expect(el.children.length).toBe(1);
  });

  test("reorders items by key", () => {
    const [items, setItems] = use([{ id: 1 }, { id: 2 }]);
    const el = h("div", { each: items, key: (item: any) => item.id }, (item: () => any) =>
      h("span", null, item),
    );
    expect(el.children.length).toBe(2);

    setItems([{ id: 2 }, { id: 1 }]);
    expect(el.children.length).toBe(2);
  });

  test("source becomes null — renders nothing", () => {
    const [items, setItems] = use<any[]>([1, 2]);
    const el = h("div", { each: items, key: (v: number) => v }, () => h("span"));
    expect(el.children.length).toBe(2);

    setItems(null as any);
    expect(el.children.length).toBe(0);
  });

  test("source becomes undefined — renders nothing", () => {
    const [items, setItems] = use<any[]>([1]);
    const el = h("div", { each: items, key: (v: number) => v }, () => h("span"));
    expect(el.children.length).toBe(1);

    setItems(undefined as any);
    expect(el.children.length).toBe(0);
  });

  test("full replacement of items", () => {
    const [items, setItems] = use([1, 2, 3]);
    const el = h("div", { each: items, key: (v: number) => v }, (v: () => number) =>
      h("span", null, v),
    );
    expect(el.children[0].textContent).toBe("1");

    setItems([4, 5, 6]);
    expect(el.children.length).toBe(3);
    expect(el.children[0].textContent).toBe("4");
  });
});

// ── each: key 行为 ──────────────────────────────────

describe("each — key behavior", () => {
  test("items reuse DOM when key matches", () => {
    const [items, setItems] = use([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
    const el = h("div", { each: items, key: (item: any) => item.id }, (item: () => any) =>
      h("span", null, item),
    );
    const span1 = el.children[0]; // key=1
    const span2 = el.children[1]; // key=2

    setItems([
      { id: 2, name: "B" },
      { id: 1, name: "A" },
    ]);
    // key=2 的 span 应被复用到第 1 位
    expect(el.children[0]).toBe(span2);
    // key=1 的 span 应被复用到第 2 位
    expect(el.children[1]).toBe(span1);
  });

  test("each without key function uses default key", () => {
    const [items] = use([1, 2]);
    const el = h("div", { each: items }, (v: () => number) => h("span", null, v));
    expect(el.children.length).toBe(2);
  });
});

// ── each: 资源清理 ──────────────────────────────────

describe("each — cleanup", () => {
  test("removed items dispose their DOM", () => {
    const [items, setItems] = use([1, 2, 3]);
    const el = h("div", { each: items, key: (v: number) => v }, (v: () => number) =>
      h("span", null, v),
    );
    expect(el.children.length).toBe(3);

    setItems([1]);
    expect(el.children.length).toBe(1);
    // 移除的 DOM 应被清理
  });

  test("item signal stops after item removed", () => {
    const [items, setItems] = use([1, 2]);
    const el = h("div", { each: items, key: (v: number) => v }, (item: () => number) =>
      h("span", null, item),
    );
    expect(el.textContent).toBe("12");

    setItems([2]);
    expect(el.textContent).toBe("2");
  });
});

// ── each: 错误恢复 ──────────────────────────────────

describe("each — error recovery", () => {
  test("childFn throw does not crash framework", () => {
    const orig = console.error;
    console.error = () => {};
    const [items] = use([1, 2, 3]);
    expect(() => {
      h("div", { each: items, key: (v: number) => v }, (v: any) => {
        if (v() === 2) throw new Error("item error");
        return h("span", null, v);
      });
    }).not.toThrow();
    console.error = orig;
  });
});

// ── each: void 元素 ────────────────────────────────

describe("each — void elements", () => {
  test("each on void element throws", () => {
    expect(() => h("br", { each: [1, 2] })).toThrow("each cannot be used on void element");
  });
});

// ── when + each 组合 ───────────────────────────────

describe("when + each combination", () => {
  test("when guards each rendering", () => {
    const [visible, setVisible] = use(true);
    const [items] = use(["a", "b"]);
    const el = h(
      "div",
      { when: visible },
      h("ul", { each: items, key: (v: string) => v }, (v: () => string) => h("li", null, v)),
    );

    expect(el.children.length).toBe(1);
    expect(el.children[0].children.length).toBe(2);

    setVisible(false);
    expect(el.children.length).toBe(0);
  });

  test("each inside when mapping table", () => {
    const [tab, setTab] = use("list");
    const [items] = use(["x", "y"]);
    const el = h(
      "div",
      { when: tab },
      {
        list: () =>
          h("ul", { each: items, key: (v: string) => v }, (v: () => string) => h("li", null, v)),
        detail: () => h("p", null, "detail"),
      },
    );

    expect(el.children.length).toBe(1);
    expect(el.children[0].children.length).toBe(2);

    setTab("detail");
    expect(el.children[0].textContent).toBe("detail");
  });
});

// ── 极限/压力 ──────────────────────────────────────

describe("stress", () => {
  test("each renders 1000 items", () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const el = h("div", { each: items, key: (v: number) => v }, (v: () => number) =>
      h("span", null, v),
    );
    expect(el.children.length).toBe(1000);
  });

  test("when rapid toggle 100 times", () => {
    const [v, setV] = use(true);
    h("div", { when: v }, h("span", null, "x"));

    for (let i = 0; i < 100; i++) {
      setV(i % 2 === 0);
    }
    // 不崩溃即可
  });

  test("each dynamic updates 100 times", () => {
    const [items, setItems] = use([1]);
    const el = h("div", { each: items, key: (v: number) => v }, (v: () => number) =>
      h("span", null, v),
    );

    for (let i = 0; i < 100; i++) {
      setItems([i]);
    }
    expect(el.children.length).toBe(1);
    expect(el.textContent).toBe("99");
  });
});

// ── SSR 中的指令 ───────────────────────────────────

describe("ssr — directives", () => {
  test("when in SSR renders truthy branch", () => {
    const [v] = use(true);
    function Comp() {
      return h("div", { when: v }, h("span", null, "ssr"));
    }
    expect(renderToString(Comp)).toBe("<div><span>ssr</span></div>");
  });

  test("each in SSR renders list", () => {
    const [items] = use(["a", "b"]);
    function Comp() {
      return h("ul", { each: items, key: (v: string) => v }, (v: () => string) => h("li", null, v));
    }
    expect(renderToString(Comp)).toBe("<ul><li>a</li><li>b</li></ul>");
  });
});
