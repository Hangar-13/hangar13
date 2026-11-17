"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveApprenticeStatus,
  saveMechanicCertificate,
  type CertificationStatus,
} from "@/app/actions/apprenticeship-status";
import { useAppNavigation } from "@/components/app-navigation-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";
import { dateToMonthInput } from "@/lib/apprenticeship-months";
import { sanitizeMechanicCertificateNumberInput } from "@/lib/mechanic-certificate-number";

type BreakDraft = { startedOn: string; endedOn: string };

function draftsFromStatus(status: CertificationStatus): BreakDraft[] {
  return status.breaks.map((item) => ({
    startedOn: dateToMonthInput(item.startedOn),
    endedOn: dateToMonthInput(item.endedOn),
  }));
}

export function CertificationStatusSection({
  status,
  heading = "Certification status",
  prompt = "Are you an apprentice or a certified mechanic?",
}: {
  status: CertificationStatus;
  heading?: string;
  prompt?: string;
}) {
  const router = useRouter();
  const { refreshSessionUser } = useAppNavigation();
  const [mode, setMode] = useState<"view" | "certificate" | "apprentice">(
    status.mechanicCertificateNumber || status.isApprentice ? "view" : "view"
  );
  const [certificate, setCertificate] = useState(status.mechanicCertificateNumber ?? "");
  const [startedOn, setStartedOn] = useState(dateToMonthInput(status.apprenticeshipStartedOn));
  const [breaks, setBreaks] = useState<BreakDraft[]>(draftsFromStatus(status));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function saveCertificate() {
    setError(null);
    startTransition(async () => {
      const result = await saveMechanicCertificate(certificate);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await refreshSessionUser();
      setMode("view");
      router.refresh();
    });
  }

  function saveApprentice() {
    setError(null);
    startTransition(async () => {
      const result = await saveApprenticeStatus({
        startedOn,
        breaks: breaks
          .filter((item) => item.startedOn.trim())
          .map((item) => ({
            startedOn: item.startedOn,
            endedOn: item.endedOn.trim() ? item.endedOn : null,
          })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await refreshSessionUser();
      setMode("view");
      router.refresh();
    });
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <DashboardSectionLabel>{heading}</DashboardSectionLabel>
        {!status.mechanicCertificateNumber && !status.isApprentice ? (
          <p className="text-sm text-muted-foreground">{prompt}</p>
        ) : null}
      </div>

      {status.mechanicCertificateNumber && mode === "view" ? (
        <p className="text-sm font-medium">A&amp;P {status.mechanicCertificateNumber}</p>
      ) : null}

      {status.isApprentice && mode === "view" ? (
        <div className="space-y-3">
          {status.mechanicCertificateNumber ? null : (
            <p className="text-sm font-medium">Apprentice</p>
          )}
          <p className="text-sm text-muted-foreground">
            Started {dateToMonthInput(status.apprenticeshipStartedOn) || "—"}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => setMode("apprentice")}>
            Edit start and breaks
          </Button>
        </div>
      ) : null}

      {!status.mechanicCertificateNumber && !status.isApprentice && mode === "view" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => setMode("certificate")}>
            Enter Your Certificate
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode("apprentice")}>
            I am an Apprentice
          </Button>
        </div>
      ) : null}

      {mode === "certificate" ? (
        <div className="space-y-3 max-w-sm">
          <div className="space-y-1.5">
            <Label htmlFor="mechanic-certificate-number">A&amp;P certificate number</Label>
            <Input
              id="mechanic-certificate-number"
              inputMode="numeric"
              value={certificate}
              onChange={(event) =>
                setCertificate(sanitizeMechanicCertificateNumberInput(event.target.value))
              }
              placeholder="7 digits"
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={pending} onClick={saveCertificate}>
              {pending ? "Saving…" : "Save certificate"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {mode === "apprentice" ? (
        <div className="space-y-4 max-w-lg">
          <div className="space-y-1.5">
            <Label htmlFor="apprenticeship-started-on">Apprenticeship start month</Label>
            <Input
              id="apprenticeship-started-on"
              type="month"
              value={startedOn}
              onChange={(event) => setStartedOn(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Breaks</p>
            <p className="text-sm text-muted-foreground">
              Add any stretch of months you left the industry. Those months do not count.
              Leave the end month empty if the break is still going.
            </p>
            {breaks.map((item, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`break-start-${index}`}>From</Label>
                  <Input
                    id={`break-start-${index}`}
                    type="month"
                    value={item.startedOn}
                    onChange={(event) =>
                      setBreaks((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, startedOn: event.target.value } : row
                        )
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`break-end-${index}`}>Through</Label>
                  <Input
                    id={`break-end-${index}`}
                    type="month"
                    value={item.endedOn}
                    onChange={(event) =>
                      setBreaks((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, endedOn: event.target.value } : row
                        )
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setBreaks((rows) => rows.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBreaks((rows) => [...rows, { startedOn: "", endedOn: "" }])}
            >
              Add a break
            </Button>
          </div>
          <div className="flex gap-2">
            <Button type="button" disabled={pending} onClick={saveApprentice}>
              {pending ? "Saving…" : "Save apprenticeship"}
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setMode("view")}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
