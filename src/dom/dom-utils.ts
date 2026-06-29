// kiaao — DOM API 别名封装
// 集中管理所有原生 DOM API 调用，打包工具自动压缩变量名。
// 注意：不要模块级引用 document，测试可能在非 DOM 环境导入此文件。
// 每个函数在调用时才访问全局 document，由打包工具自动内联优化。

export const querySelector = (s: string) => document.querySelector(s);
export const createElement = (t: string) => document.createElement(t);
export const createElementNS = (ns: string, t: string) => document.createElementNS(ns, t);
export const createTextNode = (t: string) => document.createTextNode(t);
export const createComment = (t: string) => document.createComment(t);
export const addEventListener = (el: EventTarget, t: string, h: any) => el.addEventListener(t, h);
export const removeEventListener = (el: EventTarget, t: string, h: any) =>
  el.removeEventListener(t, h);
