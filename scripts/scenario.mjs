/**
 * Reload a named situation for the test student and mentor.
 *
 *   npm run scenario -- list
 *   npm run scenario -- reset prior-ojt
 *   npm run scenario -- reset mentor-review --env .env.staging.local --allow-remote
 *
 * Default env file is .env.scorm.local (local stack). Production is refused.
 * Remote databases also need --allow-remote. Only the two scenario accounts
 * are rewritten; everyone else is left alone.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const PASSWORD = "scenario";
const MENTOR_EMAIL = "mentor.scenario@hangar13.test";
const STUDENT_EMAIL = "student.scenario@hangar13.test";
const PRODUCTION_REF = "nehpaeebasijyzcafkoz";

const SCENARIOS = {
  "prior-ojt": {
    title: "Prior experience is waiting",
    detail:
      "Student is enrolled and assigned to the mentor. The prior-experience section is on the student dashboard. Nothing has been logged or submitted.",
    priorOjtSkipped: false,
    passFirstLesson: false,
    submitReflection: false,
    submitLog: false,
  },
  "ready-to-submit": {
    title: "First lesson is ready to submit",
    detail:
      "Prior experience is skipped. The first lesson's courseware is passed, and there is no reflection yet. Sign in as the student and submit the week.",
    priorOjtSkipped: true,
    passFirstLesson: true,
    submitReflection: false,
    submitLog: false,
  },
  "mentor-review": {
    title: "Mentor has work waiting",
    detail:
      "The student has a submitted reflection and a submitted log entry. Sign in as the mentor and open My Students or Review submissions.",
    priorOjtSkipped: true,
    passFirstLesson: true,
    submitReflection: true,
    submitLog: true,
  },
};

function usage() {
  console.log(`Usage:
  npm run scenario -- list
  npm run scenario -- reset <name> [--env <file>] [--allow-remote]

Scenarios:`);
  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    console.log(`  ${name}`);
    console.log(`    ${scenario.detail}`);
  }
  console.log(`
Accounts (password: ${PASSWORD}):
  student  ${STUDENT_EMAIL}
  mentor   ${MENTOR_EMAIL}`);
}

function argsAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

function requireEnv() {
  const envFile = argsAfter("--env") || ".env.scorm.local";
  const envPath = resolve(process.cwd(), envFile);
  if (!existsSync(envPath)) {
    console.error(`Missing ${envFile}.`);
    process.exit(1);
  }
  const loaded = dotenv.config({ path: envPath, override: true });
  if (loaded.error) {
    console.error(loaded.error.message);
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    console.error(`${envFile} needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.`);
    process.exit(1);
  }
  if (url.includes(PRODUCTION_REF)) {
    console.error("Refusing to rewrite production.");
    process.exit(1);
  }
  const local = /127\.0\.0\.1|localhost/.test(url);
  if (!local && !process.argv.includes("--allow-remote")) {
    console.error(
      `${url} is not the local stack. Pass --allow-remote to rewrite the scenario accounts there.`
    );
    process.exit(1);
  }
  return { envFile, url };
}

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function must(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result.data;
}

async function findAuthUser(supabase, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`list users: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureAuthUser(supabase, email, fullName) {
  const existing = await findAuthUser(supabase, email);
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw new Error(`update ${email}: ${error.message}`);
    return existing.id;
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw new Error(`create ${email}: ${error?.message ?? "no user"}`);
  return data.user.id;
}

async function ensureProfile(supabase, id, email, fullName, organizationId) {
  await must(
    await supabase.from("users").upsert(
      {
        id,
        email,
        full_name: fullName,
        role: "standard",
        visible: true,
        last_active_organization_id: organizationId,
        current_user_training_id: null,
        mentor_id: null,
        prior_ojt_skipped_at: null,
      },
      { onConflict: "id" }
    ),
    `profile ${email}`
  );
}

async function organizationId(supabase) {
  const rows = await must(
    await supabase.from("organizations").select("id, name"),
    "organizations"
  );
  const hangar = rows.find((row) => row.name?.trim().toLowerCase() === "hangar 13");
  if (!hangar) throw new Error('No organization named "Hangar 13".');
  return hangar.id;
}

async function trainingTarget(supabase) {
  const paths = await must(
    await supabase.from("training_paths").select("id, name").order("name"),
    "training paths"
  );
  const preferred =
    paths.find((path) => /refresher/i.test(path.name)) ??
    paths.find((path) => /certification/i.test(path.name)) ??
    paths[0];
  if (!preferred) throw new Error("No training path exists.");

  const items = await must(
    await supabase
      .from("training_path_items")
      .select("course_id, module_id, lesson_id, sort_order")
      .eq("training_path_id", preferred.id)
      .order("sort_order"),
    "path items"
  );

  const lessons = [];
  for (const item of items) {
    if (item.lesson_id) {
      const row = await must(
        await supabase
          .from("lessons")
          .select("id, title, number, content_package_id, test_package_id, courseware_revision, module_id")
          .eq("id", item.lesson_id)
          .maybeSingle(),
        "lesson"
      );
      if (row) lessons.push(row);
      continue;
    }
    let moduleIds = item.module_id ? [item.module_id] : [];
    if (item.course_id) {
      const modules = await must(
        await supabase.from("modules").select("id").eq("course_id", item.course_id),
        "modules"
      );
      moduleIds = modules.map((row) => row.id);
    }
    if (moduleIds.length === 0) continue;
    const rows = await must(
      await supabase
        .from("lessons")
        .select("id, title, number, content_package_id, test_package_id, courseware_revision, module_id")
        .in("module_id", moduleIds)
        .order("number"),
      "course lessons"
    );
    lessons.push(...rows);
  }

  const seen = new Set();
  const ordered = lessons.filter((lesson) => {
    if (seen.has(lesson.id)) return false;
    seen.add(lesson.id);
    return true;
  });
  if (ordered.length === 0) throw new Error(`${preferred.name} has no lessons.`);
  return { path: preferred, lessons: ordered };
}

async function courseIdForLesson(supabase, lesson) {
  const moduleRow = await must(
    await supabase.from("modules").select("course_id").eq("id", lesson.module_id).maybeSingle(),
    "lesson module"
  );
  if (!moduleRow?.course_id) throw new Error(`Lesson ${lesson.title} has no course.`);
  return moduleRow.course_id;
}

async function latestVersionId(supabase, courseId) {
  const versions = await must(
    await supabase
      .from("course_versions")
      .select("id, major_version, minor_version")
      .eq("course_id", courseId),
    "course versions"
  );
  versions.sort((a, b) => b.major_version - a.major_version || b.minor_version - a.minor_version);
  return versions[0]?.id ?? null;
}

async function clearStudent(supabase, studentId) {
  await must(
    await supabase
      .from("users")
      .update({ current_user_training_id: null, mentor_id: null, prior_ojt_skipped_at: null })
      .eq("id", studentId),
    "clear student pointers"
  );
  const trainings = await must(
    await supabase.from("user_trainings").select("id").eq("user_id", studentId),
    "student enrollments"
  );
  const trainingIds = trainings.map((row) => row.id);
  if (trainingIds.length > 0) {
    await must(
      await supabase.from("lesson_submissions").delete().in("user_training_id", trainingIds),
      "clear reflections"
    );
  }
  await must(
    await supabase.from("lesson_player_attempts").delete().eq("user_id", studentId),
    "clear attempts"
  );
  await must(
    await supabase.from("lesson_version_holds").delete().eq("user_id", studentId),
    "clear holds"
  );
  await must(
    await supabase.from("course_version_pins").delete().eq("user_id", studentId),
    "clear pins"
  );
  await must(
    await supabase.from("logbook_entries").delete().eq("user_id", studentId),
    "clear log entries"
  );
  await must(
    await supabase.from("prior_ojt_assessments").delete().eq("user_id", studentId),
    "clear prior experience"
  );
  await must(
    await supabase.from("notifications").delete().or(`recipient_user_id.eq.${studentId},subject_user_id.eq.${studentId}`),
    "clear notifications"
  );
  if (trainingIds.length > 0) {
    await must(
      await supabase.from("user_trainings").delete().eq("user_id", studentId),
      "clear enrollments"
    );
  }
}

async function resetScenario(name) {
  const scenario = SCENARIOS[name];
  if (!scenario) {
    console.error(`Unknown scenario "${name}".`);
    usage();
    process.exit(1);
  }
  const { envFile, url } = requireEnv();
  const supabase = client();
  const orgId = await organizationId(supabase);
  const mentorId = await ensureAuthUser(supabase, MENTOR_EMAIL, "Scenario Mentor");
  const studentId = await ensureAuthUser(supabase, STUDENT_EMAIL, "Scenario Student");
  await ensureProfile(supabase, mentorId, MENTOR_EMAIL, "Scenario Mentor", orgId);
  await ensureProfile(supabase, studentId, STUDENT_EMAIL, "Scenario Student", orgId);

  for (const [userId, role] of [
    [mentorId, "mentor"],
    [studentId, "student"],
  ]) {
    await must(
      await supabase.from("user_organizations").upsert(
        { user_id: userId, organization_id: orgId, role },
        { onConflict: "user_id,organization_id" }
      ),
      "organization membership"
    );
  }

  await clearStudent(supabase, studentId);
  const { path, lessons } = await trainingTarget(supabase);
  const enrollment = await must(
    await supabase
      .from("user_trainings")
      .insert({
        user_id: studentId,
        mentor_id: mentorId,
        training_path_id: path.id,
        status: "active",
        enrollment_source: "self_service",
        start_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .single(),
    "enrollment"
  );

  const courseIds = new Set();
  for (const lesson of lessons) {
    courseIds.add(await courseIdForLesson(supabase, lesson));
  }
  for (const courseId of courseIds) {
    const versionId = await latestVersionId(supabase, courseId);
    if (!versionId) continue;
    await must(
      await supabase.from("course_version_pins").insert({
        course_id: courseId,
        course_version_id: versionId,
        user_id: studentId,
        organization_id: null,
        pinned_by: studentId,
      }),
      "course pin"
    );
  }

  await must(
    await supabase
      .from("users")
      .update({
        mentor_id: mentorId,
        current_user_training_id: enrollment.id,
        prior_ojt_skipped_at: scenario.priorOjtSkipped ? new Date().toISOString() : null,
      })
      .eq("id", studentId),
    "student pointers"
  );

  const first = lessons[0];
  if (scenario.passFirstLesson) {
    if (!first.content_package_id) {
      throw new Error(`${first.title} has no courseware to mark passed.`);
    }
    await must(
      await supabase.from("lesson_player_attempts").insert({
        package_id: first.content_package_id,
        lesson_id: first.id,
        user_id: studentId,
        lesson_status: "passed",
        courseware_revision: first.courseware_revision > 0 ? first.courseware_revision : null,
        total_time_seconds: 3600,
        session_time: null,
        cmi: { "cmi.core.lesson_status": "passed", "cmi.core.total_time": "0001:00:00.00" },
      }),
      "passed attempt"
    );
  }

  if (scenario.submitReflection) {
    const versionId = await latestVersionId(supabase, await courseIdForLesson(supabase, first));
    await must(
      await supabase.from("lesson_submissions").insert({
        user_training_id: enrollment.id,
        lesson_id: first.id,
        week_number: 1,
        reflection_text: "Scenario reflection, ready for review.",
        status: "submitted",
        submitted_at: new Date().toISOString(),
        course_version_id: versionId,
        player_completion: {
          checkedAt: new Date().toISOString(),
          content: {
            status: "passed",
            score: 100,
            coursewareRevision: first.courseware_revision > 0 ? first.courseware_revision : null,
            timeSpentSeconds: 3600,
          },
          test: null,
        },
      }),
      "reflection"
    );
  }

  if (scenario.submitLog) {
    await must(
      await supabase.from("logbook_entries").insert({
        user_id: studentId,
        entry_date: new Date().toISOString().slice(0, 10),
        hours_worked: 1,
        description: "Scenario log entry, ready for review.",
        status: "submitted",
        submitted_at: new Date().toISOString(),
      }),
      "log entry"
    );
  }

  console.log(`${scenario.title} (${name})`);
  console.log(scenario.detail);
  console.log(`Training: ${path.name}`);
  console.log(`Database: ${url} via ${envFile}`);
  console.log(`Student  ${STUDENT_EMAIL}  /  ${PASSWORD}`);
  console.log(`Mentor   ${MENTOR_EMAIL}  /  ${PASSWORD}`);
}

const command = process.argv[2];
if (command === "list" || !command) {
  usage();
  process.exit(command === "list" ? 0 : 1);
}
if (command === "reset") {
  const name = process.argv[3];
  if (!name || name.startsWith("--")) {
    usage();
    process.exit(1);
  }
  resetScenario(name).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
} else {
  usage();
  process.exit(1);
}
