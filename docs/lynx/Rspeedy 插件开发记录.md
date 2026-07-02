# Kiaao Lynx Rspeedy 插件开发记录

**状态**：已关闭
**原因**：最终采用原生 Rspack（单入口主线程模式），Rspeedy 插件路线废弃。

---

## 采用的理由

Rspeedy 插件路线（Vue-Lynx 模式）需要完整的入口分层、`@lynx-js/runtime-wrapper-webpack-plugin`、`@lynx-js/react-webpack-plugin` 等复杂依赖链。对于 kiaao 这种不需要 React 及 worklet 机制的框架来说过于复杂。

最终选择了 SolidJS 示例项目的方案——原生 Rspack + 单入口全主线程模式，配置简单且成功跑通。

---

## 探索过程中学到的东西

| 概念                                       | 说明                                    |
| ------------------------------------------ | --------------------------------------- |
| `LAYERS.MAIN_THREAD` / `LAYERS.BACKGROUND` | Rspack 的入口分层机制                   |
| `additionalTreeRuntimeRequirements`        | 强制生成 `__webpack_require__` 启动代码 |
| `VueMarkMainThreadPlugin`                  | 标记主线程 asset + 启动代码生成         |
| `RuntimeWrapperWebpackPlugin`              | 后台 JS 的 AMD 包装器                   |
| `LynxTemplatePlugin.chunks`                | 指定主/后台入口的顺序                   |

---

**最终生效的配置**：`packages/lynx/rspack.config.js`
