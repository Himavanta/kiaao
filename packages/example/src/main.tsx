import "./style.css";
import typescriptLogo from "./assets/typescript.svg";
import viteLogo from "./assets/vite.svg";
import heroImg from "./assets/hero.png";
import { define, mount } from "kiaao";
import { TodoApp } from "./todo.tsx";

// ── SVG Icon Components ────────────────────────────────

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

function createIcon(href: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("role", "presentation");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttributeNS(XLINK_NS, "href", href);
  svg.appendChild(use);
  return svg;
}

function renderIcon(href: string) {
  return createIcon(href);
}

// ── Counter ────────────────────────────────────────────

function Counter() {
  const [count, setCount] = define(0);

  return (
    <button id="counter" type="button" class="counter" onClick={() => setCount((prev) => prev + 1)}>
      Count is {count}
    </button>
  );
}

// ── App ────────────────────────────────────────────────

function App() {
  return (
    <section id="center">
      <div class="hero">
        <img class="base" src={heroImg} width="170" height="179" alt="" />
        <img class="framework" src={typescriptLogo} alt="TypeScript logo" />
        <img class="vite" src={viteLogo} alt="Vite logo" />
      </div>

      <div>
        <h1>Get started</h1>
        <p>
          Edit <code>src/main.tsx</code> and save to test <code>HMR</code>
        </p>
      </div>

      <Counter />
      <TodoApp />
    </section>
  );
}

// ── Next Steps ─────────────────────────────────────────

function NextSteps() {
  return (
    <>
      <div class="ticks" />
      <section id="next-steps">
        <div id="docs">
          {renderIcon("/icons.svg#documentation-icon")}
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img class="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://www.typescriptlang.org" target="_blank">
                <img class="button-icon" src={typescriptLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          {renderIcon("/icons.svg#social-icon")}
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>
      <div class="ticks" />
      <section id="spacer" />
    </>
  );
}

// ── Mount ──────────────────────────────────────────────

const root = (
  <div>
    <App />
    <NextSteps />
  </div>
);

mount(root as HTMLElement, document.querySelector<HTMLDivElement>("#app")!);
