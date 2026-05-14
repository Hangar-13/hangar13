/**
 * Opening Talent in Hangar’s iframe passes the SSO bookmark URL for the frame, and the original
 * markdown URL for “open in new tab” — Talent often ignores `?redirect=` after SSO, so the raw deep
 * link is the reliable way to reach the lesson in a normal browser tab.
 */
export type TalentLmsWebviewOpenPayload = Readonly<{
  ssoLaunchUrl: string;
  originalLessonUrl: string;
}>;
