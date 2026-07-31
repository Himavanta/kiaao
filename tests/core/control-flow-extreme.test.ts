// @vitest-environment happy-dom
// 控制流组件极端测试 —— 函数子元素即组件

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, Show, Case, Each, use, triggerMount, type HResult } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

/** 辅助：将 HResult 挂到 DOM 并 triggerMount */
function mount(result: HResult): HTMLElement {
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(container, node as Node);
  }
  if (result.owner) triggerMount(result.owner);
  return container;
}

/** 辅助：获取锚点之前的内容节点 */
function contentBefore(result: HResult): Node[] {
  const anchor = result.nodes[result.nodes.length - 1] as Node;
  const nodes: Node[] = [];
  let prev = anchor.previousSibling;
  while (prev) {
    nodes.unshift(prev);
    prev = prev.previousSibling;
  }
  return nodes;
}

// ═══════════════════════════════════════════════════════
// Show — 极端场景
// ═══════════════════════════════════════════════════════

describe("Show 极端", () => {
  test("快速开关 100 次不泄漏、不崩溃", () => {
    const visible = use(true);
    let mountCount = 0;
    let unmountCount = 0;

    function Primary(_: unknown, { onMount, onUnmount }: any) {
      onMount(() => mountCount++);
      onUnmount(() => unmountCount++);
      return h("span", null, "on");
    }
    function Fallback(_: unknown, { onMount, onUnmount }: any) {
      onMount(() => mountCount++);
      onUnmount(() => unmountCount++);
      return h("span", null, "off");
    }

    const result = h(Show as any, { value: visible }, Primary, Fallback);
    mount(result);

    for (let i = 0; i < 100; i++) {
      visible(!visible());
    }

    // mount 次数应该远小于 toggle 次数（分支只创建一次，后续复用复用）
    expect(mountCount).toBeGreaterThanOrEqual(2); // 至少两个分支各挂载过一次
    expect(unmountCount).toBeGreaterThanOrEqual(1); // 至少一个分支被卸载过
  });

  test("fallback 分支内使用 context.use 创建组件级信号", () => {
    const visible = use(false);
    let fallbackSignal: any = null;

    function Fallback(_: unknown, { use }: any) {
      const count = use(0);
      fallbackSignal = count;
      return h("span", null, count);
    }

    const result = h(Show as any, { value: visible }, () => h("span", null, "on"), Fallback);
    const container = mount(result);

    expect(container.textContent).toBe("0");
    fallbackSignal(42);
    expect(container.textContent).toBe("42");

    // 切到 primary，fallback 应卸载
    visible(true);
    fallbackSignal(99);
    expect(container.textContent).toBe("on"); // fallback 信号不再影响 DOM
  });

  test("嵌套 Show — 内外分支生命周期独立", () => {
    const outer = use(true);
    const inner = use(true);
    const events: string[] = [];

    function OuterPrimary(_: unknown, { onMount, onUnmount }: any) {
      onMount(() => events.push("outer-mount"));
      onUnmount(() => events.push("outer-unmount"));
      return h(
        Show as any,
        { value: inner },
        (_: unknown, { onMount, onUnmount }: any) => {
          onMount(() => events.push("inner-mount"));
          onUnmount(() => events.push("inner-unmount"));
          return h("span", null, "inner-on");
        },
        (_: unknown, { onMount, onUnmount }: any) => {
          onMount(() => events.push("inner-fallback-mount"));
          onUnmount(() => events.push("inner-fallback-unmount"));
          return h("span", null, "inner-off");
        },
      );
    }

    const result = h(Show as any, { value: outer }, OuterPrimary);
    mount(result);
    expect(events).toContain("outer-mount");
    expect(events).toContain("inner-mount");

    // 关内层
    inner(false);
    expect(events).toContain("inner-unmount");
    expect(events).toContain("inner-fallback-mount");

    // 关外层 — 内层也应全部清理
    outer(false);
    expect(events).toContain("outer-unmount");
    expect(events).toContain("inner-fallback-unmount");
  });

  test("只在 falsy 分支传入 — 无 fallback 时只渲染锚点", () => {
    const result = h(Show as any, { value: false }, () => h("span", null, "never"));
    mount(result);
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0] as Node).nodeType).toBe(8); // 注释锚点
  });
});

