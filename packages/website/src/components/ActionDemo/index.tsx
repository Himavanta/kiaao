import { actions } from "astro:actions";
import { use, Show } from "kiaao";

import style from "./style.module.css";

export default function ActionDemo() {
  const count = use(0);
  const greeting = use<string | null>(null);
  const name = use("");
  const loading = use(false);
  const error = use<string | null>(null);

  const handleLike = async () => {
    loading(true);
    error(null);
    const { data, error: actErr } = await actions.like({ id: "demo-post" });
    if (actErr) {
      error(String(actErr.message ?? actErr.code));
      loading(false);
      return;
    }
    count(data.likes);
    loading(false);
  };

  const handleGreeting = async () => {
    loading(true);
    error(null);
    const { data, error: actErr } = await actions.getGreeting({
      name: name() || "朋友",
    });
    if (actErr) {
      error(String(actErr.message ?? actErr.code));
      loading(false);
      return;
    }
    greeting(data);
    loading(false);
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    loading(true);
    error(null);

    const form = e.currentTarget as HTMLFormElement;
    const formData = new FormData(form);

    const { data, error: actErr } = await actions.submitFeedback(formData);
    if (actErr) {
      error(String(actErr.message ?? actErr.code));
      loading(false);
      return;
    }
    greeting(`感谢反馈，${data.name}！`);
    form.reset();
    loading(false);
  };

  return (
    <div class={style.container}>
      <h1 class={style.title}>Astro Actions Demo</h1>

      {/* ① 点赞按钮 */}
      <section class={style.card}>
        <h2>① 点赞</h2>
        <p>当前点赞数：{count}</p>
        <button class={style.btn} onClick={handleLike} disabled={loading()}>
          {loading() ? "加载中…" : "👍 点赞"}
        </button>
        <Show value={use(error, () => Boolean(error()))}>
          {() => <p class={style.error}>{error}</p>}
        </Show>
      </section>

      {/* ② 问候 */}
      <section class={style.card}>
        <h2>② 获取问候</h2>
        <input
          class={style.input}
          placeholder="输入名字"
          value={name}
          onInput={(e: Event) => name((e.target as HTMLInputElement).value)}
        />
        <button class={style.btn} onClick={handleGreeting} disabled={loading()}>
          获取问候
        </button>
        <Show value={use(greeting, () => Boolean(greeting()))}>
          {() => <p class={style.result}>{greeting}</p>}
        </Show>
      </section>

      {/* ③ 反馈表单 */}
      <section class={style.card}>
        <h2>③ 提交反馈（FormData）</h2>
        <form onSubmit={handleSubmit}>
          <input class={style.input} name="name" placeholder="名字" required />
          <input class={style.input} name="email" type="email" placeholder="邮箱" required />
          <textarea
            class={style.textarea}
            name="message"
            placeholder="消息（至少 5 个字符）"
            required
          />
          <button class={style.btn} type="submit" disabled={loading()}>
            {loading() ? "提交中…" : "提交反馈"}
          </button>
        </form>
        <Show value={use(error, () => Boolean(error()))}>
          {() => <p class={style.error}>{error}</p>}
        </Show>
      </section>
    </div>
  );
}
