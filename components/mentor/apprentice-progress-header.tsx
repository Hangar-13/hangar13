"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Apprentice {
  id: string;
  full_name: string | null;
}

interface ApprenticeProgressHeaderProps {
  apprentices: Apprentice[];
  currentApprenticeId: string;
}

export function ApprenticeProgressHeader({
  apprentices,
  currentApprenticeId,
}: ApprenticeProgressHeaderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleApprenticeChange = (newId: string) => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("apprentice", newId);
    router.push(`/dashboard/mentor/mentees/progress?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-2xl font-bold tracking-tight">Progress for</span>
      <Select
        value={currentApprenticeId}
        onValueChange={handleApprenticeChange}
      >
        <SelectTrigger className="w-[220px] h-9 text-base font-bold border-0 shadow-none focus:ring-0 bg-transparent hover:bg-secondary/50">
          <SelectValue placeholder="Select apprentice" />
        </SelectTrigger>
        <SelectContent>
          {apprentices.map((apprentice) => (
            <SelectItem key={apprentice.id} value={apprentice.id}>
              {apprentice.full_name || "Unnamed Apprentice"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
