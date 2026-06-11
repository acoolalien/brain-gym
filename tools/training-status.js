// training-status — agent tool: report progress
import { getStatus } from "../lib/plan-engine.js";

export const name = "training_status";
export const description =
  "查询脑力训练进度。默认报今日进度和昨日对比，overview 模式出全局状态（执行中计划、总体趋势、连续打卡天数）。";

export const parameters = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["daily", "overview"], description: "daily=今日进度, overview=全局状态" },
  },
  required: [],
};

export async function execute(input, toolCtx) {
  const mode = input?.mode || "daily";

  try {
    const status = getStatus(toolCtx.pluginDir, toolCtx.dataDir, mode);

    if (mode === "overview") {
      return formatOverview(status);
    }
    return formatDaily(status);
  } catch (err) {
    return {
      content: [{ type: "text", text: `查询进度失败: ${err.message}` }],
    };
  }
}

function formatDaily(status) {
  if (!status.hasActivePlan) {
    const planList = (status.availablePlans || []).map(p => `- **${p.id}**: ${p.name}`).join("\n");
    return {
      content: [{ type: "text", text: `尚未开始训练计划。可选计划：\n${planList}\n\n说「开始XX计划」来启动。` }],
    };
  }

  const todayTag = status.todayCompleted ? "✅ 已完成" : "⏳ 待完成";
  let text = `📋 **${status.planName}** — 第 ${status.currentDay}/${status.totalDays} 天 ${todayTag}\n`;
  text += `今日目标：${status.todayGoal}\n`;

  if (status.todayCompleted && status.todayResult) {
    const r = status.todayResult;
    text += `本轮成绩：${formatScore(r)}\n`;
    if (status.yesterdayResult) {
      const y = status.yesterdayResult;
      const diff = compareScores(r.score, y.score);
      if (diff) text += `与昨日对比：${diff}\n`;
    }
  }

  if (!status.todayCompleted) {
    text += `剩余 ${status.remainingDays} 天，说「脑力热身」继续。`;
  }

  return { content: [{ type: "text", text }] };
}

function formatOverview(status) {
  if (!status.activePlan) {
    return { content: [{ type: "text", text: "没有进行中的训练计划。说「脑力热身」开始自由练习，或选择一个训练计划。" }] };
  }

  let text = `📊 **训练总览**\n`;
  text += `当前计划：${status.activePlan.name} — 第 ${status.activePlan.currentDay}/${status.activePlan.totalDays} 天\n`;
  text += `已完成：${status.completedDays} 天\n`;
  text += `连续打卡：${status.streak} 天 🔥\n`;
  if (status.startedAt) {
    text += `开始日期：${new Date(status.startedAt).toLocaleDateString("zh-CN")}\n`;
  }

  return { content: [{ type: "text", text }] };
}

function formatScore(result) {
  if (!result.score) return "";
  const s = result.score;
  if (typeof s.time === "number") return `用时 ${s.time.toFixed(1)}s`;
  if (typeof s.accuracy === "number") return `准确率 ${(s.accuracy * 100).toFixed(0)}%`;
  return JSON.stringify(s);
}

function compareScores(current, previous) {
  if (!current || !previous) return null;
  const parts = [];
  if (typeof current.time === "number" && typeof previous.time === "number") {
    const diff = previous.time - current.time;
    if (Math.abs(diff) > 0.1) {
      parts.push(diff > 0 ? `⏱ 快了 ${diff.toFixed(1)}s` : `⏱ 慢了 ${Math.abs(diff).toFixed(1)}s`);
    }
  }
  if (typeof current.accuracy === "number" && typeof previous.accuracy === "number") {
    const diff = current.accuracy - previous.accuracy;
    if (Math.abs(diff) > 0.01) {
      parts.push(diff > 0 ? `🎯 准确率提高 ${(diff * 100).toFixed(0)}%` : `🎯 准确率下降 ${(Math.abs(diff) * 100).toFixed(0)}%`);
    }
  }
  return parts.length > 0 ? parts.join("，") + "，继续保持！" : null;
}
