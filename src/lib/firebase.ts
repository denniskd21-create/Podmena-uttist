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
  writeBatch
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

const VEHICLES_COLLECTION = 'vehicles';
const META_DOC_REF = doc(db, '_meta', 'initialized');

/**
 * Subscribe to real-time updates for all vehicles in Firestore.
 * Seeds initial vehicles only once if the database was never initialized.
 */
export function subscribeToVehicles(
  onUpdate: (vehicles: Vehicle[]) => void,
  onError?: (err: Error) => void
): () => void {
  const vehiclesRef = collection(db, VEHICLES_COLLECTION);

  const unsubscribe = onSnapshot(
    vehiclesRef,
    async (snapshot) => {
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
            onUpdate(INITIAL_VEHICLES);
            return;
          }
        } catch (seedErr) {
          console.error('Error checking meta doc:', seedErr);
        }
        // If meta doc exists (or error), empty snapshot means all vehicles were deleted
        onUpdate([]);
      } else {
        // Ensure meta doc exists so future deletions know database was initialized
        try {
          getDoc(META_DOC_REF).then((metaSnap) => {
            if (!metaSnap.exists()) {
              setDoc(META_DOC_REF, { initialized: true, timestamp: new Date().toISOString() }).catch(() => {});
            }
          }).catch(() => {});
        } catch (e) {}

        const vehiclesList: Vehicle[] = [];
        snapshot.forEach((docSnap) => {
          vehiclesList.push(docSnap.data() as Vehicle);
        });
        // Sort by garage number
        vehiclesList.sort((a, b) => a.garageNumber.localeCompare(b.garageNumber, undefined, { numeric: true }));
        onUpdate(vehiclesList);
      }
    },
    (err) => {
      console.error('Firestore subscription error:', err);
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
    console.error('Failed to save vehicle to Firestore:', err);
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
    console.error('Failed to delete vehicle from Firestore:', err);
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
    console.error('Failed to save all vehicles to Firestore:', err);
    throw err;
  }
}