// ═══════════════════════════════════════════════════════
// Case — 极端场景
// ═══════════════════════════════════════════════════════

describe("Case 极端", () => {
  test("快速切换键 100 次，生命周期正确", () => {
    const key = use("a");
    const mounts: Record<string, number> = {};
    const unmounts: Record<string, number> = {};

    function makeBranch(name: string) {
      return (_: unknown, { onMount, onUnmount }: any) => {
        onMount(() => (mounts[name] = (mounts[name] || 0) + 1));
        onUnmount(() => (unmounts[name] = (unmounts[name] || 0) + 1));
        return h("span", null, name);
      };
    }

    const map = {
      a: makeBranch("a"),
      b: makeBranch("b"),
      c: makeBranch("c"),
    };

    const result = h(Case as any, { value: key }, map);
    mount(result);

    const keys = ["a", "b", "c", "a", "b", "c"];
    for (let i = 0; i < 100; i++) {
      key(keys[i % keys.length]);
    }

    // 每个分支至少挂载过一次
    expect(mounts.a).toBeGreaterThanOrEqual(1);
    expect(mounts.b).toBeGreaterThanOrEqual(1);
    expect(mounts.c).toBeGreaterThanOrEqual(1);
  });

  test("fallback 分支内使用 context.use + onMount", () => {
    const key = use("unknown");
    let fallbackMounted = false;
    let fallbackSignal: any = null;

    function Fallback(_: unknown, { use, onMount }: any) {
      onMount(() => (fallbackMounted = true));
      fallbackSignal = use("fallback-value");
      return h("span", null, fallbackSignal);
    }

    const map = {
      home: () => h("span", null, "home"),
    };

    const result = h(Case as any, { value: key }, map, Fallback);
    const container = mount(result);

    expect(fallbackMounted).toBe(true);
    expect(container.textContent).toBe("fallback-value");

    fallbackSignal("updated");
    expect(container.textContent).toBe("updated");
  });

  test("映射表值支持直接组件引用和箭头包装混用", () => {
    const key = use("a");

    function CompA() {
      return h("span", { class: "a" }, "A");
    }

    const map = {
      a: CompA,
      b: (props: unknown, ctx: any) => {
        const v = ctx.use("b-value");
        return h("span", { class: "b" }, v);
      },
    };

    const result = h(Case as any, { value: key }, map);
    const container = mount(result);
    expect(container.querySelector(".a")?.textContent).toBe("A");

    key("b");
    expect(container.querySelector(".b")?.textContent).toBe("b-value");
  });
});

// ═══════════════════════════════════════════════════════
// Each — 极端场景
// ═══════════════════════════════════════════════════════

