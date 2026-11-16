export type PageTourStep = {
  /** Matches `data-tour` on the page. Steps with no visible target are skipped. */
  target: string;
  text: string;
};

export type PageTour = {
  id: string;
  match: (pathname: string) => boolean;
  steps: PageTourStep[];
};

/** First-visit tips. Prior OJT is intentionally absent. */
export const PAGE_TOURS: PageTour[] = [
  {
    id: "student-home",
    match: (path) => path === "/dashboard/student",
    steps: [
      { target: "student-log-entry", text: "Log the hours you worked." },
      { target: "student-submit-week", text: "Send this week's lesson to your mentor." },
      { target: "student-prior-ojt", text: "Record maintenance experience you already have." },
      { target: "student-current-week", text: "Open this week's lesson." },
      { target: "student-find-training", text: "Choose a training program to start." },
    ],
  },
  {
    id: "student-training",
    match: (path) => path === "/dashboard/student/training",
    steps: [
      { target: "training-weeks", text: "Move between weeks of your program." },
      { target: "training-start-lesson", text: "Start the lesson for this week." },
      { target: "training-discussion", text: "Ask your mentor about this lesson." },
      { target: "training-submit", text: "Submit the week when you are done." },
    ],
  },
  {
    id: "student-submit-week",
    match: (path) => path === "/dashboard/student/training/submit",
    steps: [
      { target: "submit-reflection", text: "Write what you did this week, then submit it." },
    ],
  },
  {
    id: "student-progress",
    match: (path) => path === "/dashboard/student/progress",
    steps: [
      { target: "progress-program", text: "This is how far you are through the program." },
      { target: "progress-coverage", text: "See which ATA chapters your logbook covers." },
    ],
  },
  {
    id: "student-find-training",
    match: (path) => path === "/dashboard/student/find-training",
    steps: [{ target: "find-training-list", text: "Enroll in a program from this list." }],
  },
  {
    id: "student-credentials",
    match: (path) => path === "/dashboard/student/credentials",
    steps: [
      { target: "credentials-current", text: "Choose which enrolled program is your current one." },
    ],
  },
  {
    id: "student-logbook",
    match: (path) => path === "/dashboard/student/logbook",
    steps: [
      { target: "logbook-add", text: "Add a log entry for work you did." },
      { target: "logbook-filters", text: "Search entries by words, status, or ATA chapter." },
      { target: "logbook-entries", text: "Open a row to view or edit that entry." },
      { target: "logbook-export", text: "Export or print your logbook." },
    ],
  },
  {
    id: "student-skills",
    match: (path) => path === "/dashboard/student/skills",
    steps: [
      { target: "skills-resume", text: "Upload a resume. You can replace it here later." },
      { target: "skills-prior-ojt", text: "Add experience from before this program." },
      { target: "skills-ojt", text: "Your logged OJT hours show up here." },
      { target: "skills-export", text: "Download this profile as a PDF." },
    ],
  },
  {
    id: "student-certification",
    match: (path) => path === "/dashboard/student/certification",
    steps: [
      { target: "cert-goal", text: "Set the certificate you are working toward." },
      { target: "cert-progress", text: "Track which ACS codes you have signed off." },
      { target: "cert-export", text: "Export your certification progress." },
    ],
  },
  {
    id: "mentor-home",
    match: (path) => path === "/dashboard/mentor",
    steps: [
      { target: "mentor-students", text: "Open a student to see their work." },
      { target: "mentor-pending-logs", text: "Sign or reject log entries waiting on you." },
    ],
  },
  {
    id: "mentor-submissions",
    match: (path) => path === "/dashboard/mentor/review-submissions",
    steps: [
      { target: "mentor-review-all", text: "Review every waiting weekly submission." },
      { target: "mentor-submission-list", text: "Or open one submission to approve or reject it." },
    ],
  },
  {
    id: "mentor-logs",
    match: (path) => path === "/dashboard/mentor/review-logs",
    steps: [
      { target: "mentor-log-filters", text: "Filter entries by status or student name." },
      { target: "mentor-log-list", text: "Open an entry to read it and sign it." },
    ],
  },
  {
    id: "mentor-students",
    match: (path) => path === "/dashboard/mentor/mentees",
    steps: [
      { target: "mentor-add-student", text: "Assign a student to yourself." },
      { target: "mentor-student-list", text: "Open a student for their logs and coursework." },
    ],
  },
  {
    id: "mentor-student",
    match: (path) => /^\/dashboard\/mentor\/student\/[^/]+$/.test(path),
    steps: [
      { target: "mentor-student-coursework", text: "See this student's lessons and submissions." },
      { target: "mentor-student-logs", text: "Review this student's logbook entries." },
    ],
  },
  {
    id: "manager-content",
    match: (path) => path === "/dashboard/manager/content",
    steps: [
      { target: "manager-paths", text: "Create a training path your students can enroll in." },
      { target: "manager-courses", text: "Create a course, then add its lessons." },
    ],
  },
  {
    id: "god-users",
    match: (path) => path === "/dashboard/god/users",
    steps: [{ target: "god-user-search", text: "Find a user by name, email, or organization." }],
  },
  {
    id: "mentor-student-progress",
    match: (path) => path === "/dashboard/mentor/mentees/progress",
    steps: [
      { target: "mentor-student-switch", text: "Switch students to see another person's progress." },
    ],
  },
  {
    id: "mentor-student-logs",
    match: (path) => path === "/dashboard/mentor/mentees/logs",
    steps: [
      { target: "mentor-student-switch", text: "Switch students to see another person's logbook." },
    ],
  },
  {
    id: "manager-students",
    match: (path) => path === "/dashboard/manager/students",
    steps: [
      { target: "manager-student-list", text: "Open a student to see the lesson they completed." },
    ],
  },
  {
    id: "god-orgs",
    match: (path) => path === "/dashboard/god/organizations",
    steps: [{ target: "god-add-org", text: "Create an organization, then add its people." }],
  },
  {
    id: "god-landing",
    match: (path) => path === "/dashboard/god/landing",
    steps: [
      { target: "god-landing-save", text: "Preview the public page, then save your wording." },
    ],
  },
  {
    id: "org-members",
    match: (path) => path === "/dashboard/organization/members",
    steps: [{ target: "org-add-member", text: "Add a row to invite someone or link an existing user." }],
  },
  {
    id: "org-subscriptions",
    match: (path) => path === "/dashboard/organization/subscriptions",
    steps: [
      {
        target: "org-course-versions",
        text: "Choose which course version your learners see.",
      },
    ],
  },
];

export function tourForPath(pathname: string): PageTour | null {
  if (pathname.startsWith("/dashboard/student/prior-ojt")) return null;
  return PAGE_TOURS.find((tour) => tour.match(pathname)) ?? null;
}
