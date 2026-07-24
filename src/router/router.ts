// kiaao — router: createRouter 入口
// 设计依据见 docs/路由/v2实施/01-设计决策.md

import type { ComponentFunction } from "../core/index.ts";
import { use } from "../core/index.ts";
import { createRouterLink } from "./link.ts";
import { createRouterGroup } from "./route-group.ts";
import type { Router, RouterOptions } from "./types.ts";
import { getPathname, getSearch, parseSearchRecord, pushState, replaceState } from "./utils.ts";

const REDIRECT_LIMIT = 10;

// ── 运行时校验 ────────────────────────────────────────

function validateRoutes(options: RouterOptions): void {
  if (!options || typeof options !== "object") {
    throw new Error("[kiaao] createRouter: options is required");
  }
  if (!options.routes || typeof options.routes !== "object") {
    throw new Error("[kiaao] createRouter: options.routes must be an object");
  }
  const index = options.routes[""];
  if (typeof index !== "function") {
    throw new Error('[kiaao] createRouter: options.routes[""] must be a function (layout/index)');
  }
}

// ── createRouter ──────────────────────────────────────

export function createRouter(options: RouterOptions): Router {
  validateRoutes(options);

  // 内部可写源信号：完整 URL（pathname + search），保留字面值（含尾斜杠）。
  const _url = use(getPathname() + getSearch());

  // 对外只读派生信号：分别取 pathname 与 search。
  const current = use(_url, () => {
    const full = _url();
    const qIdx = full.indexOf("?");
    return qIdx === -1 ? full : full.slice(0, qIdx) || "/";
  });
  const search = use(_url, () => {
    const full = _url();
    const qIdx = full.indexOf("?");
    return parseSearchRecord(qIdx === -1 ? "" : full.slice(qIdx + 1));
  });

  // ── 核心导航逻辑 ────────────────────────────────────

  /**
   * 执行一次 onRoute 调用并处理返回。
   * - 返回 string：视为重定向目标，递增 redirects；
   * - 返回 void/undefined：放行；
   * - throw / reject：consume 错误并返回 { error: true }。
   */
  async function runGuard(
    target: string,
    from: string | null,
    redirects: number,
  ): Promise<{ ok: true; target: string; next: number } | { error: true }> {
    try {
      const result = options.onRoute ? await options.onRoute(target, from) : undefined;
      if (typeof result === "string") {
        if (redirects + 1 > REDIRECT_LIMIT) {
          console.error(`[kiaao] too many redirects (max ${REDIRECT_LIMIT})`);
          return { error: true };
        }
        return { ok: true, target: result, next: redirects + 1 };
      }
      return { ok: true, target, next: redirects };
    } catch (err) {
      console.error("[kiaao] onRoute error:", err);
      return { error: true };
    }
  }

  // ── push ────────────────────────────────────────────

  async function push(path: string): Promise<void> {
    let target = path;
    const from = _url();
    let redirects = 0;

    while (true) {
      const result = await runGuard(target, from, redirects);
      if ("error" in result) {
        throw new Error("[kiaao] push aborted due to onRoute error");
      }
      if (result.target !== target || result.next !== redirects) {
        // 重定向或错误循环继续
        target = result.target;
        redirects = result.next;
        continue;
      }
      // 放行
      pushState(target);
      _url(target);
      return;
    }
  }

  // ── popstate 监听 ────────────────────────────────────

  window.addEventListener("popstate", async () => {
    const newUrl = getPathname() + getSearch();
    let target = newUrl;
    const from = _url();
    let redirects = 0;

    while (true) {
      const result = await runGuard(target, from, redirects);
      if ("error" in result) {
        replaceState(from);
        return;
      }
      if (result.target !== target) {
        // 重定向
        target = result.target;
        redirects = result.next;
        continue;
      }
      // 放行
      if (target !== newUrl) {
        replaceState(target);
      }
      _url(target);
      return;
    }
  });

  // ── 首次进入 ────────────────────────────────────────

  void (async () => {
    const initial = _url();
    let target = initial;
    let redirects = 0;

    while (true) {
      const result = await runGuard(target, null, redirects);
      if ("error" in result) {
        // 首次进入错误：保持初始 URL 不变
        return;
      }
      if (result.target !== target) {
        target = result.target;
        redirects = result.next;
        continue;
      }
      if (target !== initial) {
        replaceState(target);
        _url(target);
      }
      return;
    }
  })();

  // ── 顶层 Router 组件 ─────────────────────────────────

  const Router: ComponentFunction = createRouterGroup({
    routes: options.routes,
    base: "/",
    current,
  });

  // ── Link 组件 ────────────────────────────────────────

  const Link: ComponentFunction = createRouterLink(push);

  // ── 对外契约 ─────────────────────────────────────────

  return { Router, Link, push, current, search };
}
