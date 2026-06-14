// @vitest-environment node
// kiaao v4 — registerSignalStop unit tests

import { expect, test, describe } from "vite-plus/test";
import { use, registerSignalStop } from "../../src/reactive/core.ts";

describe("registerSignalStop", () => {
  test("creates a new signal and calls register", () => {
    const registered: (() => void)[] = [];

    const [val, setVal] = registerSignalStop([42], (stop) => {
      registered.push(stop);
    });

    expect(val()).toBe(42);
    expect(registered.length).toBe(1);
    expect(typeof registered[0]).toBe("function");

    setVal(100);
    expect(val()).toBe(100);
  });

  test("creates derivation signal and calls register", () => {
    const registered: (() => void)[] = [];
    const [a] = use(5);

    const [b] = registerSignalStop([a, () => a() * 2], (stop) => {
      registered.push(stop);
    });

    expect(b()).toBe(10);
    expect(registered.length).toBe(1);
  });

  test("reference to existing signal does NOT call register", () => {
    const registered: (() => void)[] = [];
    const [a] = use(42);

    const [b] = registerSignalStop([a], (stop) => {
      registered.push(stop);
    });

    expect(b).toBe(a);
    expect(registered.length).toBe(0);
  });

  test("register is called with the stop function", () => {
    let capturedStop: (() => void) | null = null;

    registerSignalStop([0], (stop) => {
      capturedStop = stop;
    });

    expect(capturedStop).toBeDefined();
    expect(typeof capturedStop!).toBe("function");

    // Calling stop should not throw
    expect(() => capturedStop!()).not.toThrow();
  });

  test("multiple signals register multiple stops", () => {
    const registered: (() => void)[] = [];

    registerSignalStop([1], (stop) => registered.push(stop));
    registerSignalStop([2], (stop) => registered.push(stop));

    expect(registered.length).toBe(2);
  });

  test("works with signals that are already reactive", () => {
    const registered: (() => void)[] = [];
    const [a] = use(10);

    // Passing an existing signal should not register
    const [b] = registerSignalStop([a], (stop) => {
      registered.push(stop);
    });

    expect(registered.length).toBe(0);
    expect(b).toBe(a);
    expect(b()).toBe(10);
  });
});
