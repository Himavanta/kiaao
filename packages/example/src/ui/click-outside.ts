// kiaao — clickOutside directive: detects clicks outside the element
// Usage:
//   <clickOutside onClickOutside={handler}>
//     <div>content</div>
//   </clickOutside>

import { direct, type DirectiveContext, type Props } from "kiaao";

interface ClickOutsideProps extends Props {
  onClickOutside?: (e: MouseEvent) => void;
}

export const ClickOutside = direct((el, props: ClickOutsideProps, ctx: DirectiveContext) => {
  const element = el as HTMLElement;
  ctx.onMount(() => {
    const handler = (e: MouseEvent) => {
      if (element.contains(e.target as Node)) return;
      props.onClickOutside?.(e);
    };
    window.addEventListener("click", handler, true);
    ctx.onUnmount(() => window.removeEventListener("click", handler, true));
  });
});
