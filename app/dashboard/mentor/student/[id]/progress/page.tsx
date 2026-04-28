import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Redirect to the main Student Progress page with this student selected */
export default async function MentorStudentProgressRedirectPage({
  params,
}: PageProps) {
  const { id: studentId } = await params;
  redirect(`/dashboard/mentor/mentees/progress?student=${studentId}`);
}
