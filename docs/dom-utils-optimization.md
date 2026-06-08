# DOM 操作封装优化

## 目标

将所有浏览器原生 API 的调用封装到单一模块中，使打包工具（esbuild/terser）能够统一缩短函数名，减少产物体积。

## 原则

- 使用标准 DOM API，无 hack
- 优先使用更短的现代替代（`append` → `appendChild`，`before` → `insertBefore`，`remove` → `removeChild`）
- 读操作与写操作分别封装
- 只封装框架内部使用的 API，不预封未使用的

## 封装清单

### 创建类

| 原始                                | 封装                | 说明     |
| ----------------------------------- | ------------------- | -------- |
| `document.createElement(t)`         | `createElement(t)`  | 元素创建 |
| `document.createTextNode(t)`        | `createTextNode(t)` | 文本节点 |
| `document.createComment(t)`         | `createComment(t)`  | 注释节点 |
| `document.createDocumentFragment()` | `createFragment()`  | 文档片段 |

### 树操作类

| 原始                   | 替代          | 说明                                        |
| ---------------------- | ------------- | ------------------------------------------- |
| `p.appendChild(c)`     | `p.append(c)` | 末尾追加，`appendChild` 的现代替代          |
| `p.insertBefore(c, r)` | `r.before(c)` | 在参考节点前插入，`insertBefore` 的现代替代 |
| `p.removeChild(c)`     | `c.remove()`  | 移除自身，替代 `removeChild`                |

### 属性读写类

| 原始                    | 封装                  | 说明            |
| ----------------------- | --------------------- | --------------- |
| `el.setAttribute(k, v)` | `setAttr(el, k, v)`   | 设属性          |
| `el.removeAttribute(k)` | `removeAttr(el, k)`   | 删属性          |
| `el.firstChild`         | `firstChild(el)`      | 首子节点        |
| `node.parentNode`       | `parentNode(n)`       | 父节点          |
| `node.previousSibling`  | `prevSibling(n)`      | 前一兄弟        |
| `el.isConnected`        | `isConnected(el)`     | 是否在 DOM 中   |
| `node.nodeType`         | `nodeType(n)`         | 节点类型        |
| `el.className = v`      | `setClassName(el, v)` | 设 class        |
| `el.style.cssText = v`  | `setCssText(el, v)`   | 设 style 字符串 |

### 窗口/URL 类

| 原始                             | 封装                 | 说明         |
| -------------------------------- | -------------------- | ------------ |
| `window.location.pathname`       | `getPathname()`      | 当前路径     |
| `window.location.search`         | `getSearch()`        | 查询字符串   |
| `history.pushState(null, "", p)` | `pushState(p)`       | 导航         |
| `new URLSearchParams(s)`         | `parseSearch(s)`     | 解析查询参数 |
| `el.addEventListener(t, h)`      | `addEvent(el, t, h)` | 事件绑定     |

## 实施步骤

1. 创建 `src/core/dom-utils.ts`
2. 逐个文件替换调用
3. 验证测试与构建
