// kiaao — router: createRouter 入口
// 设计依据见 docs/路由/v2实施/01-设计决策.md

import type { ComponentFunction } from "../core/index.ts";
import { use } from "../core/index.ts";
import { createRouterLink } from "./link.ts";
import { createRouterGroup } from "./route-group.ts";
import type { GuardResult, Router, RouterOptions } from "./types.ts";
import { getPathname, getSearch, parseSearchRecord, pushState, replaceState } from "./utils.ts";

// ── 常量 ──────────────────────────────────────────────

const REDIRECT_LIMIT = 10;

// ── 运行时校验 ────────────────────────────────────────

function validateRoutes(options: RouterOptions): void {
  if (!options || typeof options !== "object") {
    throw new Error("[kiaao] createRouter: options is required");
  }
  if (!options.routes || typeof options.routes !== "object") {
    throw new Error("[kiaao] createRouter: options.routes must be an object");
  }
  if (typeof options.routes[""] !== "function") {
    throw new Error('[kiaao] createRouter: options.routes[""] must be a function (layout/index)');
  }
}

// ── 核心导航 ──────────────────────────────────────────

/**
 * 执行一次 onRoute 守卫并解析返回值。
 *
 * - 返回 string：视为重定向目标，递增 redirects；
 * - 返回 void / undefined：放行；
 * - throw / reject：被消费，调用方根据 navigate 模式决定后续处理。
 */
async function runGuard(
  onRoute: RouterOptions["onRoute"],
  target: string,
  from: string | null,
  redirects: number,
): Promise<GuardResult> {
  try {
    const result = onRoute ? await onRoute(target, from) : undefined;
    if (typeof result === "string") {
      if (redirects + 1 > REDIRECT_LIMIT) {
        console.error(`[kiaao] too many redirects (max ${REDIRECT_LIMIT})`);
        return { ok: false };
      }
      return { ok: true, target: result, next: redirects + 1 };
    }
    return { ok: true, target, next: redirects };
  } catch (err) {
    console.error("[kiaao] onRoute error:", err);
    return { ok: false };
  }
}

/** 导航模式：决定写入历史的方式与错误处理 */
type NavigateMode = "push" | "popstate" | "initial";

/**
 * 统一的导航流程。
 *
 * 处理 onRoute 守卫、重定向链、最终写入 history + 更新 _url。
 * 不同模式的差异：
 * - push：写入 pushState；守卫失败抛错；
 * - popstate：仅当 target 与 originalTarget 不同时 replaceState；守卫失败回滚；
 * - initial：仅当 target 与 originalTarget 不同时 replaceState；守卫失败静默保留 initial。
 */
async function navigate(opts: {
  mode: NavigateMode;
  target: string;
  from: string | null;
  originalTarget: string;
  onRoute: RouterOptions["onRoute"];
  commitUrl: (url: string) => void;
  onError: (mode: NavigateMode) => void;
}): Promise<void> {
  let { target, from } = opts;
  let redirects = 0;

  while (true) {
    const result = await runGuard(opts.onRoute, target, from, redirects);
    if (!result.ok) {
      opts.onError(opts.mode);
      return;
    }
    if (result.target !== target || result.next !== redirects) {
      from = target;
      target = result.target;
      redirects = result.next;
      continue;
    }
    opts.commitUrl(target);
    return;
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

  // ── 共享 commit 回调 ─────────────────────────────────

  function commitPush(url: string): void {
    pushState(url);
    _url(url);
  }
  function commitReplaceIfChanged(originalTarget: string, url: string): void {
    if (url !== originalTarget) {
      replaceState(url);
    }
    _url(url);
  }

  // ── push ────────────────────────────────────────────

  async function push(path: string): Promise<void> {
    await navigate({
      mode: "push",
      target: path,
      from: _url(),
      originalTarget: path,
      onRoute: options.onRoute,
      commitUrl: commitPush,
      onError: () => {
        throw new Error("[kiaao] push aborted due to onRoute error");
      },
    });
  }

  // ── popstate 监听 ────────────────────────────────────

  window.addEventListener("popstate", () => {
    const newUrl = getPathname() + getSearch();
    void navigate({
      mode: "popstate",
      target: newUrl,
      from: _url(),
      originalTarget: newUrl,
      onRoute: options.onRoute,
      commitUrl: (url) => commitReplaceIfChanged(newUrl, url),
      onError: () => replaceState(_url()),
    });
  });

  // ── 首次进入 ────────────────────────────────────────

  void (async () => {
    const initial = _url();
    await navigate({
      mode: "initial",
      target: initial,
      from: null,
      originalTarget: initial,
      onRoute: options.onRoute,
      commitUrl: (url) => commitReplaceIfChanged(initial, url),
      onError: () => {
        // 首次进入守卫失败：保持初始 URL 不变
      },
    });
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
