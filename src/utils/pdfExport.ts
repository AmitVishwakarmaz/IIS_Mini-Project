import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { TimetableEntry, Subject, Faculty, Room, Division, TimeSlot } from '../types';
import { DAYS } from '../types';

interface ExportData {
  entries: TimetableEntry[];
  subjects: Subject[];
  faculty: Faculty[];
  rooms: Room[];
  divisions: Division[];
  timeSlots: TimeSlot[];
  semester: number;
  timetableName?: string;
}

// Build grid data for a single division
function buildGridData(
  divisionId: string,
  entries: TimetableEntry[],
  timeSlots: TimeSlot[],
  subjects: Subject[],
  faculty: Faculty[],
  rooms: Room[]
) {
  const sorted = [...timeSlots].sort((a, b) => a.order - b.order);
  const rows: (string | { content: string; styles: Record<string, unknown> })[][] = [];

  for (const ts of sorted) {
    if (ts.isBreak) {
      rows.push([
        `${ts.startTime}–${ts.endTime}`,
        ...DAYS.map(() => ({ content: 'BREAK', styles: { fillColor: [230, 230, 230] as unknown, halign: 'center' as const, fontStyle: 'bold' as const, fontSize: 8 } }))
      ]);
      continue;
    }

    const row: (string | { content: string; styles: Record<string, unknown> })[] = [
      `${ts.startTime}\n${ts.endTime}`
    ];

    for (const day of DAYS) {
      const entry = entries.find(
        e => e.day === day && e.timeSlotId === ts.id && e.divisionId === divisionId
      );
      if (entry) {
        const sub = subjects.find(s => s.id === entry.subjectId);
        const fac = faculty.find(f => f.id === entry.facultyId);
        const rm = rooms.find(r => r.id === entry.roomId);

        const bgColor = sub?.type === 'theory' ? [239, 246, 255]
          : sub?.type === 'practical' ? [255, 247, 237]
          : sub?.type === 'tutorial' ? [236, 253, 245]
          : sub?.type === 'pbl' ? [245, 243, 255]
          : [255, 255, 255];

        row.push({
          content: `${sub?.code || '?'}\n${fac?.shortName || ''}\n${rm?.name || ''}`,
          styles: { fillColor: bgColor as unknown, fontSize: 7, cellPadding: 2 }
        });
      } else {
        row.push('');
      }
    }
    rows.push(row);
  }

  return rows;
}

// Add a single timetable to the PDF
function addTimetablePage(
  doc: jsPDF,
  data: ExportData,
  division: Division,
  isFirst: boolean
) {
  if (!isFirst) doc.addPage();

  const pageWidth = doc.internal.pageSize.getWidth();

  // Title
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('CLASS TIME TABLE', pageWidth / 2, 16, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const subtitle = `Computer Engineering  •  Semester ${data.semester}  •  ${division.name}  •  Strength: ${division.strength}`;
  doc.text(subtitle, pageWidth / 2, 23, { align: 'center' });

  if (data.timetableName) {
    doc.setFontSize(8);
    doc.text(data.timetableName, pageWidth / 2, 28, { align: 'center' });
  }

  const divEntries = data.entries.filter(e => e.divisionId === division.id);
  const gridData = buildGridData(
    division.id, divEntries, data.timeSlots,
    data.subjects, data.faculty, data.rooms
  );

  autoTable(doc, {
    startY: data.timetableName ? 32 : 28,
    head: [['Time', ...DAYS]],
    body: gridData,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 2,
      valign: 'middle',
      halign: 'center',
      lineWidth: 0.2,
      lineColor: [200, 200, 200],
    },
    headStyles: {
      fillColor: [43, 42, 40],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center', fontStyle: 'bold', fontSize: 7 },
    },
    margin: { left: 10, right: 10 },
  });
}

// Export a single division's timetable as PDF
export function exportSinglePDF(data: ExportData, divisionId: string) {
  const division = data.divisions.find(d => d.id === divisionId);
  if (!division) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  addTimetablePage(doc, data, division, true);

  const filename = `timetable_${division.name.replace(/\s+/g, '_')}_sem${data.semester}.pdf`;
  doc.save(filename);
}

// Export all divisions' timetables merged into one PDF
export function exportAllPDF(data: ExportData, divisionIds: string[]) {
  const divisions = divisionIds
    .map(id => data.divisions.find(d => d.id === id))
    .filter((d): d is Division => d !== undefined);

  if (divisions.length === 0) return;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  divisions.forEach((div, i) => {
    addTimetablePage(doc, data, div, i === 0);
  });

  const filename = data.timetableName
    ? `${data.timetableName.replace(/\s+/g, '_')}.pdf`
    : `timetable_all_sem${data.semester}.pdf`;
  doc.save(filename);
}
