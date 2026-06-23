// kiaao — Owner tree tests
// Platform-agnostic: No DOM environment needed.

import { expect, test, describe } from "vite-plus/test";
import { createOwner, disposeOwner, triggerMount, currentOwner } from "../../src/core/owner.ts";
import { removeElement, setAdapter, type RenderAdapter } from "../../src/core/types.ts";

// ── Helpers ────────────────────────────────────────────

/** 验证 Owner 的默认状态 */
function expectFreshOwner(owner: any) {
  expect(owner.parent).toBe(null);
  expect(owner.children).toEqual([]);
  expect(owner.cleanups).toEqual([]);
  expect(owner.mountCallbacks).toEqual([]);
  expect(owner.unmountCallbacks).toEqual([]);
  expect(owner.elements.size).toBe(0);
  expect(owner.disposed).toBe(false);
}

// ── createOwner ────────────────────────────────────────

describe("createOwner", () => {
  test("creates an owner with default state", () => {
    const owner = createOwner();
    expectFreshOwner(owner);
  });

  test("multiple owners are independent", () => {
    const a = createOwner();
    const b = createOwner();
    expect(a).not.toBe(b);
    expectFreshOwner(a);
    expectFreshOwner(b);
  });
});

// ── Parent/Child Relationship ─────────────────────────

describe("parent/child relationship", () => {
  test("manual parent/child linking", () => {
    const parent = createOwner();
    const child = createOwner();
    child.parent = parent;
    parent.children.push(child);

    expect(child.parent).toBe(parent);
    expect(parent.children).toHaveLength(1);
    expect(parent.children[0]).toBe(child);
  });

  test("multiple children on same parent", () => {
    const parent = createOwner();
    const c1 = createOwner();
    const c2 = createOwner();
    const c3 = createOwner();

    for (const c of [c1, c2, c3]) {
      c.parent = parent;
      parent.children.push(c);
    }

    expect(parent.children).toHaveLength(3);
    expect(c1.parent).toBe(parent);
    expect(c2.parent).toBe(parent);
    expect(c3.parent).toBe(parent);
  });
});

// ── currentOwner ──────────────────────────────────────

describe("currentOwner", () => {
  test("initial state is null", () => {
    expect(currentOwner.get()).toBe(null);
  });

  test("set and get round-trip", () => {
    const owner = createOwner();
    currentOwner.set(owner);
    expect(currentOwner.get()).toBe(owner);
    currentOwner.set(null);
    expect(currentOwner.get()).toBe(null);
  });

  test("push/pop pattern preserves stack", () => {
    const parent = createOwner();
    const child = createOwner();

    currentOwner.set(parent);
    expect(currentOwner.get()).toBe(parent);

    const prev = currentOwner.get();
    currentOwner.set(child);
    expect(currentOwner.get()).toBe(child);

    currentOwner.set(prev);
    expect(currentOwner.get()).toBe(parent);

    currentOwner.set(null);
    expect(currentOwner.get()).toBe(null);
  });

  test("nested push/pop restores correctly", () => {
    const root = createOwner();
    const a = createOwner();
    const b = createOwner();

    currentOwner.set(root);
    currentOwner.set(a);
    const prevA = currentOwner.get();
    currentOwner.set(b);
    currentOwner.set(prevA);
    expect(currentOwner.get()).toBe(a);
    currentOwner.set(null);
  });
});

// ── disposeOwner: Basic ────────────────────────────────

