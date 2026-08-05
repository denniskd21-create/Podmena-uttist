import { Vehicle, DriverNote } from '../types';
import { INITIAL_VEHICLES } from '../data/mockVehicles';

const STORAGE_KEY = 'uttist_driver_vehicles_v2';
const RECENT_KEY = 'uttist_driver_recent_garage_v2';

export function getStoredVehicles(): Vehicle[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_VEHICLES));
      return INITIAL_VEHICLES;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return INITIAL_VEHICLES;
  } catch (err) {
    console.error('Failed to parse vehicles from localStorage:', err);
    return INITIAL_VEHICLES;
  }
}

export function saveStoredVehicles(vehicles: Vehicle[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(vehicles));
  } catch (err) {
    console.error('Failed to save vehicles to localStorage:', err);
  }
}

export function resetVehiclesToDefault(): Vehicle[] {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_VEHICLES));
  } catch (err) {
    console.error('Failed to reset vehicles:', err);
  }
  return INITIAL_VEHICLES;
}

export function getRecentGarageNumbers(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? JSON.parse(raw) : ['0142', '0285', '0732'];
  } catch {
    return ['0142', '0285', '0732'];
  }
}

export function addRecentGarageNumber(garageNum: string): void {
  try {
    const current = getRecentGarageNumbers();
    const filtered = current.filter((num) => num !== garageNum);
    const updated = [garageNum, ...filtered].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save recent garage number:', err);
  }
}

export function addNoteToVehicle(vehicles: Vehicle[], vehicleId: string, note: Omit<DriverNote, 'id' | 'date'>): Vehicle[] {
  const updated = vehicles.map((v) => {
    if (v.id === vehicleId) {
      const newNoteItem: DriverNote = {
        ...note,
        id: 'note-' + Date.now(),
        date: new Date().toISOString()
      };
      return {
        ...v,
        notes: [newNoteItem, ...v.notes],
        lastUpdated: new Date().toISOString()
      };
    }
    return v;
  });
  saveStoredVehicles(updated);
  return updated;
}

export function deleteNoteFromVehicle(vehicles: Vehicle[], vehicleId: string, noteId: string): Vehicle[] {
  const updated = vehicles.map((v) => {
    if (v.id === vehicleId) {
      return {
        ...v,
        notes: v.notes.filter((n) => n.id !== noteId),
        lastUpdated: new Date().toISOString()
      };
    }
    return v;
  });
  saveStoredVehicles(updated);
  return updated;
}

export function deleteNuanceFromVehicle(vehicles: Vehicle[], vehicleId: string, index: number): Vehicle[] {
  const updated = vehicles.map((v) => {
    if (v.id === vehicleId) {
      const nextNuances = [...(v.techNuances || [])];
      nextNuances.splice(index, 1);
      return {
        ...v,
        techNuances: nextNuances,
        lastUpdated: new Date().toISOString()
      };
    }
    return v;
  });
  saveStoredVehicles(updated);
  return updated;
}

export function deleteVehicleFromStore(vehicles: Vehicle[], vehicleId: string): Vehicle[] {
  const updated = vehicles.filter((v) => v.id !== vehicleId);
  saveStoredVehicles(updated);
  return updated;
}

const LAST_VEHICLE_KEY = 'uttist_driver_last_vehicle_id_v2';
const LAST_SEARCH_KEY = 'uttist_driver_last_search_term_v2';

export function getLastVehicleId(): string | null {
  try {
    return localStorage.getItem(LAST_VEHICLE_KEY);
  } catch {
    return null;
  }
}

export function saveLastVehicleId(id: string): void {
  try {
    if (id) {
      localStorage.setItem(LAST_VEHICLE_KEY, id);
    } else {
      localStorage.removeItem(LAST_VEHICLE_KEY);
    }
  } catch (err) {
    console.error('Failed to save last vehicle id:', err);
  }
}

export function getLastSearchTerm(): string {
  try {
    return localStorage.getItem(LAST_SEARCH_KEY) || '';
  } catch {
    return '';
  }
}

export function saveLastSearchTerm(term: string): void {
  try {
    localStorage.setItem(LAST_SEARCH_KEY, term);
  } catch (err) {
    console.error('Failed to save last search term:', err);
  }
}

export function getSavedShiftForVehicle(vehicleId: string): '1' | '2' {
  if (typeof window === 'undefined' || !vehicleId) return '1';
  try {
    const saved = localStorage.getItem(`uttist_vehicle_shift_${vehicleId}`);
    if (saved === '1' || saved === '2') {
      return saved;
    }
  } catch (err) {
    console.error('Error reading saved shift:', err);
  }
  return '1';
}

export function saveShiftForVehicle(vehicleId: string, shift: '1' | '2'): void {
  if (typeof window === 'undefined' || !vehicleId) return;
  try {
    localStorage.setItem(`uttist_vehicle_shift_${vehicleId}`, shift);
    window.dispatchEvent(
      new CustomEvent('vehicle_shift_changed', { detail: { vehicleId, shift } })
    );
  } catch (err) {
    console.error('Error saving shift:', err);
  }
}


