import type { SkillsProfileData } from "@/lib/skills-profile";
import { formatSkillsHours } from "@/lib/skills-profile";
import { externalCertificationTypeLabel } from "@/lib/external-certification";
import { formatUiDate } from "@/lib/format-ui-date";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function displayName(data: SkillsProfileData): string {
  return data.user.full_name?.trim() || data.user.email?.trim() || "Mechanic";
}

function safeFileName(name: string): string {
  return name.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80);
}

type AutoTableDoc = jsPDF & { lastAutoTable?: { finalY: number } };

export function downloadSkillsProfilePdf(data: SkillsProfileData) {
  const doc = new jsPDF({ unit: "pt", format: "letter" }) as AutoTableDoc;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 48;
  let y = margin;

  const name = displayName(data);

  doc.setFillColor(255, 207, 3);
  doc.rect(0, 0, pageWidth, 6, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(30, 30, 56);
  doc.text("Skills & Experience Profile", margin, y);
  y += 28;

  doc.setFontSize(14);
  doc.text(name, margin, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 100);

  const certLine = [
    data.user.mechanic_certificate_type
      ? `Mechanic cert: ${data.user.mechanic_certificate_type}`
      : null,
    data.user.mechanic_certificate_number
      ? `#${data.user.mechanic_certificate_number}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  if (certLine) {
    doc.text(certLine, margin, y);
    y += 14;
  }

  doc.text(
    `${formatSkillsHours(data.totalOjtHours)} total OJT hours · Generated ${formatUiDate(new Date().toISOString())}`,
    margin,
    y
  );
  y += 24;

  const addSectionTitle = (title: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(30, 30, 56);
    doc.text(title, margin, y);
    y += 16;
  };

  const tableEndY = () =>
    doc.lastAutoTable?.finalY != null ? doc.lastAutoTable.finalY + 24 : y + 24;

  if (
    data.certificationAwards.length > 0 ||
    data.externalCertifications.length > 0
  ) {
    addSectionTitle("Certifications");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Name", "Type / Issuer", "Awarded", "Expires"]],
      body: [
        ...data.certificationAwards.map((row) => [
          row.certification_name,
          "Awarded certification",
          formatUiDate(row.awarded_on),
          "—",
        ]),
        ...data.externalCertifications.map((row) => [
          row.name,
          `${externalCertificationTypeLabel(row.certification_type, row.certification_type_other)} · ${row.issuing_organization}`,
          formatUiDate(row.awarded_on),
          row.expires_on ? formatUiDate(row.expires_on) : "—",
        ]),
      ],
      theme: "grid",
      headStyles: {
        fillColor: [30, 30, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 56] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
    });
    y = tableEndY();
  }

  if (data.trainingCompletions.length > 0) {
    addSectionTitle("Completed training");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Program", "Completed", "Source"]],
      body: data.trainingCompletions.map((row) => [
        row.training_name,
        formatUiDate(row.completed_on),
        row.source === "platform" ? "Hangar13 program" : "External / manual",
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [30, 30, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 56] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
    });
    y = tableEndY();
  }

  if (data.aircraftExperience.length > 0) {
    addSectionTitle("Aircraft / airframe experience");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Aircraft", "Logs", "Hours"]],
      body: data.aircraftExperience.map((row) => [
        row.label,
        String(row.entryCount),
        `${formatSkillsHours(row.totalHours)}h`,
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [30, 30, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 56] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
    });
    y = tableEndY();
  }

  if (data.engineExperience.length > 0 || data.propellerExperience.length > 0) {
    addSectionTitle("Engine / propeller experience");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["Equipment", "Logs", "Hours"]],
      body: [
        ...data.engineExperience.map((row) => [
          `Engine: ${row.label}`,
          String(row.entryCount),
          `${formatSkillsHours(row.totalHours)}h`,
        ]),
        ...data.propellerExperience.map((row) => [
          `Propeller: ${row.label}`,
          String(row.entryCount),
          `${formatSkillsHours(row.totalHours)}h`,
        ]),
      ],
      theme: "grid",
      headStyles: {
        fillColor: [30, 30, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 56] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
    });
    y = tableEndY();
  }

  if (data.ataExperience.length > 0) {
    addSectionTitle("ATA chapter OJT experience");
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [["ATA chapter", "Logs", "Hours"]],
      body: data.ataExperience.map((row) => [
        row.label,
        String(row.entryCount),
        `${formatSkillsHours(row.totalHours)}h`,
      ]),
      theme: "grid",
      headStyles: {
        fillColor: [30, 30, 56],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 9,
      },
      bodyStyles: { fontSize: 9, textColor: [30, 30, 56] },
      alternateRowStyles: { fillColor: [248, 249, 250] },
    });
  }

  doc.save(`${safeFileName(name)}_skills_profile.pdf`);
}
