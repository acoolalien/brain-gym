// plan-engine — resolve training plan state
import { loadProgress, readJSON, saveProgress } from "./storage.js";
import path from "node:path";

function loadPlans(configDir) {
  const configPath = path.join(configDir, "config.json");
  const raw = readJSON(configPath);
  return raw?.plans || {};
}

export function resolveGame(pluginDir, dataDir, userInput) {
  const plans = loadPlans(pluginDir);
  const progress = loadProgress(dataDir);

  // User specified a specific game
  if (userInput && userInput.game) {
    return { type: "free", game: userInput.game, params: userInput.params || {} };
  }

  // User specified a plan name → start/switch plan
  if (userInput && userInput.plan) {
    const plan = plans[userInput.plan];
    if (!plan) {
      return { type: "error", message: `未找到训练计划: ${userInput.plan}` };
    }
    progress.planId = userInput.plan;
    progress.currentDay = 1;
    progress.startedAt = new Date().toISOString();
    progress.dailyResults = {};
    saveProgress(dataDir, progress);
    const dayConfig = plan.days[0];
    return {
      type: "plan",
      planId: userInput.plan,
      planName: plan.name,
      currentDay: 1,
      totalDays: plan.days.length,
      game: dayConfig.game,
      params: dayConfig.params || {},
      goal: dayConfig.goal || "",
    };
  }

  // Active plan → continue
  if (progress.planId && progress.currentDay > 0) {
    const plan = plans[progress.planId];
    if (!plan) {
      return { type: "error", message: `当前计划 ${progress.planId} 已被移除，请选择新计划` };
    }
    const dayIndex = progress.currentDay - 1;
    if (dayIndex >= plan.days.length) {
      return { type: "complete", planId: progress.planId, planName: plan.name, totalDays: plan.days.length };
    }
    const dayConfig = plan.days[dayIndex];
    return {
      type: "plan",
      planId: progress.planId,
      planName: plan.name,
      currentDay: progress.currentDay,
      totalDays: plan.days.length,
      game: dayConfig.game,
      params: dayConfig.params || {},
      goal: dayConfig.goal || "",
    };
  }

  // No active plan, no specific request → prompt user to pick
  return { type: "prompt", availablePlans: Object.keys(plans).map(id => ({ id, name: plans[id].name })) };
}

// currentDay = the next day to play. After playing day N, dailyResults["N"] is saved,
// currentDay advances to N+1. So "today's completed check" looks at dailyResults[currentDay-1].
export function recordResult(dataDir, game, score) {
  const progress = loadProgress(dataDir);
  if (!progress.planId || progress.currentDay === 0) {
    return; // Free play — no plan tracking
  }

  const dayKey = String(progress.currentDay);
  progress.dailyResults[dayKey] = {
    game,
    score,
    completedAt: new Date().toISOString(),
  };

  progress.currentDay += 1;
  saveProgress(dataDir, progress);
}

export function getStatus(pluginDir, dataDir, mode) {
  const plans = loadPlans(pluginDir);
  const progress = loadProgress(dataDir);

  if (mode === "overview") {
    const plan = progress.planId ? plans[progress.planId] : null;
    return {
      activePlan: plan ? { id: progress.planId, name: plan.name, currentDay: progress.currentDay, totalDays: plan.days.length } : null,
      completedDays: Object.keys(progress.dailyResults).length,
      startedAt: progress.startedAt,
      streak: computeStreak(progress),
    };
  }

  // Default: today's progress
  if (!progress.planId || progress.currentDay === 0) {
    const available = Object.keys(plans).map(id => ({ id, name: plans[id].name }));
    return { hasActivePlan: false, availablePlans: available };
  }

  const plan = plans[progress.planId];
  if (!plan) {
    return { hasActivePlan: false, error: "当前计划已被移除" };
  }

  // currentDay has advanced after last recordResult. The last completed day is currentDay-1.
  const lastCompletedDay = progress.currentDay - 1;
  const todayResult = lastCompletedDay >= 1 ? progress.dailyResults[String(lastCompletedDay)] : null;
  const yesterdayResult = lastCompletedDay >= 2 ? progress.dailyResults[String(lastCompletedDay - 1)] : null;

  const dayIndex = progress.currentDay - 1;
  const dayConfig = dayIndex < plan.days.length ? plan.days[dayIndex] : null;

  return {
    hasActivePlan: true,
    planName: plan.name,
    currentDay: progress.currentDay,
    totalDays: plan.days.length,
    todayGoal: dayConfig?.goal || "",
    todayCompleted: !!todayResult,
    yesterdayResult: yesterdayResult || null,
    todayResult: todayResult || null,
    remainingDays: Math.max(0, plan.days.length - progress.currentDay + 1),
  };
}

function computeStreak(progress) {
  const days = Object.keys(progress.dailyResults).map(Number).sort((a, b) => b - a);
  if (days.length === 0) return 0;
  let streak = 1;
  for (let i = 0; i < days.length - 1; i++) {
    if (days[i] - days[i + 1] === 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