describe("disposeOwner", () => {
  test("marks owner as disposed", () => {
    const owner = createOwner();
    expect(owner.disposed).toBe(false);
    disposeOwner(owner);
    expect(owner.disposed).toBe(true);
  });

  test("executes cleanup callbacks in order", () => {
    const owner = createOwner();
    const order: number[] = [];

    owner.cleanups.push(() => order.push(1));
    owner.cleanups.push(() => order.push(2));
    owner.cleanups.push(() => order.push(3));

    disposeOwner(owner);
    expect(order).toEqual([1, 2, 3]);
  });

  test("executes unmountCallbacks before cleanups", () => {
    const owner = createOwner();
    const order: string[] = [];

    owner.unmountCallbacks.push(() => order.push("unmount"));
    owner.cleanups.push(() => order.push("cleanup"));

    disposeOwner(owner);
    expect(order).toEqual(["unmount", "cleanup"]);
  });

  test("idempotent — multiple calls only execute once", () => {
    const owner = createOwner();
    let callCount = 0;
    owner.cleanups.push(() => callCount++);

    disposeOwner(owner);
    disposeOwner(owner);
    disposeOwner(owner);

    expect(callCount).toBe(1);
    expect(owner.disposed).toBe(true);
  });

  test("empty owner (no cleanups, no children, no elements) completes without error", () => {
    const owner = createOwner();
    expect(() => disposeOwner(owner)).not.toThrow();
  });
});

// ── disposeOwner: Element Removal ──────────────────────

describe("disposeOwner elements", () => {
  test("clears elements set after disposal", () => {
    const owner = createOwner();
    owner.elements.add("fake-node-1");
    owner.elements.add("fake-node-2");
    expect(owner.elements.size).toBe(2);

    disposeOwner(owner);
    expect(owner.elements.size).toBe(0);
  });

  test("removeElement is a no-op when no adapter registered", () => {
    // removeElement checks _adapter internally and skips if null
    expect(() => removeElement("anything")).not.toThrow();
  });
});

// ── disposeOwner: Children ────────────────────────────

describe("disposeOwner children", () => {
  test("recursively disposes all children", () => {
    const parent = createOwner();
    const child = createOwner();
    const grandchild = createOwner();

    child.parent = parent;
    parent.children.push(child);
    grandchild.parent = child;
    child.children.push(grandchild);

    disposeOwner(parent);

    expect(parent.disposed).toBe(true);
    expect(child.disposed).toBe(true);
    expect(grandchild.disposed).toBe(true);
  });

  test("disposes children even when children array is mutated during iteration", () => {
    // This test validates the [...children] snapshot guard.
    // If disposeOwner iterated children directly without a copy,
    // a child's disposal removing itself from the parent's children
    // would cause siblings to be skipped.
    const parent = createOwner();
    const children = [createOwner(), createOwner(), createOwner(), createOwner(), createOwner()];

    for (const c of children) {
      c.parent = parent;
      parent.children.push(c);
    }

    disposeOwner(parent);

    for (const c of children) {
      expect(c.disposed).toBe(true);
    }
    expect(parent.children).toHaveLength(0);
  });

  test("parent cleanup runs before child cleanup (parent cleanups step runs before recursive children)", () => {
    // disposeOwner order: unmountCallbacks → cleanups → elements → children
    // So parent's cleanups (step 2) run BEFORE recursive child disposal (step 4)
    const parent = createOwner();
    const child = createOwner();
    const order: number[] = [];

    parent.cleanups.push(() => order.push(1));
    child.cleanups.push(() => order.push(2));
    child.parent = parent;
    parent.children.push(child);

    disposeOwner(parent);
    expect(order).toEqual([1, 2]);
  });

  test("large number of child owners (1000)", () => {
    const parent = createOwner();
    for (let i = 0; i < 1000; i++) {
      const c = createOwner();
      c.parent = parent;
      parent.children.push(c);
    }

    expect(() => disposeOwner(parent)).not.toThrow();
    expect(parent.disposed).toBe(true);
    expect(parent.children).toHaveLength(0);
  });

  test("disposeOwner does not throw when called on already disposed owner in child tree", () => {
    const parent = createOwner();
    const child = createOwner();
    child.parent = parent;
    parent.children.push(child);

    // Pre-dispose the child
    disposeOwner(child);
    expect(child.disposed).toBe(true);

    // Parent disposal should skip already-disposed child
    expect(() => disposeOwner(parent)).not.toThrow();
  });
});

// ── triggerMount ───────────────────────────────────────

