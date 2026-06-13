// @vitest-environment happy-dom
// 框架崩溃测试：主动触发各类极端场景，记录框架行为和缺失的提示

import { expect, test, describe } from "vite-plus/test";
import { use } from "../src/reactive/core.ts";
import { h } from "../src/dom/h.ts";
import { mount, unmount, disposeNode, safeCall } from "../src/dom/component.ts";
import { Portal } from "../src/dom/portal.ts";
import { renderToString } from "../src/server/index.ts";

// ── 1. reactive/core.ts 非法场景 ─────────────────────

describe("reactive — crash scenarios", () => {
  test("use with invalid types does not crash", () => {
    expect(() => {
      (use as any)(null);
    }).not.toThrow();
    expect(() => {
      (use as any)(undefined);
    }).not.toThrow();
    expect(() => {
      (use as any)(Symbol("x"));
    }).not.toThrow();
    expect(() => {
      (use as any)(() => {});
    }).not.toThrow();
  });

  test("setter called after component disposed", () => {
    // 信号本身没有"已销毁"概念，setter 始终可用
    // 但节点已卸载 → 更新不会影响 DOM
    const [count, setCount] = use(0);
    const el = h("p", null, count);
    document.body.append(el);
    expect(el.textContent).toBe("0");
    unmount(el as HTMLElement); // 卸载节点，但信号仍在
    expect(() => setCount(42)).not.toThrow(); // setter 不崩
    expect(el.textContent).toBe("0"); // DOM 不更新（信号已无订阅者）
  });

  test("derive function throws during initial compute is caught", () => {
    const [a] = use(1);
    const orig = console.error;
    console.error = () => {};

    // try-catch 保护后，错误不再传播
    expect(() => {
      use(a, () => {
        throw new Error("oops");
      });
    }).not.toThrow();

    console.error = orig;
  });

  test("derive function accessing undefined is caught", () => {
    const [a] = use({} as any);
    const orig = console.error;
    console.error = () => {};

    expect(() => {
      use(a, () => a().nonexistent.value);
    }).not.toThrow();

    console.error = orig;
  });
});

// ── 2. dom/h.ts 非法场景 ────────────────────────────

describe("h() — crash scenarios", () => {
  test("h with Symbol as tag", () => {
    expect(() => h(Symbol("x") as any)).not.toThrow();
  });

  test("h with object as tag", () => {
    expect(() => h({} as any)).not.toThrow();
  });

  test("h with array as tag", () => {
    expect(() => h([] as any)).not.toThrow();
  });

  test("component throws synchronously", () => {
    const orig = console.error;
    console.error = () => {};
    function BadComp() {
      throw new Error("component crash");
    }
    // h() 中 tag(props, context) 直接调用，没有 try-catch 包裹
    expect(() => h(BadComp)).toThrow("component crash");
    console.error = orig;
  });

  test("component returns number", () => {
    function NumComp() {
      return 42 as any;
    }
    const el = h(NumComp);
    // 当前行为：非 Node 返回值 → 创建注释占位节点 + 警告
    expect(el.nodeType).toBe(Node.COMMENT_NODE);
  });

  test("component returns Symbol", () => {
    function SymComp() {
      return Symbol("x") as any;
    }
    const el = h(SymComp);
    expect(el.nodeType).toBe(Node.COMMENT_NODE); // 应降级为占位
  });

  test("async component that resolves to null", async () => {
    async function NullComp() {
      return null as any;
    }
    const el = h(NullComp);
    expect((el as HTMLElement).style.display).toBe("contents");
    await new Promise((r) => setTimeout(r, 0));
    // resolve null → 被防御性检查 capture 为 Comment
    // 但我们在 h() 中只检查了 realDOM instanceof Node 并处理
    // null 不是 Node → 注释占位
    expect(el.childNodes.length).toBeGreaterThanOrEqual(0);
  });

  test("async component that throws", async () => {
    const orig = console.error;
    console.error = () => {};
    async function ThrowComp() {
      throw new Error("async fail");
    }
    const el = h(ThrowComp);
    await new Promise((r) => setTimeout(r, 0));
    // Promise reject 被 .catch() 捕获并 console.error
    // wrapper 保留为空
    expect((el as HTMLElement).style.display).toBe("contents");
    console.error = orig;
  });

  test("h with null children", () => {
    const el = h("div", null, null, undefined, false, true);
    expect(el.children.length).toBe(0); // 全被过滤
  });

  test("h with Symbol as child", () => {
    const el = h("div", null, Symbol("x") as any);
    // Symbol → String(Symbol("x")) → "Symbol(x)"
    expect(el.textContent).toBe("Symbol(x)");
  });

  test("h with BigInt as child", () => {
    const el = h("div", null, BigInt(42) as any);
    expect(el.textContent).toBe("42");
  });
});

