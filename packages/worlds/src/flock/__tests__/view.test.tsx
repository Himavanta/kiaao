// @vitest-environment happy-dom
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// flock 的视图契约
//
// 这里锁的是一个**踩过的坑**（2026-10-08 实测发现）：
//
//   `style={{ translate: 信号 }}`   ❌ 信号不会被解包
//   `<StyleMemo value={{ translate: 信号 }}>`  ✅ 逐属性解包
//
// 差别是实质的：普通 `style` 对象把信号**函数本身**交给 CSSStyleDeclaration，
// 浏览器把它 stringify 成 `translate: function(...ar`——**位置静默失效**，
// 所有方块堆在原点（表现为「左上角一小块」）。
//
// 为什么难发现：SVG 折线用的是 `points` **属性**，不经过 style，
// 所以「线照画、方块全堆在一起」——看起来像逻辑错了，其实是样式通道错了。
//
// 这个坑必须靠测试锁：它不抛错、不告警，只是位置不动。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { setAdapter } from "kiaao/adapter";
import { browserAdapter, createApp } from "kiaao/dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import Flock from "../index.tsx";

setAdapter(browserAdapter);

/** rAF / 时钟替身：手动推进帧 */
function createDriver() {
  const queue = new Map<number, (t: number) => void>();
  let nextId = 1;
  let clock = 0;

  const raf = vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    const id = nextId++;
    queue.set(id, cb);
    return id;
  });
  const caf = vi
    .spyOn(globalThis, "cancelAnimationFrame")
    .mockImplementation(((id: any) => queue.delete(id)) as never);
  const now = vi.spyOn(performance, "now").mockImplementation(() => clock);

  return {
    tick() {
      clock += 16;
      const pending = [...queue.values()];
      queue.clear();
      for (const cb of pending) cb(clock);
    },
    restore() {
      raf.mockRestore();
      caf.mockRestore();
      now.mockRestore();
    },
  };
}

/** 取容器里所有方块（它们是 StyleMemo 渲染出的 div） */
function squares(): HTMLElement[] {
  const container = document.querySelector(".relative");
  if (!container) return [];
  return [...container.querySelectorAll("div")] as HTMLElement[];
}

/** 读一个方块的实际 translate 值 */
function translateOf(el: HTMLElement): string | undefined {
  return (el.getAttribute("style") ?? "").match(/translate:\s*([^;]+)/)?.[1];
}

describe("flock / 视图使用 StyleMemo（而非普通 style 对象）", () => {
  let driver: ReturnType<typeof createDriver>;

  beforeEach(() => {
    driver = createDriver();
    document.body.innerHTML = '<div id="app"></div>';
  });

  afterEach(() => {
    driver.restore();
  });

  test("15 个方块都渲染了", () => {
    const app = createApp(() => <Flock />);
    app.mount("#app");

    expect(squares().length).toBe(15);
    app.unmount();
  });

  test("translate 是真实数值——不是被 stringify 的信号函数", () => {
    const app = createApp(() => <Flock />);
    app.mount("#app");
    driver.tick();

    const values = squares().map(translateOf);
    for (const value of values) {
      expect(value).toBeDefined();
      // 这个坑的特征：写进去的是函数源码
      expect(value).not.toContain("function");
      // 真实值形如 "92.2px 70.5px"
      expect(value).toMatch(/^-?[\d.]+px -?[\d.]+px$/);
    }

    app.unmount();
  });

  test("方块位置各不相同——不是全部堆在原点", () => {
    const app = createApp(() => <Flock />);
    app.mount("#app");
    driver.tick();

    const values = squares().map(translateOf);
    expect(new Set(values).size).toBe(15);

    app.unmount();
  });

  test("折线数 = 方块数（每只鸟一条自己的痕迹）", () => {
    const app = createApp(() => <Flock />);
    app.mount("#app");
    driver.tick();

    const container = document.querySelector(".relative")!;
    expect(container.querySelectorAll("polyline").length).toBe(15);

    app.unmount();
  });
});
