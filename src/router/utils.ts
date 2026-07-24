// kiaao — router: URL helpers + segment extraction
//
// 设计依据见 docs/路由/v2实施/01-设计决策.md
// extractSegment 算法复用自 v1（保留原算法，不重写）。

// ── Browser URL Helpers ───────────────────────────────

export const getPathname = (): string => window.location.pathname;

export const getSearch = (): string => window.location.search;

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
export const replaceState = (path: string): void => {
  history.replaceState(null, "", path);
};

export const parseSearch = (search: string): URLSearchParams => new URLSearchParams(search);

// ── Segment Extraction ───────────────────────────────

/**
 * 从完整路径中提取当前 RouterView 负责的第一个路径段。
 *
 * - 若设置了 base，先验证路径是否在 base 范围内（startsWith + 斜杠边界检查），
 *   再裁剪得到相对路径，取第一段；
 * - base === "/" 等价于不传 base，匹配所有路径；
 * - 末尾斜杠不影响匹配（/foo 与 /foo/ 在同一 base 下 segment 相同）；
 * - 返回 "" 表示当前层是 layout 或当前 base 已到尽头。
 */
export function extractSegment(fullPath: string, base?: string): string {
  if (base && base !== "/") {
    if (!fullPath.startsWith(base)) return "";
    if (fullPath.length > base.length && fullPath[base.length] !== "/") {
      return "";
    }
  }

  const relative = base ? fullPath.slice(base.length) : fullPath;
  return relative.replace(/^\/+/, "").split("/")[0] || "";
}

/**
 * 将 query string 解析为对象。
 *
 * 多个同名 key 会被合并为数组；此处统一保留最后一个值，与 v1 一致。
 */
export function parseSearchRecord(search: string): Record<string, string> {
  const record: Record<string, string> = {};
  if (!search) return record;
  parseSearch(search).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/**
 * 规范化 URL：分离 pathname 与 search。
 *
 * pathname 包含前导 /，search 包含前导 ?（如果没有则为空串）。
 */
export function splitUrl(url: string): { pathname: string; search: string } {
  const idx = url.indexOf("?");
  if (idx === -1) {
    return { pathname: url, search: "" };
  }
  return { pathname: url.slice(0, idx), search: url.slice(idx) };
}

/**
 * 把 pathname + search 拼成完整 URL。
 *
 * pathname 不含尾斜杠、不含 search；search 以 ? 开头或为空。
 */
export function joinUrl(pathname: string, search: string): string {
  return pathname + (search || "");
}
