import { use, type Context } from "kiaao";
import { createMotion } from "kiaao/motion";

export default function (_: any, context: Context) {
  // 业务信号：直接操作，状态文案立即响应
  const [state, setState] = use(true);
  // 动画信号：延迟更新，绑定到 when
  const [visible, Motion] = createMotion(state, context);

  const [text] = use(state, () => (state() ? "关闭" : "打开"));

  return (
    <div class="h-full w-full gap-4">
      <button
        onClick={() => setState(!state())}
        class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        {text}
      </button>

      <div when={visible}>
        <Motion
          from={{ opacity: 0, transform: "translateY(20px)" }}
          to={{ opacity: 1, transform: "translateY(0)" }}
          duration={0.3}
        >
          <div class="p-8 bg-white rounded-xl shadow-lg text-center text-lg">
            <p>👋 你好，kiaao Motion！</p>
            <p class="text-sm text-gray-500 mt-2">点击按钮触发退出动画</p>
          </div>
        </Motion>
      </div>
    </div>
  );
}
