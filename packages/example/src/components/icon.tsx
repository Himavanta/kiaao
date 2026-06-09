import { define, effect, derive } from "kiaao";

// ── Types ──────────────────────────────────────────────

interface IconifyIcon {
  body: string;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
}

// ── Cache ──────────────────────────────────────────────

const cache = new Map<string, Promise<IconifyIcon>>();

function fetchIcon(name: string): Promise<IconifyIcon> {
  if (cache.has(name)) return cache.get(name)!;

  const [prefix, icon] = name.split(":");
  const promise = fetch(`https://api.iconify.design/${prefix}.json?icons=${icon}`)
    .then((r) => {
      if (!r.ok) throw new Error(`Iconify ${r.status}: ${name}`);
      return r.json();
    })
    .then((d) => {
      if (!d.icons?.[icon]) throw new Error(`Icon not found: ${name}`);

      return { width: d.width, height: d.height, ...d.icons[icon] } as IconifyIcon;
    });

  cache.set(name, promise);
  return promise;
}

// ── Component ──────────────────────────────────────────

export default function Icon(props: Record<string, any>) {
  // 排除内部使用的 prop
  const { icon, ...svgProps } = props;

  const [data, setData] = define<IconifyIcon | null>(null);
  const [loading, setLoading] = define(true);

  effect(() => {
    setLoading(true);
    setData(null);

    if (icon()) {
      fetchIcon(icon())
        .then((d) => {
          setData(d);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    }
  });

  const body = derive(() => (loading() || !data() ? "" : data()!.body));

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={data((v) => `0 0 ${v?.width || 24} ${v?.height || 24}`)}
      prop:innerHTML={body}
      {...svgProps}
    />
  );
}
