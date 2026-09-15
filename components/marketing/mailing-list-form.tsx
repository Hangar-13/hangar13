"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { joinMailingList } from "@/app/actions/mailing-list";
import { cn } from "@/lib/utils";
import type { MailingListAudience } from "@/lib/marketing/mailing-list";

const RESET_AFTER_JOIN_MS = 2500;

type FormState = {
  fullName: string;
  email: string;
  audience: MailingListAudience;
  isVeteran: boolean;
  website: string;
};

function emptyForm(audience: MailingListAudience): FormState {
  return {
    fullName: "",
    email: "",
    audience,
    isVeteran: false,
    website: "",
  };
}

export function MailingListForm({
  defaultAudience = "mechanic",
  onBack,
  resetAfterJoin = false,
  large = false,
  titleTag: TitleTag = "h2",
}: {
  defaultAudience?: MailingListAudience | null;
  onBack?: () => void;
  /** After a successful join, show thanks then clear for the next person. */
  resetAfterJoin?: boolean;
  large?: boolean;
  titleTag?: "h1" | "h2";
}) {
  const nameId = useId();
  const emailId = useId();
  const veteranId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const audience = defaultAudience ?? "mechanic";
  const [cycle, setCycle] = useState(0);
  const [form, setForm] = useState<FormState>(() => emptyForm(audience));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!joined) {
      nameRef.current?.focus();
    }
  }, [joined, cycle]);

  useEffect(() => {
    if (!joined || !resetAfterJoin) return;
    const timer = window.setTimeout(() => {
      setForm(emptyForm(audience));
      setError(null);
      setJoined(false);
      setCycle((current) => current + 1);
    }, RESET_AFTER_JOIN_MS);
    return () => window.clearTimeout(timer);
  }, [joined, resetAfterJoin, audience]);

  function clearForm() {
    setForm(emptyForm(audience));
    setError(null);
  }

  async function handleJoin() {
    setError(null);
    setSubmitting(true);
    try {
      const result = await joinMailingList({
        fullName: form.fullName,
        email: form.email,
        audience: form.audience,
        isVeteran: form.isVeteran,
        website: form.website,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setJoined(true);
    } catch {
      setError("Could not join the mailing list. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClassName = cn(
    "w-full rounded-none border border-[#121417]/20 bg-white px-3 text-[#121417] outline-none focus-visible:border-[#0055FF] focus-visible:ring-2 focus-visible:ring-[#0055FF]/25",
    large ? "h-14 text-lg" : "h-11 text-base md:text-sm"
  );
  const buttonClassName = large ? "h-14 text-base" : "h-12 text-sm";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex w-fit items-center gap-2 text-sm font-semibold text-[#0055FF] underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back
        </button>
      ) : null}

      {joined ? (
        <div className="space-y-3">
          <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
            Mailing list
          </p>
          <TitleTag className="text-3xl font-black uppercase leading-[.9] tracking-[-.06em]">
            You&apos;re on the list
          </TitleTag>
          <p className="text-sm leading-6 text-[#515860] sm:text-base">
            Thanks for joining. We won&apos;t spam you, and you can opt out at any
            time.
          </p>
        </div>
      ) : (
        <form
          key={cycle}
          className="flex min-h-0 flex-1 flex-col"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            void handleJoin();
          }}
        >
          <div className="space-y-5">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
                Mailing list
              </p>
              <TitleTag className="mt-2 text-3xl font-black uppercase leading-[.9] tracking-[-.06em] lg:text-4xl">
                Join the list
              </TitleTag>
              <p className="mt-2 text-sm leading-6 text-[#515860] sm:text-base">
                Occasional Hangar13 updates. We won&apos;t spam you, and you can opt
                out at any time.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label htmlFor={nameId} className="text-sm font-semibold">
                  Name
                </label>
                <input
                  ref={nameRef}
                  id={nameId}
                  name={`fullName-${cycle}`}
                  type="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="words"
                  spellCheck={false}
                  required
                  maxLength={120}
                  value={form.fullName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                  className={fieldClassName}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor={emailId} className="text-sm font-semibold">
                  Email
                </label>
                <input
                  id={emailId}
                  name={`email-${cycle}`}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  maxLength={254}
                  value={form.email}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                  className={fieldClassName}
                />
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">I am a</legend>
                <div
                  className="grid grid-cols-2 gap-1 border border-[#121417]/20 bg-white p-1"
                  role="group"
                  aria-label="Operator or mechanic"
                >
                  {(
                    [
                      { id: "mechanic", label: "Mechanic" },
                      { id: "operator", label: "Operator" },
                    ] as const
                  ).map((option) => {
                    const selected = form.audience === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            audience: option.id,
                          }))
                        }
                        className={cn(
                          "font-semibold",
                          large ? "px-3 py-3.5 text-base" : "px-3 py-2.5 text-sm",
                          selected
                            ? "bg-[#121417] text-white"
                            : "text-[#515860] hover:text-[#121417]"
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <label
                htmlFor={veteranId}
                className="flex cursor-pointer items-center gap-3 text-sm font-semibold"
              >
                <input
                  id={veteranId}
                  name={`isVeteran-${cycle}`}
                  type="checkbox"
                  checked={form.isVeteran}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isVeteran: event.target.checked,
                    }))
                  }
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={cn(
                    "pointer-events-none flex shrink-0 items-center justify-center border border-[#121417] bg-white",
                    "peer-focus-visible:ring-2 peer-focus-visible:ring-[#0055FF]/40",
                    large ? "h-6 w-6" : "h-5 w-5",
                    form.isVeteran && "border-[#FF4D00] bg-[#FF4D00] text-white"
                  )}
                >
                  {form.isVeteran ? <Check className={large ? "h-4 w-4" : "h-3.5 w-3.5"} /> : null}
                </span>
                Are you a Vet?
              </label>
            </div>

            <div className="hidden" aria-hidden="true">
              <input
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={form.website}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    website: event.target.value,
                  }))
                }
              />
            </div>

            {error ? (
              <p className="text-sm font-medium text-[#B42318]" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "inline-flex items-center justify-center bg-[#FF4D00] px-4 font-semibold text-white disabled:opacity-60",
                buttonClassName
              )}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Joining
                </>
              ) : (
                "Join"
              )}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={clearForm}
              className={cn(
                "inline-flex items-center justify-center border border-[#121417]/20 bg-white px-4 font-semibold text-[#121417] hover:bg-[#E9EDF0] disabled:opacity-60",
                buttonClassName
              )}
            >
              Clear
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
