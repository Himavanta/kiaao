// kiaao — Lynx 事件绑定

const EVENT_TYPE_MAP: Record<string, string> = {
  bind: "bindEvent",
  catch: "catchEvent",
  "capture-bind": "capture-bind",
  "capture-catch": "capture-catch",
  "global-bind": "global-bindEvent",
};

const LYNX_EVENT_RE = /^(bind|catch|capture-bind|capture-catch|global-bind)([A-Za-z]+)$/;

/** 检测 Lynx 事件属性并绑定。返回 true 表示已处理。 */
export function tryBindEvent(
  el: FiberElement,
  key: string,
  value: unknown,
  hasMainThreadPrefix: boolean,
): boolean {
  const match = key.match(LYNX_EVENT_RE);
  if (!match) return false;

  const eventType = EVENT_TYPE_MAP[match[1]!]!;
  const eventName = match[2]!;

  if (hasMainThreadPrefix) {
    __AddEvent(el, eventType, eventName, { type: "worklet", value });
  } else {
    __AddEvent(el, eventType, eventName, value as string);
  }
  return true;
}
