// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 规则系统：胜负判定、时限、重开
//
// 三个终局条件（规划文档 8.4 取「击杀指定目标」制）：
// - 达成击杀目标 → `won`
// - 警报满值 → `caught`（警察到场）
// - 时限耗尽 → `timeout`
//
// **判定只在 `playing` 阶段生效**，且判定后立即 `stop()` 帧循环——
// 结算界面是静态的，继续跑帧只会让已死的人继续被杀。
//
// 本系统是所有终局状态的唯一写入者：其他系统只报告事实（击杀数、
// 警报值），由这里决定游戏是否结束。这样「什么时候结束」只有一处。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { use } from "kiaao";

import { gameState, type Phase } from "../state";

/** 关卡目标配置 */
export type Objective = {
  /** 需要达成的击杀数 */
  killGoal: number;
  /** 时限（秒） */
  timeLimit: number;
};

export type RulesSystem = {
  update: (delta: number) => void;
  /** 当前目标（HUD 展示用） */
  objective: Objective;
  /** 重新开始一局：重置状态、实体目录、警报 */
  restart: () => void;
};

/** 注册重开回调（组装层接线：resetGameState + 替换实体目录 + 警报归零） */
export type RestartHandler = () => void;

export function createRulesSystem(options: {
  objective: Objective;
  /** 停止帧循环（终局后调用） */
  stop: () => void;
  /** 报警信号（由 alarm 提供） */
  alarm: () => number;
  /** 重开回调：由组装层提供（它知道实体目录与警报怎么重置） */
  onRestart: () => void;
}) {
  const { objective, stop, alarm, onRestart } = options;

  const result = use<Phase>("playing");

  /** 结算结果：终局时记录一次，供结算界面展示 */
  const settle = (phase: Phase) => {
    gameState.phase(phase);
    result(phase);
    stop();
  };

  const update = (delta: number) => {
    // 终局后不再判定：结算界面是静态的
    if (gameState.phase() !== "playing") return;

    gameState.elapsed(gameState.elapsed() + delta);

    // 胜负条件按「优先度」排列：达成目标优先于被抓，
    // 否则同一帧内既完成目标又拉满警报时会误判为失败
    if (gameState.kills() >= objective.killGoal) {
      settle("won");
      return;
    }

    if (alarm() >= 100) {
      settle("caught");
      return;
    }

    const left = gameState.timeLeft() - delta;
    if (left <= 0) {
      gameState.timeLeft(0);
      settle("timeout");
      return;
    }

    gameState.timeLeft(left);
  };

  const restart = () => {
    result("playing");
    onRestart();
    // 重开后帧循环由组件重新 start（Show 分支重建时 onMount 会触发）
  };

  return { update, objective, restart };
}
