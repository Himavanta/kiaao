// @vitest-environment happy-dom
// kiaao — adapter API 边界测试：before/append/remove/clear 极端场景

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

setAdapter(browserAdapter);

const adapter = browserAdapter;

// ── before ──────────────────────────────────────────

describe("adapter.before", () => {
  test("before on node without parent is no-op", () => {
    const ref = adapter.comment("ref") as Comment;
    const child = adapter.comment("child") as Comment;
    expect(() => adapter.before(ref, child)).not.toThrow();
    expect(child.parentNode).toBeNull();
  });

  test("before inserts child before ref in parent", () => {
    const parent = adapter.el("div") as HTMLElement;
    const ref = adapter.comment("ref") as Comment;
    const child = adapter.el("span") as HTMLElement;
    adapter.append(parent, ref);

    adapter.before(ref, child);
    // ref is a Comment → parent.childNodes (not children) includes it
    expect(parent.childNodes[0]).toBe(child);
    expect(parent.childNodes[1]).toBe(ref);
  });

  test("before with already-placed child moves it", () => {
    const parent = adapter.el("div") as HTMLElement;
    const ref = adapter.comment("ref") as Comment;
    const child = adapter.el("span") as HTMLElement;
    adapter.append(parent, ref);

    adapter.before(ref, child);
    adapter.before(ref, child);
    expect(parent.childNodes.length).toBe(2);
    expect(parent.childNodes[0]).toBe(child);
    expect(parent.childNodes[1]).toBe(ref);
  });

  test("before moves child from elsewhere", () => {
    const parent = adapter.el("div") as HTMLElement;
    const other = adapter.el("div") as HTMLElement;
    const ref = adapter.comment("ref") as Comment;
    const child = adapter.el("span") as HTMLElement;

    adapter.append(parent, ref);
    adapter.append(other, child);

    adapter.before(ref, child);
    expect(child.parentNode).toBe(parent);
    expect(other.childNodes.length).toBe(0);
  });
});

// ── append ──────────────────────────────────────────

describe("adapter.append", () => {
  test("append to regular element works", () => {
    const parent = adapter.el("div") as HTMLElement;
    const child = adapter.el("span") as HTMLElement;
    adapter.append(parent, child);
    expect(parent.childNodes.length).toBe(1);
    expect(parent.childNodes[0]).toBe(child);
  });

  test("append to void element is no-op", () => {
    const br = adapter.el("br") as HTMLElement;
    const child = adapter.comment("x") as Comment;
    expect(() => adapter.append(br, child)).not.toThrow();
  });

  test("append to text node does not crash", () => {
    const text = adapter.text("hello") as Text;
    const child = adapter.comment("x") as Comment;
    expect(() => adapter.append(text, child)).not.toThrow();
  });

  test("append already-attached child moves to end", () => {
    const parent = adapter.el("div") as HTMLElement;
    const c1 = adapter.el("span") as HTMLElement;
    const c2 = adapter.el("em") as HTMLElement;
    adapter.append(parent, c1);
    adapter.append(parent, c2);

    adapter.append(parent, c1);
    expect(parent.childNodes.length).toBe(2);
    expect(parent.childNodes[1]).toBe(c1);
  });
});

// ── remove ──────────────────────────────────────────

describe("adapter.remove", () => {
  test("remove node from parent", () => {
    const parent = adapter.el("div") as HTMLElement;
    const child = adapter.el("span") as HTMLElement;
    adapter.append(parent, child);
    adapter.remove(child);
    expect(parent.childNodes.length).toBe(0);
  });

  test("remove orphaned node is no-op", () => {
    const orphan = adapter.el("div") as HTMLElement;
    expect(() => adapter.remove(orphan)).not.toThrow();
  });

  test("remove null/undefined does not crash", () => {
    expect(() => adapter.remove(null as any)).not.toThrow();
    expect(() => adapter.remove(undefined as any)).not.toThrow();
  });

  test("remove text node", () => {
    const parent = adapter.el("div") as HTMLElement;
    const text = adapter.text("hello") as Text;
    adapter.append(parent, text);
    adapter.remove(text);
    expect(parent.childNodes.length).toBe(0);
  });

  test("remove comment node", () => {
    const parent = adapter.el("div") as HTMLElement;
    const comment = adapter.comment("test") as Comment;
    adapter.append(parent, comment);
    adapter.remove(comment);
    expect(parent.childNodes.length).toBe(0);
  });
});

// ── clear ───────────────────────────────────────────

// ── replace ─────────────────────────────────────────

describe("adapter.replace", () => {
  test("replace old node with new node", () => {
    const parent = adapter.el("div") as HTMLElement;
    const old = adapter.el("span") as HTMLElement;
    const fresh = adapter.el("em") as HTMLElement;
    adapter.append(parent, old);

    adapter.replace(old, fresh);
    expect(parent.childNodes.length).toBe(1);
    expect(parent.childNodes[0]).toBe(fresh);
    expect(old.parentNode).toBeNull();
  });

  test("replace orphaned node does not crash", () => {
    const orphan = adapter.comment("orphan") as Comment;
    const fresh = adapter.el("div") as HTMLElement;
    expect(() => adapter.replace(orphan, fresh)).not.toThrow();
  });
});

// ── 跨容器操作 ──────────────────────────────────────

describe("adapter — cross-container", () => {
  test("move node between containers", () => {
    const c1 = adapter.el("div") as HTMLElement;
    const c2 = adapter.el("div") as HTMLElement;
    const child = adapter.el("span") as HTMLElement;
    adapter.append(c1, child);

    adapter.append(c2, child);
    expect(c1.childNodes.length).toBe(0);
    expect(c2.childNodes.length).toBe(1);
  });

  test("nested append then remove", () => {
    const outer = adapter.el("div") as HTMLElement;
    const inner = adapter.el("div") as HTMLElement;
    const child = adapter.el("span") as HTMLElement;

    adapter.append(outer, inner);
    adapter.append(inner, child);
    expect(outer.querySelector("span")).toBeTruthy();

    adapter.remove(inner);
    expect(outer.childNodes.length).toBe(0);
  });
});
