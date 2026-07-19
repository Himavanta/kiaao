// kiaao — Lynx 原生 API 类型声明

export {};

declare global {
  interface FiberElement {
    $$typeof: symbol;
  }

  // ── 节点创建 ─────────────────────────────────────────

  function __CreatePage(componentId: string, cssId: number): FiberElement;
  function __CreateElement(tag: string, parentComponentUniqueId: number): FiberElement;
  function __CreateWrapperElement(parentComponentUniqueId: number): FiberElement;
  function __CreateRawText(s: string): FiberElement;
  /** 创建 image 元素 — 初始化原生图片解码器等 image 特有内部状态 */
  function __CreateImage(parentComponentUniqueId: number): FiberElement;
  function __CreateView(parentComponentUniqueId: number): FiberElement;
  function __CreateText(parentComponentUniqueId: number): FiberElement;

  // ── 节点操作 ─────────────────────────────────────────

  function __AppendElement(parent: FiberElement, child: FiberElement): FiberElement;
  function __InsertElementBefore(
    parent: FiberElement,
    child: FiberElement,
    ref?: FiberElement,
  ): FiberElement;
  function __RemoveElement(parent: FiberElement, child: FiberElement): FiberElement;
  /** 原子替换节点。参数顺序: (newElement, oldElement) */
  function __ReplaceElement(a: FiberElement, b: FiberElement): FiberElement;

  // ── 刷新 ─────────────────────────────────────────────

  function __FlushElementTree(): void;
  function __FlushElementTree(element: FiberElement): void;
  function __FlushElementTree(element: FiberElement, options: FlushOptions): void;

  interface FlushOptions {
    triggerLayout?: boolean;
    operationID?: any;
    pipelineOptions?: PipelineOptions;
    elementID?: number;
    listID?: number;
    asyncFlush?: boolean;
    triggerDataUpdated?: boolean;
  }

  interface PipelineOptions {
    pipelineID: string;
    pipelineOrigin: string;
    needTimestamps: boolean;
    dsl: string;
    stage: string;
  }

  // ── 属性 / 样式 ──────────────────────────────────────

  function __SetAttribute(e: FiberElement, key: string, value: any): void;
  function __SetClasses(e: FiberElement, c: string): void;
  function __SetInlineStyles(e: FiberElement, style: string): void;
  function __AddInlineStyle(e: FiberElement, key: number | string, value: any): void;
  function __SetID(e: FiberElement, id: string | undefined | null): void;
  function __AddDataset(e: FiberElement, key: string, value: any): void;
  function __SetDataset(e: FiberElement, value: Record<string, any>): void;
  function __GetDataset(e: FiberElement): Record<string, any>;
  function __GetAttributes(e: FiberElement): Record<string, any>;
  function __GetAttributeByName(e: FiberElement, name: string): any;
  function __GetAttributeNames(e: FiberElement): string[];
  function __SetCSSId(e: FiberElement | FiberElement[], cssId: number, entryName?: string): void;

  // ── 事件 ─────────────────────────────────────────────

  function __AddEvent(
    e: FiberElement,
    eventType: string,
    eventName: string,
    event: Record<string, any> | string | undefined,
  ): void;

  // ── 节点遍历 / 查询 ──────────────────────────────────

  function __GetParent(of: FiberElement): FiberElement | undefined;
  function __GetPageElement(): FiberElement | undefined;
  function __FirstElement(parent: FiberElement): FiberElement;
  function __LastElement(parent: FiberElement): FiberElement;
  function __NextElement(node: FiberElement): FiberElement;
  function __GetTag(e: FiberElement): string;
  function __GetElementUniqueID(e: FiberElement): number;
  function __QuerySelector(
    e: FiberElement,
    cssSelector: string,
    params: object,
  ): FiberElement | undefined;
  function __GetTemplateParts(e: FiberElement): Record<string, FiberElement>;

  // ── 动画 ─────────────────────────────────────────────

  function __ElementAnimate(element: FiberElement, args: any[]): void;

  // ── 运行时 ───────────────────────────────────────────

  function runWorklet(value: unknown, params: unknown[]): void;
}
