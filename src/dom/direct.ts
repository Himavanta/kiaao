// kiaao — DOM-specific directive wrapper
// Overrides core `direct()` with `el: Element` type for DOM environments.
// Core's `direct()` uses `el: HostNode` (= unknown) for cross-platform compatibility;
// DOM-specific directives always receive real DOM elements, so this wrapper
// provides the correct type without requiring manual casts.

import {
  direct as coreDirect,
  type DirectiveContext,
  type Props,
  type HResult,
} from "../core/index.ts";

// ── JSX component signature (redeclared for DOM layer) ─

type JSXComponentSignature = (props: Props) => HResult;

// ── DOM Directive Type ────────────────────────────────

type DOMDirectiveFunction = (
  el: Element,
  props: Props & { children?: any },
  context: DirectiveContext,
) => void;

// ── direct() — DOM version ────────────────────────────

export function direct<T extends DOMDirectiveFunction>(fn: T): T & JSXComponentSignature {
  return coreDirect(fn as any) as any;
}
