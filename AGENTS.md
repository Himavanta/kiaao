<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## 代码规范

- 使用统一类型封装模块
- 使用统一dom操作封装
- 不要使用for循环，使用for-in 或者for-of来代替
- 函数参数超过3个时使用对象解构传递
- 对于数组元素的读取，尽量不使用下标获取，使用 [first,secd] = dataArray 解构的语法
- 函数体代码行数控制在30行内，最多不超过50行，可以使用 LSP 工具来辅助，注释不参与代码行数统计
- 完成任务自行使用LSP检查类型已经 vp check --fix 检查代码
