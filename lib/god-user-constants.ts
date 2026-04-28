import type { OrganizationRole, SystemRole } from "./auth-shared";

/** System roles available in the god "Add user" and user detail editors. */
export const GOD_UI_SYSTEM_ROLES: [SystemRole, ...SystemRole[]] = [
  "guest",
  "student",
  "mentor",
  "manager",
  "admin",
  "god",
];

export const GOD_UI_ORG_ROLES: [OrganizationRole, ...OrganizationRole[]] = [
  "student",
  "mentor",
  "manager",
  "admin",
];
