import { use, toValue } from "kiaao";

// ── Types ──────────────────────────────────────────────

interface IconData {
  body: string;
  width: number;
  height: number;
}

interface IconifyResponse {
  width: number;
  height: number;
  icons: Record<string, { body: string; width?: number; height?: number }>;
}

// ── Cache ──────────────────────────────────────────────

const cache = new Map<string, Promise<IconifyResponse>>();

function fetchRaw(name: string): Promise<IconifyResponse> {
  if (cache.has(name)) return cache.get(name)!;

  const [prefix, icon] = name.split(":");
  const promise = fetch(`https://api.iconify.design/${prefix}.json?icons=${icon}`).then((r) => {
    if (!r.ok) throw new Error(`Iconify ${r.status}: ${name}`);
    return r.json();
  });

  cache.set(name, promise);
  return promise;
}

// ── Component ──────────────────────────────────────────

export default function Icon(props: Record<string, any>) {
  const [data, setData] = use<IconData | null>(null);
  const { icon, ...svgProps } = props;

  const name = toValue(icon);
  if (name) {
    fetchRaw(name)
      .then((res) => {
        const entry = res.icons[name.split(":")[1]];
        if (!entry) throw new Error(`Icon not found: ${name}`);
        setData({
          body: entry.body,
          width: entry.width || res.width || 24,
          height: entry.height || res.height || 24,
        });
      })
      .catch((err) => console.error("[icon] failed to load:", err));
  }

  const [body] = use(data, () => data()?.body ?? "");
  const [viewBox] = use(data, () => {
    const d = data();
    return `0 0 ${d?.width || 24} ${d?.height || 24}`;
  });

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={props.width || "1em"}
      height={props.height || "1em"}
      fill={props.fill || "currentColor"}
      prop:innerHTML={body}
      {...svgProps}
    />
  );
}
