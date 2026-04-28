"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getAcsSignoffsByStudent } from "@/app/actions/acs-codes";
import {
  computeAcsCertificationProgressStats,
  type AcsCertificationProgressStats,
} from "@/lib/acs-certification-progress";
import type { Certification } from "@/lib/certification";
import type { AcsDomain } from "@/lib/acs-utils";

export type { AcsCertificationProgressStats } from "@/lib/acs-certification-progress";

/**
 * ACS sign-off progress vs 50% thresholds per applicable section for the user’s certification goal.
 * Uses acs_code.domain and satisfied codes derived from approved logbook lines and lesson submissions.
 */
export async function getAcsCertificationProgressStats(
  studentUserId: string,
  certification: Certification | null
): Promise<AcsCertificationProgressStats> {
  const supabase = await createServerSupabaseClient();

  const { data: rows } = await supabase.from("acs_code").select("id, domain");

  const totalByDomain: Record<AcsDomain, number> = {
    general: 0,
    airframe: 0,
    powerplant: 0,
  };
  const acsIdToDomain = new Map<number, AcsDomain>();

  (rows ?? []).forEach((row) => {
    const d = row.domain as AcsDomain;
    if (d in totalByDomain) {
      totalByDomain[d]++;
      acsIdToDomain.set(row.id as number, d);
    }
  });

  const signoffs = await getAcsSignoffsByStudent(studentUserId);
  const signedIds = Object.keys(signoffs).map((k) => Number(k));

  return computeAcsCertificationProgressStats(
    totalByDomain,
    acsIdToDomain,
    signedIds,
    certification
  );
}
