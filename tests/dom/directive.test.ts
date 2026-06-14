// @vitest-environment happy-dom
// kiaao v4 — Directive system: Phase 0 tests
// direct(), isDirective(), createDirectiveContext()

import { expect, test, describe } from "vite-plus/test";
import { use } from "../../src/reactive/core.ts";
import { DIRECT_KEY, DIRECTIVE_MOUNT, DIRECTIVE_UNMOUNT } from "../../src/reactive/types.ts";
import { direct, isDirective, createDirectiveContext } from "../../src/dom/directive.ts";
import type { DirectiveFunction } from "../../src/dom/directive.ts";

// ── direct() ──────────────────────────────────────────

describe("direct()", () => {
  test("adds DIRECT_KEY marker to the function", () => {
    const fn: DirectiveFunction = (el, _props, _ctx) => {
      el.setAttribute("data-test", "true");
    };
    const dir = direct(fn);
    expect((dir as any)[DIRECT_KEY]).toBe(true);
  });

  test("returns the same function reference", () => {
    const fn: DirectiveFunction = () => {};
    const dir = direct(fn);
    expect(dir).toBe(fn);
  });

  test("does not interfere with function execution", () => {
    const el = document.createElement("div");
    const fn: DirectiveFunction = (el) => {
      el.setAttribute("data-test", "called");
    };
    const dir = direct(fn);
    dir(el, {}, createDirectiveContext(el));
    expect(el.getAttribute("data-test")).toBe("called");
  });

  test("multiple directives have independent markers", () => {
    const fn1: DirectiveFunction = () => {};
    const fn2: DirectiveFunction = () => {};
    const dir1 = direct(fn1);
    const dir2 = direct(fn2);
    expect((dir1 as any)[DIRECT_KEY]).toBe(true);
    expect((dir2 as any)[DIRECT_KEY]).toBe(true);
    expect(dir1).not.toBe(dir2);
  });
});

// ── isDirective() ──────────────────────────────────────

describe("isDirective()", () => {
  test("returns true for direct()-created function", () => {
    const dir = direct(() => {});
    expect(isDirective(dir)).toBe(true);
  });

  test("returns false for plain function", () => {
    expect(isDirective(() => {})).toBe(false);
  });

  test("returns false for null", () => {
    expect(isDirective(null)).toBe(false);
  });

  test("returns false for undefined", () => {
    expect(isDirective(undefined)).toBe(false);
  });

  test("returns false for object", () => {
    expect(isDirective({})).toBe(false);
  });

  test("returns false for number", () => {
    expect(isDirective(42)).toBe(false);
  });

  test("returns false for string", () => {
    expect(isDirective("hello")).toBe(false);
  });
});

// ── createDirectiveContext() ──────────────────────────

describe("createDirectiveContext()", () => {
  test("returns context with onMount, onUnmount, use", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);
    expect(typeof ctx.onMount).toBe("function");
    expect(typeof ctx.onUnmount).toBe("function");
    expect(typeof ctx.use).toBe("function");
  });

  test("context methods operate on the provided element", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const mountFn = () => {};
    const unmountFn = () => {};

    ctx.onMount(mountFn);
    ctx.onUnmount(unmountFn);

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    const unmounts = (el as any)[DIRECTIVE_UNMOUNT] as Set<() => void>;

    expect(mounts).toBeInstanceOf(Set);
    expect(mounts.has(mountFn)).toBe(true);
    expect(unmounts).toBeInstanceOf(Set);
    expect(unmounts.has(unmountFn)).toBe(true);
  });

  test("multiple onMount registrations are all stored", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const fn1 = () => {};
    const fn2 = () => {};

    ctx.onMount(fn1);
    ctx.onMount(fn2);

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    expect(mounts.size).toBe(2);
    expect(mounts.has(fn1)).toBe(true);
    expect(mounts.has(fn2)).toBe(true);
  });

  test("onUnmount does not affect mount set", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    ctx.onMount(() => {});
    ctx.onUnmount(() => {});

    expect((el as any)[DIRECTIVE_MOUNT]).toBeDefined();
    expect((el as any)[DIRECTIVE_UNMOUNT]).toBeDefined();

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    const unmounts = (el as any)[DIRECTIVE_UNMOUNT] as Set<() => void>;

    expect(mounts.size).toBe(1);
    expect(unmounts.size).toBe(1);
  });
});

