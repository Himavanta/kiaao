// @vitest-environment happy-dom
// kiaao — 信号批量更新与竞争极端测试

import { setAdapter } from "../../src/adapter/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";
setAdapter(browserAdapter);

import { expect, test, describe } from "vite-plus/test";

import { use } from "../../src/core/signal.ts";

describe("信号批量写入", () => {
  test("多个信号同时写入（多 deps）", () => {
    const a = use(0);
    const b = use(0);
    const sum = use(a, b, () => a() + b());

    a(10);
    b(20);
    expect(sum()).toBe(30);
  });

  test("派生函数中修改另一个信号", () => {
    const a = use(0);
    const side = use(0);

    const b = use(a, () => {
      side(a() * 2);
      return a() + 1;
    });

    a(5);
    expect(b()).toBe(6);
    expect(side()).toBe(10);
  });

  test("派生链中修改中间信号（派生信号忽略 setter）", () => {
    const a = use(1);
    const b = use(a, () => a() * 10);

    const c = use(a, () => {
      b(a() * 100); // 派生信号的 setter 无效，会重新从 deps 计算
      return a() + 100;
    });

    a(2);
    expect(c()).toBe(102);
    // b 是派生信号，b(200) 被忽略，b 仍为 a()*10 = 20
    expect(b()).toBe(20);
  });

  test("信号写入导致派生重算，重算中再写入不崩溃", () => {
    const a = use(0);
    const log: number[] = [];

    use(a, () => {
      const v = a();
      log.push(v);
      if (v < 3) {
        a(v + 1); // 在派生中修改源信号
      }
      return v;
    });

    // a(0) 触发派生 → 派生中 a(1) → 触发派生 → a(2) → a(3) → 停止
    expect(log).toEqual([0, 1, 2, 3]);
  });
});

describe("1000 个信号同时触发", () => {
  test("1000 个信号创建不崩溃", () => {
    const signals: Array<ReturnType<typeof use<number>>> = [];
    for (let i = 0; i < 1000; i++) {
      signals.push(use(i));
    }
    expect(signals.length).toBe(1000);
    expect(signals[500]()).toBe(500);
  });

  test("1000 个派生监听同一源信号", () => {
    const src = use(0);
    const derived: Array<ReturnType<typeof use<number>>> = [];

    for (let i = 0; i < 1000; i++) {
      derived.push(use(src, () => src() + i));
    }

    // 所有派生初始正确
    for (let i = 0; i < 1000; i++) {
      expect(derived[i]()).toBe(i);
    }

    // 源信号变化
    src(10);
    for (let i = 0; i < 1000; i++) {
      expect(derived[i]()).toBe(10 + i);
    }
  });

  test("1000 个信号写入不崩溃", () => {
    const signals: Array<ReturnType<typeof use<number>>> = [];
    for (let i = 0; i < 1000; i++) {
      signals.push(use(0));
    }

    for (let i = 0; i < 1000; i++) {
      signals[i](i);
    }

    for (let i = 0; i < 1000; i++) {
      expect(signals[i]()).toBe(i);
    }
  });
});

describe("信号竞争", () => {
  test("同时写入和读取不崩溃", () => {
    const a = use(0);

    // 连续交替读写
    for (let i = 0; i < 100; i++) {
      a(a() + 1);
    }
    expect(a()).toBe(100);
  });

  test("多个派生共享同一中间信号", () => {
    const src = use(1);
    const mid = use(src, () => src() * 10);

    const branch1 = use(mid, () => mid() + 1);
    const branch2 = use(mid, () => mid() + 2);

    expect(branch1()).toBe(11);
    expect(branch2()).toBe(12);

    src(2);
    expect(branch1()).toBe(21);
    expect(branch2()).toBe(22);
  });
});
