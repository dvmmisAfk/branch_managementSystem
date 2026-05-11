import type { ScoreBand } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export function bandFromPct(pct: number): ScoreBand {
  if (pct >= 90) return "excellent";
  if (pct >= 80) return "good";
  if (pct >= 70) return "satisfactory";
  if (pct >= 60) return "needs_improvement";
  return "critical";
}

type BreakdownRow = { earned: number; max: number; pct: number };

export async function recalculateScoreSnapshotForVisit(visitId: string) {
  const rows = await prisma.visitScore.findMany({
    where: { visitId },
    include: { subcategory: { include: { category: true } } },
  });

  let earnedTotal = 0;
  let maxTotal = 0;
  const categoryAgg = new Map<string, { earned: number; max: number; name: string }>();

  for (const row of rows) {
    const catId = row.subcategory.category.id;
    const catName = row.subcategory.category.name;
    const max = row.maxScore;
    if (row.status === "not_applicable") continue;

    let earned = row.scoreGiven ?? 0;
    earned = Math.min(earned, max);

    earnedTotal += earned;
    maxTotal += max;

    let cur = categoryAgg.get(catId) ?? { earned: 0, max: 0, name: catName };
    cur = { ...cur, earned: cur.earned + earned, max: cur.max + max };
    categoryAgg.set(catId, cur);
  }

  const categoryBreakdown: Record<string, BreakdownRow> = {};
  for (const { earned, max, name } of categoryAgg.values()) {
    categoryBreakdown[name] = {
      earned,
      max,
      pct: max <= 0 ? 0 : Math.round(((earned * 10000) / max)) / 100,
    };
  }

  const scorePercentage = maxTotal <= 0 ? 0 : Math.round(((earnedTotal * 10000) / maxTotal)) / 100;
  const scoreBand = bandFromPct(scorePercentage);

  await prisma.scoreSnapshot.upsert({
    where: { visitId },
    create: {
      visitId,
      totalPointsEarned: earnedTotal,
      totalMaxPoints: maxTotal,
      scorePercentage,
      scoreBand,
      categoryBreakdown: categoryBreakdown as object,
    },
    update: {
      totalPointsEarned: earnedTotal,
      totalMaxPoints: maxTotal,
      scorePercentage,
      scoreBand,
      categoryBreakdown: categoryBreakdown as object,
      calculatedAt: new Date(),
    },
  });

  return { earnedTotal, maxTotal, scorePercentage, scoreBand, categoryBreakdown };
}
