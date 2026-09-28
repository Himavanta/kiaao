import { createApp } from "kiaao";

import "./styles/global.scss";
import style from "./styles/shell.module.scss";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// saboteur 入口（最小启动：挂载 App 到 #app）
//
// 样式分两层：
// - 静态布局 → CSS Modules 类名（本文件）
// - 逐帧变化的值 → StyleMemo 逐属性写入（组件内）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function App() {
  return (
    <div class={style.shell}>
      <div class={style.viewport}>
        <span class={style.title}>SABOTEUR</span>
      </div>
    </div>
  );
}

createApp(App).mount("#app");
