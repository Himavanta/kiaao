// kiaao — Shared type guard utilities

export const isArray = Array.isArray;

export const isNode = (v: any): v is Node => v instanceof Node;
export const isElement = (v: any): v is Element => v instanceof Element;
export const isPromise = (v: any): v is Promise<any> => v instanceof Promise;
export const isFunction = (v: any): v is Function => typeof v === "function";
export const isString = (v: any): v is string => typeof v === "string";
export const isNumber = (v: any): v is number => typeof v === "number";
export const isBoolean = (v: any): v is boolean => typeof v === "boolean";
export const isObject = (v: any): v is object => typeof v === "object" && v !== null;

// ── Null / Undefined ──────────────────────────────────

export const isNil = (v: any): v is null | undefined => v == null;
export const isNotNil = <T>(v: T): v is NonNullable<T> => v != null;
export const isUndefined = (v: any): v is undefined => v === undefined;
export const isDefined = <T>(v: T): v is Exclude<T, undefined> => v !== undefined;

// ── Collection ────────────────────────────────────────

export const isMap = (v: any): v is Map<any, any> => v instanceof Map;
export const isSet = (v: any): v is Set<any> => v instanceof Set;

// ── Object ────────────────────────────────────────────

/** 纯对象：constructor === Object（排除类实例、Map、Set 等） */
export const isPlainObject = (v: any): v is Record<string, any> => !!v && v.constructor === Object;

/** 任意非 null 非数组对象（含类实例），支持动态属性访问 */
export const isRecord = (v: any): v is Record<string, any> =>
  typeof v === "object" && v !== null && !isArray(v);
