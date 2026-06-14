// kiaao v4 — Directive system: direct() function, types, element-level context

import { DIRECT_KEY, DIRECTIVE_MOUNT, DIRECTIVE_UNMOUNT } from "../reactive/types.ts";
import { registerSignalStop } from "../reactive/core.ts";
import type { UseFunction } from "../reactive/core.ts";
import { addLocalEffect } from "./local-effect.ts";

// ── Types ──────────────────────────────────────────────

export interface DirectiveContext {
  onMount(fn: () => void): void;
  onUnmount(fn: () => void): void;
  use: UseFunction;
}

export type DirectiveFunction = (
  el: Element,
  props: Record<string, any> & { children?: any },
  context: DirectiveContext,
) => void;

// ── direct() ───────────────────────────────────────────

/**
 * 创建一个自定义指令。
 * 为传入的函数添加 DIRECT_KEY 标记，h() 通过此标记区分指令和组件。
 */
export function direct<T extends DirectiveFunction>(fn: T): T {
  (fn as any)[DIRECT_KEY] = true;
  return fn;
}

// ── isDirective ────────────────────────────────────────

/**
 * 判断一个函数是否是指令（检查 DIRECT_KEY 标记）。
 */
export function isDirective(fn: any): boolean {
  return typeof fn === "function" && fn[DIRECT_KEY] === true;
}

// ── Directive Context Creator ──────────────────────────

/**
 * 为指定元素创建指令上下文，提供元素级生命周期 API。
 * - onMount: 注册回调，元素挂载后由 triggerMount 触发
 * - onUnmount: 注册回调，元素卸载前由 disposeNode 触发
 * - use: 创建元素级信号，元素清理时自动停止
 */
export function createDirectiveContext(el: Element): DirectiveContext {
  return {
    onMount(fn: () => void): void {
      let mountSet = (el as any)[DIRECTIVE_MOUNT] as Set<() => void> | undefined;
      if (!mountSet) {
        mountSet = new Set();
        (el as any)[DIRECTIVE_MOUNT] = mountSet;
      }
      mountSet.add(fn);
    },

    onUnmount(fn: () => void): void {
      let unmountSet = (el as any)[DIRECTIVE_UNMOUNT] as Set<() => void> | undefined;
      if (!unmountSet) {
        unmountSet = new Set();
        (el as any)[DIRECTIVE_UNMOUNT] = unmountSet;
      }
      unmountSet.add(fn);
    },

    use: ((...args: any[]): any => {
      return registerSignalStop(args, (stop) => {
        addLocalEffect(el, stop);
      });
    }) as UseFunction,
  };
}
