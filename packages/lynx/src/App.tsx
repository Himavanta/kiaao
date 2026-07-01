import { use } from "kiaao/lynx";

import "./App.css";
import arrow from "./assets/arrow.png";
import lynxLogo from "./assets/lynx-logo.png";
import reactLynxLogo from "./assets/react-logo.png";

export function App() {
  const alterLogo = use(false);
  const logoY = use(0);
  const velocity = use(0);
  const gravity = use(0.5);

  const jump = () => {
    velocity(-8);
    const tick = () => {
      velocity(velocity() + gravity());
      logoY(logoY() + velocity());
      if (logoY() > 0) {
        logoY(0);
        velocity(0);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const onTap = () => {
    "background only";
    alterLogo(!alterLogo());
  };

  return (
    <view bindtap={jump}>
      <view className="Background" />
      <view className="App">
        <view className="Banner">
          <view className="Logo" style={{ transform: `translateY(${logoY()}px)` }} bindtap={onTap}>
            {alterLogo() ? (
              <image src={reactLynxLogo} className="Logo--react" />
            ) : (
              <image src={lynxLogo} className="Logo--lynx" />
            )}
          </view>
          <text className="Title">Kiaao</text>
          <text className="Subtitle">on Lynx</text>
        </view>
        <view className="Content">
          <image src={arrow} className="Arrow" />
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
        <view style={{ flex: 1 }} />
      </view>
    </view>
  );
}
