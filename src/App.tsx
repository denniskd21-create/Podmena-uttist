import React, { useState, useEffect, useMemo } from 'react';
import { Vehicle, DriverNote } from './types';
import {
  getStoredVehicles,
  saveStoredVehicles,
  getRecentGarageNumbers,
  addRecentGarageNumber,
  addNoteToVehicle,
  deleteNoteFromVehicle,
  deleteNuanceFromVehicle,
  deleteVehicleFromStore,
  getLastVehicleId,
  saveLastVehicleId,
  getLastSearchTerm,
  saveLastSearchTerm
} from './lib/storage';
import {
  subscribeToVehicles,
  saveVehicleToFirestore,
  deleteVehicleFromFirestore
} from './lib/firebase';
import {
  getNotificationSettings,
  checkVehicleNotifications
} from './lib/notifications';
import { Header } from './components/Header';
import { SearchPad } from './components/SearchPad';
import { VehicleList } from './components/VehicleList';
import { VehicleEditModal } from './components/VehicleEditModal';
import { AddNoteModal } from './components/AddNoteModal';
import { Truck, Plus } from 'lucide-react';

export default function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedColumn, setSelectedColumn] = useState('Все');
  const [selectedShift, setSelectedShift] = useState('Все смены');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [recentGarageNumbers, setRecentGarageNumbers] = useState<string[]>([]);

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [vehicleToEdit, setVehicleToEdit] = useState<Vehicle | null>(null);

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [vehicleForNote, setVehicleForNote] = useState<Vehicle | null>(null);

  // Load state on mount and subscribe to Firestore real-time updates
  useEffect(() => {
    // Fast initial load from local storage
    const loaded = getStoredVehicles();
    setVehicles(loaded);
    setRecentGarageNumbers(getRecentGarageNumbers());

    const savedLastSearch = getLastSearchTerm();
    const savedLastVehId = getLastVehicleId();

    if (savedLastSearch) {
      setSearchTerm(savedLastSearch);
    }

    if (savedLastVehId && loaded.some((v) => v.id === savedLastVehId)) {
      setSelectedVehicleId(savedLastVehId);
    } else if (savedLastSearch) {
      const match = loaded.find(
        (v) =>
          v.garageNumber.toLowerCase() === savedLastSearch.toLowerCase() ||
          v.garageNumber.toLowerCase().includes(savedLastSearch.toLowerCase())
      );
      if (match) setSelectedVehicleId(match.id);
      else setSelectedVehicleId(null);
    } else {
      setSelectedVehicleId(null);
    }

    // Subscribe to Firestore real-time updates across all devices
    const unsubscribe = subscribeToVehicles(
      (remoteVehicles) => {
        setVehicles(remoteVehicles);
        saveStoredVehicles(remoteVehicles);

        // Keep selection valid
        setSelectedVehicleId((currentId) => {
          if (currentId && remoteVehicles.some((v) => v.id === currentId)) {
            return currentId;
          }
          const savedLastVehId = getLastVehicleId();
          if (savedLastVehId && remoteVehicles.some((v) => v.id === savedLastVehId)) {
            return savedLastVehId;
          }
          const currentSearch = getLastSearchTerm();
          if (currentSearch) {
            const match = remoteVehicles.find(
              (v) =>
                v.garageNumber.toLowerCase() === currentSearch.toLowerCase() ||
                v.garageNumber.toLowerCase().includes(currentSearch.toLowerCase()) ||
                v.licensePlate.toLowerCase().includes(currentSearch.toLowerCase())
            );
            if (match) return match.id;
          }
          return null;
        });
      },
      (err) => {
        console.error('Firestore connection error:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  // Filtered vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles.filter((v) => {
      const q = searchTerm.trim().toLowerCase();
      const matchSearch =
        !q ||
        v.garageNumber.toLowerCase().includes(q) ||
        v.licensePlate.toLowerCase().includes(q) ||
        v.brandModel.toLowerCase().includes(q) ||
        v.customerName.toLowerCase().includes(q) ||
        v.mvzCode.toLowerCase().includes(q) ||
        (v.mvzDescription && v.mvzDescription.toLowerCase().includes(q));

      const matchColumn =
        selectedColumn === 'Все' || v.autoColumn === selectedColumn;

      const matchShift =
        selectedShift === 'Все смены' || v.shiftType === selectedShift;

      return matchSearch && matchColumn && matchShift;
    });
  }, [vehicles, searchTerm, selectedColumn, selectedShift]);

  // Derive active selected vehicle
  const selectedVehicle = useMemo(() => {
    if (selectedVehicleId) {
      return vehicles.find((v) => v.id === selectedVehicleId) || null;
    }
    if (filteredVehicles.length === 1) {
      return filteredVehicles[0];
    }
    return null;
  }, [vehicles, selectedVehicleId, filteredVehicles]);

  // Periodic background check for 15-minute point notifications
  useEffect(() => {
    if (!selectedVehicle) return;

    const check = () => {
      const settings = getNotificationSettings();
      if (settings.enabled) {
        checkVehicleNotifications(selectedVehicle, settings);
      }
    };

    check();
    const timer = setInterval(check, 15000); // Check every 15 seconds
    return () => clearInterval(timer);
  }, [selectedVehicle]);

  // Handle Search Input Change
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    saveLastSearchTerm(val);

    // Auto-select exact or first matching vehicle if searching
    if (val.trim()) {
      const q = val.trim().toLowerCase();
      const match = vehicles.find(
        (v) =>
          v.garageNumber.toLowerCase() === q ||
          v.garageNumber.toLowerCase().includes(q) ||
          v.licensePlate.toLowerCase().includes(q)
      );
      if (match) {
        setSelectedVehicleId(match.id);
        saveLastVehicleId(match.id);
      }
    }
  };

  // Select vehicle handler
  const handleSelectVehicle = (id: string) => {
    setSelectedVehicleId(id);
    saveLastVehicleId(id);
    const target = vehicles.find((v) => v.id === id);
    if (target) {
      addRecentGarageNumber(target.garageNumber);
      setRecentGarageNumbers(getRecentGarageNumbers());
      saveLastSearchTerm(target.garageNumber);
    }
  };

  const handleSelectRecentGarageNumber = (num: string) => {
    setSearchTerm(num);
    saveLastSearchTerm(num);
    const target = vehicles.find((v) => v.garageNumber === num);
    if (target) {
      setSelectedVehicleId(target.id);
      saveLastVehicleId(target.id);
    }
  };

  // Save/Update Vehicle to Firestore & local state
  const handleSaveVehicle = async (updatedVehicle: Vehicle) => {
    // Local optimistic update
    const exists = vehicles.some((v) => v.id === updatedVehicle.id);
    let nextVehicles: Vehicle[];
    if (exists) {
      nextVehicles = vehicles.map((v) => (v.id === updatedVehicle.id ? updatedVehicle : v));
    } else {
      nextVehicles = [updatedVehicle, ...vehicles];
    }
    setVehicles(nextVehicles);
    saveStoredVehicles(nextVehicles);
    setSelectedVehicleId(updatedVehicle.id);
    saveLastVehicleId(updatedVehicle.id);
    saveLastSearchTerm(updatedVehicle.garageNumber);
    addRecentGarageNumber(updatedVehicle.garageNumber);
    setRecentGarageNumbers(getRecentGarageNumbers());

    // Save to Firestore
    try {
      await saveVehicleToFirestore(updatedVehicle);
    } catch (err) {
      console.error('Error saving to Firestore:', err);
    }
  };

  // Delete Vehicle from Firestore & local state
  const handleDeleteVehicle = async (vehicleId: string) => {
    const updated = deleteVehicleFromStore(vehicles, vehicleId);
    setVehicles(updated);
    if (selectedVehicleId === vehicleId) {
      const nextId = updated.length > 0 ? updated[0].id : null;
      setSelectedVehicleId(nextId);
      if (nextId) saveLastVehicleId(nextId);
    }

    try {
      await deleteVehicleFromFirestore(vehicleId);
    } catch (err) {
      console.error('Error deleting from Firestore:', err);
    }
  };

  // Save Note to Firestore & local state
  const handleSaveNote = async (vehicleId: string, noteData: Omit<DriverNote, 'id' | 'date'>) => {
    const updated = addNoteToVehicle(vehicles, vehicleId, noteData);
    setVehicles(updated);
    const targetVehicle = updated.find((v) => v.id === vehicleId);
    if (targetVehicle) {
      try {
        await saveVehicleToFirestore(targetVehicle);
      } catch (err) {
        console.error('Error updating note in Firestore:', err);
      }
    }
  };

  // Delete Note from Firestore & local state
  const handleDeleteNote = async (vehicleId: string, noteId: string) => {
    const updated = deleteNoteFromVehicle(vehicles, vehicleId, noteId);
    setVehicles(updated);
    const targetVehicle = updated.find((v) => v.id === vehicleId);
    if (targetVehicle) {
      try {
        await saveVehicleToFirestore(targetVehicle);
      } catch (err) {
        console.error('Error deleting note in Firestore:', err);
      }
    }
  };

  // Delete Nuance from Firestore & local state
  const handleDeleteNuance = async (vehicleId: string, index: number) => {
    const updated = deleteNuanceFromVehicle(vehicles, vehicleId, index);
    setVehicles(updated);
    const targetVehicle = updated.find((v) => v.id === vehicleId);
    if (targetVehicle) {
      try {
        await saveVehicleToFirestore(targetVehicle);
      } catch (err) {
        console.error('Error deleting nuance in Firestore:', err);
      }
    }
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    saveLastSearchTerm('');
    setSelectedColumn('Все');
    setSelectedShift('Все смены');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <Header
        onOpenAddModal={() => {
          setVehicleToEdit(null);
          setIsEditModalOpen(true);
        }}
        totalVehiclesCount={vehicles.length}
        selectedVehicle={selectedVehicle}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5">
        {/* Compact Add Vehicle Banner */}
        <div className="bg-[#14141A] text-white rounded-xl p-2.5 px-3.5 mb-3 border border-slate-800 flex items-center justify-between gap-2 shadow-sm">
          <div className="flex items-center space-x-2 text-xs text-slate-300 min-w-0">
            <Truck className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="truncate font-medium">Если нет автомобиля в базе, добавьте информацию</span>
          </div>
          <button
            onClick={() => {
              setVehicleToEdit(null);
              setIsEditModalOpen(true);
            }}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg flex items-center gap-1 shrink-0 transition-colors shadow-md shadow-blue-600/20"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Добавить ТС</span>
          </button>
        </div>

        {/* Search Input */}
        <SearchPad
          searchTerm={searchTerm}
          onSearchChange={handleSearchChange}
        />

        {/* Vehicles Display Area */}
        <VehicleList
          allVehiclesCount={vehicles.length}
          vehicles={filteredVehicles}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={handleSelectVehicle}
          searchTerm={searchTerm}
          selectedColumn={selectedColumn}
          onSelectColumn={setSelectedColumn}
          selectedShift={selectedShift}
          onSelectShift={setSelectedShift}
          onResetFilters={handleResetFilters}
          onEdit={(v) => {
            setVehicleToEdit(v);
            setIsEditModalOpen(true);
          }}
          onAddNote={(v) => {
            setVehicleForNote(v);
            setIsNoteModalOpen(true);
          }}
          onDeleteVehicle={handleDeleteVehicle}
          onDeleteNote={handleDeleteNote}
          onDeleteNuance={handleDeleteNuance}
        />
      </main>

      {/* Footer */}
      <footer className="bg-[#070708] text-slate-400 text-xs py-5 border-t border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-1">
          <p className="font-semibold text-slate-300">
            УТТиСТ ООО «Газпром добыча Ямбург» — Электронный справочник экипажей и техники
          </p>
        </div>
      </footer>

      {/* Modals */}
      <VehicleEditModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSave={handleSaveVehicle}
        initialVehicle={vehicleToEdit}
        existingVehicles={vehicles}
      />

      <AddNoteModal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        vehicle={vehicleForNote}
        onSaveNote={handleSaveNote}
      />
    </div>
  );
}


