"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddStudentModal } from "@/components/mentor/add-student-modal";
import { Plus } from "lucide-react";

interface AddStudentButtonProps {
  mentorId: string;
  /** When set, only learners in this org’s programs (and org student role) are listed. */
  organizationId?: string | null;
}

export function AddStudentButton({
  mentorId,
  organizationId = null,
}: AddStudentButtonProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    // Refresh the page to show the newly assigned student
    router.refresh();
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Student
      </Button>
      <AddStudentModal
        open={open}
        onOpenChange={setOpen}
        currentMentorId={mentorId}
        organizationId={organizationId}
        onSuccess={handleSuccess}
      />
    </>
  );
}
