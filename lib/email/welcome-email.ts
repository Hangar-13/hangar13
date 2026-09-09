import "server-only";

import { getEmailFromAddress, getResendClient } from "@/lib/email/resend";

type SendWelcomeEmailParams = {
  to: string;
  /** Recipient's full name, if known — used to personalize the greeting. */
  fullName?: string | null;
  /** Public base URL of the app (no trailing slash) for links. */
  origin: string;
};

type SendResult = { sent: boolean; skipped?: string; error?: string };

function firstName(fullName?: string | null): string {
  const name = (fullName ?? "").trim();
  if (!name) return "there";
  return name.split(/\s+/)[0];
}

function welcomeEmailHtml(params: { greetingName: string; origin: string }): string {
  const { greetingName, origin } = params;
  const ctaUrl = `${origin}/`;

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#F4F7F9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#121417;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Welcome to Hangar13 — here's how to get started.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F7F9;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid rgb(18 20 23 / 10%);overflow:hidden;">
            <tr>
              <td align="left" style="padding:32px 40px 8px 40px;">
                <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-weight:900;letter-spacing:-0.06em;font-size:22px;color:#121417;">HANGAR<span style="color:#FF4D00;">13</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 8px 40px;">
                <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:700;color:#121417;">Welcome aboard, ${greetingName}!</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px 0 40px;font-size:15px;line-height:1.6;color:#515860;">
                <p style="margin:0 0 16px 0;">Your email is confirmed and your Hangar13 account is ready. We're glad to have you here.</p>
                <p style="margin:0 0 12px 0;">Hangar13 is your home base for aviation maintenance training — work through your assigned lessons, track your hours, and build the logbook record of everything you complete.</p>
                <p style="margin:0 0 8px 0;font-weight:600;color:#121417;">A few good first steps:</p>
                <ul style="margin:0 0 20px 0;padding-left:20px;color:#515860;">
                  <li style="margin-bottom:6px;">Open your dashboard to see what's assigned to you.</li>
                  <li style="margin-bottom:6px;">Start your first lesson and pick up where your training begins.</li>
                  <li style="margin-bottom:6px;">Log your work as you go so nothing gets missed.</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td align="left" style="padding:8px 40px 32px 40px;">
                <a href="${ctaUrl}" style="display:inline-block;background-color:#FF4D00;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;">Go to your dashboard</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;border-top:1px solid rgb(18 20 23 / 10%);">
                <p style="margin:20px 0 0 0;font-size:13px;line-height:1.5;color:#515860;">Questions or trouble getting started? Just reply to this email and we'll help you out.</p>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#9ca3af;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-weight:700;letter-spacing:-0.04em;">HANGAR<span style="color:#FF4D00;">13</span></p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function welcomeEmailText(params: { greetingName: string; origin: string }): string {
  const { greetingName, origin } = params;
  return [
    `Welcome aboard, ${greetingName}!`,
    "",
    "Your email is confirmed and your Hangar 13 account is ready. We're glad to have you here.",
    "",
    "Hangar 13 is your home base for aviation maintenance training — work through your assigned lessons, track your hours, and build the logbook record of everything you complete.",
    "",
    "A few good first steps:",
    "  - Open your dashboard to see what's assigned to you.",
    "  - Start your first lesson and pick up where your training begins.",
    "  - Log your work as you go so nothing gets missed.",
    "",
    `Go to your dashboard: ${origin}/`,
    "",
    "Questions or trouble getting started? Just reply to this email and we'll help you out.",
    "",
    "Hangar 13",
  ].join("\n");
}

/**
 * Sends the one-time welcome email. Best-effort: returns `{ sent: false }` (never
 * throws) when Resend isn't configured so signup/confirmation flows are unaffected.
 */
export async function sendWelcomeEmail(params: SendWelcomeEmailParams): Promise<SendResult> {
  const resend = getResendClient();
  const from = getEmailFromAddress();

  if (!resend || !from) {
    return { sent: false, skipped: "Resend not configured (RESEND_API_KEY / EMAIL_FROM)." };
  }

  const greetingName = firstName(params.fullName);
  const origin = params.origin.replace(/\/$/, "");

  try {
    const { error } = await resend.emails.send({
      from,
      to: params.to,
      subject: "Welcome to Hangar 13",
      html: welcomeEmailHtml({ greetingName, origin }),
      text: welcomeEmailText({ greetingName, origin }),
    });

    if (error) {
      return { sent: false, error: error.message };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : "Unknown email error" };
  }
}
