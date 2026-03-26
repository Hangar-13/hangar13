export type TrainingPlanEmbed = {
  name: string;
  description: string | null;
};

export type UserTrainingRowWithPlan = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  training_plans: TrainingPlanEmbed | TrainingPlanEmbed[] | null;
};

function normalizePlan(
  raw: UserTrainingRowWithPlan["training_plans"]
): TrainingPlanEmbed | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function describeUserTraining(row: UserTrainingRowWithPlan): {
  title: string;
  detail: string | null;
} {
  const plan = normalizePlan(row.training_plans);
  if (plan) {
    return {
      title: plan.name,
      detail: plan.description?.trim() || null,
    };
  }
  const notes = row.notes?.trim();
  return {
    title: notes || "Training enrollment",
    detail: null,
  };
}
