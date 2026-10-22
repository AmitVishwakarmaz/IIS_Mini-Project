import type { SolverInput, SolverResult, TimetableEntry, Day, Subject, TimeSlot } from '../types';
import { DAYS } from '../types';

// ── Constraint-based backtracking timetable solver ──
// Generates timetables for ALL selected divisions simultaneously.
// Pure TypeScript — no React, no Firebase. Can be reused in Flutter.

interface Variable {
  divisionId: string;
  subjectId: string;
  sessionIndex: number;
}

interface Slot {
  day: Day;
  timeSlotId: string;
  roomId: string;
  facultyId: string;
}

function eligibleFacultyIds(subject: Subject): string[] {
  return subject.facultyIds?.length ? subject.facultyIds : subject.facultyId ? [subject.facultyId] : [];
}

// Build all variables from input
function buildVariables(input: SolverInput): Variable[] {
  const vars: Variable[] = [];
  for (const div of input.divisions) {
    // Find subjects for this division — match semester, and optionally departmentId
    const divSubjects = input.subjects.filter(s =>
      s.semester === div.semester &&
      (s.departmentId === div.departmentId || !div.departmentId || !s.departmentId)
    );
    for (const sub of divSubjects) {
      for (let i = 0; i < sub.weeklyPeriods; i++) {
        vars.push({ divisionId: div.id, subjectId: sub.id, sessionIndex: i });
      }
    }
  }
  return vars;
}

// Build all possible slots — filtered by per-day availability and day reservations
function buildDomain(input: SolverInput, sub: Subject): Slot[] {
  const slots: Slot[] = [];
  const validRooms = input.rooms.filter(r => r.type === sub.roomType);
  const rooms = validRooms.length > 0 ? validRooms : input.rooms;

  // Find all days where this subject's type is explicitly listed in reservedForTypes
  const daysExplicitlyAllowingType = (input.daySchedules || [])
    .filter(ds => ds.reservedForTypes && ds.reservedForTypes.includes(sub.type))
    .map(ds => ds.day);

  for (const day of DAYS) {
    const daySchedule = input.daySchedules?.find(ds => ds.day === day);
    const maxOrder = daySchedule?.maxSlotOrder ?? Infinity;

    // 1. If this day is reserved for specific types and this subject isn't one of them -> skip day
    if (
      daySchedule?.reservedForTypes &&
      daySchedule.reservedForTypes.length > 0 &&
      !daySchedule.reservedForTypes.includes(sub.type)
    ) {
      continue;
    }

    // 2. If this subject's type is explicitly reserved for specific day(s),
    // and this day is NOT one of those days, skip this day
    if (
      daysExplicitlyAllowingType.length > 0 &&
      !daysExplicitlyAllowingType.includes(day)
    ) {
      continue;
    }

    const availableSlots = input.timeSlots
      .filter(ts => !ts.isBreak)
      .filter(ts => ts.order <= maxOrder)
      .filter(ts => {
        // If slot has availableDays set, it's only valid on those days
        if (ts.availableDays && ts.availableDays.length > 0) {
          return ts.availableDays.includes(day);
        }
        return true; // available on all days
      })
      .sort((a, b) => a.order - b.order);

    for (const ts of availableSlots) {
      for (const room of rooms) {
        for (const facultyId of eligibleFacultyIds(sub)) {
          slots.push({ day, timeSlotId: ts.id, roomId: room.id, facultyId });
        }
      }
    }
  }
  return slots;
}

