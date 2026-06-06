import "./style.css";
import typescriptLogo from "./assets/typescript.svg";
import viteLogo from "./assets/vite.svg";
import heroImg from "./assets/hero.png";
import { define, h, mount } from "kiaao";

function App() {
  const [count, setCount] = define(0);

  return h(
    "section",
    { id: "center" },
    // Hero logos
    h(
      "div",
      { class: "hero" },
      h("img", { class: "base", src: heroImg, width: "170", height: "179", alt: "" }),
      h("img", { class: "framework", src: typescriptLogo, alt: "TypeScript logo" }),
      h("img", { class: "vite", src: viteLogo, alt: "Vite logo" }),
    ),
    // Title block
    h(
      "div",
      null,
      h("h1", null, "Get started"),
      h(
        "p",
        null,
        "Edit ",
        h("code", null, "src/main.ts"),
        " and save to test ",
        h("code", null, "HMR"),
      ),
    ),
    // Reactive counter
    h(
      "button",
      {
        id: "counter",
        type: "button",
        class: "counter",
        onClick: () => setCount((prev) => prev + 1),
      },
      count((v) => `Count is ${v}`),
    ),
  );
}

function NextSteps() {
  return [
    h("div", { class: "ticks" }),
    h(
      "section",
      { id: "next-steps" },
      h(
        "div",
        { id: "docs" },
        h("h2", null, "Documentation"),
        h("p", null, "Your questions, answered"),
        h(
          "ul",
          null,
          h(
            "li",
            null,
            h(
              "a",
              { href: "https://vite.dev/", target: "_blank" },
              h("img", { class: "logo", src: viteLogo, alt: "" }),
              " Explore Vite",
            ),
          ),
          h(
            "li",
            null,
            h(
              "a",
              { href: "https://www.typescriptlang.org", target: "_blank" },
              h("img", { class: "button-icon", src: typescriptLogo, alt: "" }),
              " Learn more",
            ),
          ),
        ),
      ),
      h(
        "div",
        { id: "social" },
        h("h2", null, "Connect with us"),
        h("p", null, "Join the Vite community"),
        h(
          "ul",
          null,
          h(
            "li",
            null,
            h("a", { href: "https://github.com/vitejs/vite", target: "_blank" }, "GitHub"),
          ),
          h("li", null, h("a", { href: "https://chat.vite.dev/", target: "_blank" }, "Discord")),
          h("li", null, h("a", { href: "https://x.com/vite_js", target: "_blank" }, "X.com")),
          h(
            "li",
            null,
            h("a", { href: "https://bsky.app/profile/vite.dev", target: "_blank" }, "Bluesky"),
          ),
        ),
      ),
    ),
    h("div", { class: "ticks" }),
    h("section", { id: "spacer" }),
  ];
}

// Build the full page tree
const root = h("div", null, App(), ...NextSteps());

// Mount into #app
mount(root, document.querySelector<HTMLDivElement>("#app")!);
