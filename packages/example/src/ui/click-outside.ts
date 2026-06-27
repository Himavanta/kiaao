// kiaao — ClickOutside directive: detects clicks outside the element
// Usage:
//   <ClickOutside onClickOutside={handler}>
//     <div>content</div>
//   </ClickOutside>

import { direct, type Props } from "kiaao";

interface ClickOutsideProps extends Props {
  onClickOutside?: (e: MouseEvent) => void;
}

export const ClickOutside = direct((el, props: ClickOutsideProps, ctx) => {
  ctx.onMount(() => {
    const handler = (e: MouseEvent) => {
      if (el.contains(e.target as Node)) return;
      props.onClickOutside?.(e);
    };
    window.addEventListener("click", handler, true);
    ctx.onUnmount(() => window.removeEventListener("click", handler, true));
  });
});
