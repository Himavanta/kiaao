// kiaao — Lynx 事件绑定
// 主线程模式：所有事件统一走 worklet，由 globalThis.runWorklet 调度

const EVENT_TYPE_MAP: Record<string, string> = {
  bind: "bindEvent",
  catch: "catchEvent",
  "capture-bind": "capture-bind",
  "capture-catch": "capture-catch",
  "global-bind": "global-bindEvent",
};

const LYNX_EVENT_RE = /^(bind|catch|capture-bind|capture-catch|global-bind)([A-Za-z]+)$/;

/**
 * 检测 Lynx 事件属性并绑定为 worklet。返回 true 表示已处理。
 * 所有事件统一在主线程执行，由 globalThis.runWorklet 调用。
 */
export function tryBindEvent(el: FiberElement, key: string, value: unknown): boolean {
  const match = key.match(LYNX_EVENT_RE);
  if (!match) return false;

  const eventType = EVENT_TYPE_MAP[match[1]!]!;
  const eventName = match[2]!;

  __AddEvent(el, eventType, eventName, { type: "worklet", value });
  return true;
}
