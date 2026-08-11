import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  enableIndexedDbPersistence
} from 'firebase/firestore';
import { Vehicle } from '../types';
import { INITIAL_VEHICLES } from '../data/mockVehicles';

// Hardcoded Firebase configuration for direct connection (e.g. on Vercel)
const firebaseConfig = {
  projectId: "watchful-snow-75xj8",
  appId: "1:429685830538:web:cdc0eaac9c437954ed8e73",
  apiKey: "AIzaSyD7Gule-fCuexqXH3nvzpnGq4C5OjAkxhg",
  authDomain: "watchful-snow-75xj8.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-02e8e413-8742-4413-b192-a358c5a8a6bd",
  storageBucket: "watchful-snow-75xj8.firebasestorage.app",
  messagingSenderId: "429685830538",
  measurementId: "",
  oAuthClientId: "429685830538-e5e8nqik3adsa10u3hcb7jq3dcohmo9f.apps.googleusercontent.com",
  recaptchaSiteKey: ""
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Firestore with specific database ID if present, else default
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Enable offline persistence (IndexedDB)
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      console.warn('Firestore persistence not supported by browser');
    }
  });
}

const VEHICLES_COLLECTION = 'vehicles';
const META_DOC_REF = doc(db, '_meta', 'initialized');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  return errInfo;
}

/**
 * Fetch all vehicles from Firestore ONCE when requested.
 * Does not establish a continuous real-time listener, saving daily Firestore read quota.
 */
export async function fetchVehiclesOnce(): Promise<Vehicle[]> {
  try {
    const vehiclesRef = collection(db, VEHICLES_COLLECTION);
    const snapshot = await getDocs(vehiclesRef);

    if (snapshot.empty) {
      try {
        const metaSnap = await getDoc(META_DOC_REF);
        if (!metaSnap.exists()) {
          // Seed initial data to Firestore ONLY on very first initialization
          const batch = writeBatch(db);
          for (const vehicle of INITIAL_VEHICLES) {
            const vehicleDocRef = doc(db, VEHICLES_COLLECTION, vehicle.id);
            batch.set(vehicleDocRef, vehicle);
          }
          batch.set(META_DOC_REF, { initialized: true, timestamp: new Date().toISOString() });
          await batch.commit();
          return INITIAL_VEHICLES;
        }
      } catch (seedErr) {
        handleFirestoreError(seedErr, OperationType.GET, '_meta/initialized');
      }
      return [];
    }

    const vehiclesList: Vehicle[] = [];
    snapshot.forEach((docSnap) => {
      vehiclesList.push(docSnap.data() as Vehicle);
    });

    vehiclesList.sort((a, b) =>
      a.garageNumber.localeCompare(b.garageNumber, undefined, { numeric: true })
    );

    return vehiclesList;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, VEHICLES_COLLECTION);
    throw err;
  }
}

/**
 * Optional: Subscribe to real-time updates for all vehicles in Firestore.
 */
export function subscribeToVehicles(
  onUpdate: (vehicles: Vehicle[]) => void,
  onError?: (err: Error) => void
): () => void {
  const vehiclesRef = collection(db, VEHICLES_COLLECTION);

  const unsubscribe = onSnapshot(
    vehiclesRef,
    (snapshot) => {
      if (snapshot.empty) {
        onUpdate([]);
      } else {
        const vehiclesList: Vehicle[] = [];
        snapshot.forEach((docSnap) => {
          vehiclesList.push(docSnap.data() as Vehicle);
        });
        vehiclesList.sort((a, b) =>
          a.garageNumber.localeCompare(b.garageNumber, undefined, { numeric: true })
        );
        onUpdate(vehiclesList);
      }
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, VEHICLES_COLLECTION);
      if (onError) onError(err);
    }
  );

  return unsubscribe;
}

/**
 * Save or update a single vehicle in Firestore
 */
export async function saveVehicleToFirestore(vehicle: Vehicle): Promise<void> {
  try {
    const vehicleDocRef = doc(db, VEHICLES_COLLECTION, vehicle.id);
    await setDoc(vehicleDocRef, vehicle);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${VEHICLES_COLLECTION}/${vehicle.id}`);
    throw err;
  }
}

/**
 * Delete a vehicle from Firestore
 */
export async function deleteVehicleFromFirestore(vehicleId: string): Promise<void> {
  try {
    const vehicleDocRef = doc(db, VEHICLES_COLLECTION, vehicleId);
    await deleteDoc(vehicleDocRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${VEHICLES_COLLECTION}/${vehicleId}`);
    throw err;
  }
}

/**
 * Save multiple vehicles in a batch
 */
export async function saveAllVehiclesToFirestore(vehicles: Vehicle[]): Promise<void> {
  try {
    const batch = writeBatch(db);
    for (const vehicle of vehicles) {
      const vehicleDocRef = doc(db, VEHICLES_COLLECTION, vehicle.id);
      batch.set(vehicleDocRef, vehicle);
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, VEHICLES_COLLECTION);
    throw err;
  }
}
