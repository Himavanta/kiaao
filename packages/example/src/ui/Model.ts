// kiaao — Model（双向绑定指令）
// 用法: <Model value={signal}><input /></Model>
// 自动适配 input(text/checkbox/radio/range/color/number 等)、textarea、select

import { direct } from "kiaao";

// ── 辅助：根据元素确定绑定属性、事件和取值方式 ──────

interface Binding {
  prop: string;
  event: string;
  getValue: (el: any) => any;
  /** 默认用 el[prop] = val，单选/多选需要自定义 */
  setValue?: (el: any, val: any) => void;
}

function resolveBinding(el: Element): Binding {
  const tag = el.tagName.toLowerCase();
  const type = ((el as HTMLInputElement).type || "").toLowerCase();

  // <select multiple>
  if (tag === "select" && (el as HTMLSelectElement).multiple) {
    return {
      prop: "value",
      event: "change",
      getValue: (el: HTMLSelectElement) =>
        [...el.selectedOptions].map((o: HTMLOptionElement) => o.value),
      setValue: (el: HTMLSelectElement, val: string[]) => {
        for (const opt of el.options) {
          opt.selected = val.includes(opt.value);
        }
      },
    };
  }

  // <select>
  if (tag === "select") {
    return {
      prop: "value",
      event: "change",
      getValue: (el: HTMLSelectElement) => el.value,
    };
  }

  // <textarea>
  if (tag === "textarea") {
    return {
      prop: "value",
      event: "input",
      getValue: (el: HTMLTextAreaElement) => el.value,
    };
  }

  // <input type="file"> — 只读
  if (type === "file") {
    return {
      prop: "value",
      event: "change",
      getValue: (el: HTMLInputElement) => el.files,
    };
  }

  // <input type="radio"> — checked 由值与当前信号比较决定
  if (type === "radio") {
    return {
      prop: "checked",
      event: "change",
      getValue: (el: HTMLInputElement) => el.value,
      setValue: (el: HTMLInputElement, val: any) => {
        el.checked = val === el.value;
      },
    };
  }

  // <input type="checkbox">
  if (type === "checkbox") {
    return {
      prop: "checked",
      event: "change",
      getValue: (el: HTMLInputElement) => el.checked,
    };
  }

  // 兜底：value + input（text / password / email / number / range / color / date 等）
  return {
    prop: "value",
    event: "input",
    getValue: (el: HTMLInputElement) => el.value,
  };
}

// ── Model 指令 ────────────────────────────────────────

const Model = direct((el, props, ctx) => {
  const signal = props.value;
  const { prop, event, getValue, setValue } = resolveBinding(el);

  // 初始化元素值
  const init = () => {
    if (setValue) {
      setValue(el, signal());
    } else {
      (el as any)[prop] = signal();
    }
  };

  // DOM → Signal
  const handler = (e: Event) => {
    signal(getValue(e.target));
  };

  el.addEventListener(event, handler);
  ctx.onUnmount(() => el.removeEventListener(event, handler));

  // Signal → DOM
  ctx.use(signal, () => {
    if (setValue) {
      setValue(el, signal());
    } else {
      (el as any)[prop] = signal();
    }
  });

  // 挂载后确保初始化（有可能 props 在首次渲染后才到位）
  ctx.onMount(init);
});

export default Model;
