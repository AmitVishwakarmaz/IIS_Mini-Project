import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { set } from './firestore';
import type { College, Department, Subject, Faculty, Room, Division, TimeSlot } from '../types';

// Seed TCET-based demo data (only if collection is empty)

async function isEmpty(col: string): Promise<boolean> {
  const snap = await getDocs(collection(db, col));
  return snap.empty;
}

export async function seedAll() {
  if (!(await isEmpty('colleges'))) return; // already seeded

  // College
  const college: Omit<College, 'id'> = {
    name: 'Thakur College of Engineering & Technology',
    address: 'Kandivali (E), Mumbai - 400101',
  };
  await set<College>('colleges', 'tcet', college);

  // Departments
  const depts: Record<string, Omit<Department, 'id'>> = {
    'comp': { name: 'Computer Engineering', shortName: 'COMP', collegeId: 'tcet' },
    'it':   { name: 'Information Technology', shortName: 'IT', collegeId: 'tcet' },
    'aids': { name: 'AI & Data Science', shortName: 'AIDS', collegeId: 'tcet' },
  };
  for (const [id, d] of Object.entries(depts)) await set<Department>('departments', id, d);

  // Faculty
  const facultyList: Record<string, Omit<Faculty, 'id'>> = {
    'f1': { name: 'Prof. Sushant Sawant', shortName: 'SuS', departmentId: 'comp' },
    'f2': { name: 'Prof. Sharma', shortName: 'SKS', departmentId: 'comp' },
    'f3': { name: 'Ms. Foram Shah', shortName: 'FS/MS', departmentId: 'comp' },
    'f4': { name: 'Mr. Kashish S', shortName: 'KS', departmentId: 'comp' },
    'f5': { name: 'Dr. Shailesh Sangle', shortName: 'SK', departmentId: 'comp' },
    'f6': { name: 'Mr. Shrikrishna Sonawane', shortName: 'SKS2', departmentId: 'comp' },
    'f7': { name: 'Mr. Rajesh Erade', shortName: 'RE', departmentId: 'comp' },
    'f8': { name: 'Prof. Sudhir M', shortName: 'SM', departmentId: 'comp' },
  };
  for (const [id, f] of Object.entries(facultyList)) await set<Faculty>('faculty', id, f);

  // Rooms
  const roomsList: Record<string, Omit<Room, 'id'>> = {
    'r305': { name: '305', type: 'classroom', capacity: 70 },
    'r306': { name: '306', type: 'classroom', capacity: 70 },
    'r326': { name: '326', type: 'classroom', capacity: 70 },
    'r324': { name: '324', type: 'classroom', capacity: 70 },
    'r304': { name: '304', type: 'classroom', capacity: 70 },
    'lab1': { name: 'Lab MP C1 C2', type: 'lab', capacity: 35 },
    'lab2': { name: 'Lab CG C1 C2', type: 'lab', capacity: 35 },
    'lab3': { name: 'Lab IIS C3 C4', type: 'lab', capacity: 35 },
  };
  for (const [id, r] of Object.entries(roomsList)) await set<Room>('rooms', id, r);

  // Subjects
  const subjectsList: Record<string, Omit<Subject, 'id'>> = {
    'toc':  { name: 'Theory of Computation', code: 'TOC', type: 'theory', weeklyPeriods: 3, facultyIds: ['f1'], roomType: 'classroom', departmentId: 'comp', semester: 6 },
    'mp':   { name: 'Microprocessor', code: 'MP', type: 'theory', weeklyPeriods: 3, facultyIds: ['f1'], roomType: 'classroom', departmentId: 'comp', semester: 6 },
    'cg':   { name: 'Computer Graphics', code: 'CG', type: 'theory', weeklyPeriods: 3, facultyIds: ['f3'], roomType: 'classroom', departmentId: 'comp', semester: 6 },
    'iis':  { name: 'Introduction to Intelligent System', code: 'IIS', type: 'theory', weeklyPeriods: 3, facultyIds: ['f4'], roomType: 'classroom', departmentId: 'comp', semester: 6 },
    'ssic': { name: 'Soft Skill & Interpersonal Communication', code: 'SSIC', type: 'theory', weeklyPeriods: 2, facultyIds: ['f6'], roomType: 'classroom', departmentId: 'comp', semester: 6 },
    'ic':   { name: 'Indian Constitution', code: 'IC', type: 'theory', weeklyPeriods: 1, facultyIds: ['f7'], roomType: 'classroom', departmentId: 'comp', semester: 6 },
    'cg_p': { name: 'CG Practical', code: 'CG-P', type: 'practical', weeklyPeriods: 2, facultyIds: ['f3'], roomType: 'lab', departmentId: 'comp', semester: 6 },
    'mp_p': { name: 'Microprocessor', code: 'MP-P', type: 'practical', weeklyPeriods: 2, facultyIds: ['f1'], roomType: 'lab', departmentId: 'comp', semester: 6 },
    'iis_p':{ name: 'IIS Practical', code: 'IIS-P', type: 'practical', weeklyPeriods: 2, facultyIds: ['f4'], roomType: 'lab', departmentId: 'comp', semester: 6 },
  };
  for (const [id, s] of Object.entries(subjectsList)) await set<Subject>('subjects', id, s);

  // Divisions
  const divisionsList: Record<string, Omit<Division, 'id'>> = {
    'te_a': { name: 'TE-A', departmentId: 'comp', semester: 6, strength: 69 },
    'te_b': { name: 'TE-B', departmentId: 'comp', semester: 6, strength: 69 },
    'te_c': { name: 'TE-C', departmentId: 'comp', semester: 6, strength: 69 },
  };
  for (const [id, d] of Object.entries(divisionsList)) await set<Division>('divisions', id, d);

  // Time Slots (standard day)
  const slots: Array<Omit<TimeSlot, 'id'> & { _id: string }> = [
    { _id: 'ts1', startTime: '08:30', endTime: '09:30', isBreak: false, order: 1 },
    { _id: 'ts2', startTime: '09:30', endTime: '10:30', isBreak: false, order: 2 },
    { _id: 'ts3', startTime: '10:30', endTime: '11:30', isBreak: false, order: 3 },
    { _id: 'ts4', startTime: '11:30', endTime: '12:30', isBreak: false, order: 4 },
    { _id: 'ts5', startTime: '12:30', endTime: '01:30', isBreak: true,  order: 5 },
    { _id: 'ts6', startTime: '01:30', endTime: '02:30', isBreak: false, order: 6 },
    { _id: 'ts7', startTime: '02:30', endTime: '03:30', isBreak: false, order: 7 },
    { _id: 'ts8', startTime: '03:30', endTime: '04:30', isBreak: false, order: 8 },
    { _id: 'ts9', startTime: '04:30', endTime: '05:30', isBreak: false, order: 9 },
  ];
  for (const s of slots) {
    const { _id, ...data } = s;
    await set<TimeSlot>('timeSlots', _id, data);
  }

  console.log('✅ Seed data loaded');
}
