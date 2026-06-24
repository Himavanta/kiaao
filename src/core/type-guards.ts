// kiaao — Platform-agnostic runtime type guards
// Generic type-checking utilities. No DOM dependencies.
// DOM-specific guards (isNode, isElement) are in src/dom/type-guards.ts

export const isArray = Array.isArray;

export const isFunction = (v: any): v is Function => typeof v === "function";
export const isString = (v: any): v is string => typeof v === "string";
export const isNumber = (v: any): v is number => typeof v === "number";
export const isBoolean = (v: any): v is boolean => typeof v === "boolean";
export const isObject = (v: any): v is object => typeof v === "object" && v !== null;

export const isNil = (v: any): v is null | undefined => v == null;
export const isNotNil = <T>(v: T): v is NonNullable<T> => v != null;
export const isUndefined = (v: any): v is undefined => v === undefined;
export const isDefined = <T>(v: T): v is Exclude<T, undefined> => v !== undefined;

export const isEmpty = (arr: { length: number }): boolean => arr.length === 0;
export const isNotEmpty = (arr: { length: number }): boolean => arr.length > 0;
export const isSingle = <T>(arr: T[]): arr is [T] => arr.length === 1;

export const isMap = (v: any): v is Map<any, any> => v instanceof Map;
export const isSet = (v: any): v is Set<any> => v instanceof Set;
export const isPromise = (v: any): v is Promise<any> => v instanceof Promise;

export const isPlainObject = (v: any): v is Record<string, any> => !!v && v.constructor === Object;
export const isRecord = (v: any): v is Record<string, any> =>
  !!v && typeof v === "object" && !isArray(v) && !isPromise(v);
