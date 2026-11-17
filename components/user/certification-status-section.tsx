"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCertificationStatus, type CertificationStatus } from "@/app/actions/apprenticeship-status";
import { useAppNavigation } from "@/components/app-navigation-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DashboardSectionLabel } from "@/components/dashboard/page-shell";
import { dateToMonthInput } from "@/lib/apprenticeship-months";
import { sanitizeMechanicCertificateNumberInput } from "@/lib/mechanic-certificate-number";
import {
  certificateAllowsApprentice,
  MECHANIC_CERTIFICATE_TYPE_LABELS,
  MECHANIC_CERTIFICATE_TYPES,
  type MechanicCertificateType,
} from "@/lib/mechanic-certificate-type";

type CertificateChoice = MechanicCertificateType | "none" | "";
type ApprenticeChoice = "yes" | "no" | "";

function certificateChoiceFromStatus(status: CertificationStatus): CertificateChoice {
  return status.mechanicCertificateType ?? (status.declared ? "none" : "");
}

export function CertificationStatusSection({
  status,
  emphasized = false,
}: {
  status: CertificationStatus;
  emphasized?: boolean;
}) {
  const router = useRouter();
  const { refreshSessionUser } = useAppNavigation();
  const [editing, setEditing] = useState(!status.declared);
  const [certificateChoice, setCertificateChoice] = useState<CertificateChoice>(
    certificateChoiceFromStatus(status)
  );
  const [certificateNumber, setCertificateNumber] = useState(
    status.mechanicCertificateNumber ?? ""
  );
  const [apprenticeChoice, setApprenticeChoice] = useState<ApprenticeChoice>(
    status.declared ? (status.isApprentice ? "yes" : "no") : ""
  );
  const [startedOn, setStartedOn] = useState(dateToMonthInput(status.apprenticeshipStartedOn));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const certificateType: MechanicCertificateType | null =
    certificateChoice && certificateChoice !== "none" ? certificateChoice : null;
  const showApprentice = certificateChoice !== "" && certificateAllowsApprentice(certificateType);
  const showNumber = certificateType != null;
  const showStart = showApprentice && apprenticeChoice === "yes";

  function save() {
    setError(null);
    if (!certificateChoice) {
      setError("Select a certificate, or choose no certificate.");
      return;
    }
    if (showApprentice && !apprenticeChoice) {
      setError("Select whether you are an apprentice.");
      return;
    }
    startTransition(async () => {
      const result = await saveCertificationStatus({
        certificateType,
        certificateNumber,
        isApprentice: showApprentice && apprenticeChoice === "yes",
        startedOn: showStart ? startedOn : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await refreshSessionUser();
      setEditing(false);
      router.refresh();
    });
  }

  const form = (
    <div className="space-y-4 max-w-md">
      <div className="space-y-1.5">
        <Label htmlFor="certificate-choice">Certificate</Label>
        <Select
          value={certificateChoice || undefined}
          onValueChange={(value) => {
            const next = value as CertificateChoice;
            setCertificateChoice(next);
            if (next === "A&P") setApprenticeChoice("");
          }}
        >
          <SelectTrigger id="certificate-choice" className="w-full">
            <SelectValue placeholder="Select a certificate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No certificate</SelectItem>
            {MECHANIC_CERTIFICATE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {MECHANIC_CERTIFICATE_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showNumber ? (
        <div className="space-y-1.5">
          <Label htmlFor="mechanic-certificate-number">Certificate number</Label>
          <Input
            id="mechanic-certificate-number"
            inputMode="numeric"
            value={certificateNumber}
            onChange={(event) =>
              setCertificateNumber(sanitizeMechanicCertificateNumberInput(event.target.value))
            }
            placeholder="7 digits"
          />
        </div>
      ) : null}

      {showApprentice ? (
        <div className="space-y-1.5">
          <Label htmlFor="apprentice-choice">Are you an apprentice?</Label>
          <Select
            value={apprenticeChoice || undefined}
            onValueChange={(value) => setApprenticeChoice(value as ApprenticeChoice)}
          >
            <SelectTrigger id="apprentice-choice" className="w-full">
              <SelectValue placeholder="Select yes or no" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {showStart ? (
        <div className="space-y-1.5">
          <Label htmlFor="apprenticeship-started-on">Apprenticeship start month</Label>
          <Input
            id="apprenticeship-started-on"
            type="month"
            value={startedOn}
            onChange={(event) => setStartedOn(event.target.value)}
          />
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {status.declared ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );

  const summary = (
    <div className="space-y-2">
      <p className="text-sm font-medium">
        {status.mechanicCertificateType
          ? `${MECHANIC_CERTIFICATE_TYPE_LABELS[status.mechanicCertificateType]}${
              status.mechanicCertificateNumber ? ` ${status.mechanicCertificateNumber}` : ""
            }`
          : "No certificate"}
      </p>
      {certificateAllowsApprentice(status.mechanicCertificateType) ? (
        <p className="text-sm text-muted-foreground">
          {status.isApprentice
            ? `Apprentice · started ${dateToMonthInput(status.apprenticeshipStartedOn) || "—"}`
            : "Not an apprentice"}
        </p>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
        Edit
      </Button>
    </div>
  );

  const body = editing ? form : summary;

  if (emphasized && !status.declared) {
    return (
      <section className="space-y-4">
        <div className="space-y-1">
          <DashboardSectionLabel>Certification status</DashboardSectionLabel>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Tell us which certificate you hold, if any. If it is not an A&amp;P, also say
            whether you are an apprentice.
          </p>
        </div>
        <div className="rounded-md bg-primary/10 px-5 py-6 sm:px-7 sm:py-8">
          {body}
          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <DashboardSectionLabel>Certification status</DashboardSectionLabel>
      {body}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