// Check if assigning slot to variable violates any hard constraint
function isConsistent(
  variable: Variable,
  slot: Slot,
  assignment: Map<number, Slot>,
  variables: Variable[],
  _subjectFacultyMap: Map<string, string>
): boolean {
  for (const [idx, assignedSlot] of assignment.entries()) {
    if (assignedSlot.day !== slot.day || assignedSlot.timeSlotId !== slot.timeSlotId) continue;

    const otherVar = variables[idx];

    // 1. Division clash: same division can't have two classes at same time
    if (otherVar.divisionId === variable.divisionId) return false;

    // 2. Faculty clash: same faculty can't teach two classes at same time
    if (assignedSlot.facultyId === slot.facultyId) return false;

    // 3. Room clash: same room can't be used by two classes at same time
    if (assignedSlot.roomId === slot.roomId) return false;
  }

  return true;
}

// Check locked entries
function isLockedSlot(
  variable: Variable,
  slot: Slot,
  lockedEntries: TimetableEntry[]
): TimetableEntry | null {
  return lockedEntries.find(e =>
    e.divisionId === variable.divisionId &&
    e.day === slot.day &&
    e.timeSlotId === slot.timeSlotId
  ) || null;
}

// ── Soft scoring — lower is better ──

function scoreSoftConstraints(
  variable: Variable,
  slot: Slot,
  assignment: Map<number, Slot>,
  variables: Variable[],
  timeSlots: TimeSlot[]
): number {
  let penalty = 0;
  const sortedSlots = [...timeSlots].filter(ts => !ts.isBreak).sort((a, b) => a.order - b.order);
  const slotOrder = timeSlots.find(ts => ts.id === slot.timeSlotId)?.order ?? 0;

  // 1. Avoid same subject > 2 times on same day (heavy penalty)
  let sameDaySubjectCount = 0;
  for (const [idx, s] of assignment.entries()) {
    if (s.day === slot.day &&
        variables[idx].divisionId === variable.divisionId &&
        variables[idx].subjectId === variable.subjectId) {
      sameDaySubjectCount++;
    }
  }
  if (sameDaySubjectCount >= 2) penalty += 50;
  if (sameDaySubjectCount >= 1) penalty += 5;

  // 2. Avoid > 3 consecutive classes (moderate penalty)
  let consecutive = 1;
  for (let offset = -1; offset >= -4; offset--) {
    const adjSlot = sortedSlots.find(ts => ts.order === slotOrder + offset);
    if (!adjSlot) break;
    const hasClass = [...assignment.entries()].some(([idx, s]) =>
      s.day === slot.day && s.timeSlotId === adjSlot.id && variables[idx].divisionId === variable.divisionId
    );
    if (hasClass) consecutive++;
    else break;
  }
  for (let offset = 1; offset <= 4; offset++) {
    const adjSlot = sortedSlots.find(ts => ts.order === slotOrder + offset);
    if (!adjSlot) break;
    const hasClass = [...assignment.entries()].some(([idx, s]) =>
      s.day === slot.day && s.timeSlotId === adjSlot.id && variables[idx].divisionId === variable.divisionId
    );
    if (hasClass) consecutive++;
    else break;
  }
  if (consecutive > 4) penalty += 20;
  else if (consecutive > 3) penalty += 8;

  // 3. COMPACTNESS: Penalize gaps between classes on the same day
  const daySlotOrders: number[] = [slotOrder];
  for (const [idx, s] of assignment.entries()) {
    if (s.day === slot.day && variables[idx].divisionId === variable.divisionId) {
      const ord = timeSlots.find(ts => ts.id === s.timeSlotId)?.order ?? 0;
      daySlotOrders.push(ord);
    }
  }
  daySlotOrders.sort((a, b) => a - b);

  if (daySlotOrders.length >= 2) {
    const minOrd = daySlotOrders[0];
    const maxOrd = daySlotOrders[daySlotOrders.length - 1];
    const availableOrders = sortedSlots
      .filter(ts => ts.order >= minOrd && ts.order <= maxOrd)
      .map(ts => ts.order);
    const usedSet = new Set(daySlotOrders);
    let gaps = 0;
    for (const ord of availableOrders) {
      if (!usedSet.has(ord)) gaps++;
    }
    penalty += gaps * 10;
  }

  // 4. Prefer filling from early slots first
  penalty += slotOrder * 0.5;

  // 5. EVEN SPREAD across days: prefer days with fewer classes for this division
  let dayCount = 0;
  for (const [idx, s] of assignment.entries()) {
    if (s.day === slot.day && variables[idx].divisionId === variable.divisionId) {
      dayCount++;
    }
  }
  penalty += dayCount * 2;

  // 6. Balance teaching assignments between every eligible teacher.
  const facultyLoad = [...assignment.values()].filter(s => s.facultyId === slot.facultyId).length;
  penalty += facultyLoad * 3;

  return penalty;
}

