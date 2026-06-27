// @vitest-environment happy-dom
// kiaao — Show, Case, Each control flow component tests

import { expect, test, describe } from "vite-plus/test";

import { setAdapter } from "../../src/adapter/index.ts";
import { h, Show, Case, Each, use, triggerMount, type HResult } from "../../src/core/index.ts";
import { browserAdapter } from "../../src/dom/index.ts";

// Register browser adapter for DOM operations
setAdapter(browserAdapter);

// ── Test Helpers ──────────────────────────────────────

/** Mount result nodes into a container and trigger lifecycle */
function mount(result: HResult): HTMLElement {
  const container = browserAdapter.createElement("div") as HTMLElement;
  for (const node of result.nodes) {
    browserAdapter.append(container, node as Node);
  }
  triggerMount(result.owner!);
  return container;
}

/** Extract content nodes before a reference node in DOM */
function getContentBeforeRef(ref: Node): Node[] {
  const nodes: Node[] = [];
  let prev = ref.previousSibling;
  while (prev) {
    nodes.unshift(prev);
    prev = prev.previousSibling;
  }
  return nodes;
}

/** h() overloads require children in props type; use unknown cast for test convenience */
const _h = h as (...args: any[]) => HResult;

function Primary() {
  return h("div", { "data-test": "primary" }, "Primary");
}
function Fallback() {
  return h("div", { "data-test": "fallback" }, "Fallback");
}

// ── Show ──────────────────────────────────────────────

describe("Show", () => {
  test("renders primary when value is truthy", () => {
    const result = _h(Show, { value: true }, Primary, Fallback);
    mount(result);

    // Anchor is the only node in result
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0] as Node).nodeType).toBe(8);

    // Content is in DOM (rendered via onMount)
    const anchor = result.nodes[0] as Node;
    const content = getContentBeforeRef(anchor);
    expect(content).toHaveLength(1);
    expect((content[0] as HTMLElement).dataset.test).toBe("primary");
  });

  test("renders fallback when value is falsy", () => {
    const result = _h(Show, { value: false }, Primary, Fallback);
    mount(result);
    const anchor = result.nodes[0] as Node;
    const content = getContentBeforeRef(anchor);
    expect(content).toHaveLength(1);
    expect((content[0] as HTMLElement).dataset.test).toBe("fallback");
  });

  test("renders nothing (only anchor) when falsy and no fallback", () => {
    const result = _h(Show, { value: false }, Primary);
    mount(result);
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0] as Node).nodeType).toBe(8);
  });

  test("reacts to signal changes", () => {
    const visible = use(true);
    const result = _h(Show, { value: visible }, Primary, Fallback);
    mount(result);
    const anchor = result.nodes[0] as Node;

    expect(getContentBeforeRef(anchor)).toHaveLength(1);
    expect((getContentBeforeRef(anchor)[0] as HTMLElement).dataset.test).toBe("primary");

    // Switch to falsy
    visible(false);
    expect(getContentBeforeRef(anchor)).toHaveLength(1);
    expect((getContentBeforeRef(anchor)[0] as HTMLElement).dataset.test).toBe("fallback");

    // Switch back
    visible(true);
    expect((getContentBeforeRef(anchor)[0] as HTMLElement).dataset.test).toBe("primary");
  });
});

// ── Case ──────────────────────────────────────────────

