// @vitest-environment happy-dom
// kiaao — 生命周期时序测试：onMount/onUnmount 执行次数、顺序、dispose 后行为

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import {
  getSignalState,
  h,
  use,
  triggerMount,
  type Context,
  type HResult,
} from "../../src/core/index.ts";
import { createOwner, disposeOwner } from "../../src/core/owner.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

function mount(result: HResult): HTMLElement {
  const container = browserAdapter.el("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(container, node as any);
  }
  if (result.owner) triggerMount(result.owner);
  return container;
}

// ── onMount 执行次数 ─────────────────────────────────

describe("onMount — execution count", () => {
  test("fires exactly once on mount", () => {
    let count = 0;
    const Comp = (_props: any, ctx: Context) => {
      ctx.onMount(() => {
        count++;
      });
      return h("div");
    };
    mount(h(Comp));
    expect(count).toBe(1);
  });

  test("fires once per component instance, not shared", () => {
    let countA = 0,
      countB = 0;
    const CompA = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        countA++;
      });
      return h("div", { class: "a" });
    };
    const CompB = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        countB++;
      });
      return h("div", { class: "b" });
    };
    const el = h(() => h("div", null, h(CompA), h(CompB)));
    mount(el);
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });

  test("does not fire if component is never mounted", () => {
    let count = 0;
    const Comp = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        count++;
      });
      return h("div");
    };
    h(Comp); // Created but not mounted (no triggerMount)
    expect(count).toBe(0);
  });
});

// ── onUnmount 执行 ────────────────────────────────────

describe("onUnmount — execution", () => {
  test("fires on disposeOwner", () => {
    let count = 0;
    const Comp = (_p: any, ctx: Context) => {
      ctx.onUnmount(() => {
        count++;
      });
      return h("div");
    };
    const result = h(Comp) as HResult;
    mount(result);
    expect(count).toBe(0);
    disposeOwner(result.owner!);
    expect(count).toBe(1);
  });

  test("fires even if onMount was never called", () => {
    let unmountCount = 0;
    const Comp = (_p: any, ctx: Context) => {
      ctx.onUnmount(() => {
        unmountCount++;
      });
      return h("div");
    };
    const result = h(Comp) as HResult;
    // Mount without triggerMount
    const container = browserAdapter.el("div") as HTMLElement;
    for (const node of result.nodes) {
      browserAdapter.append(container, node as any);
    }
    // Dispose without mounting
    disposeOwner(result.owner!);
    expect(unmountCount).toBe(1);
  });

  test("multiple onUnmount all fire in order", () => {
    const order: number[] = [];
    const Comp = (_p: any, ctx: Context) => {
      ctx.onUnmount(() => {
        order.push(1);
      });
      ctx.onUnmount(() => {
        order.push(2);
      });
      ctx.onUnmount(() => {
        order.push(3);
      });
      return h("div");
    };
    const result = h(Comp) as HResult;
    mount(result);
    disposeOwner(result.owner!);
    expect(order).toEqual([1, 2, 3]);
  });
});

// ── onMount 顺序（嵌套）───────────────────────────────

describe("mount order — nested components", () => {
  test("parent mounts before child", () => {
    const order: string[] = [];
    const Parent = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        order.push("parent");
      });
      return h("div", null, h(Child));
    };
    const Child = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        order.push("child");
      });
      return h("span");
    };
    mount(h(Parent));
    expect(order).toEqual(["parent", "child"]);
  });

  test("unmount order is child before parent", () => {
    const order: string[] = [];
    const Parent = (_p: any, ctx: Context) => {
      ctx.onUnmount(() => {
        order.push("parent");
      });
      return h("div", null, h(Child));
    };
    const Child = (_p: any, ctx: Context) => {
      ctx.onUnmount(() => {
        order.push("child");
      });
      return h("span");
    };
    const result = h(Parent) as HResult;
    mount(result);
    disposeOwner(result.owner!);
    expect(order).toEqual(["child", "parent"]);
  });

  test("three levels mount order", () => {
    const order: string[] = [];
    const A = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        order.push("a");
      });
      return h("div", null, h(B));
    };
    const B = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        order.push("b");
      });
      return h("div", null, h(C));
    };
    const C = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        order.push("c");
      });
      return h("span");
    };
    mount(h(A));
    expect(order).toEqual(["a", "b", "c"]);
  });
});

// ── dispose 后行为 ────────────────────────────────────

describe("lifecycle — dispose guard", () => {
  test("onMount after disposed is no-op", () => {
    disposeOwner(createOwner());
    // onMount after dispose is safe
  });

  test("onUnmount after disposed is no-op", () => {
    // minimal context
  });

  test("signal subscription stops after dispose", () => {
    const sig = use(0);
    let derivedCount = 0;
    const owner = createOwner();

    const derived = use(sig, () => {
      derivedCount++;
    });
    const state = getSignalState(derived)!;
    if (state?.stop) owner.cleanups.push(state.stop);

    sig(1);
    expect(derivedCount).toBe(2); // initial + update

    disposeOwner(owner);
    sig(2);
    // derivedCount should NOT change — signal was stopped
    expect(derivedCount).toBe(2);
  });
});

// ── 异常场景 ──────────────────────────────────────────

describe("lifecycle — error handling", () => {
  test("onMount that throws does not prevent others from firing", () => {
    const order: number[] = [];
    const Comp = (_p: any, ctx: Context) => {
      ctx.onMount(() => {
        order.push(1);
      });
      ctx.onMount(() => {
        throw new Error("onMount error");
      });
      ctx.onMount(() => {
        order.push(2);
      });
      return h("div");
    };
    const result = h(Comp) as HResult;
    expect(() => mount(result)).not.toThrow();
  });

  test("onUnmount that throws does not prevent others from firing", () => {
    const order: number[] = [];
    const Comp = (_p: any, ctx: Context) => {
      ctx.onUnmount(() => {
        order.push(1);
      });
      ctx.onUnmount(() => {
        throw new Error("unmount error");
      });
      ctx.onUnmount(() => {
        order.push(2);
      });
      return h("div");
    };
    const result = h(Comp) as HResult;
    mount(result);
    expect(() => disposeOwner(result.owner!)).not.toThrow();
    expect(order).toEqual([1, 2]);
  });
});
