import type { SupabaseClient } from "@supabase/supabase-js";
import {
  completedApprenticeshipMonths,
  type ApprenticeshipBreakRange,
} from "@/lib/apprenticeship-months";

export type ApprenticeshipProgress = {
  monthsCompleted: number;
  monthsRequired: number;
};

type UserApprenticeRow = {
  is_apprentice: boolean | null;
  apprenticeship_started_on: string | null;
};

type BreakRow = {
  started_on: string;
  ended_on: string | null;
};

export async function loadApprenticeshipProgress(
  supabase: SupabaseClient,
  userId: string,
  trainingPathId: string | null | undefined
): Promise<ApprenticeshipProgress | null> {
  if (!userId || !trainingPathId) return null;

  const [{ data: userRow }, { data: pathRow }, { data: breakRows }] = await Promise.all([
    supabase
      .from("users")
      .select("is_apprentice, apprenticeship_started_on")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("training_paths")
      .select("is_apprentice_program, ojt_months_required")
      .eq("id", trainingPathId)
      .maybeSingle(),
    supabase
      .from("user_apprenticeship_breaks")
      .select("started_on, ended_on")
      .eq("user_id", userId),
  ]);

  const user = userRow as UserApprenticeRow | null;
  const path = pathRow as {
    is_apprentice_program: boolean | null;
    ojt_months_required: number | null;
  } | null;
  if (!user?.is_apprentice || !user.apprenticeship_started_on) return null;
  if (!path?.is_apprentice_program || !path.ojt_months_required) return null;

  const breaks: ApprenticeshipBreakRange[] = ((breakRows ?? []) as BreakRow[]).map((row) => ({
    startedOn: row.started_on,
    endedOn: row.ended_on,
  }));

  return {
    monthsCompleted: completedApprenticeshipMonths({
      startedOn: user.apprenticeship_started_on,
      breaks,
      asOfIso: new Date().toISOString().slice(0, 10),
    }),
    monthsRequired: path.ojt_months_required,
  };
}

export async function userIsApprentice(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("users")
    .select("is_apprentice")
    .eq("id", userId)
    .maybeSingle();
  return Boolean((data as { is_apprentice?: boolean } | null)?.is_apprentice);
}
