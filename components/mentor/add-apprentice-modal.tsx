"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase-browser";
import { User, Mail, Clock, Plus } from "lucide-react";

interface Apprentice {
  id: string;
  user_id: string;
  mentor_id: string | null;
  full_name: string;
  email: string;
  total_hours: number;
  is_assigned: boolean;
}

interface AddApprenticeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMentorId: string;
  onSuccess?: () => void;
}

export function AddApprenticeModal({
  open,
  onOpenChange,
  currentMentorId,
  onSuccess,
}: AddApprenticeModalProps) {
  const [apprentices, setApprentices] = useState<Apprentice[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchApprentices();
    }
  }, [open, currentMentorId]);

  async function fetchApprentices() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();

      // Get all apprentices with their profiles
      // Note: This requires RLS policy that allows mentors to view all apprentices
      const { data: allApprentices, error: apprenticesError } = await supabase
        .from("user_trainings")
        .select("id, user_id, mentor_id, status")
        .eq("status", "active");

      if (apprenticesError) {
        console.error("Error fetching apprentices:", apprenticesError);
        setError(`Failed to load apprentices: ${apprenticesError.message}. Make sure the RLS policy allows mentors to view all apprentices.`);
        setLoading(false);
        return;
      }

      // Get profiles and calculate hours for each apprentice
      // Filter to only include apprentices (role='apprentice'), not mentors/managers or the current mentor
      const apprenticesWithDetails = await Promise.all(
        (allApprentices || []).map(async (apprentice) => {
          // Skip if it's the current mentor
          if (apprentice.user_id === currentMentorId) {
            return null;
          }

          // Get profile with role check
          const { data: profile, error: profileError } = await supabase
            .from("users")
            .select("id, email, full_name, role")
            .eq("id", apprentice.user_id)
            .single();

          if (profileError) {
            console.error(`Error fetching profile for apprentice ${apprentice.id}:`, profileError);
            return null; // Skip this apprentice if profile fetch fails
          }

          // Only include users with role='apprentice', exclude mentors, managers, etc.
          if (profile?.role !== 'apprentice') {
            return null;
          }

          // Get total hours from logbook entries
          // Note: This should work with the existing mentor RLS policy for logbook_entries
          const { data: entries, error: entriesError } = await supabase
            .from("logbook_entries")
            .select("hours_worked")
            .eq("user_training_id", apprentice.id);

          if (entriesError) {
            console.error(`Error fetching entries for apprentice ${apprentice.id}:`, entriesError);
          }

          const totalHours = entries?.reduce(
            (sum, entry) => sum + (parseFloat(entry.hours_worked?.toString() || "0") || 0),
            0
          ) || 0;

          return {
            id: apprentice.id,
            user_id: apprentice.user_id,
            mentor_id: apprentice.mentor_id,
            full_name: profile.full_name || "Unknown",
            email: profile.email || "",
            total_hours: totalHours,
            is_assigned: apprentice.mentor_id === currentMentorId,
          };
        })
      );

      // Filter out null values (non-apprentices or the current mentor)
      const validApprentices = apprenticesWithDetails.filter((a): a is Apprentice => a !== null);
      setApprentices(validApprentices);
    } catch (err) {
      console.error("Error fetching apprentices:", err);
      setError("Failed to load apprentices. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function assignApprentice(apprenticeId: string) {
    setAssigning(apprenticeId);
    setError(null);

    try {
      const supabase = createClient();

      const { error: updateError } = await supabase
        .from("user_trainings")
        .update({ mentor_id: currentMentorId })
        .eq("id", apprenticeId);

      if (updateError) throw updateError;

      // Update local state
      setApprentices((prev) =>
        prev.map((a) =>
          a.id === apprenticeId
            ? { ...a, mentor_id: currentMentorId, is_assigned: true }
            : a
        )
      );

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      console.error("Error assigning apprentice:", err);
      setError("Failed to assign apprentice. Please try again.");
    } finally {
      setAssigning(null);
    }
  }

  const unassignedApprentices = apprentices.filter((a) => !a.is_assigned);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Apprentice</DialogTitle>
          <DialogDescription>
            Select an apprentice to assign to your mentoring list.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">Loading apprentices...</p>
            </div>
          ) : apprentices.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                No apprentices found in the system.
              </p>
            </div>
          ) : unassignedApprentices.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-sm text-muted-foreground">
                No unassigned apprentices available. All apprentices are already assigned to mentors.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {unassignedApprentices.map((apprentice) => (
                <div
                  key={apprentice.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{apprentice.full_name}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Mail className="h-3.5 w-3.5" />
                          <span className="truncate">{apprentice.email}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          <span>{apprentice.total_hours.toFixed(1)} hours</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => assignApprentice(apprentice.id)}
                    disabled={assigning === apprentice.id || apprentice.is_assigned}
                  >
                    {assigning === apprentice.id ? (
                      "Assigning..."
                    ) : (
                      <>
                        <Plus className="h-4 w-4 mr-2" />
                        Add
                      </>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
