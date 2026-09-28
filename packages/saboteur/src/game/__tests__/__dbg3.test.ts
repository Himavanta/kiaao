import { createApp } from "kiaao";
// @vitest-environment happy-dom
import { test, vi } from "vite-plus/test";

import App from "../../app";
import { level, stop, alarm } from "../instance";
import { listActors } from "../state";
import type { ActorEntity } from "../types";

const pin = (e: any, pos: any, facing: ActorEntity["facing"]) =>
  (e as any)({
    ...e(),
    x: pos.x,
    y: pos.y,
    facing,
    path: [],
    goal: null,
    idleLeft: 1e6,
    moodLeft: 1e6,
  });

test("dbg3", () => {
  const q = new Map<number, any>();
  let i = 1;
  let clock = 0;
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((cb: any) => {
    q.set(i, cb);
    return i++;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((x: any) => {
    q.delete(x);
  });
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  const tick = () => {
    clock += 16;
    const p = [...q.values()];
    q.clear();
    p.forEach((cb) => cb(clock));
  };
  document.body.innerHTML = '<div id="app"></div>';
  const app = createApp(App);
  app.mount("#app");
  alarm.reset();

  const guests = listActors().filter((e) => e().role === "guest");
  const guest = guests[0],
    corpse = guests[1];
  pin(corpse, { x: 7 * 32, y: 10 * 32 }, "west");
  (corpse as any)({ ...corpse(), dead: true, path: [], goal: null });

  const bottom = level.grid.rows - 2;
  let slot = 0;
  const iso = () => {
    slot = 0;
    for (const e of listActors()) {
      if (e === guest || e === corpse) continue;
      const col = 1 + slot * 8;
      console.log(`  isolate ${e().role} -> col ${col}, row ${bottom}`);
      pin(e, { x: col * 32 + 6, y: bottom * 32 + 6 }, "north");
      slot++;
    }
    pin(guest, { x: 5 * 32, y: 10 * 32 }, "east");
  };

  for (let k = 0; k < 40; k++) {
    iso();
    tick();
    if (guest().witnessed && k <= 8) {
      console.log(`帧${k}: alarm=${alarm.alarm()} count=${alarm.witnessCount()}`);
      listActors().forEach((e) => {
        const a = e();
        if (a.witnessed)
          console.log(`   witnessed: ${a.role} @${a.x.toFixed(0)},${a.y.toFixed(0)}`);
      });
    }
  }
  console.log("最终 alarm =", alarm.alarm(), "count =", alarm.witnessCount());
  app.unmount();
  stop();
});
