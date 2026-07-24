// kiaao — router: createRouter 入口

import type { ComponentFunction, Signal } from "../core/index.ts";
import { use } from "../core/index.ts";
import { isFunction, isPlainObject, isString } from "../core/index.ts";
import { createRouterLink } from "./link.ts";
import { createRouterGroup } from "./route-group.ts";
import type { GuardResult, Router, RouterOptions } from "./types.ts";
import { getCurrentPath, parseSearchRecord, pushState, replaceState, resolveUrl } from "./utils.ts";

// ── 常量 ──────────────────────────────────────────────

const REDIRECT_LIMIT = 10;

let popstateHandler: (() => void) | null = null;

// ── 运行时校验 ────────────────────────────────────────

function validateRoutes(options: RouterOptions): void {
  if (!isPlainObject(options)) {
    throw new Error("[kiaao] createRouter: options is required");
  }
  if (!isPlainObject(options.routes)) {
    throw new Error("[kiaao] createRouter: options.routes must be an object");
  }
  if (!isFunction(options.routes[""])) {
    throw new Error('[kiaao] createRouter: options.routes[""] must be a function (layout/index)');
  }
}

// ── 守卫 ──────────────────────────────────────────────

/**
 * 执行一次 onRoute 守卫并解析返回值。
 *
 * - 返回 string：视为重定向目标，递增 redirects；
 * - 返回 void / undefined：放行；
 * - throw / reject：被消费，调用方根据 navigate 模式决定后续处理。
 */
async function runGuard({
  onRoute,
  target,
  from,
  redirects,
}: {
  onRoute: RouterOptions["onRoute"];
  target: string;
  from: string | null;
  redirects: number;
}): Promise<GuardResult> {
  try {
    const result = onRoute ? await onRoute(target, from) : undefined;
    if (isString(result)) {
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
 * 处理 onRoute 守卫、重定向链、最终写入 history + 更新 sourceUrl。
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
    const result = await runGuard({
      onRoute: opts.onRoute,
      target,
      from,
      redirects,
    });
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

// ── 信号 ──────────────────────────────────────────────

function createRouterSignals(): {
  sourceUrl: Signal<string>;
  current: Signal<string>;
  search: Signal<Record<string, string>>;
} {
  // 内部可写源信号：完整 URL（pathname + search），保留字面值（含尾斜杠）。
  const sourceUrl = use(getCurrentPath());

  // 对外只读派生信号：分别取 pathname 与 search。
  // 使用 new URL 统一解析，避免手动 split 的边界问题。
  const parsed = use(sourceUrl, () => {
    const url = resolveUrl(sourceUrl());
    return {
      path: url.pathname,
      query: url.search ? url.search.slice(1) : "",
    };
  });
  const current = use(parsed, () => parsed().path);
  const search = use(parsed, () => parseSearchRecord(parsed().query));

  return { sourceUrl, current, search };
}

// ── commit 回调 ────────────────────────────────────────

function commitPush(sourceUrl: Signal<string>, url: string): void {
  try {
    pushState(url);
  } catch (err) {
    throw new Error(`[kiaao] pushState failed for "${url}": ${(err as Error).message}`);
  }
  sourceUrl(url);
}

function commitReplaceIfChanged(
  sourceUrl: Signal<string>,
  originalTarget: string,
  url: string,
): void {
  if (url !== originalTarget) replaceState(url);
  sourceUrl(url);
}

// ── 浏览器导航监听 ────────────────────────────────────

function installPopstateListener(opts: {
  sourceUrl: Signal<string>;
  onRoute: RouterOptions["onRoute"];
}): void {
  if (popstateHandler) {
    window.removeEventListener("popstate", popstateHandler);
  }
  const { sourceUrl, onRoute } = opts;
  popstateHandler = () => {
    const newUrl = getCurrentPath();
    void navigate({
      mode: "popstate",
      target: newUrl,
      from: sourceUrl(),
      originalTarget: newUrl,
      onRoute,
      commitUrl: (url) => commitReplaceIfChanged(sourceUrl, newUrl, url),
      onError: () => {
        // popstate 已改浏览器 URL，但 sourceUrl 仍为旧值；
        // replaceState 回滚浏览器 URL 即可，sourceUrl 无需更新。
        replaceState(sourceUrl());
      },
    }).catch((err: Error) => {
      console.error("[kiaao] popstate navigation error:", err);
    });
  };
  window.addEventListener("popstate", popstateHandler);
}

function installInitialEntry(opts: {
  sourceUrl: Signal<string>;
  onRoute: RouterOptions["onRoute"];
}): void {
  const { sourceUrl, onRoute } = opts;
  void (async () => {
    const initial = sourceUrl();
    await navigate({
      mode: "initial",
      target: initial,
      from: null,
      originalTarget: initial,
      onRoute,
      commitUrl: (url) => commitReplaceIfChanged(sourceUrl, initial, url),
      onError: () => {
        // 首次进入守卫失败：保持初始 URL 不变
      },
    });
  })().catch((err: Error) => {
    console.error("[kiaao] initial entry navigation error:", err);
  });
}

// ── 入口 ──────────────────────────────────────────────

export function createRouter(options: RouterOptions): Router {
  validateRoutes(options);

  const { sourceUrl, current, search } = createRouterSignals();
  installPopstateListener({ sourceUrl, onRoute: options.onRoute });
  installInitialEntry({ sourceUrl, onRoute: options.onRoute });

  // ── 顶层 Router 组件 ─────────────────────────────────

  const Router: ComponentFunction = createRouterGroup({
    routes: options.routes,
    base: "/",
    current,
  });

  async function push(path: string): Promise<void> {
    await navigate({
      mode: "push",
      target: path,
      from: sourceUrl(),
      originalTarget: path,
      onRoute: options.onRoute,
      commitUrl: (url) => commitPush(sourceUrl, url),
      onError: () => {
        throw new Error("[kiaao] push aborted due to onRoute error");
      },
    });
  }

  // ── Link 组件 ────────────────────────────────────────

  const Link: ComponentFunction = createRouterLink(push);

  // ── 对外契约 ─────────────────────────────────────────

  return {
    Router: Router as Router["Router"],
    Link: Link as Router["Link"],
    push,
    current,
    search,
  };
}
