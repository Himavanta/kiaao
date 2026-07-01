import { use } from "kiaao";

import Model from "../../ui/Model.ts";

export default function () {
  // ── 各种表单信号 ─────────────────────────────────
  const text = use("hello");
  const password = use("secret");
  const email = use("user@example.com");
  const number = use("42");
  const range = use("50");
  const color = use("#6366f1");
  const date = use("2025-01-01");
  const checked = use(true);
  const radio = use("a");
  const textarea = use("多行文本");
  const select = use("b");
  const multiselect = use(["a", "c"]);

  return (
    <form autocomplete="off" class="max-w-lg mx-auto p-6 flex flex-col gap-6">
      <h1 class="text-xl font-bold">Model 指令演示</h1>

      {/* ── 文本 / 密码 / 邮箱 ─────────────── */}
      <section class="flex flex-col gap-2">
        <h2 class="font-semibold text-sm text-gray-500">文本类</h2>

        <label class="flex items-center gap-3">
          <span class="w-16 text-sm shrink-0">text</span>
          <Model value={text}>
            <input class="border rounded px-2 py-1 flex-1" />
          </Model>
          <span class="text-xs text-gray-400 w-24 truncate">{text}</span>
        </label>

        <label class="flex items-center gap-3">
          <span class="w-16 text-sm shrink-0">password</span>
          <Model value={password}>
            <input type="password" autocomplete="off" class="border rounded px-2 py-1 flex-1" />
          </Model>
        </label>

        <label class="flex items-center gap-3">
          <span class="w-16 text-sm shrink-0">email</span>
          <Model value={email}>
            <input type="email" class="border rounded px-2 py-1 flex-1" />
          </Model>
          <span class="text-xs text-gray-400 w-24 truncate">{email}</span>
        </label>

        <label class="flex items-center gap-3">
          <span class="w-16 text-sm shrink-0">number</span>
          <Model value={number}>
            <input type="number" class="border rounded px-2 py-1 flex-1" />
          </Model>
          <span class="text-xs text-gray-400 w-24">value: {number}</span>
        </label>
      </section>

      {/* ── 范围 + 颜色 ────────────────────── */}
      <section class="flex flex-col gap-2">
        <h2 class="font-semibold text-sm text-gray-500">范围 / 颜色</h2>

        <label class="flex items-center gap-3">
          <span class="w-16 text-sm shrink-0">range</span>
          <Model value={range}>
            <input type="range" min="0" max="100" class="flex-1" />
          </Model>
          <span class="text-xs text-gray-400 w-12 text-right">{range}</span>
        </label>

        <label class="flex items-center gap-3">
          <span class="w-16 text-sm shrink-0">color</span>
          <Model value={color}>
            <input type="color" class="w-10 h-10 rounded cursor-pointer" />
          </Model>
          <span class="text-xs text-gray-400 w-24 font-mono">{color}</span>
        </label>
      </section>

      {/* ── 日期 ────────────────────────────── */}
      <section class="flex flex-col gap-2">
        <h2 class="font-semibold text-sm text-gray-500">日期</h2>

        <label class="flex items-center gap-3">
          <span class="w-16 text-sm shrink-0">date</span>
          <Model value={date}>
            <input type="date" class="border rounded px-2 py-1 flex-1" />
          </Model>
          <span class="text-xs text-gray-400 w-24">{date}</span>
        </label>
      </section>

      {/* ── 布尔类：checkbox / radio ────────── */}
      <section class="flex flex-col gap-2">
        <h2 class="font-semibold text-sm text-gray-500">布尔类</h2>

        <label class="flex items-center gap-3 cursor-pointer">
          <Model value={checked}>
            <input type="checkbox" />
          </Model>
          <span class="text-sm">checked: {checked}</span>
        </label>

        <div class="flex flex-col gap-1">
          <span class="text-sm text-gray-500">radio (current: {radio})</span>
          {["a", "b", "c"].map((v) => (
            <label class="flex items-center gap-2 cursor-pointer">
              <Model value={radio}>
                <input type="radio" name="demo-radio" value={v} />
              </Model>
              <span class="text-sm">{v}</span>
            </label>
          ))}
        </div>
      </section>

      {/* ── textarea ─────────────────────────── */}
      <section class="flex flex-col gap-2">
        <h2 class="font-semibold text-sm text-gray-500">多行文本</h2>

        <Model value={textarea}>
          <textarea class="border rounded px-2 py-1 h-20 w-full resize-none" />
        </Model>
        <pre class="text-xs text-gray-400 bg-gray-50 rounded p-2 whitespace-pre-wrap">
          {textarea}
        </pre>
      </section>

      {/* ── select ───────────────────────────── */}
      <section class="flex flex-col gap-2">
        <h2 class="font-semibold text-sm text-gray-500">选择框</h2>

        <label class="flex items-center gap-3">
          <span class="w-16 text-sm shrink-0">select</span>
          <Model value={select}>
            <select class="border rounded px-2 py-1 flex-1">
              <option value="a">A</option>
              <option value="b">B</option>
              <option value="c">C</option>
            </select>
          </Model>
          <span class="text-xs text-gray-400">value: {select}</span>
        </label>

        <label class="flex items-center gap-3">
          <span class="w-16 text-sm shrink-0">multiselect</span>
          <Model value={multiselect}>
            <select multiple class="border rounded px-2 py-1 flex-1 h-24">
              <option value="a">A</option>
              <option value="b">B</option>
              <option value="c">C</option>
              <option value="d">D</option>
            </select>
          </Model>
          <span class="text-xs text-gray-400 w-24">
            {use(multiselect, () => multiselect().join(", "))}
          </span>
        </label>
      </section>
    </form>
  );
}