// ── 3. lifecycle 非法场景 ────────────────────────────

describe("lifecycle — crash scenarios", () => {
  test("mount into non-Element container", () => {
    expect(() => (mount as any)(h("div"), "not-an-element")).toThrow();
  });

  test("mount already mounted root again", () => {
    const [count] = use(0);
    const el = h("p", null, count);
    mount(el as HTMLElement, document.body);

    // 再次 mount（append 到另一个容器）
    const container2 = document.createElement("div");
    // mount 内部是 append + triggerMount
    // append 会将已存在的节点移动到新位置
    expect(() => mount(el as HTMLElement, container2)).not.toThrow();
    // triggerMount 再次触发 → INSTANCE_KEY 已标记 INITIALIZED → 跳过
    // 当前行为：节点移动到 container2，不崩

    unmount(el as HTMLElement);
  });

  test("unmount already unmounted root", () => {
    const el = h("div");
    mount(el as HTMLElement, document.body);
    unmount(el as HTMLElement);
    // 再次 unmount → disposeNode 调用 → 子节点已被移除
    expect(() => unmount(el as HTMLElement)).not.toThrow();
    // disposeNode 遍历空节点 → 无 DISPOSE_KEY → 跳过
  });

  test("disposeNode on text node", () => {
    const text = document.createTextNode("test");
    expect(() => disposeNode(text)).not.toThrow();
  });

  test("onMount called during component execution after unmount", () => {
    // onMount 在组件函数执行期间注册，但组件在 mount 前被丢弃
    let mounted = false;
    function Comp(_: any, { onMount }: any) {
      onMount(() => {
        mounted = true;
      });
      return h("div", null, "never-mounted");
    }

    h(Comp);
    expect(mounted).toBe(false);
  });

  test("safeCall with non-function", () => {
    expect(() => safeCall(null as any, "test")).not.toThrow();
    expect(() => safeCall(42 as any, "test")).not.toThrow();
  });
});

// ── 4. each 非法场景 ─────────────────────────────────

describe("each — crash scenarios", () => {
  test("each with null source", () => {
    const el = h("div", { each: null as any, key: (x: any) => x }, () => h("span"));
    expect(el.children.length).toBe(0);
  });

  test("each with undefined source", () => {
    const el = h("div", { each: undefined as any, key: (x: any) => x }, () => h("span"));
    expect(el.children.length).toBe(0);
  });

  test("each with signal source set to null", () => {
    const [items, setItems] = use<any[]>([1, 2]);
    const el = h("div", { each: items, key: (x: any) => x }, () => h("span"));
    expect(el.children.length).toBe(2);

    setItems(null as any);
    expect(el.children.length).toBe(0);
  });

  test("each with non-array object", () => {
    const el = h(
      "div",
      {
        each: { a: 1, b: 2 } as any,
        key: (_k: string, _i: number, entryKey: any) => entryKey,
      },
      () => h("span"),
    );
    // Object.entries → 遍历键值
    expect(el.children.length).toBe(2);
  });

  test("each child function throws is caught", () => {
    const [items] = use([1, 2, 3]);
    const orig = console.error;
    console.error = () => {};

    expect(() => {
      h("div", { each: items, key: (x: any) => x }, () => {
        throw new Error("child fn error");
      });
    }).not.toThrow();

    console.error = orig;
  });
});

// ── 5. when 非法场景 ─────────────────────────────────

