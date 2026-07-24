import { use } from "kiaao/lynx";

import "./App.css";

export function App() {
  const alterLogo = use(true);
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
    alterLogo(!alterLogo());
  };

  return (
    <view bindtap={jump}>
      <view className="Background" />
      <view className="App" bindtap={onTap}>
        <view className="Banner">
          <text>{alterLogo}</text>
          <image
            src="https://img2.baidu.com/it/u=2889559798,3207819863&fm=253&fmt=auto&app=138&f=JPEG"
            style={use(alterLogo, () => ({ visibility: alterLogo() ? "visible" : "hidden" }))}
          />
          {/* <Show value={alterLogo}>
            {() => (
              <view>
                <text>text-a</text>
              </view>
            )}
            {() => (
              <view>
                <text>text-b</text>
              </view>
            )}
          </Show> */}
          <view className="Logo" style={{ transform: `translateY(${logoY()}px)` }}>
            {/* <image
              src={use(alterLogo, () =>
                alterLogo()
                  ? "https://img2.baidu.com/it/u=2889559798,3207819863&fm=253&fmt=auto&app=138&f=JPEG"
                  : "https://img1.baidu.com/it/u=3300257362,2600200351&fm=253&fmt=auto&app=138&f=JPEG",
              )}
              className="Logo--react"
            /> */}
            {/* <Show value={alterLogo}>
              {() => (
                <view>
                  <image
                    src="https://img2.baidu.com/it/u=2889559798,3207819863&fm=253&fmt=auto&app=138&f=JPEG"
                    className="Logo--react"
                  />
                </view>
              )}
              {() => (
                <view>
                  <image
                    src="https://img1.baidu.com/it/u=3300257362,2600200351&fm=253&fmt=auto&app=138&f=JPEG"
                    className="Logo--lynx"
                  />
                </view>
              )}
            </Show> */}
            {/* <Show value={alterLogo}>
              {() => <image src={reactLynxLogo} className="Logo--react" />}
              {() => <image src={lynxLogo} className="Logo--lynx" />}
            </Show> */}
          </view>
          <text className="Title">Kiaao</text>
          <text className="Subtitle">on Lynx</text>
        </view>
        <view className="Content">
          {/* <image src={arrow} className="Arrow" /> */}
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
