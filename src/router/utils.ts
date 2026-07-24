// kiaao — router: URL helpers + segment extraction

// ── Browser URL Helpers ───────────────────────────────

/** 获取当前 pathname + search，不含 origin 与 hash */
export const getCurrentPath = (): string => window.location.pathname + window.location.search;

/** 以当前 origin 为基准解析路径为 URL 对象 */
export const resolveUrl = (path: string): URL => new URL(path, window.location.origin);

export const pushState = (path: string): void => {
  history.pushState(null, "", path);
};

/**
 * 以 replaceState 方式写入历史（不增加新条目）。
 *
 * 用于：
 * - 首次进入触发 onRoute 时
 * - popstate 后 onRoute 重定向时
 * - onRoute reject 回滚到原 URL 时
 */
export const replaceState = (path: string): void => history.replaceState(null, "", path);

// ── Segment Extraction ───────────────────────────────

export const isSlash = (s: string) => s === "/";

/**
 * 从完整路径中提取当前 RouterView 负责的第一个路径段。
 */
export function extractSegment(fullPath: string, base?: string): string {
  if (base && !isSlash(base)) {
    if (!fullPath.startsWith(base)) return "";
    if (!isSlash(fullPath[base.length])) return "";
  }

  const relative = base ? fullPath.slice(base.length) : fullPath;
  // 跳过前导 /，收集第一段
  let segment = "";
  let started = false;
  for (const ch of relative) {
    if (!started && isSlash(ch)) continue;
    if (isSlash(ch)) break;
    started = true;
    segment += ch;
  }
  return segment;
}

/**
 * 将 query string 解析为对象。
 * 多个同名 key 保留最后一个值。
 */
export const parseSearchRecord = (search: string): Record<string, string> =>
  search ? Object.fromEntries(new URLSearchParams(search)) : {};
