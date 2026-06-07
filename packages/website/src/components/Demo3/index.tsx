import { lazy, Teleport } from "kiaao";

const Demo = lazy(() => import("../Demo2"));

export default function () {
  return <Teleport to="body">{() => <Demo />}</Teleport>;
}
