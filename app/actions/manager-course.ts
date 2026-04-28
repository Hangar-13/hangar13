"use server";

import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  resolveOrganizationIdForCreatedContent,
} from "@/lib/organization";
import {
  assertManagerOrGodInOrganization,
  assertManagerOrGodRole,
} from "@/lib/manager-training-guard";

export type CreateManagerCourseResult =
  | { ok: true; courseId: string }
  | { ok: false; error: string };

export async function createManagerCourse(input: {
  title: string;
  description: string;
}): Promise<CreateManagerCourseResult> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Title is required." };
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "You must be signed in." };
  }

  const elevated = await assertManagerOrGodRole(supabase, user.id);
  if (!elevated.ok) {
    return { ok: false, error: "You do not have permission to create courses." };
  }

  const description = input.description.trim() || null;

  const organizationId = await resolveOrganizationIdForCreatedContent(
    supabase,
    user.id
  );
  if (!organizationId) {
    return {
      ok: false,
      error: "No organization exists to attach this course to.",
    };
  }

  const canCreate = await assertManagerOrGodInOrganization(
    supabase,
    user.id,
    organizationId
  );
  if (!canCreate) {
    return {
      ok: false,
      error: "You do not have permission to create courses for this organization.",
    };
  }

  const { data: course, error: insertError } = await supabase
    .from("courses")
    .insert({
      name: title,
      description,
      created_by: user.id,
      organization_id: organizationId,
    })
    .select("id")
    .single();

  if (insertError || !course) {
    console.error("createManagerCourse:", insertError);
    return { ok: false, error: "Could not create course. Try again." };
  }

  const { error: moduleError } = await supabase.from("modules").insert({
    course_id: course.id,
    title: "Module 1",
    number: 0,
    description: null,
    is_hidden_from_users: false,
  });

  if (moduleError) {
    console.error("createManagerCourse default module:", moduleError);
  }

  return { ok: true, courseId: course.id };
}
