// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 资源加载与音效播放
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 音效名称 */
export type SoundName = "hit" | "paddle" | "lose" | "win";

/** 加载完成的资源：背景图 URL + 音效播放器 */
export type Assets = {
  bg: string;
  play: (name: SoundName) => void;
};

/** 加载图片：resolve 返回可用的 URL */
function loadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(url);
    img.onerror = () => reject(new Error(`图片加载失败: ${url}`));
    img.src = url;
  });
}

/** 加载并解码音效 */
async function loadSound(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`音效加载失败: ${url}`);
  return ctx.decodeAudioData(await res.arrayBuffer());
}

/** 播放音效：自动恢复挂起的 AudioContext（用户手势后） */
function createPlayer(ctx: AudioContext, sounds: Record<SoundName, AudioBuffer>) {
  return (name: SoundName) => {
    if (ctx.state === "suspended") void ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = sounds[name];
    src.connect(ctx.destination);
    src.start();
  };
}

/**
 * 预加载全部资源。
 * 由异步组件中 await 调用：resolve 后游戏即可渲染（加载期间为占位符）。
 */
export async function loadAssets(): Promise<Assets> {
  const ctx = new AudioContext();
  const [bg, hit, paddle, lose, win] = await Promise.all([
    loadImage("/breakout/bg.svg"),
    loadSound(ctx, "/breakout/hit.wav"),
    loadSound(ctx, "/breakout/paddle.wav"),
    loadSound(ctx, "/breakout/lose.wav"),
    loadSound(ctx, "/breakout/win.wav"),
  ]);
  return { bg, play: createPlayer(ctx, { hit, paddle, lose, win }) };
}
