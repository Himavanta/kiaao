import { loadAssets } from "./assets";
import Game from "./game";

/**
 * 异步组件入口：await 资源加载完成后才渲染游戏。
 * 加载期间框架渲染占位注释节点；加载失败由框架捕获并保留占位符。
 */
async function Breakout() {
  const assets = await loadAssets();
  return <Game assets={assets} />;
}

export default Breakout;
