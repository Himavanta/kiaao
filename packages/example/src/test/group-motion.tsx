import { use, Each, type Context } from "kiaao";
import { createGroupMotion } from "kiaao/motion";

export default function (_: any, context: Context) {
  const items = use([
    { id: 1, text: "任务一", done: false },
    { id: 2, text: "任务二", done: false },
    { id: 3, text: "任务三", done: false },
  ]);
  const [visibleItems, GroupMotion] = createGroupMotion(items, (v) => v.id, context);

  let nextId = 4;

  const addItem = () => {
    items((v) => [...v, { id: nextId++, text: `任务${nextId - 1}`, done: false }]);
  };

  const removeItem = (id: number) => {
    items((v) => v.filter((i) => i.id !== id));
  };

  const toggleDone = (id: number) => {
    items((v) => v.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  };

  return (
    <div class="h-full w-full flex flex-col gap-4 p-6">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900">each 模式</h2>
        <span class="text-sm text-gray-500">{use(items, () => items().length)} 项</span>
      </div>

      <div>
        <button
          onClick={addItem}
          class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
        >
          ＋ 添加
        </button>
      </div>

      <ul class="flex flex-col gap-2">
        <Each value={visibleItems} keyed={(v: any) => v.id}>
          {({ item, index: _index }) => {
            const data = item();
            return (
              <GroupMotion
                key={data.id}
                from={{ opacity: 0, transform: "translateX(-20px)" }}
                to={{ opacity: 1, transform: "translateX(0)" }}
                duration={0.3}
              >
                <li
                  class="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-100"
                  style={`opacity: ${data.done ? 0.6 : 1}`}
                >
                  <div class="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={data.done}
                      onChange={() => toggleDone(data.id)}
                      class="w-4 h-4"
                    />
                    <span
                      style={`text-decoration: ${data.done ? "line-through" : "none"}`}
                      class="text-gray-800"
                    >
                      {data.text}
                    </span>
                  </div>
                  <button
                    onClick={() => removeItem(data.id)}
                    class="px-3 py-1 text-sm bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors"
                  >
                    删除
                  </button>
                </li>
              </GroupMotion>
            );
          }}
        </Each>
      </ul>

      <p class="text-xs text-gray-400">删除项先播放退出动画，动画完成后再从 DOM 中移除</p>
    </div>
  );
}