// MRV: pick variable with fewest remaining valid slots
function selectVariable(
  unassigned: number[],
  variables: Variable[],
  assignment: Map<number, Slot>,
  domainMap: Map<string, Slot[]>,
  subjectFacultyMap: Map<string, string>
): number {
  let bestIdx = unassigned[0];
  let bestCount = Infinity;

  const check = unassigned.length > 50 ? unassigned.slice(0, 50) : unassigned;

  for (const idx of check) {
    const v = variables[idx];
    const domain = domainMap.get(v.subjectId) || [];
    let count = 0;
    for (const slot of domain) {
      if (isConsistent(v, slot, assignment, variables, subjectFacultyMap)) {
        count++;
        if (count > bestCount) break;
      }
    }
    if (count < bestCount) {
      bestCount = count;
      bestIdx = idx;
    }
    // Dead-end pruning: if any variable has 0 consistent slots, pick it immediately
    if (bestCount === 0) break;
  }

  return bestIdx;
}

// Order domain values: prefer slots with lower soft-constraint penalties
function orderDomain(
  variable: Variable,
  domain: Slot[],
  assignment: Map<number, Slot>,
  variables: Variable[],
  input: SolverInput
): Slot[] {
  const scored = domain.map(slot => ({
    slot,
    score: scoreSoftConstraints(variable, slot, assignment, variables, input.timeSlots)
  }));
  scored.sort((a, b) => a.score - b.score);
  return scored.map(s => s.slot);
}

