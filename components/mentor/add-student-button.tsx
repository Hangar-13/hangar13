"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AddStudentModal } from "@/components/mentor/add-student-modal";
import { Plus } from "lucide-react";

interface AddStudentButtonProps {
  mentorId: string;
  /** Students are scoped to this organization's membership. */
  organizationId?: string | null;
  /** When true (supervisor/lead), the viewer may reassign already-mentored students. */
  canReassign?: boolean;
  /** Open the modal on mount (e.g. arriving from a deep link with ?add=1). */
  initialOpen?: boolean;
}

export function AddStudentButton({
  mentorId,
  organizationId = null,
  canReassign = false,
  initialOpen = false,
}: AddStudentButtonProps) {
  const [open, setOpen] = useState(initialOpen);
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
        canReassign={canReassign}
        onSuccess={handleSuccess}
      />
    </>
  );
}
