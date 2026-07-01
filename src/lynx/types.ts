// kiaao — Lynx 原生 API 类型声明

export {};

declare global {
  interface FiberElement {
    $$typeof: symbol;
  }

  function __CreatePage(componentId: string, cssId: number): FiberElement;
  function __CreateElement(tag: string, parentComponentUniqueId: number): FiberElement;
  function __CreateWrapperElement(parentComponentUniqueId: number): FiberElement;
  function __CreateRawText(s: string): FiberElement;
  function __InsertElementBefore(
    parent: FiberElement,
    child: FiberElement,
    ref?: FiberElement,
  ): FiberElement;
  function __RemoveElement(parent: FiberElement, child: FiberElement): FiberElement;
  function __ReplaceElement(a: FiberElement, b: FiberElement): FiberElement;
  function __FlushElementTree(element?: FiberElement): void;
  function __SetAttribute(e: FiberElement, key: string, value: any): void;
  function __SetClasses(e: FiberElement, c: string): void;
  function __SetInlineStyles(e: FiberElement, style: string): void;
  function __SetID(e: FiberElement, id: string | undefined | null): void;
  function __AddDataset(e: FiberElement, key: string, value: any): void;
  function __AddEvent(
    e: FiberElement,
    eventType: string,
    eventName: string,
    event: Record<string, any> | string | undefined,
  ): void;
  function __GetParent(of: FiberElement): FiberElement | undefined;
  function __FirstElement(parent: FiberElement): FiberElement;
  function __NextElement(node: FiberElement): FiberElement;
  function __GetTag(e: FiberElement): string;
  function __GetElementUniqueID(e: FiberElement): number;
}
