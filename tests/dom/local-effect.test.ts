// @vitest-environment happy-dom
// kiaao v4 — local-effect 极限测试

import { expect, test, describe } from "vite-plus/test";
import { addLocalEffect, removeLocalEffect } from "../../src/dom/local-effect.ts";
import { LOCAL_EFFECTS } from "../../src/reactive/types.ts";

describe("addLocalEffect", () => {
  test("registers stop on node", () => {
    const el = document.createElement("div");
    const stop = () => {};
    addLocalEffect(el, stop);
    expect((el as any)[LOCAL_EFFECTS]).toBeInstanceOf(Set);
    expect((el as any)[LOCAL_EFFECTS].has(stop)).toBe(true);
  });

  test("multiple stops on same node", () => {
    const el = document.createElement("div");
    const stop1 = () => {};
    const stop2 = () => {};
    addLocalEffect(el, stop1);
    addLocalEffect(el, stop2);
    expect((el as any)[LOCAL_EFFECTS].size).toBe(2);
  });

  test("works on text node", () => {
    const tn = document.createTextNode("");
    const stop = () => {};
    addLocalEffect(tn, stop);
    expect((tn as any)[LOCAL_EFFECTS].has(stop)).toBe(true);
  });

  test("works on comment node", () => {
    const cm = document.createComment("");
    const stop = () => {};
    addLocalEffect(cm, stop);
    expect((cm as any)[LOCAL_EFFECTS].has(stop)).toBe(true);
  });
});

describe("removeLocalEffect", () => {
  test("removes registered stop", () => {
    const el = document.createElement("div");
    const stop = () => {};
    addLocalEffect(el, stop);
    expect((el as any)[LOCAL_EFFECTS]).toBeDefined();

    removeLocalEffect(el, stop);
    // remove 后 LOCAL_EFFECTS 被删除
    expect((el as any)[LOCAL_EFFECTS]).toBeUndefined();
  });

  test("deletes LOCAL_EFFECTS when set becomes empty", () => {
    const el = document.createElement("div");
    const stop = () => {};
    addLocalEffect(el, stop);
    removeLocalEffect(el, stop);
    expect((el as any)[LOCAL_EFFECTS]).toBeUndefined();
  });

  test("removing non-existent stop does nothing", () => {
    const el = document.createElement("div");
    const stop = () => {};
    addLocalEffect(el, () => {});
    expect(() => removeLocalEffect(el, stop)).not.toThrow();
  });

  test("removing from node with no LOCAL_EFFECTS does nothing", () => {
    const el = document.createElement("div");
    expect(() => removeLocalEffect(el, () => {})).not.toThrow();
  });
});

describe("stop function execution", () => {
  test("stops are called during LOCAL_EFFECTS iteration", () => {
    const el = document.createElement("div");
    let called = false;
    addLocalEffect(el, () => {
      called = true;
    });

    const stops = (el as any)[LOCAL_EFFECTS] as Set<() => void>;
    for (const stop of stops) stop();
    expect(called).toBe(true);
  });

  test("all stops are called even if one throws", () => {
    const orig = console.error;
    console.error = () => {};

    const el = document.createElement("div");
    const order: number[] = [];
    addLocalEffect(el, () => {
      order.push(1);
    });
    addLocalEffect(el, () => {
      throw new Error("fail");
    });
    addLocalEffect(el, () => {
      order.push(3);
    });

    const stops = (el as any)[LOCAL_EFFECTS] as Set<() => void>;
    for (const stop of stops) {
      try {
        stop();
      } catch {}
    }
    expect(order).toEqual([1, 3]);
    console.error = orig;
  });
});
