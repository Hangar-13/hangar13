import { Constants, IdentityProvider } from "samlify";
import { NextResponse } from "next/server";

import { getTalentLmsSamlEnvironment } from "@/lib/talentlms/saml-config";
import { loginUrlAbsolute, logoutUrlAbsolute } from "@/lib/talentlms/talentlms-saml";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const env = getTalentLmsSamlEnvironment();
    const idp = IdentityProvider({
      entityID: env.idpEntityId,
      privateKey: env.signingPrivateKeyPem,
      signingCert: env.signingCertificatePem,
      wantAuthnRequestsSigned: false,
      nameIDFormat: [Constants.namespace.format.emailAddress],
      singleSignOnService: [
        {
          Binding: Constants.namespace.binding.redirect,
          Location: loginUrlAbsolute(env),
        },
      ],
      singleLogoutService: [
        {
          Binding: Constants.namespace.binding.redirect,
          Location: logoutUrlAbsolute(env),
        },
      ],
    });

    const xml = idp.getMetadata();
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml;charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Misconfigured Talent LMS SAML.";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
