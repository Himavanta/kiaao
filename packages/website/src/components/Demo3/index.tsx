import { lazy, Teleport } from "kiaao";

const Demo = lazy(() => import("../Demo2"));

function FragmentDemo() {
  return (
    <>
      <h3 style="margin-bottom: 4px">Fragment 演示</h3>
      <p>这段内容被 Fragment 包裹，没有额外 DOM 容器。</p>
    </>
  );
}

export default function () {
  return (
    <Teleport to="body">
      <div>hhhh</div>
      <>
        <FragmentDemo />
        <Demo />
      </>
    </Teleport>
  );
}
