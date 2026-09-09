import type { ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Hangar13Mark } from "@/components/brand/hangar13-mark";

export const authInputClassName =
  "h-11 rounded-none border-[#121417]/20 bg-white text-[#121417] shadow-none focus-visible:border-[#0055FF] focus-visible:ring-[#0055FF]/25";

export const authButtonClassName =
  "h-11 rounded-none bg-[#FF4D00] text-sm font-semibold text-white hover:bg-[#e64500]";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-screen bg-[#F4F7F9] text-[#121417]"
      data-auth-page
    >
      <div className="relative hidden min-h-screen overflow-hidden lg:block lg:w-[46%] xl:w-[52%]">
        <img
          src="/marketing/maintenance-workbench.webp"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121417] via-[#121417]/50 to-[#121417]/20" />
        <div className="absolute inset-x-0 top-0 z-10 p-8">
          <Hangar13Mark href="/" onDark size="lg" />
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 p-8 text-white xl:p-12">
          <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-white/70">
            Aviation training, built right
          </p>
          <p className="mt-4 text-[clamp(2.5rem,5vw,4.25rem)] font-black uppercase leading-[.84] tracking-[-.07em]">
            Log.
            <br />
            Learn.
            <br />
            Certify.
          </p>
        </div>
      </div>

      <div className="flex min-h-screen flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-[#121417]/10 px-5 py-4 lg:hidden">
          <Hangar13Mark href="/" size="md" />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 py-12">
          <div className="w-full max-w-[26rem]">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function AuthContinuing({
  title = "Sign in",
  message,
}: {
  title?: string;
  message: string;
}) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <p className="font-mono text-xs font-bold uppercase tracking-[.22em] text-[#0055FF]">
        Account
      </p>
      <h1 className="text-[2.15rem] font-black uppercase leading-[.9] tracking-[-.06em]">
        {title}
      </h1>
      <div className="flex items-center gap-3 text-sm leading-6 text-[#515860]">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-[#FF4D00]" aria-hidden />
        <span>{message}</span>
      </div>
    </div>
  );
}

export function AuthFooterLink({
  prompt,
  href,
  label,
}: {
  prompt: string;
  href: string;
  label: string;
}) {
  return (
    <p className="text-center text-sm text-[#515860]">
      {prompt}{" "}
      <Link href={href} className="font-semibold text-[#0055FF] underline-offset-4 hover:underline">
        {label}
      </Link>
    </p>
  );
}