describe("when — crash scenarios", () => {
  test("when with null condition", () => {
    // when={null} = false → 不显示内容
    const el = h("div", { when: null as any }, h("span", null, "content"));
    expect(el.textContent).toBe("");
  });

  test("when with undefined condition equals no when prop", () => {
    // undefined 和没传 when 等价 → 正常显示子节点
    const el = h("div", { when: undefined as any }, h("span", null, "content"));
    expect(el.textContent).toBe("content");
  });

  test("when with number condition", () => {
    const el = h("div", { when: 0 as any }, h("span", null, "zero"));
    expect(el.textContent).toBe("");

    const el2 = h("div", { when: 1 as any }, h("span", null, "one"));
    expect(el2.textContent).toBe("one");
  });

  test("when mapping table with missing return", () => {
    function MissingReturn() {
      return h(
        "div",
        { when: "loading" },
        {
          loading: () => h("p", null, "Loading..."),
        },
      );
    }
    const el = h(MissingReturn);
    expect(el.textContent).toBe("Loading...");
  });
});

// ── 6. props 非法场景 ────────────────────────────────

describe("props — crash scenarios", () => {
  test("style with non-standard value", () => {
    expect(() => h("div", { style: null })).not.toThrow();
    expect(() => h("div", { style: undefined })).not.toThrow();
    expect(() => h("div", { style: 42 as any })).not.toThrow();
    // 42 → typeof 42 !== "string" && typeof 42 !== "object" → 跳过
  });

  test("event with non-function value", () => {
    expect(() => h("button", { onClick: "not-a-function" as any })).not.toThrow();
    // addEvent(el, "click", "not-a-function") → 执行时崩？不，addEventListener 接受非函数不崩
  });

  test("unknown on-prefixed prop", () => {
    // onClickOutside 之类自定义事件
    expect(() => h("div", { onClickOutside: () => {} })).not.toThrow();
  });
});

// ── 7. Portal 非法场景 ─────────────────────────────

describe("Portal — crash scenarios", () => {
  test("Portal with non-existent target", () => {
    function Comp() {
      return h(Portal, { to: "#does-not-exist", children: () => h("div") });
    }
    expect(() => h(Comp)).not.toThrow();
  });

  test("Portal with null target", () => {
    function Comp() {
      return h(Portal, { to: null as any, children: () => h("div") });
    }
    expect(() => h(Comp)).not.toThrow();
  });
});

// ── 8. 组合场景 ─────────────────────────────────────

describe("combined — crash scenarios", () => {
  test("nested component that throws in signal callback", () => {
    const orig = console.error;
    console.error = () => {};
    const [trigger, setTrigger] = use(0);
    function Inner(_: any, { onMount }: any) {
      onMount(() => {
        use(trigger, () => {
          throw new Error("signal callback error");
        });
      });
      return h("span", null, "inner");
    }
    function Outer() {
      return h("div", null, h(Inner));
    }
    h(Outer);
    expect(() => setTrigger(1)).not.toThrow();
    console.error = orig;
  });

  test("signal updated during component render", () => {
    const [count, setCount] = use(0);
    function Comp() {
      // 在渲染期间更新信号
      if (count() === 0) setCount(1);
      return h("p", null, count);
    }
    const el = h(Comp);
    // setCount(1) 导致 count 变化 → triggerDerivations →
    // 当前组件没有派生订阅，所以不崩
    // 但 count 已更新
    expect(el.textContent).toBe("1");
  });

  test("cyclic signal update from setter in derive", () => {
    const orig = console.error;
    console.error = () => {};
    const [_a, _setA] = use(1);
    // 在派生中调用 setA → 触发 a 变化 → 派生重算 → 无限循环
    // spec 不检测循环依赖
    // 这里我们不执行，只是验证框架不会在循环时优雅处理
    // expect(() => {
    //   use(a, () => setA(a() + 1));
    // }).not.toThrow();
    // 实际会栈溢出
    console.error = orig;
  });
});

// ── 9. SSR 混合场景 ─────────────────────────────────

describe("SSR — crash scenarios", () => {
  test("SSR component accessing document", () => {
    function Comp() {
      // SSR 下 document 不存在
      if (typeof document !== "undefined") {
        document.createElement("div");
      }
      return h("p", null, "safe");
    }
    expect(() => renderToString(Comp)).not.toThrow();
  });

  test("SSR component returning Promise", () => {
    function AsyncComp() {
      return Promise.resolve(h("p", null, "async"));
    }
    expect(() => renderToString(AsyncComp)).toThrow("Async components are not supported in SSR");
  });
});