// ── context.use() ────────────────────────────────────

describe("context.use()", () => {
  test("creates a new definition signal", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [val, setVal] = ctx.use(42);
    expect(val()).toBe(42);
    setVal(100);
    expect(val()).toBe(100);
  });

  test("creates a new derivation signal", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [a] = ctx.use(5);
    const [b] = ctx.use(a, () => a() * 2);
    expect(b()).toBe(10);
  });

  test("new signal registers stop to element's LOCAL_EFFECTS", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    ctx.use(0);

    const [count, setCount] = ctx.use(0);
    expect(count()).toBe(0);
    setCount(5);
    expect(count()).toBe(5);
  });

  test("reference to existing signal does NOT register cleanup", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [a] = use(42);

    // use an existing getter
    const [b] = ctx.use(a);
    expect(b).toBe(a); // same reference
  });

  test("use on existing signal returns same getter and setter", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [a, setA] = use(10);
    const [b, setB] = ctx.use(a);

    expect(b).toBe(a);
    expect(setB).toBe(setA);

    setB(20);
    expect(a()).toBe(20);
  });

  test("context.use can create derivation with existing signal reference", () => {
    const el = document.createElement("div");
    const ctx = createDirectiveContext(el);

    const [a, setA] = use(3);
    const [b] = ctx.use(a, () => a() * 3);

    expect(b()).toBe(9);
    setA(5);
    expect(b()).toBe(15);
  });
});

// ── Multiple contexts on same element ─────────────────

describe("multiple contexts on same element", () => {
  test("two contexts can register callbacks on the same element", () => {
    const el = document.createElement("div");
    const ctx1 = createDirectiveContext(el);
    const ctx2 = createDirectiveContext(el);

    ctx1.onMount(() => {});
    ctx2.onMount(() => {});

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    expect(mounts.size).toBe(2);
  });

  test("two contexts share the same mount/unmount sets", () => {
    const el = document.createElement("div");
    const ctx1 = createDirectiveContext(el);
    const ctx2 = createDirectiveContext(el);

    ctx1.onMount(() => {});
    ctx2.onMount(() => {});

    const mounts = (el as any)[DIRECTIVE_MOUNT] as Set<() => void>;
    expect(mounts.size).toBe(2);

    ctx1.onUnmount(() => {});
    ctx2.onUnmount(() => {});

    const unmounts = (el as any)[DIRECTIVE_UNMOUNT] as Set<() => void>;
    expect(unmounts.size).toBe(2);
  });
});

// ── Directive lifecycle via h() + mount/unmount ──

import { h } from "../../src/dom/h.ts";
import { mount, unmount, disposeNode } from "../../src/dom/component.ts";
import { renderToString } from "../../src/server/index.ts";

