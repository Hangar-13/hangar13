import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/** Redirect to the main Apprentice Progress page with this apprentice selected */
export default async function MentorApprenticeProgressRedirectPage({
  params,
}: PageProps) {
  const { id: apprenticeId } = await params;
  redirect(`/dashboard/mentor/mentees/progress?apprentice=${apprenticeId}`);
}