describe("triggerMount", () => {
  test("executes mount callbacks", () => {
    const owner = createOwner();
    let called = false;
    owner.mountCallbacks.push(() => {
      called = true;
    });

    triggerMount(owner);
    expect(called).toBe(true);
  });

  test("clears mountCallbacks after execution", () => {
    const owner = createOwner();
    owner.mountCallbacks.push(() => {});
    triggerMount(owner);
    expect(owner.mountCallbacks).toHaveLength(0);
  });

  test("does not execute on disposed owner", () => {
    const owner = createOwner();
    let called = false;
    owner.mountCallbacks.push(() => {
      called = true;
    });
    disposeOwner(owner);
    triggerMount(owner);
    expect(called).toBe(false);
  });

  test("empty owner completes without error", () => {
    const owner = createOwner();
    expect(() => triggerMount(owner)).not.toThrow();
  });

  test("recursive: fires parent before children (depth-first)", () => {
    const order: string[] = [];
    const parent = createOwner();
    const child = createOwner();

    parent.mountCallbacks.push(() => order.push("p"));
    child.parent = parent;
    parent.children.push(child);
    child.mountCallbacks.push(() => order.push("c"));

    triggerMount(parent);
    expect(order).toEqual(["p", "c"]);
  });

  test("recursive: fires children of multiple branches", () => {
    const order: string[] = [];
    const root = createOwner();
    const a = createOwner();
    const b = createOwner();
    const a1 = createOwner();
    const b1 = createOwner();

    root.mountCallbacks.push(() => order.push("root"));
    a.parent = root;
    root.children.push(a);
    a.mountCallbacks.push(() => order.push("a"));
    b.parent = root;
    root.children.push(b);
    b.mountCallbacks.push(() => order.push("b"));
    a1.parent = a;
    a.children.push(a1);
    a1.mountCallbacks.push(() => order.push("a1"));
    b1.parent = b;
    b.children.push(b1);
    b1.mountCallbacks.push(() => order.push("b1"));

    triggerMount(root);
    expect(order).toEqual(["root", "a", "a1", "b", "b1"]);
  });
});

// ── triggerMount: Cycle Protection ────────────────────

describe("triggerMount cycle protection", () => {
  test("prevents infinite recursion on circular parent reference", () => {
    const a = createOwner();
    const b = createOwner();

    // Create a cycle: a → b → a
    a.children.push(b);
    b.parent = a;
    b.children.push(a);
    a.parent = b;

    a.mountCallbacks.push(() => {});
    b.mountCallbacks.push(() => {});

    // Should not stack overflow
    expect(() => triggerMount(a)).not.toThrow();
  });

  test("provides idempotency via visited set", () => {
    const owner = createOwner();
    let callCount = 0;
    owner.mountCallbacks.push(() => callCount++);

    triggerMount(owner);
    triggerMount(owner); // Second call: callbacks already cleared
    triggerMount(owner); // Third call: no effect

    expect(callCount).toBe(1);
  });
});

// ── Combined: disposeOwner + triggerMount ─────────────

describe("disposeOwner + triggerMount interaction", () => {
  test("disposeOwner after triggerMount is safe", () => {
    const owner = createOwner();
    owner.mountCallbacks.push(() => {});
    owner.cleanups.push(() => {});

    triggerMount(owner);
    expect(() => disposeOwner(owner)).not.toThrow();
  });

  test("triggerMount after disposeOwner is skipped (disposed check)", () => {
    const owner = createOwner();
    let called = false;
    owner.mountCallbacks.push(() => {
      called = true;
    });
    disposeOwner(owner);
    triggerMount(owner);
    expect(called).toBe(false);
  });
});

// ── RenderAdapter: Type Compatibility ─────────────────

describe("RenderAdapter type compatibility", () => {
  test("a mock adapter satisfies the interface", () => {
    const mockAdapter: RenderAdapter = {
      createElement(tag: string) {
        return { type: "element", tag };
      },
      createTextNode(text: string) {
        return { type: "text", value: text };
      },
      createComment(text: string) {
        return { type: "comment", value: text };
      },
      insertBefore() {},
      removeElement() {},
      replaceWith() {},
      setAttribute() {},
      removeAttribute() {},
      addEventListener() {},
      removeEventListener() {},
      setProperty() {},
    };

    setAdapter(mockAdapter);
    const el = mockAdapter.createElement("div");
    expect(el).toEqual({ type: "element", tag: "div" });
  });
});