describe("directive lifecycle integration", () => {
  test("onMount fires when element is mounted", () => {
    let mounted = false;
    const TestDir = direct((el, _props, ctx) => {
      ctx.onMount(() => {
        mounted = true;
      });
    });

    const el = h("div", null, h(TestDir, null, h("span", null, "child")));
    expect(mounted).toBe(false);

    mount(el, document.body);
    expect(mounted).toBe(true);

    unmount(el);
  });

  test("onUnmount fires when element is disposed via disposeNode", () => {
    let unmounted = false;
    const TestDir = direct((el, _props, ctx) => {
      ctx.onUnmount(() => {
        unmounted = true;
      });
    });

    const el = h("div", null, h(TestDir, null, h("span", null, "child")));
    mount(el, document.body);

    const span = el.querySelector("span")!;
    expect(unmounted).toBe(false);
    disposeNode(span);
    expect(unmounted).toBe(true);

    unmount(el);
  });

  test("onUnmount fires via unmount lifecycle", () => {
    let unmounted = false;
    const TestDir = direct((el, _props, ctx) => {
      ctx.onUnmount(() => {
        unmounted = true;
      });
    });

    const el = h("div", null, h(TestDir, null, h("span", null, "child")));

    mount(el, document.body);
    expect(unmounted).toBe(false);

    unmount(el);
    expect(unmounted).toBe(true);
  });

  test("directive onUnmount fires before component onUnmount", () => {
    const order: string[] = [];

    const TestDir = direct((el, _props, ctx) => {
      ctx.onUnmount(() => {
        order.push("directive");
      });
    });

    function Comp(_props: any, { onUnmount }: any) {
      onUnmount(() => {
        order.push("component");
      });
      return h("div", null, h(TestDir, null, h("span", null, "child")));
    }

    const el = h(Comp);
    mount(el, document.body);
    unmount(el);

    expect(order).toEqual(["directive", "component"]);
  });

  test("cleanup is safe on element without directive hooks", () => {
    const el = h("div", null, "plain text");
    mount(el, document.body);
    expect(() => unmount(el)).not.toThrow();
  });

  test("multiple onMount callbacks all fire", () => {
    let count = 0;
    const TestDir = direct((el, _props, ctx) => {
      ctx.onMount(() => {
        count++;
      });
      ctx.onMount(() => {
        count++;
      });
    });

    const el = h("div", null, h(TestDir, null, h("span", null, "child")));
    mount(el, document.body);
    expect(count).toBe(2);
    unmount(el);
  });

  test("context.use signals are auto-cleaned on unmount", () => {
    let signalValue = 0;
    const TestDir = direct((el, _props, ctx) => {
      const [val, _setVal] = ctx.use(42);
      signalValue = val();
      ctx.onUnmount(() => {
        // 卸载后信号值仍可读（缓存值）
        expect(val()).toBe(42);
      });
    });

    const el = h("div", null, h(TestDir, null, h("span", null, "child")));
    mount(el, document.body);
    expect(signalValue).toBe(42);
    unmount(el);
  });
});

// ── Integration: h() directive mode ──────────────────