describe("Case", () => {
  function Loading() {
    return h("div", { "data-test": "loading" }, "Loading");
  }
  function ErrorMsg() {
    return h("div", { "data-test": "error" }, "Error");
  }
  function Content() {
    return h("div", { "data-test": "content" }, "Content");
  }

  const map = {
    loading: Loading,
    error: ErrorMsg,
    success: Content,
  };

  test("renders matching branch from mapping table", () => {
    const result = _h(Case, { value: "loading" }, map, Fallback);
    mount(result);
    const anchor = result.nodes[0] as Node;
    const content = getContentBeforeRef(anchor);
    expect(content).toHaveLength(1);
    expect((content[0] as HTMLElement).dataset.test).toBe("loading");
  });

  test("renders fallback when key not matched", () => {
    const result = _h(Case, { value: "unknown" }, map, Fallback);
    mount(result);
    const anchor = result.nodes[0] as Node;
    const content = getContentBeforeRef(anchor);
    expect((content[0] as HTMLElement).dataset.test).toBe("fallback");
  });

  test("renders nothing when key not matched and no fallback", () => {
    const result = _h(Case, { value: "unknown" }, map);
    mount(result);
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0] as Node).nodeType).toBe(8);
  });

  test("switches branches on signal change", () => {
    const status = use("loading");
    const result = _h(Case, { value: status }, map, Fallback);
    mount(result);
    const anchor = result.nodes[0] as Node;

    expect((getContentBeforeRef(anchor)[0] as HTMLElement).dataset.test).toBe("loading");

    status("success");
    expect((getContentBeforeRef(anchor)[0] as HTMLElement).dataset.test).toBe("content");

    status("unknown");
    expect((getContentBeforeRef(anchor)[0] as HTMLElement).dataset.test).toBe("fallback");
  });

  test("reuses same key without triggering update", () => {
    const status = use("loading");
    let renderCount = 0;
    function TrackLoading() {
      renderCount++;
      return h("div", { "data-test": "loading" });
    }
    const result = _h(Case, { value: status }, { loading: TrackLoading });
    mount(result);
    renderCount = 0;

    status("loading"); // same key — should not trigger new render
    expect(renderCount).toBe(0);
  });
});

// ── Each ─────────────────────────────────────────────

describe("Each", () => {
  function ItemRow({ item, index }: { item: () => any; index: number }) {
    return h("li", { "data-index": String(index) }, String(item().text));
  }

  function EmptyState() {
    return h("li", { "data-test": "empty" }, "No items");
  }

  test("renders items from array", () => {
    const items = [
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ];
    const result = _h(Each, { value: items, keyed: (item: any) => item.id }, ItemRow, EmptyState);
    mount(result);
    const anchor = result.nodes[0] as Node;

    expect(result.nodes).toHaveLength(1); // anchor only
    expect(getContentBeforeRef(anchor)).toHaveLength(2);
    expect(getContentBeforeRef(anchor)[0].textContent).toBe("A");
    expect(getContentBeforeRef(anchor)[1].textContent).toBe("B");
  });

  test("renders fallback when array is empty", () => {
    const items: any[] = [];
    const result = _h(Each, { value: items, keyed: (item: any) => item.id }, ItemRow, EmptyState);
    mount(result);
    const anchor = result.nodes[0] as Node;
    const content = getContentBeforeRef(anchor);
    expect(content).toHaveLength(1);
    expect((content[0] as HTMLElement).dataset.test).toBe("empty");
  });

  test("renders nothing when array is empty and no fallback", () => {
    const items: any[] = [];
    const result = _h(Each, { value: items }, ItemRow);
    mount(result);
    expect(result.nodes).toHaveLength(1);
    expect((result.nodes[0] as Node).nodeType).toBe(8);
  });

  test("reacts to array signal changes", () => {
    const items = use([
      { id: 1, text: "A" },
      { id: 2, text: "B" },
    ]);
    const result = _h(Each, { value: items, keyed: (item: any) => item.id }, ItemRow, EmptyState);
    mount(result);
    const anchor = result.nodes[0] as Node;

    expect(getContentBeforeRef(anchor)).toHaveLength(2);
    expect(getContentBeforeRef(anchor)[0].textContent).toBe("A");

    // Remove one item
    items([{ id: 2, text: "B" }]);
    expect(getContentBeforeRef(anchor)).toHaveLength(1);
    expect(getContentBeforeRef(anchor)[0].textContent).toBe("B");

    // Clear all — fallback should show
    items([]);
    expect((getContentBeforeRef(anchor)[0] as HTMLElement).dataset.test).toBe("empty");
  });

  test("without keyed rebuilds all on change", () => {
    const items = use([{ id: 1, text: "A" }]);
    const result = _h(Each, { value: items }, ItemRow);
    mount(result);
    const anchor = result.nodes[0] as Node;

    expect(getContentBeforeRef(anchor)).toHaveLength(1);
    expect(getContentBeforeRef(anchor)[0].textContent).toBe("A");

    // Change array — full rebuild
    items([{ id: 2, text: "B" }]);
    expect(getContentBeforeRef(anchor)).toHaveLength(1);
    expect(getContentBeforeRef(anchor)[0].textContent).toBe("B");
  });
});
