import { use, type Context } from "kiaao";
import { createMotion } from "kiaao/motion";

export default function (_: any, context: Context) {
  const [state, setState] = use(true);
  const [visible, Motion] = createMotion(state, context);
  const [text] = use(state, () => (state() ? "收起" : "展开"));

  return (
    <div class="h-full w-full flex flex-col gap-4 p-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">when 模式</h2>
        <span class="text-sm text-gray-500">业务状态：{text}</span>
      </div>

      <button
        onClick={() => setState(!state())}
        class="self-start px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        {text}
      </button>

      <div when={visible}>
        <Motion
          from={{ opacity: 0, transform: "translateY(16px)" }}
          to={{ opacity: 1, transform: "translateY(0)" }}
          duration={0.3}
        >
          <div class="p-6 bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
            <p class="text-lg">🎉 进入动画</p>
            <p class="text-sm text-gray-500 mt-1">退出动画播放完毕后，此卡片才会移除</p>
          </div>
        </Motion>
      </div>
    </div>
  );
}