// Main solver
export function solve(input: SolverInput): SolverResult {
  const warnings: string[] = [];

  // 1. Basic validation
  if (input.divisions.length === 0) return { success: false, entries: [], error: 'No divisions selected.', warnings };
  if (input.rooms.length === 0) return { success: false, entries: [], error: 'No rooms available.', warnings };
  if (input.timeSlots.length === 0) return { success: false, entries: [], error: 'No time slots configured.', warnings };

  // 2. Pre-flight: Compute actual available slots per day and per week
  const nonBreakSlots = input.timeSlots.filter(ts => !ts.isBreak);
  const slotsByDay = new Map<Day, number>();
  let totalSlotsPerWeek = 0;

  for (const day of DAYS) {
    const daySchedule = input.daySchedules?.find(ds => ds.day === day);
    const maxOrder = daySchedule?.maxSlotOrder ?? Infinity;
    const slotsThisDay = nonBreakSlots.filter(ts =>
      ts.order <= maxOrder &&
      (!ts.availableDays || ts.availableDays.length === 0 || ts.availableDays.includes(day))
    ).length;
    slotsByDay.set(day, slotsThisDay);
    totalSlotsPerWeek += slotsThisDay;
  }

  if (totalSlotsPerWeek === 0) {
    return {
      success: false, entries: [],
      error: 'No available class slots found. Check that time slots are active and day schedules allow periods.',
      warnings
    };
  }

  // Precompute domains for each subject once
  const domainMap = new Map<string, Slot[]>();
  for (const sub of input.subjects) {
    const domain = buildDomain(input, sub);
    domainMap.set(sub.id, domain);
  }

  // 3. Pre-flight checks on divisions and subjects
  for (const div of input.divisions) {
    const divSubjects = input.subjects.filter(s =>
      s.semester === div.semester &&
      (s.departmentId === div.departmentId || !div.departmentId || !s.departmentId)
    );

    if (divSubjects.length === 0) {
      warnings.push(`Division "${div.name}" has no subjects for semester ${div.semester}.`);
      continue;
    }

    // Check if any subject has 0 available slots in its domain
    for (const sub of divSubjects) {
      const d = domainMap.get(sub.id) || [];
      if (d.length === 0) {
        return {
          success: false, entries: [],
          error: eligibleFacultyIds(sub).length === 0
            ? `Cannot schedule subject "${sub.name}": assign at least one eligible teacher.`
            : `Cannot schedule subject "${sub.name}" (${sub.type}): no available slots match its required room type "${sub.roomType}" or day constraints.`,
          warnings
        };
      }
    }

    // Check total periods for this division vs total week slots
    const totalPeriods = divSubjects.reduce((sum, s) => sum + s.weeklyPeriods, 0);
    if (totalPeriods > totalSlotsPerWeek) {
      return {
        success: false, entries: [],
        error: `Division "${div.name}": requires ${totalPeriods} class periods, but only ${totalSlotsPerWeek} slots are available across all days.`,
        warnings
      };
    }

    // Check per-type slot capacity for this division
    const periodsByType = new Map<string, number>();
    for (const sub of divSubjects) {
      periodsByType.set(sub.type, (periodsByType.get(sub.type) || 0) + sub.weeklyPeriods);
    }

    for (const [type, needed] of periodsByType.entries()) {
      const allowedDays = DAYS.filter(day => {
        const ds = input.daySchedules?.find(d => d.day === day);
        if (ds?.reservedForTypes && ds.reservedForTypes.length > 0) {
          return ds.reservedForTypes.includes(type as any);
        }
        const explicitlyReservedElsewhere = (input.daySchedules || []).some(
          d => d.day !== day && d.reservedForTypes && d.reservedForTypes.includes(type as any)
        );
        return !explicitlyReservedElsewhere;
      });

      const allowedSlots = allowedDays.reduce((sum, d) => sum + (slotsByDay.get(d) || 0), 0);
      if (needed > allowedSlots) {
        return {
          success: false, entries: [],
          error: `Division "${div.name}": needs ${needed} periods of type "${type}", but only ${allowedSlots} slots are available on the allowed days (${allowedDays.join(', ')}).`,
          warnings
        };
      }
    }
  }

  const variables = buildVariables(input);

  if (variables.length === 0) {
    return {
      success: false, entries: [],
      error: 'No subjects found for the selected divisions/semester. Add subjects for this semester first.',
      warnings
    };
  }

  // Retained as a parameter for the search helpers; faculty is selected per slot.
  const subjectFacultyMap = new Map<string, string>();
  for (const s of input.subjects) {
    subjectFacultyMap.set(s.id, eligibleFacultyIds(s)[0] || '');
  }

  const assignment = new Map<number, Slot>();

  // Pre-assign locked entries
  for (const locked of input.lockedEntries) {
    const idx = variables.findIndex(v =>
      v.divisionId === locked.divisionId && v.subjectId === locked.subjectId
    );
    if (idx >= 0 && !assignment.has(idx)) {
      assignment.set(idx, {
        day: locked.day,
        timeSlotId: locked.timeSlotId,
        roomId: locked.roomId,
        facultyId: locked.facultyId
      });
    }
  }

  // Backtracking search with safety limits
  let iterations = 0;
  const MAX_ITERATIONS = 30000;
  const MAX_TIME_MS = 3000; // 3 seconds max search time
  const startTime = Date.now();

  function backtrack(): boolean {
    if (++iterations > MAX_ITERATIONS) return false;
    if (Date.now() - startTime > MAX_TIME_MS) return false;
    if (assignment.size === variables.length) return true;

    const unassigned = variables.map((_, i) => i).filter(i => !assignment.has(i));
    const idx = selectVariable(unassigned, variables, assignment, domainMap, subjectFacultyMap);
    const v = variables[idx];
    const domain = domainMap.get(v.subjectId) || [];
    const ordered = orderDomain(v, domain, assignment, variables, input);

    for (const slot of ordered) {
      // Skip if this slot is locked for another subject
      const locked = isLockedSlot(v, slot, input.lockedEntries);
      if (locked && locked.subjectId !== v.subjectId) continue;

      if (isConsistent(v, slot, assignment, variables, subjectFacultyMap)) {
        assignment.set(idx, slot);
        if (backtrack()) return true;
        assignment.delete(idx);
      }
    }

    return false;
  }

  const solved = backtrack();

  if (!solved) {
    if (Date.now() - startTime > MAX_TIME_MS || iterations > MAX_ITERATIONS) {
      return {
        success: false, entries: [],
        error: 'Timetable generation timed out. Constraints may be too restrictive (e.g. tight daily end times, room shortages, or faculty conflicts). Try extending day end times or relaxing restrictions.',
        warnings
      };
    }
    return {
      success: false, entries: [],
      error: 'Cannot generate a valid timetable with current constraints. Check: enough rooms of each type? Faculty schedules clash across divisions? Enough daily slots?',
      warnings
    };
  }

  // Build entries
  const entries: TimetableEntry[] = [];
  for (const [idx, slot] of assignment.entries()) {
    const v = variables[idx];
    entries.push({
      day: slot.day,
      timeSlotId: slot.timeSlotId,
      subjectId: v.subjectId,
      facultyId: slot.facultyId,
      roomId: slot.roomId,
      divisionId: v.divisionId,
      isLocked: input.lockedEntries.some(l =>
        l.divisionId === v.divisionId && l.day === slot.day && l.timeSlotId === slot.timeSlotId
      ),
    });
  }

  // Post-generation warnings
  for (const div of input.divisions) {
    const divEntries = entries.filter(e => e.divisionId === div.id);
    if (divEntries.length === 0) {
      warnings.push(`Division "${div.name}" got 0 classes assigned. Check subject/semester match.`);
    }

    // Check for gaps on each day
    for (const day of DAYS) {
      const dayEntries = divEntries.filter(e => e.day === day);
      if (dayEntries.length < 2) continue;
      const orders = dayEntries.map(e => {
        const ts = input.timeSlots.find(t => t.id === e.timeSlotId);
        return ts?.order ?? 0;
      }).sort((a, b) => a - b);
      const minO = orders[0];
      const maxO = orders[orders.length - 1];
      const expectedSlots = nonBreakSlots.filter(ts => ts.order >= minO && ts.order <= maxO).length;
      if (expectedSlots > orders.length + 1) {
        warnings.push(`${div.name} has free periods between classes on ${day}`);
      }
    }
  }

  return { success: true, entries, warnings };
}

// Validate an existing timetable for conflicts
export function validateTimetable(
  entries: TimetableEntry[],
  input: SolverInput
): string[] {
  const errors: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (a.day !== b.day || a.timeSlotId !== b.timeSlotId) continue;

      if (a.divisionId === b.divisionId) {
        errors.push(`Division clash: ${a.divisionId} has two classes at ${a.day} ${a.timeSlotId}`);
      }
      if (a.facultyId === b.facultyId) {
        const fname = input.faculty.find(f => f.id === a.facultyId)?.name || a.facultyId;
        errors.push(`Faculty clash: ${fname} teaches two classes at ${a.day} ${a.timeSlotId}`);
      }
      if (a.roomId === b.roomId) {
        const rname = input.rooms.find(r => r.id === a.roomId)?.name || a.roomId;
        errors.push(`Room clash: ${rname} double-booked at ${a.day} ${a.timeSlotId}`);
      }
    }
  }

  return errors;
}