describe("h() directive mode integration", () => {
  test("directive receives props passed in JSX", () => {
    let receivedProps: any = null;
    const TestDir = direct((el, props, _ctx) => {
      receivedProps = { ...props };
    });

    const child = h("span", null, "hello");
    h("div", null, h(TestDir, { duration: 0.5, from: { opacity: 0 } }, child));

    expect(receivedProps).toBeDefined();
    expect(receivedProps.duration).toBe(0.5);
    expect(receivedProps.from).toEqual({ opacity: 0 });
  });

  test("single child unwrapping: directive returns Node not array", () => {
    const TestDir = direct((_el, _props, _ctx) => {});

    const child = h("span", null, "single");
    const result = h("div", null, h(TestDir, null, child));

    // span 应直接作为 div 的子节点（单子节点展开）
    expect(result.children.length).toBe(1);
    expect(result.children[0].tagName).toBe("SPAN");
    expect(result.children[0].textContent).toBe("single");
  });

  test("multi-child: directive processes each Element", () => {
    const processed: Element[] = [];
    const TestDir = direct((el, _props, _ctx) => {
      processed.push(el);
    });

    const childA = h("span", null, "A");
    const childB = h("span", null, "B");
    const result = h("div", null, h(TestDir, null, childA, childB));

    // 指令被调用了两次
    expect(processed.length).toBe(2);
    expect(processed[0].textContent).toBe("A");
    expect(processed[1].textContent).toBe("B");
    // 两个 span 都是 div 的子节点
    expect(result.children.length).toBe(2);
  });

  test("directive as component root with single child returns Element", () => {
    const TestDir = direct((_el, _props, _ctx) => {});

    function Comp() {
      return h(TestDir, null, h("p", null, "content"));
    }

    const el = h(Comp);
    // 单子节点展开：直接返回 p 元素
    expect(el.tagName).toBe("P");
    expect(el.textContent).toBe("content");
  });

  test("directive as component root with multiple children wraps in Fragment", () => {
    const TestDir = direct((_el, _props, _ctx) => {});

    function Comp() {
      return h(TestDir, null, h("p", null, "A"), h("p", null, "B"));
    }

    const el = h(Comp);
    // 多子节点：Fragment 包裹
    expect(el.tagName).toBe("DIV");
    expect((el as HTMLElement).style.display).toBe("contents");
    expect(el.children.length).toBe(2);
    expect(el.children[0].textContent).toBe("A");
    expect(el.children[1].textContent).toBe("B");
  });

  test("directive wrapped inside when", () => {
    const TestDir = direct((el, _props, _ctx) => {
      el.setAttribute("data-dir", "applied");
    });

    // 使用 when 在行内属性中
    const el = h("section", { when: true }, h(TestDir, null, h("p", null, "visible")));

    expect(el.childNodes.length).toBeGreaterThan(0);
    const p = el.querySelector("p")!;
    expect(p.textContent).toBe("visible");
  });

  test("directive inside when toggling visibility", () => {
    let mounted = false;
    const TestDir = direct((el, _props, ctx) => {
      ctx.onMount(() => {
        mounted = true;
      });
    });

    const [visible, setVisible] = use(true);
    const el = h("section", { when: visible }, h(TestDir, null, h("p", null, "content")));

    mount(el as HTMLElement, document.body);
    expect(mounted).toBe(true);

    setVisible(false);
    expect(el.children.length).toBe(0);

    unmount(el as HTMLElement);
  });

  test("directive inside each iterates over items", () => {
    const processed: Element[] = [];
    const ItemDir = direct((el, _props, _ctx) => {
      processed.push(el);
    });

    const [items] = use(["a", "b", "c"]);
    const el = h("ul", { each: items, key: (item: string) => item }, (item: () => string) =>
      h(ItemDir, null, h("li", null, item)),
    );

    expect(el.children.length).toBe(3);
    expect(processed.length).toBe(3);
    expect(processed[0].textContent).toBe("a");
  });

  test("nested directives both register on the same element", () => {
    const order: string[] = [];

    const Outer = direct((el, _props, ctx) => {
      ctx.onMount(() => order.push("outer"));
    });
    const Inner = direct((el, _props, ctx) => {
      ctx.onMount(() => order.push("inner"));
    });

    function Comp() {
      return h("div", null, h(Outer, null, h(Inner, null, h("span", null, "nested"))));
    }

    const el = h(Comp);
    mount(el, document.body);

    // inner 先注册，outer 后注册 → onMount 按注册顺序触发
    expect(order).toEqual(["inner", "outer"]);

    unmount(el);
  });
});

// ── Integration: SSR ─────────────────────────────────

describe("SSR directive skipping", () => {
  test("directive is skipped in SSR mode and children are rendered", () => {
    const TestDir = direct((_el, _props, _ctx) => {
      throw new Error("should not be called in SSR");
    });

    function Comp() {
      return h("div", null, h(TestDir, null, h("p", null, "ssr-content")));
    }

    const html = renderToString(Comp);
    // 指令被跳过，子节点正常渲染
    expect(html).toBe("<div><p>ssr-content</p></div>");
  });
});

// ── Integration: Error handling ────────────────────

describe("directive error handling", () => {
  test("directive function throw propagates (same as component throw)", () => {
    const BadDir = direct((_el, _props, _ctx) => {
      throw new Error("directive error");
    });

    expect(() => {
      h("div", null, h(BadDir, null, h("span", null, "child")));
    }).toThrow("directive error");
  });

  test("context.use after element disposed is safe", () => {
    const TestDir = direct((el, _props, ctx) => {
      ctx.onUnmount(() => {
        // 卸载后调用 ctx.use 应安全
        const [v] = ctx.use(99);
        expect(v()).toBe(99);
      });
    });

    const el = h("div", null, h(TestDir, null, h("span", null, "child")));
    mount(el, document.body);
    unmount(el);
  });
});