describe("Each 极端", () => {
  test("列表项内使用 context.use — 每项独立信号", () => {
    const items = use([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);
    const itemSignals: any[] = [];

    function ItemRow({ item, index }: { item: () => any; index: number }, { use }: any) {
      const local = use(item().text);
      itemSignals.push(local);
      return h("li", null, String(index + 1), ". ", local);
    }

    const result = h(Each as any, { value: items, keyed: (it: any) => it.id }, ItemRow);
    const container = mount(result);

    expect(contentBefore(result)).toHaveLength(2);
    expect(container.textContent).toContain("1. A");
    expect(container.textContent).toContain("2. B");

    // 第一项的组件级信号独立
    itemSignals[0]("A-modified");
    expect(container.textContent).toContain("1. A-modified");
    expect(container.textContent).toContain("2. B"); // 第二项不受影响
  });

  test("100 项列表渲染，每项独立生命周期", () => {
    const data = Array.from({ length: 100 }, (_, i) => ({ id: i, text: String(i) }));
    const items = use(data);
    let mountCount = 0;
    let unmountCount = 0;

    function ItemRow({ item }: { item: () => any }, { onMount, onUnmount }: any) {
      onMount(() => mountCount++);
      onUnmount(() => unmountCount++);
      return h("li", null, String(item().text));
    }

    const result = h(Each as any, { value: items, keyed: (it: any) => it.id }, ItemRow);
    const container = mount(result);

    expect(contentBefore(result)).toHaveLength(100);
    expect(mountCount).toBe(100);

    // 缩减到 1 项
    items([{ id: 0, text: "0" }]);
    expect(contentBefore(result)).toHaveLength(1);
    expect(unmountCount).toBe(99);
    expect(container.querySelector("li")?.textContent).toBe("0");
  });

  test("空 → 有数据 → 空的完整周期", () => {
    const items = use([] as { id: number; text: string }[]);
    let emptyMounted = 0;
    let emptyUnmounted = 0;

    function ItemRow({ item }: { item: () => any }) {
      return h("li", null, String(item().text));
    }
    function EmptyState(_: unknown, { onMount, onUnmount }: any) {
      onMount(() => emptyMounted++);
      onUnmount(() => emptyUnmounted++);
      return h("li", { class: "empty" }, "No items");
    }

    const result = h(Each as any, { value: items, keyed: (it: any) => it.id }, ItemRow, EmptyState);
    const container = mount(result);

    expect(emptyMounted).toBe(1);
    expect(container.querySelector(".empty")?.textContent).toBe("No items");

    // 添加数据
    items([{ id: 1, text: "A" }]);
    expect(emptyUnmounted).toBe(1);
    expect(contentBefore(result)).toHaveLength(1);
    expect((contentBefore(result)[0] as HTMLElement).tagName).toBe("LI");

    // 清空
    items([]);
    expect(container.querySelector(".empty")?.textContent).toBe("No items");
    expect(emptyMounted).toBe(2); // 再次挂载
  });

  test("无 keyed 时完整重建，keyed 时保留 DOM", () => {
    const items = use([{ id: 1, text: "A" }]);
    const destroyCount = { keyed: 0, unkeyed: 0 };

    function KeyedRow({ item }: { item: () => any }, { onUnmount }: any) {
      onUnmount(() => destroyCount.keyed++);
      return h("li", null, String(item().text));
    }
    function UnkeyedRow({ item }: { item: () => any }, { onUnmount }: any) {
      onUnmount(() => destroyCount.unkeyed++);
      return h("li", null, String(item().text));
    }

    const r1 = h(Each as any, { value: items, keyed: (it: any) => it.id }, KeyedRow);
    const r2 = h(Each as any, { value: items }, UnkeyedRow);
    mount(r1);
    mount(r2);

    items([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);

    // keyed: id=1 保留，不卸载
    expect(destroyCount.keyed).toBe(0);
    // unkeyed: 旧的全部销毁，新的全部创建
    expect(destroyCount.unkeyed).toBe(1);
  });

  test("Each 内嵌 Show — 每项的交互独立", () => {
    const items = use([
      { id: 1, text: "A", done: false },
      { id: 2, text: "B", done: false },
    ]);

    function TodoItem({ item }: { item: () => any }, { use }: any) {
      const done = use(item, () => item().done);
      const text = use(item, () => item().text);
      return h(
        "li",
        null,
        h(
          Show as any,
          { value: done },
          () => h("span", { class: "done" }, text),
          () => h("span", { class: "todo" }, text),
        ),
      );
    }

    const result = h(Each as any, { value: items, keyed: (it: any) => it.id }, TodoItem);
    const container = mount(result);

    // 两项都是 "todo" 状态
    expect(container.querySelectorAll(".todo")).toHaveLength(2);
    expect(container.querySelectorAll(".done")).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════
// Each — item 逻辑只读
// ═══════════════════════════════════════════════════════

describe("Each item 只读", () => {
  test("写入 item(newVal) 是空操作，值不变", () => {
    const items = use(["A"]);
    let itemRef: any = null;

    function ItemRow({ item }: { item: () => any }) {
      itemRef = item;
      return h("li", null, item);
    }

    const result = h(Each as any, { value: items }, ItemRow);
    const container = mount(result);

    expect(container.textContent).toBe("A");

    itemRef("Z");
    expect(container.textContent).toBe("A"); // 写入被忽略
  });

  test("item() 始终反映源数组最新值", () => {
    const items = use(["A"]);

    function ItemRow({ item }: { item: () => any }) {
      return h("li", null, item);
    }

    const result = h(Each as any, { value: items }, ItemRow);
    const container = mount(result);

    expect(container.textContent).toBe("A");

    items(["B"]);
    expect(container.textContent).toBe("B");
  });

  test("keyed diff 时 item 随源数组更新", () => {
    const items = use([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);

    function ItemRow({ item }: { item: () => any }, { use }: any) {
      const text = use(item, () => item().text);
      return h("li", null, text);
    }

    const result = h(Each as any, { value: items, keyed: (it: any) => it.id }, ItemRow);
    const container = mount(result);

    const items_list = () => container.querySelectorAll("li");
    expect(items_list()).toHaveLength(2);

    // 替换第二个，保留第一个
    items([
      { id: 1, text: "A-updated" },
      { id: 3, text: "C" },
    ]);
    expect(items_list()).toHaveLength(2);
    expect(items_list()[0]?.textContent).toBe("A-updated");
    expect(items_list()[1]?.textContent).toBe("C");
  });

  test("写入 item 不影响源数组", () => {
    const items = use(["A"]);
    let itemRef: any = null;

    function ItemRow({ item }: { item: () => any }) {
      itemRef = item;
      return h("li", null, item);
    }

    h(Each as any, { value: items }, ItemRow);

    itemRef("Z");
    expect(items()[0]).toBe("A"); // 源数组未变
  });

  test("多项列表每项的 item 独立", () => {
    const items = use(["A", "B", "C"]);
    const refs: any[] = [];

    function ItemRow({ item, index }: { item: () => any; index: number }) {
      refs[index] = item;
      return h("li", null, item);
    }

    const result = h(Each as any, { value: items }, ItemRow);
    const container = mount(result);

    expect(contentBefore(result)).toHaveLength(3);

    // 写入任一项都不影响 DOM
    refs[0]("X");
    refs[1]("Y");
    refs[2]("Z");
    expect(container.querySelectorAll("li")[0]?.textContent).toBe("A");
    expect(container.querySelectorAll("li")[1]?.textContent).toBe("B");
    expect(container.querySelectorAll("li")[2]?.textContent).toBe("C");
  });
});

// ═══════════════════════════════════════════════════════
// 组合场景
// ═══════════════════════════════════════════════════════

describe("控制流组合", () => {
  test("Each → Show → 信号联动", () => {
    const items = use([
      { id: 1, text: "A", done: false },
      { id: 2, text: "B", done: true },
      { id: 3, text: "C", done: false },
    ]);

    function TodoItem({ item }: { item: () => any }, { use }: any) {
      const done = use(item, () => item().done);
      const text = use(item, () => item().text);
      return h(
        "li",
        null,
        h(
          Show as any,
          { value: done },
          () => h("del", null, text),
          () => h("span", null, text),
        ),
      );
    }

    const result = h(Each as any, { value: items, keyed: (it: any) => it.id }, TodoItem);
    const container = mount(result);

    // B 已完成 → <del>，A/C 未完成 → <span>
    expect(container.querySelectorAll("del")).toHaveLength(1);
    expect(container.querySelectorAll("span")).toHaveLength(2); // A 和 C

    // 标记 C 为完成
    items([
      { id: 1, text: "A", done: false },
      { id: 2, text: "B", done: true },
      { id: 3, text: "C", done: true },
    ]);
    expect(container.querySelectorAll("del")).toHaveLength(2);
    expect(container.querySelectorAll("span")).toHaveLength(1);
  });

  test("Case → Show → 深层嵌套生命周期链", () => {
    const tab = use("a");
    const toggle = use(true);
    const lifecycles: string[] = [];

    function makeLeaf(name: string) {
      return (_: unknown, { onMount, onUnmount }: any) => {
        onMount(() => lifecycles.push(`${name}-mount`));
        onUnmount(() => lifecycles.push(`${name}-unmount`));
        return h("span", null, name);
      };
    }

    const map = {
      a: (_: unknown, ctx: any) => {
        ctx.onMount(() => lifecycles.push("a-mount"));
        ctx.onUnmount(() => lifecycles.push("a-unmount"));
        return h(Show as any, { value: toggle }, makeLeaf("inner-a"), makeLeaf("inner-b"));
      },
    };

    const result = h(Case as any, { value: tab }, map);
    mount(result);

    expect(lifecycles).toContain("a-mount");
    expect(lifecycles).toContain("inner-a-mount");

    // 切换内层 Show
    toggle(false);
    expect(lifecycles).toContain("inner-a-unmount");
    expect(lifecycles).toContain("inner-b-mount");
  });
});
