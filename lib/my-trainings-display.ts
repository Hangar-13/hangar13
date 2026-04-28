export type TrainingPathEmbed = {
  id: string;
  name: string;
  description: string | null;
  is_active?: boolean;
};

/** Row shape for public.user_trainings (My Trainings list). */
export type UserTrainingEnrollmentRow = {
  id: string;
  status: string;
  start_date: string;
  end_date: string | null;
  training_path_id: string;
  training_paths: TrainingPathEmbed | TrainingPathEmbed[] | null;
};

function first<T>(raw: T | T[] | null): T | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function describeUserTrainingEnrollment(row: UserTrainingEnrollmentRow): {
  title: string;
  detail: string | null;
} {
  const path = first(row.training_paths);
  if (path) {
    return {
      title: path.name,
      detail: path.description?.trim() || null,
    };
  }
  return {
    title: "Training program",
    detail: null,
  };
}
