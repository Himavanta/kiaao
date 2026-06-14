// kiaao — Shared type guard utilities

export const isNode = (v: any): v is Node => v instanceof Node;
export const isElement = (v: any): v is Element => v instanceof Element;
export const isPromise = (v: any): v is Promise<any> => v instanceof Promise;
export const isFunction = (v: any): v is Function => typeof v === "function";
export const isString = (v: any): v is string => typeof v === "string";
export const isNumber = (v: any): v is number => typeof v === "number";
export const isBoolean = (v: any): v is boolean => typeof v === "boolean";
export const isObject = (v: any): v is object => typeof v === "object" && v !== null;
