// kiaao — Directive system: direct(), types, element-level context (Owner-based)

import { DIRECT_KEY } from "../core/types.ts";
import { currentOwner } from "../core/owner.ts";
import { registerSignalStop } from "../core/signal.ts";
import type { UseFunction } from "../core/signal.ts";
import { isFunction } from "../utils/type-guards.ts";

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

// ── JSX component signature ────────────────────────────

type JSXComponentSignature = (props: Record<string, any>) => Node;

// ── direct() ───────────────────────────────────────────

export const direct = <T extends DirectiveFunction>(fn: T): T & JSXComponentSignature => {
  (fn as any)[DIRECT_KEY] = true;
  return fn as T & JSXComponentSignature;
};

// ── isDirective ────────────────────────────────────────

export const isDirective = (fn: any): boolean => isFunction(fn) && fn[DIRECT_KEY] === true;

// ── createDirectiveContext ─────────────────────────────

/**
 * 为指定元素创建指令上下文。
 * onMount/onUnmount/use 注册到当前 Owner 的对应队列中。
 * 不再使用 DOM 节点的 Symbol 属性（DIRECTIVE_MOUNT / DIRECTIVE_UNMOUNT）。
 */
export function createDirectiveContext(_el: Element): DirectiveContext {
  return {
    onMount(fn: () => void): void {
      const owner = currentOwner.get();
      if (owner) {
        owner.mountCallbacks.push(fn);
      }
    },

    onUnmount(fn: () => void): void {
      const owner = currentOwner.get();
      if (owner) {
        owner.unmountCallbacks.push(fn);
      }
    },

    use: ((...args: any[]): any => {
      return registerSignalStop(args, (stop: () => void) => {
        const owner = currentOwner.get();
        if (owner) {
          owner.cleanups.push(stop);
        }
      });
    }) as UseFunction,
  };
}
