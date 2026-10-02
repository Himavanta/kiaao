import { Link } from "../router";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// worlds 入口页：demo 跳转卡片
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const demos = [
  {
    path: "/bouncing-boxes",
    title: "弹跳盒子",
    desc: "矩形碰撞 + 静止障碍：彩盒在屏幕内弹跳、互相碰撞，紫色方块为静止障碍物（碰撞反弹、不交换速度）。",
    tags: ["矩形碰撞", "静止池", "移动池"],
  },
  {
    path: "/gravity-balls",
    title: "重力弹球",
    desc: "圆形碰撞 + 动态生命周期：点击空白生成小球（随机重力/大小/颜色），点击小球销毁，小球与中央方块精确圆角碰撞。",
    tags: ["圆形碰撞", "重力系统", "动态注册"],
  },
  {
    path: "/breakout",
    title: "打砖块",
    desc: "完整小游戏：键盘控制挡板反弹小球、击碎砖块计分；信号驱动的状态机（准备/运行/胜利/失败）；异步组件预加载音效与背景资源。",
    tags: ["状态机", "键盘输入", "异步组件", "音效"],
  },
  {
    path: "/crowd",
    title: "人群（actor 模型实验）",
    desc: "对照组实验：状态存在组件闭包、池里放带方法的对象。点击方块制造尸体，视野内的 NPC 会恐慌逃跑并传染给更远的人。与 ECS 版实现同一类玩法，用于比较两种模型的心智负担。",
    tags: ["actor 模型", "闭包状态", "恐慌传播", "实验"],
  },
  {
    path: "/breakout-objects",
    title: "打砖块（对象池改写）",
    desc: "breakout 的副本，改用「状态对象 + 池 + 帧末统一 flush」的写法：状态是可变的普通对象，方法直接 mutate，帧末浅拷贝进信号更新视图。与 ECS 版对照。",
    tags: ["对象池", "帧末 flush", "对照实验"],
  },
];

export default function Worlds() {
  return (
    <div class="flex h-full w-full items-center justify-center gap-8 bg-gray-50 p-8">
      {demos.map(({ path, title, desc, tags }) => (
        <Link
          to={path}
          class="block w-80 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
        >
          <h2 class="text-xl font-semibold text-gray-900">{title}</h2>
          <p class="mt-3 text-sm leading-relaxed text-gray-600">{desc}</p>
          <div class="mt-4 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span class="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600">
                {tag}
              </span>
            ))}
          </div>
        </Link>
      ))}
    </div>
  );
}
