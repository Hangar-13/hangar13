"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getCertificationAwardsForUser, getTrainingCompletionsForUser } from "@/app/actions/user-credentials";
import { getExternalCertificationsForUser } from "@/app/actions/external-certifications";
import { getMyTrainingsPageData } from "@/app/actions/my-trainings";
import { getAtaChapters } from "@/app/actions/ata-chapters";
import {
  aggregateAircraftExperience,
  aggregateAtaExperience,
  aggregateEngineExperience,
  aggregatePropellerExperience,
  type SkillsProfileData,
  type SkillsProfileLogbookEntry,
} from "@/lib/skills-profile";
import type { Certification } from "@/lib/certification";

export type SkillsProfileResult =
  | { error: string }
  | { data: SkillsProfileData };

export async function getSkillsProfileForUser(
  targetUserId: string
): Promise<SkillsProfileResult> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: viewer },
    error: viewerError,
  } = await supabase.auth.getUser();

  if (viewerError || !viewer) {
    return { error: "Not authenticated." };
  }

  const { data: allowed, error: accessError } = await supabase.rpc(
    "auth_can_view_skills_profile",
    { p_target_user_id: targetUserId }
  );

  if (accessError) {
    console.error("auth_can_view_skills_profile:", accessError);
    return { error: "Unable to verify access." };
  }

  if (!allowed) {
    return { error: "You do not have permission to view this skills profile." };
  }

  const [
    { data: profile, error: profileError },
    { data: logbookRows, error: logbookError },
    { data: activeEnrollments },
    certificationAwards,
    externalCertifications,
    manualCompletions,
    trainingsData,
    ataChapters,
  ] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, full_name, email, avatar_url, mechanic_certificate_type, mechanic_certificate_number, current_certification"
      )
      .eq("id", targetUserId)
      .maybeSingle(),
    supabase.rpc("list_logbook_entries_for_skills_profile", {
      p_owner_user_id: targetUserId,
    }),
    supabase
      .from("user_trainings")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("status", "active")
      .limit(1),
    getCertificationAwardsForUser(targetUserId),
    getExternalCertificationsForUser(targetUserId),
    getTrainingCompletionsForUser(targetUserId),
    getMyTrainingsPageData(targetUserId),
    getAtaChapters(),
  ]);

  if (profileError || !profile) {
    return { error: profileError?.message ?? "User not found." };
  }

  if (logbookError) {
    console.error("list_logbook_entries_for_skills_profile:", logbookError);
    return { error: "Unable to load logbook experience." };
  }

  const logbookEntries = (logbookRows ?? []) as SkillsProfileLogbookEntry[];
  const totalOjtHours =
    logbookEntries.reduce((sum, entry) => sum + Number(entry.hours_worked || 0), 0) ||
    0;

  const platformTrainings = trainingsData.completed;
  const trainingCompletions = [
    ...manualCompletions.map((row) => ({
      id: row.id,
      training_name: row.training_name,
      completed_on: row.completed_on,
      notes: row.notes,
      source: "manual" as const,
    })),
    ...platformTrainings.map((row) => {
      const path = Array.isArray(row.training_paths)
        ? row.training_paths[0]
        : row.training_paths;
      return {
        id: row.id,
        training_name: path?.name?.trim() || "Training program",
        completed_on: row.end_date ?? row.start_date,
        notes: path?.description?.trim() || null,
        source: "platform" as const,
      };
    }),
  ].sort((a, b) => b.completed_on.localeCompare(a.completed_on));

  const ataChapterItems = ataChapters.map((c) => ({
    chapter_number: c.chapter_number,
    title: c.title,
  }));

  return {
    data: {
      user: {
        id: profile.id,
        full_name: profile.full_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        mechanic_certificate_type: profile.mechanic_certificate_type,
        mechanic_certificate_number: profile.mechanic_certificate_number,
        current_certification:
          (profile.current_certification as Certification | null) ?? null,
        hasActiveEnrollment: (activeEnrollments?.length ?? 0) > 0,
      },
      viewerIsOwner: viewer.id === targetUserId,
      totalOjtHours,
      certificationAwards,
      externalCertifications,
      trainingCompletions,
      platformTrainings,
      aircraftExperience: aggregateAircraftExperience(logbookEntries),
      engineExperience: aggregateEngineExperience(logbookEntries),
      propellerExperience: aggregatePropellerExperience(logbookEntries),
      ataExperience: aggregateAtaExperience(logbookEntries, ataChapterItems),
      logbookEntries,
    },
  };
}
