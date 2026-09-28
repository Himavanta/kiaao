import { createApp } from "kiaao";

import "./style.css";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// saboteur 入口（最小启动：挂载 App 到 #app）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function App() {
  return <div class="boot">saboteur</div>;
}

createApp(App).mount("#app");
