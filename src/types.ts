// ── All types for the timetable generator ──

export interface College {
  id: string;
  name: string;
  address: string;
}

export interface Department {
  id: string;
  name: string;
  shortName: string;
  collegeId: string;
}

export type SubjectType = 'theory' | 'practical' | 'tutorial' | 'pbl';

export interface Subject {
  id: string;
  name: string;
  code: string;
  type: SubjectType;
  weeklyPeriods: number;
  // Optional: semester contact hours → used to auto-compute weeklyPeriods
  semesterHours?: number;
  semesterWeeks?: number;    // default 15
  // Teachers eligible to deliver this subject. The solver assigns one of them
  // to each period, allowing the teaching load to be shared.
  facultyIds: string[];
  // Legacy single-teacher field, retained so existing Firestore records can
  // still be read until they are edited and saved.
  facultyId?: string;
  roomType: 'classroom' | 'lab';
  departmentId: string;
  semester: number;
}

export interface Faculty {
  id: string;
  name: string;
  shortName: string;
  departmentId: string;
}

export interface Room {
  id: string;
  name: string;
  type: 'classroom' | 'lab';
  capacity: number;
}

export interface Division {
  id: string;
  name: string;
  departmentId: string;
  semester: number;
  strength: number;
}

// Per-day schedule config: how many time-slot orders are available on this day
// e.g. Saturday maxOrder: 4 means only slots with order <= 4 are used on Saturday
export interface DaySchedule {
  id: string;
  day: Day;
  maxSlotOrder: number;       // Slots with order > this are skipped on this day
  label?: string;             // e.g. "Half Day", "Full Day"
  // Reservation: if set, ONLY subjects of these types can be scheduled on this day.
  // All other subject types are blocked from this day.
  reservedForTypes?: SubjectType[];  // e.g. ['pbl', 'tutorial'] for Saturday
  // Pattern: 'every' = every occurrence of this day, 'alternate' = every other week
  // 'alternate' is informational (shown in grid header) — solver treats it same as 'every'
  // since the timetable is a single-week template.
  pattern?: 'every' | 'alternate';
}

export interface TimeSlot {
  id: string;
  startTime: string;
  endTime: string;
  isBreak: boolean;
  order: number;
  // Optional: if set, this slot is only available on these specific days
  // Leave empty/undefined = available on ALL days
  availableDays?: Day[];
}

export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export type Day = typeof DAYS[number];

export interface TimetableEntry {
  day: Day;
  timeSlotId: string;
  subjectId: string;
  facultyId: string;
  roomId: string;
  divisionId: string;
  isLocked: boolean;
}

export interface ExamEntry {
  date: string;
  timeSlotId: string;
  subjectId: string;
  divisionId: string;
  roomId: string;
}

export interface Timetable {
  id: string;
  name: string;
  type: 'daily' | 'exam';
  departmentId: string;
  semester: number;
  divisionIds: string[];
  status: 'draft' | 'final';
  entries: TimetableEntry[];
  examEntries: ExamEntry[];
  createdAt: number;
  updatedAt: number;
}

// Solver types
export interface SolverInput {
  divisions: Division[];
  subjects: Subject[];
  faculty: Faculty[];
  rooms: Room[];
  timeSlots: TimeSlot[];
  daySchedules?: DaySchedule[];  // Optional per-day limits
  lockedEntries: TimetableEntry[];
}

export interface SolverResult {
  success: boolean;
  entries: TimetableEntry[];
  error?: string;
  warnings: string[];
}

// ── Utility: compute weekly periods from semester hours ──
export function computeWeeklyPeriods(
  semesterHours: number,
  semesterWeeks: number = 15,
  periodDurationHours: number = 1
): number {
  // Total periods in semester ÷ weeks = periods per week, rounded up
  const totalPeriods = Math.ceil(semesterHours / periodDurationHours);
  return Math.ceil(totalPeriods / semesterWeeks);
}

// ── Utility: compute total weekly load summary for a set of subjects ──
export interface WeeklyLoadSummary {
  theory: number;
  practical: number;
  tutorial: number;
  pbl: number;
  total: number;
}

export function computeWeeklyLoad(subjects: Subject[]): WeeklyLoadSummary {
  const summary: WeeklyLoadSummary = { theory: 0, practical: 0, tutorial: 0, pbl: 0, total: 0 };
  for (const s of subjects) {
    summary[s.type] += s.weeklyPeriods;
    summary.total += s.weeklyPeriods;
  }
  return summary;
}
