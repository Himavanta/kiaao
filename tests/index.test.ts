import { expect, test, describe } from "vite-plus/test";
import { define, effect, derive, romise } from "../src/index.ts";

describe("define", () => {
  test("getter without selector returns initial value", () => {
    const [count] = define(42);
    expect(count()).toBe(42);
  });

  test("setter updates value with direct new value", () => {
    const [count, setCount] = define(0);
    setCount(10);
    expect(count()).toBe(10);
  });

  test("setter accepts updater function", () => {
    const [count, setCount] = define(0);
    setCount((prev) => prev + 1);
    expect(count()).toBe(1);
  });

  test("getter with selector returns a reactive function", () => {
    const [user] = define({ name: "tom", age: 18 });
    const nameFn = user((v) => v.name);
    expect(typeof nameFn).toBe("function");
    expect(nameFn()).toBe("tom");
  });

  test("getter selector enables partial subscription", () => {
    const [user] = define({ name: "tom", age: 18 });
    const age = user((v) => v.age >= 18);
    expect(age()).toBe(true);
  });
});

describe("effect", () => {
  test("effect runs immediately", () => {
    let called = false;
    effect(() => {
      called = true;
    });
    expect(called).toBe(true);
  });

  test("effect re-runs when tracked signal changes", () => {
    const [count, setCount] = define(0);
    let calls = 0;

    effect(() => {
      count(); // track
      calls++;
    });

    expect(calls).toBe(1);

    setCount(1);
    expect(calls).toBe(2);
  });

  test("effect does NOT re-run for unrelated signals", () => {
    const [a, setA] = define(0);
    const [_b] = define(0);
    let calls = 0;

    effect(() => {
      a(); // track only a
      calls++;
    });

    expect(calls).toBe(1);

    setA(1); // tracked — re-runs
    expect(calls).toBe(2);
  });

  test("stop() cancels effect permanently", () => {
    const [count, setCount] = define(0);
    let calls = 0;

    const stop = effect(() => {
      count();
      calls++;
    });

    expect(calls).toBe(1);

    stop(); // cancel

    setCount(1);
    expect(calls).toBe(1); // should NOT have increased
  });

  test("selector subscription: only triggers when selected value changes", () => {
    const [user, setUser] = define({ name: "tom", age: 18 });
    let calls = 0;

    effect(() => {
      user((v) => v.name)(); // subscribe to name only
      calls++;
    });

    expect(calls).toBe(1);

    // Change age — name didn't change, so effect should NOT re-run
    setUser((prev) => ({ ...prev, age: 19 }));
    expect(calls).toBe(1);

    // Change name — effect should re-run
    setUser((prev) => ({ ...prev, name: "jerry" }));
    expect(calls).toBe(2);
  });
});

describe("derive", () => {
  test("derive computes derived value", () => {
    const [count] = define(5);
    const double = derive(() => count() * 2);
    expect(double()).toBe(10);
  });

  test("derive updates when upstream changes", () => {
    const [count, setCount] = define(3);
    const double = derive(() => count() * 2);

    expect(double()).toBe(6);

    setCount(4);
    expect(double()).toBe(8);
  });

  test("derive returns IS_REACTIVE marked function", () => {
    const [count] = define(0);
    const double = derive(() => count() * 2);
    expect((double as any)[Symbol.for("is_reactive")]).toBeUndefined();
    // Actually IS_REACTIVE is a local Symbol, so we can check typeof
    expect(typeof double).toBe("function");
  });

  test("derive with selector-based upstream", () => {
    const [user, setUser] = define({ name: "tom", age: 18 });
    const nameUpper = derive(() => user((v) => v.name)().toUpperCase());

    expect(nameUpper()).toBe("TOM");

    setUser((prev) => ({ ...prev, name: "jerry" }));
    expect(nameUpper()).toBe("JERRY");
  });
});

describe("romise", () => {
  test("resolves and sets data", async () => {
    const { data, loading } = romise(() => Promise.resolve("hello"));
    expect(data()).toBeNull();
    expect(loading()).toBe(true);

    await new Promise((r) => setTimeout(r, 0));
    expect(data()).toBe("hello");
    expect(loading()).toBe(false);
  });

  test("rejects and sets error", async () => {
    const { error, loading } = romise(() => Promise.reject(new Error("boom")));

    await new Promise((r) => setTimeout(r, 0));
    expect(error()!.message).toBe("boom");
    expect(loading()).toBe(false);
  });

  test("handles sync return value", async () => {
    const { data, loading } = romise(() => "sync" as any);

    await new Promise((r) => setTimeout(r, 0));
    expect(data()).toBe("sync");
    expect(loading()).toBe(false);
  });

  test("latest request wins (race condition)", async () => {
    const [dep, setDep] = define(0);
    let callCount = 0;
    let resolve: ((v: string) => void)[] = [];

    const { data } = romise(() => {
      const id = ++callCount;
      dep(); // 追踪依赖
      return new Promise<string>((r) => {
        resolve[id] = r;
      });
    });

    // 第一次请求
    await new Promise((r) => setTimeout(r, 0));

    // 触发第二次请求
    setDep(1);

    // 第二次请求先返回
    resolve[2]("second");
    await new Promise((r) => setTimeout(r, 0));
    expect(data()).toBe("second");

    // 第一次请求后返回，应被丢弃
    resolve[1]("first");
    await new Promise((r) => setTimeout(r, 0));
    expect(data()).toBe("second"); // 仍然是 second
  });

  test("non-Error rejection is wrapped", async () => {
    const { error } = romise(() => Promise.reject("string error"));

    await new Promise((r) => setTimeout(r, 0));
    expect(error()!.message).toBe("string error");
    expect(error()).toBeInstanceOf(Error);
  });
});
