import { use, Show, type Context } from "kiaao";
import { createMotion } from "kiaao/motion";

export default function (_: any, context: Context) {
  const state = use(true);
  const [visible, Motion] = createMotion(state, context);
  const text = use(state, () => (state() ? "收起" : "展开"));

  return (
    <div class="h-full w-full flex flex-col gap-4 p-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">when 模式</h2>
        <span class="text-sm text-gray-500">业务状态：{text}</span>
      </div>

      <button
        onClick={() => state(!state())}
        class="self-start px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        切换
      </button>

      <Show value={visible}>
        {() => (
          <Motion
            from={{ opacity: 0, transform: "translateY(16px)" }}
            to={{ opacity: 1, transform: "translateY(0)" }}
            duration={0.3}
          >
            <div class="p-6 bg-linear-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
              <p class="text-lg">🎉 进入动画</p>
              <p class="mt-4 text-gray-500 text-sm">
                你看不到退出动画——因为解除挂载后，Motion 不会触发退出动画
              </p>
            </div>
          </Motion>
        )}
      </Show>
    </div>
  );
}
