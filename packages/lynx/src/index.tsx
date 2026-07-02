import { render } from "kiaao/lynx";

// import { App } from "./App";

function App() {
  return (
    <view className="Content">
      <text className="Description">Tap the logo and have fun!</text>
      <text className="Hint">
        Edit
        <text
          style={{
            fontStyle: "italic",
            color: "rgba(255, 255, 255, 0.85)",
          }}
        >
          {" src/App.tsx "}
        </text>
        to see updates!
      </text>
    </view>
  );
}

render(App);
