import { use, type Context } from "kiaao";
import { createMotion } from "kiaao/motion";

export default function (_: any, context: Context) {
  const [visible] = use(true);
  const [play, Motion] = createMotion(visible, context);

  const [text] = use(visible, () => (visible() ? "关闭" : "打开"));

  return (
    <div class="h-full w-full flex flex-col items-center justify-center gap-4">
      <button
        onClick={() => play(!visible())}
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
