// @vitest-environment happy-dom
// kiaao — 已知边界问题的预期失败用例
//
// 本文件专门用于暴力/极端边界测试中**预期会失败**的用例。
//
// 使用约定：
// - 用 `test.fails(...)` 标记，明确该用例当前会失败但仍属于设计可接受范围；
// - 测试运行后这些用例如果反而开始通过，需要及时删除 `.fails` 并改进框架；
// - 不要再在本文件中放能正常通过的测试，那是 `tests/core/` 和 `tests/server/` 的职责。
//
// 通过标准参见 `tests/TESTING.md`：
// - 不出现未处理异常（框架可以 console.error，但不能 throw 到用户代码之外）；
// - 行为可预测；
// - 崩溃 / 静默失败 / 抛出合理异常 / 行为正确 都在可接受范围内。

import { describe, expect, test } from "vite-plus/test";

import { setAdapter } from "../src/adapter/index.ts";
import { h, use, type Owner } from "../src/core/index.ts";
import { disposeOwner } from "../src/core/owner.ts";
import { browserAdapter, createApp } from "../src/dom/index.ts";

setAdapter(browserAdapter);

// ── Owner 销毁边界 ─────────────────────────────────────

describe("[已知问题] disposeOwner 非法入参", () => {
  /**
   * 测试类型：边界 — 已知缺陷
   * 场景：disposeOwner 传入 null
   * 当前：throw TypeError: Cannot read properties of null (reading 'disposed')
   * 修复目标：应静默忽略或抛明确错误
   * 处理：源码修复后删除 .fails
   */
  test.fails("disposeOwner 接受 null 不应崩溃", () => {
    expect(() => disposeOwner(null as unknown as Owner)).not.toThrow();
  });

  /**
   * 测试类型：边界 — 已知缺陷
   * 场景：disposeOwner 传入 undefined
   * 当前：throw TypeError
   * 修复目标：应静默忽略或抛明确错误
   * 处理：源码修复后删除 .fails
   */
  test.fails("disposeOwner 接受 undefined 不应崩溃", () => {
    expect(() => disposeOwner(undefined as unknown as Owner)).not.toThrow();
  });

  /**
   * 测试类型：边界 — 已知缺陷
   * 场景：disposeOwner 传入非 Owner 对象
   * 当前：throw TypeError（在 number 上创建 disposed 属性）
   * 修复目标：应静默忽略或抛明确错误
   * 处理：源码修复后删除 .fails
   */
  test.fails("disposeOwner 接受非法类型不应崩溃", () => {
    expect(() => disposeOwner(42 as unknown as Owner)).not.toThrow();
  });
});

// ── h() 非法 tag ──────────────────────────────────────

describe("[已知问题] h() 非法 tag", () => {
  /**
   * 测试类型：边界 — 已知缺陷
   * 场景：h() 传入 null 作为 tag
   * 当前：仅 console.warn 后返回空注释节点，未抛错
   * 修复目标：抛明确错误
   * 处理：源码改进后删除 .fails
   */
  test.fails("h(null) 抛明确错误", () => {
    expect(() => h(null as unknown as string)).toThrow();
  });

  /**
   * 测试类型：边界 — 已知缺陷
   * 场景：h() 传入 Symbol 作为 tag
   * 当前：仅 console.warn 后返回空注释节点，未抛错
   * 处理：本条不修复，但用 test.fails 标记以便后续决策
   */
  test.fails("h(Symbol) 抛明确错误", () => {
    expect(() => h(Symbol("tag") as unknown as string)).toThrow();
  });

  /**
   * 测试类型：边界 — 已知缺陷
   * 场景：h() 传入数字作为 tag
   * 当前：仅 console.warn 后返回空注释节点
   * 处理：本条不修复，但用 test.fails 标记以便后续决策
   */
  test.fails("h(42) 抛明确错误", () => {
    expect(() => h(42 as unknown as string)).toThrow();
  });
});

// ── 信号写入的极端值 ───────────────────────────────────

describe("[已知问题] use() 极端值", () => {
  /**
   * 测试类型：边界 — 已知行为
   * 场景：use(Promise) 作为初始值
   * 当前：definitionMode 直接把 Promise 当作普通值存储（sig() 返回 Promise 本身）
   * 本条不是缺陷，而是 kiaao “不解释函数、Promise、async 函数”的明确行为
   * 处理：用 test.fails 保留为对未来契约变更的标记
   *       expect 故意写反为 “应解包为 42”，从而触发 test.fails 通过
   */
  test.fails("use(Promise) 应解包为 Promise.resolve 的值", () => {
    const promise = Promise.resolve(42);
    const sig = use(promise);
    expect(sig()).toBe(42);
  });

  /**
   * 测试类型：边界 — 已知缺陷
   * 场景：use() 传入 undefined 作为初始值
   * 当前：definitionMode 正常工作（sig() 返回 undefined），但
   *       isUse(undefined) 与 sig() 的语义对外不够明确
   * 修复目标：统一文档化
   * 处理：本条用反向断言标记为 .fails
   */
  test.fails("use(undefined) 不可作为信号", () => {
    const sig = use(undefined);
    expect(sig).toBeUndefined();
  });
});

// ── HResult 边界 ──────────────────────────────────────

describe("[已知问题] HResult 重复挂载到不同容器", () => {
  /**
   * 测试类型：边界 — 已知缺陷
   * 场景：同一个 HResult 挂载到两个 createApp 实例
   * 当前：第二个 mount 会把节点从第一个容器移动到第二个容器（DOM 单父节点限制）
   * 修复目标：应抛明确错误或拒绝 mount
   * 处理：见 docs/架构/Cell 与 HResult 的分离，持久 Owner 树的纯化.md（设计限制）
   */
  test.fails("createApp 应拒绝已挂载的 HResult", () => {
    const Comp = () => h("div", { class: "shared" }, "shared");
    const hr = h(Comp);
    const c1 = browserAdapter.el("div") as HTMLElement;
    const c2 = browserAdapter.el("div") as HTMLElement;

    createApp(hr).mount(c1);

    // 期望：抛错告知 hr 已被使用
    expect(() => createApp(hr).mount(c2)).toThrow();
  });
});
