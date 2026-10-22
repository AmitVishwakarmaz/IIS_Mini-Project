import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, setDoc
} from 'firebase/firestore';
import { db } from '../firebase';

// Generic Firestore CRUD

export async function getAll<T>(col: string): Promise<T[]> {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as T));
}

export async function getById<T>(col: string, id: string): Promise<T | null> {
  const snap = await getDoc(doc(db, col, id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as T;
}

export async function create<T extends { id?: string }>(col: string, data: Omit<T, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, col), data);
  return ref.id;
}

export async function set<T>(col: string, id: string, data: Omit<T, 'id'>): Promise<void> {
  await setDoc(doc(db, col, id), data);
}

export async function update<T>(col: string, id: string, data: Partial<T>): Promise<void> {
  await updateDoc(doc(db, col, id), data as Record<string, unknown>);
}

export async function remove(col: string, id: string): Promise<void> {
  await deleteDoc(doc(db, col, id));
}
