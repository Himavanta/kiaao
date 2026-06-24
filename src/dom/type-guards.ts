// kiaao — DOM-specific runtime type guards
// These rely on DOM APIs (Node, Element) and reside in the DOM platform layer.

export const isNode = (v: any): v is Node => v instanceof Node;
export const isElement = (v: any): v is Element => v instanceof Element;
export const isSVGElement = (v: any): boolean => v instanceof SVGElement;
