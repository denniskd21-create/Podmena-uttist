import React, { useState, useEffect, useRef } from 'react';
import { Vehicle, VehicleType, AutoColumn, ShiftType } from '../types';
import { X, Save, Truck, Plus, Trash2, Users, Check, User, Phone } from 'lucide-react';
import {
  formatGarageNumber,
  formatLicensePlate,
  formatMvzCode,
  formatPhoneNumber,
  formatTimeInput,
  finalizeTimeFormat
} from '../lib/formatters';

interface VehicleEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (vehicle: Vehicle) => void;
  initialVehicle?: Vehicle | null;
  existingVehicles?: Vehicle[];
}

const VEHICLE_TYPES: VehicleType[] = [
  'легковая',
  'микроавтобус',
  'автобус',
  'вахтовка',
  'самосвал',
  'грузовой',
  'спецтехника'
];

const AUTO_COLUMNS: AutoColumn[] = [
  '1',
  '3',
  '4',
  '5',
  '6',
  '7',
  '9',
  '10'
];

const SHIFT_TYPES: ShiftType[] = ['1-сменка', '2-сменка'];

const PRESET_BRANDS_MODELS = [
  'КАМАЗ (Вахтовка)',
  'КАМАЗ (Самосвал)',
  'КАМАЗ (Грузовой)',
  'УРАЛ (Вахтовка)',
  'УРАЛ (Грузовой)',
  'НЕФАЗ (Автобус)',
  'ПАЗ (Микроавтобус)',
  'ГАЗель NEXT',
  'УАЗ Патриот',
  'УАЗ Профи',
  'Трэкол 6х6',
  'МТЗ-82'
];

interface CrewMemberItem {
  name: string;
  phone: string;
}

interface CustomerContactItem {
  name: string;
  phone: string;
}

export const VehicleEditModal: React.FC<VehicleEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialVehicle,
  existingVehicles = []
}) => {
  const [garageNumber, setGarageNumber] = useState('');
  const [duplicateError, setDuplicateError] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [brandModel, setBrandModel] = useState('');
  const [showBrandSuggestions, setShowBrandSuggestions] = useState(false);
  const brandInputRef = useRef<HTMLInputElement>(null);

  const [vehicleType, setVehicleType] = useState<VehicleType>('вахтовка');
  const [autoColumn, setAutoColumn] = useState<AutoColumn>('1');
  const [shiftType, setShiftType] = useState<ShiftType>('1-сменка');

  const [departureTime, setDepartureTime] = useState('06:00');
  const [returnTime, setReturnTime] = useState('18:00');

  // 2-Shift specific inputs
  const [shift1Departure, setShift1Departure] = useState('06:00');
  const [shift1Return, setShift1Return] = useState('18:00');

  const [shift2Departure, setShift2Departure] = useState('18:00');
  const [shift2Return, setShift2Return] = useState('06:00');

  const [parkingSpot, setParkingSpot] = useState('');
  const [pickupPointsText, setPickupPointsText] = useState('');
  const [shift1PickupPointsText, setShift1PickupPointsText] = useState('');
  const [shift2PickupPointsText, setShift2PickupPointsText] = useState('');

  const [customerName, setCustomerName] = useState('');
  const [customerContacts, setCustomerContacts] = useState<CustomerContactItem[]>([
    { name: '', phone: '' }
  ]);
  const [customerNotes, setCustomerNotes] = useState('');
  const [customerNotesShift1, setCustomerNotesShift1] = useState('');
  const [customerNotesShift2, setCustomerNotesShift2] = useState('');
  const [mvzCode, setMvzCode] = useState('');
  const [mvzDescription, setMvzDescription] = useState('');
  const [submissionLocation, setSubmissionLocation] = useState('');
  const [techNuancesText, setTechNuancesText] = useState('');

  // Dynamic Crew Members (up to 4 drivers - only name and phone, no status/shift input)
  const [crewMembers, setCrewMembers] = useState<CrewMemberItem[]>([
    { name: '', phone: '' },
    { name: '', phone: '' }
  ]);

  // Extract unique brand/models from existing database + presets
  const availableBrandModels = React.useMemo(() => {
    const set = new Set<string>(PRESET_BRANDS_MODELS);
    existingVehicles.forEach((v) => {
      if (v.brandModel && v.brandModel.trim()) {
        set.add(v.brandModel.trim());
      }
    });
    return Array.from(set);
  }, [existingVehicles]);

  const filteredBrandSuggestions = React.useMemo(() => {
    if (!brandModel.trim()) return availableBrandModels;
    const query = brandModel.toLowerCase().trim();
    return availableBrandModels.filter((b) => b.toLowerCase().includes(query));
  }, [availableBrandModels, brandModel]);

  // Live route input mask: converts e.g. "930" -> "09:30 — ", "1245" -> "12:45 — "
  const autoFormatRouteLive = (val: string): string => {
    if (!val) return '';
    const lines = val.split('\n');

    const formattedLines = lines.map((line) => {
      // If line already starts with formatted HH:MM —
      if (/^\d{2}:\d{2}\s*—/.test(line)) {
        return line;
      }

      // Match 4 digits at start of line, e.g. "1245" -> "12:45 — ", "0930" -> "09:30 — "
      const fourDigitsMatch = line.match(/^(\d{4})(\s*.*)$/);
      if (fourDigitsMatch) {
        const digits = fourDigitsMatch[1];
        const rest = fourDigitsMatch[2] || '';
        const hh = digits.slice(0, 2);
        const mm = digits.slice(2, 4);

        const hNum = parseInt(hh, 10);
        const mNum = parseInt(mm, 10);

        if (hNum <= 23 && mNum <= 59) {
          const cleanRest = rest.replace(/^[\s—\-]+/, '');
          return `${hh}:${mm} — ${cleanRest}`;
        }
      }

      // Match 3 digits at start of line, e.g. "930", "124", "235"
      const threeDigitsMatch = line.match(/^(\d{3})(\s*.*)$/);
      if (threeDigitsMatch) {
        const digits = threeDigitsMatch[1];
        const rest = threeDigitsMatch[2] || '';
        const d0 = digits[0];

        // If first digit is 3..9 (e.g. "930", "615"), hour MUST be 1 digit!
        if (/[3-9]/.test(d0)) {
          const hh = '0' + d0;
          const mm = digits.slice(1, 3);
          const hNum = parseInt(hh, 10);
          const mNum = parseInt(mm, 10);

          if (hNum <= 23 && mNum <= 59) {
            const cleanRest = rest.replace(/^[\s—\-]+/, '');
            return `${hh}:${mm} — ${cleanRest}`;
          }
        }

        // If first digit is 0..2 (e.g. "124", "235"), user might be typing 4 digits ("1245").
        // Convert ONLY if there is a space, dash, or delimiter after the 3 digits (e.g. "124 " or "124-")
        if (/[0-2]/.test(d0) && /^[\s—\-]+/.test(rest)) {
          const hh = '0' + d0;
          const mm = digits.slice(1, 3);
          const hNum = parseInt(hh, 10);
          const mNum = parseInt(mm, 10);

          if (hNum <= 23 && mNum <= 59) {
            const cleanRest = rest.replace(/^[\s—\-]+/, '');
            return `${hh}:${mm} — ${cleanRest}`;
          }
        }
      }

      // Match "H:MM" or "HH:MM" at start of line (e.g. "9:30" or "09:30 ")
      const timeMatch = line.match(/^(\d{1,2}):(\d{2})(\s*.*)$/);
      if (timeMatch) {
        const hh = timeMatch[1].padStart(2, '0');
        const mm = timeMatch[2];
        const rest = timeMatch[3] || '';

        const hNum = parseInt(hh, 10);
        const mNum = parseInt(mm, 10);

        if (hNum <= 23 && mNum <= 59) {
          const cleanRest = rest.replace(/^[\s—\-]+/, '');
          return `${hh}:${mm} — ${cleanRest}`;
        }
      }

      return line;
    });

    return formattedLines.join('\n');
  };

  const formatRouteOnBlur = (val: string): string => {
    if (!val) return '';
    const lines = val.split('\n');
    const formatted = lines.map((line) => {
      if (/^\d{2}:\d{2}\s*—/.test(line)) return line;
      const match = line.match(/^(\d{3})(\s*.*)$/);
      if (match) {
        const digits = match[1];
        const rest = match[2] || '';
        const hh = '0' + digits[0];
        const mm = digits.slice(1, 3);
        const hNum = parseInt(hh, 10);
        const mNum = parseInt(mm, 10);

        if (hNum <= 23 && mNum <= 59) {
          const cleanRest = rest.replace(/^[\s—\-]+/, '');
          return `${hh}:${mm} — ${cleanRest}`;
        }
      }
      return line;
    });
    return formatted.join('\n');
  };

  const handleGarageNumberChange = (val: string) => {
    const formatted = formatGarageNumber(val);
    setGarageNumber(formatted);
    const clean = formatted.trim();

    if (clean.length > 0) {
      const duplicate = existingVehicles.some(
        (v) => v.garageNumber.toLowerCase() === clean.toLowerCase() && v.id !== initialVehicle?.id
      );
      if (duplicate) {
        setDuplicateError(`Автомобиль с гаражным номером "${clean}" уже существует в базе!`);
        return;
      }
    }
    setDuplicateError('');
  };

  useEffect(() => {
    setDuplicateError('');
    if (initialVehicle) {
      setGarageNumber(formatGarageNumber(initialVehicle.garageNumber || ''));
      setLicensePlate(formatLicensePlate(initialVehicle.licensePlate || ''));
      setBrandModel(initialVehicle.brandModel || '');
      setVehicleType(initialVehicle.vehicleType || 'вахтовка');
      setAutoColumn(initialVehicle.autoColumn || '1');
      setShiftType(initialVehicle.shiftType || '1-сменка');

      setDepartureTime(initialVehicle.departureTime || initialVehicle.shift1Departure || '06:00');
      setReturnTime(initialVehicle.returnTime || initialVehicle.shift1Return || '18:00');

      setShift1Departure(initialVehicle.shift1Departure || initialVehicle.departureTime || '06:00');
      setShift1Return(initialVehicle.shift1Return || initialVehicle.returnTime || '18:00');

      setShift2Departure(initialVehicle.shift2Departure || '18:00');
      setShift2Return(initialVehicle.shift2Return || '06:00');

      setParkingSpot(initialVehicle.parkingSpot || '');
      setPickupPointsText((initialVehicle.pickupPoints || []).join('\n'));
      setShift1PickupPointsText((initialVehicle.shift1PickupPoints || initialVehicle.pickupPoints || []).join('\n'));
      setShift2PickupPointsText((initialVehicle.shift2PickupPoints || []).join('\n'));

      setCustomerName(initialVehicle.customerName || '');
      if (initialVehicle.customerContacts && initialVehicle.customerContacts.length > 0) {
        setCustomerContacts(
          initialVehicle.customerContacts.map((c) => ({
            name: c.name || '',
            phone: formatPhoneNumber(c.phone || '')
          }))
        );
      } else {
        const initialContacts: CustomerContactItem[] = [];
        if (initialVehicle.customerContactName || initialVehicle.customerPhone) {
          initialContacts.push({
            name: initialVehicle.customerContactName || '',
            phone: formatPhoneNumber(initialVehicle.customerPhone || '')
          });
        }
        if (initialVehicle.customerContact2Name || initialVehicle.customerPhone2) {
          initialContacts.push({
            name: initialVehicle.customerContact2Name || '',
            phone: formatPhoneNumber(initialVehicle.customerPhone2 || '')
          });
        }
        if (initialContacts.length === 0) {
          initialContacts.push({ name: '', phone: '' });
        }
        setCustomerContacts(initialContacts);
      }
      setCustomerNotes(initialVehicle.customerNotes || '');
      setCustomerNotesShift1(initialVehicle.customerNotesShift1 || initialVehicle.customerNotes || '');
      setCustomerNotesShift2(initialVehicle.customerNotesShift2 || '');
      setMvzCode(formatMvzCode(initialVehicle.mvzCode || ''));
      setMvzDescription(initialVehicle.mvzDescription || '');
      setSubmissionLocation(initialVehicle.submissionLocation || '');
      setTechNuancesText((initialVehicle.techNuances || []).join('\n'));

      if (initialVehicle.crewMembers && initialVehicle.crewMembers.length > 0) {
        setCrewMembers(
          initialVehicle.crewMembers.map((m) => ({
            name: m.name || '',
            phone: formatPhoneNumber(m.phone || '')
          }))
        );
      } else {
        const legacyCrew: CrewMemberItem[] = [];
        if (initialVehicle.shift1Driver) {
          legacyCrew.push({ name: initialVehicle.shift1Driver, phone: '' });
        }
        if (initialVehicle.shift2Driver) {
          legacyCrew.push({ name: initialVehicle.shift2Driver, phone: '' });
        }
        if (legacyCrew.length === 0) {
          legacyCrew.push({ name: '', phone: '' });
        }
        setCrewMembers(legacyCrew);
      }
    } else {
      // Reset
      setGarageNumber('');
      setLicensePlate('');
      setBrandModel('');
      setVehicleType('вахтовка');
      setAutoColumn('1');
      setShiftType('1-сменка');
      setDepartureTime('06:00');
      setReturnTime('18:00');
      setShift1Departure('06:00');
      setShift1Return('18:00');
      setShift2Departure('18:00');
      setShift2Return('06:00');
      setParkingSpot('');
      setPickupPointsText('');
      setShift1PickupPointsText('');
      setShift2PickupPointsText('');
      setCustomerName('');
      setCustomerContacts([{ name: '', phone: '' }]);
      setCustomerNotes('');
      setCustomerNotesShift1('');
      setCustomerNotesShift2('');
      setMvzCode('');
      setMvzDescription('');
      setSubmissionLocation('');
      setTechNuancesText('');
      setCrewMembers([
        { name: '', phone: '' },
        { name: '', phone: '' }
      ]);
    }
  }, [initialVehicle, isOpen]);

  if (!isOpen) return null;

  const handleAddCrewMember = () => {
    if (crewMembers.length >= 4) return;
    setCrewMembers([...crewMembers, { name: '', phone: '' }]);
  };

  const handleRemoveCrewMember = (index: number) => {
    setCrewMembers(crewMembers.filter((_, i) => i !== index));
  };

  const handleCrewChange = (index: number, field: keyof CrewMemberItem, value: string) => {
    const updated = [...crewMembers];
    if (field === 'phone') {
      updated[index].phone = formatPhoneNumber(value);
    } else {
      updated[index][field] = value;
    }
    setCrewMembers(updated);
  };

  const handleAddCustomerContact = () => {
    if (customerContacts.length >= 4) return;
    setCustomerContacts([...customerContacts, { name: '', phone: '' }]);
  };

  const handleRemoveCustomerContact = (index: number) => {
    if (customerContacts.length <= 1) {
      setCustomerContacts([{ name: '', phone: '' }]);
    } else {
      setCustomerContacts(customerContacts.filter((_, i) => i !== index));
    }
  };

  const handleCustomerContactChange = (index: number, field: keyof CustomerContactItem, value: string) => {
    const updated = [...customerContacts];
    if (field === 'phone') {
      updated[index].phone = formatPhoneNumber(value);
    } else {
      updated[index][field] = value;
    }
    setCustomerContacts(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanGarage = garageNumber.trim();
    const isNew = !initialVehicle;

    if (isNew && cleanGarage) {
      const duplicate = existingVehicles.some(
        (v) => v.garageNumber.toLowerCase() === cleanGarage.toLowerCase()
      );
      if (duplicate) {
        setDuplicateError(`Автомобиль с гаражным номером "${cleanGarage}" уже существует в базе!`);
        return;
      }
    }

    const pickupPoints = pickupPointsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const shift1PickupPoints = shift1PickupPointsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const shift2PickupPoints = shift2PickupPointsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const techNuances = techNuancesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const defaultRoles = ['1 смена (день)', '2 смена (ночь)', '3 смена', 'Подменный'];

    const validCrewMembers = crewMembers
      .map((m, idx) => ({
        name: m.name.trim(),
        phone: m.phone.trim(),
        role: defaultRoles[idx] || 'Основной'
      }))
      .filter((m) => m.name.length > 0);

    const validContacts = customerContacts.filter(
      (c) => c.name.trim() !== '' || c.phone.trim() !== ''
    );

    const updatedVehicle: Vehicle = {
      id: initialVehicle ? initialVehicle.id : 'veh-' + Date.now(),
      garageNumber: garageNumber.trim() || '—',
      licensePlate: licensePlate.trim() || '—',
      brandModel: brandModel.trim() || 'Автомобиль',
      vehicleType,
      autoColumn,
      shiftType,

      departureTime: shiftType === '2-сменка'
        ? finalizeTimeFormat(shift1Departure, '06:00')
        : finalizeTimeFormat(departureTime, '06:00'),
      returnTime: shiftType === '2-сменка'
        ? finalizeTimeFormat(shift1Return, '18:00')
        : finalizeTimeFormat(returnTime, '18:00'),

      shift1Departure: finalizeTimeFormat(shift1Departure, '06:00'),
      shift1Return: finalizeTimeFormat(shift1Return, '18:00'),
      shift1Driver: validCrewMembers[0]?.name || '',

      shift2Departure: finalizeTimeFormat(shift2Departure, '18:00'),
      shift2Return: finalizeTimeFormat(shift2Return, '06:00'),
      shift2Driver: validCrewMembers[1]?.name || '',

      parkingSpot: parkingSpot.trim(),
      pickupPoints: pickupPoints.length > 0 ? pickupPoints : shift1PickupPoints,
      shift1PickupPoints: shift1PickupPoints.length > 0 ? shift1PickupPoints : pickupPoints,
      shift2PickupPoints: shift2PickupPoints,

      customerName: customerName.trim(),
      customerContactName: validContacts[0]?.name.trim() || '',
      customerPhone: validContacts[0]?.phone.trim() || '',
      customerContact2Name: validContacts[1]?.name.trim() || '',
      customerPhone2: validContacts[1]?.phone.trim() || '',
      customerContacts: validContacts.map((c) => ({
        name: c.name.trim(),
        phone: c.phone.trim()
      })),
      customerNotes: customerNotes.trim() || customerNotesShift1.trim(),
      customerNotesShift1: customerNotesShift1.trim(),
      customerNotesShift2: customerNotesShift2.trim(),
      mvzCode: mvzCode.trim(),
      mvzDescription: mvzDescription.trim(),
      submissionLocation: submissionLocation.trim(),
      techNuances,
      crewMembers: validCrewMembers,
      notes: initialVehicle ? initialVehicle.notes : [],
      lastUpdated: new Date().toISOString()
    };

    onSave(updatedVehicle);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-[#0F0F12] border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-fadeIn text-slate-100">
        {/* Header */}
        <div className="bg-[#141419] border-b border-slate-800 text-white p-4 px-6 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-400" />
            {initialVehicle ? `Редактирование автомобиля ${initialVehicle.garageNumber}` : 'Добавление автомобиля'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Duplicate Error Alert */}
          {duplicateError && (
            <div className="bg-rose-950/90 border border-rose-800 text-rose-200 p-3 rounded-xl flex items-center gap-2 text-xs font-bold animate-fadeIn">
              <span className="text-base">⚠️</span>
              <span>{duplicateError}</span>
            </div>
          )}

          {/* Main Specs */}
          <div className="bg-[#14141A] p-4 rounded-xl border border-slate-800 space-y-3">
            <h3 className="font-bold text-white text-xs">1. Основная информация</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Гаражный номер
                </label>
                <input
                  type="text"
                  placeholder="0142"
                  maxLength={4}
                  value={garageNumber}
                  onChange={(e) => handleGarageNumberChange(e.target.value)}
                  className={`w-full p-2 bg-[#1A1A22] border rounded-lg font-mono font-bold text-white tracking-widest ${
                    duplicateError ? 'border-rose-500 focus:border-rose-500 ring-1 ring-rose-500' : 'border-slate-700'
                  }`}
                />
                {duplicateError && (
                  <p className="text-[11px] text-rose-400 font-bold mt-1 animate-fadeIn">
                    ⚠️ {duplicateError}
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Госномер
                </label>
                <input
                  type="text"
                  placeholder="Х000ХХ00"
                  maxLength={12}
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(formatLicensePlate(e.target.value))}
                  className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg font-mono uppercase text-white font-bold tracking-wider"
                />
              </div>

              {/* Brand & Model with Autocomplete */}
              <div className="relative">
                <label className="block font-semibold text-slate-300 mb-1">
                  Марка и Модель
                </label>
                <input
                  ref={brandInputRef}
                  type="text"
                  placeholder="КАМАЗ (Вахтовка)"
                  value={brandModel}
                  onFocus={() => setShowBrandSuggestions(true)}
                  onChange={(e) => {
                    setBrandModel(e.target.value);
                    setShowBrandSuggestions(true);
                  }}
                  className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white font-medium"
                />

                {/* Suggestions Dropdown */}
                {showBrandSuggestions && filteredBrandSuggestions.length > 0 && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setShowBrandSuggestions(false)}
                    />
                    <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-[#1A1A22] border border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto py-1 text-slate-200">
                      <div className="px-3 py-1 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800">
                        Предложения из базы
                      </div>
                      {filteredBrandSuggestions.map((item) => (
                        <button
                          key={item}
                          type="button"
                          onClick={() => {
                            setBrandModel(item);
                            setShowBrandSuggestions(false);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-blue-600/30 hover:text-white transition-colors flex items-center justify-between text-xs"
                        >
                          <span>{item}</span>
                          {brandModel === item && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Тип автомобиля</label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white font-medium"
                >
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-[#1A1A22] text-white">{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Колонна</label>
                <select
                  value={autoColumn}
                  onChange={(e) => setAutoColumn(e.target.value as AutoColumn)}
                  className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white font-medium"
                >
                  {AUTO_COLUMNS.map((col) => (
                    <option key={col} value={col} className="bg-[#1A1A22] text-white">Колонна {col}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Смена</label>
                <select
                  value={shiftType}
                  onChange={(e) => setShiftType(e.target.value as ShiftType)}
                  className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white font-medium"
                >
                  {SHIFT_TYPES.map((st) => (
                    <option key={st} value={st} className="bg-[#1A1A22] text-white">{st}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Schedule & Shift details */}
          <div className="bg-[#14141A] p-4 rounded-xl border border-slate-800 space-y-3">
            <h3 className="font-bold text-white text-xs">2. График работы и маршруты</h3>

            {shiftType === '2-сменка' ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-[#1A1A22] rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-blue-400 block">1-я Смена (время):</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Выезд</label>
                        <input
                          type="text"
                          placeholder="06:00"
                          maxLength={5}
                          value={shift1Departure}
                          onChange={(e) => setShift1Departure(formatTimeInput(e.target.value))}
                          onBlur={(e) => setShift1Departure(finalizeTimeFormat(e.target.value, '06:00'))}
                          className="w-full p-1.5 bg-[#0F0F12] border border-slate-700 rounded text-white font-mono text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Возврат</label>
                        <input
                          type="text"
                          placeholder="18:00"
                          maxLength={5}
                          value={shift1Return}
                          onChange={(e) => setShift1Return(formatTimeInput(e.target.value))}
                          onBlur={(e) => setShift1Return(finalizeTimeFormat(e.target.value, '18:00'))}
                          className="w-full p-1.5 bg-[#0F0F12] border border-slate-700 rounded text-white font-mono text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-[#1A1A22] rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-blue-400 block">2-я Смена (время):</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Выезд</label>
                        <input
                          type="text"
                          placeholder="18:00"
                          maxLength={5}
                          value={shift2Departure}
                          onChange={(e) => setShift2Departure(formatTimeInput(e.target.value))}
                          onBlur={(e) => setShift2Departure(finalizeTimeFormat(e.target.value, '18:00'))}
                          className="w-full p-1.5 bg-[#0F0F12] border border-slate-700 rounded text-white font-mono text-center"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Возврат</label>
                        <input
                          type="text"
                          placeholder="06:00"
                          maxLength={5}
                          value={shift2Return}
                          onChange={(e) => setShift2Return(formatTimeInput(e.target.value))}
                          onBlur={(e) => setShift2Return(finalizeTimeFormat(e.target.value, '06:00'))}
                          className="w-full p-1.5 bg-[#0F0F12] border border-slate-700 rounded text-white font-mono text-center"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Время выезда
                  </label>
                  <input
                    type="text"
                    placeholder="06:00"
                    maxLength={5}
                    value={departureTime}
                    onChange={(e) => setDepartureTime(formatTimeInput(e.target.value))}
                    onBlur={(e) => setDepartureTime(finalizeTimeFormat(e.target.value, '06:00'))}
                    className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg font-mono text-white text-center"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Время возврата
                  </label>
                  <input
                    type="text"
                    placeholder="18:00"
                    maxLength={5}
                    value={returnTime}
                    onChange={(e) => setReturnTime(formatTimeInput(e.target.value))}
                    onBlur={(e) => setReturnTime(finalizeTimeFormat(e.target.value, '18:00'))}
                    className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg font-mono text-white text-center"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Место стоянки / Бокс</label>
              <input
                type="text"
                placeholder="Бокс №4"
                value={parkingSpot}
                onChange={(e) => setParkingSpot(e.target.value)}
                className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white"
              />
            </div>

            {shiftType === '2-сменка' ? (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block font-semibold text-blue-300 mb-1">
                    Маршрут и точки сбора 1-Й СМЕНЫ (по 1 строке):
                  </label>
                  <textarea
                    rows={2}
                    placeholder={'930 — Площадка №4\n1830 — Посёлок №3'}
                    value={shift1PickupPointsText}
                    onChange={(e) => setShift1PickupPointsText(autoFormatRouteLive(e.target.value))}
                    onBlur={(e) => setShift1PickupPointsText(formatRouteOnBlur(e.target.value))}
                    className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg font-mono text-white placeholder-slate-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-blue-300 mb-1">
                    Маршрут и точки сбора 2-Й СМЕНЫ (по 1 строке):
                  </label>
                  <textarea
                    rows={2}
                    placeholder={'1830 — Площадка №4\n1845 — Посёлок №3'}
                    value={shift2PickupPointsText}
                    onChange={(e) => setShift2PickupPointsText(autoFormatRouteLive(e.target.value))}
                    onBlur={(e) => setShift2PickupPointsText(formatRouteOnBlur(e.target.value))}
                    className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg font-mono text-white placeholder-slate-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Точки сбора / маршрут (по 1 строке):
                </label>
                <textarea
                  rows={2}
                  placeholder={'630 — Площадка №4\n700 — ГП-2'}
                  value={pickupPointsText}
                  onChange={(e) => setPickupPointsText(autoFormatRouteLive(e.target.value))}
                  onBlur={(e) => setPickupPointsText(formatRouteOnBlur(e.target.value))}
                  className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg font-mono text-white placeholder-slate-500"
                />
              </div>
            )}
          </div>

          {/* Dynamic Crew Members Section - NO shift/role input as requested */}
          <div className="bg-[#14141A] p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
              <h3 className="font-bold text-white text-xs flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-400" />
                3. Водители ТС
              </h3>
              {crewMembers.length < 4 && (
                <button
                  type="button"
                  onClick={handleAddCrewMember}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-900/40 active:scale-95 shrink-0"
                >
                  <Plus className="w-4 h-4 text-white" />
                  <span>Добавить водителя</span>
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {crewMembers.map((member, idx) => (
                <div key={idx} className="bg-[#1A1A22] p-3 rounded-xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-slate-400 font-bold text-[11px]">
                    <span>Водитель #{idx + 1}</span>
                    {crewMembers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveCrewMember(idx)}
                        className="text-rose-400 hover:text-rose-300 p-0.5 rounded transition-colors"
                        title="Удалить водителя"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">ФИО водителя (полностью)</label>
                      <input
                        type="text"
                        placeholder="Иванов Иван Иванович"
                        value={member.name}
                        onChange={(e) => handleCrewChange(idx, 'name', e.target.value)}
                        className="w-full p-2 bg-[#0F0F12] border border-slate-700 rounded-lg text-white font-medium"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-400 block mb-0.5">Телефон</label>
                      <input
                        type="text"
                        placeholder="+7 (000) 000-00-00"
                        value={member.phone}
                        onFocus={() => {
                          if (!member.phone) handleCrewChange(idx, 'phone', '+7');
                        }}
                        onChange={(e) => handleCrewChange(idx, 'phone', e.target.value)}
                        className="w-full p-2 bg-[#0F0F12] border border-slate-700 rounded-lg font-mono text-white"
                      />
                    </div>
                  </div>
                </div>
              ))}

              {crewMembers.length < 4 && (
                <button
                  type="button"
                  onClick={handleAddCrewMember}
                  className="w-full py-2.5 px-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/60 hover:border-blue-400 text-blue-200 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-sm"
                >
                  <Plus className="w-4 h-4 text-blue-400" />
                  <span>+ Добавить водителя</span>
                </button>
              )}
            </div>
          </div>

          {/* Customer & MVZ */}
          <div className="bg-[#14141A] p-4 rounded-xl border border-slate-800 space-y-3">
            <h3 className="font-bold text-white text-xs">4. Заказчик и Код МВЗ</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Заказчик</label>
                <input
                  type="text"
                  placeholder="УЭВП"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white font-medium"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Код МВЗ
                </label>
                <input
                  type="text"
                  placeholder="4502120100"
                  maxLength={10}
                  value={mvzCode}
                  onChange={(e) => setMvzCode(formatMvzCode(e.target.value))}
                  className="w-full p-2 bg-blue-950/80 border border-blue-800 rounded-lg font-mono font-bold text-blue-200 tracking-wider"
                />
              </div>
            </div>

            {/* Dynamic Customer Contacts Section - exactly like drivers */}
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-400" />
                  Контактные лица заказчика
                </span>
                {customerContacts.length < 4 && (
                  <button
                    type="button"
                    onClick={handleAddCustomerContact}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md shadow-blue-900/40 active:scale-95 shrink-0"
                  >
                    <Plus className="w-4 h-4 text-white" />
                    <span>Добавить контактное лицо</span>
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {customerContacts.map((contact, idx) => (
                  <div key={idx} className="bg-[#1A1A22] p-3 rounded-xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-slate-400 font-bold text-[11px]">
                      <span>Контактное лицо #{idx + 1}</span>
                      {customerContacts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomerContact(idx)}
                          className="text-rose-400 hover:text-rose-300 p-0.5 rounded transition-colors"
                          title="Удалить контактное лицо"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">
                          ФИО / Должность
                        </label>
                        <input
                          type="text"
                          placeholder="Диспетчер Петрова Е.В. / Мастер"
                          value={contact.name}
                          onChange={(e) => handleCustomerContactChange(idx, 'name', e.target.value)}
                          className="w-full p-2 bg-[#0F0F12] border border-slate-700 rounded-lg text-white font-medium"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">
                          Телефон
                        </label>
                        <input
                          type="text"
                          placeholder="+7 (34949) 6-12-34"
                          value={contact.phone}
                          onFocus={() => {
                            if (!contact.phone) handleCustomerContactChange(idx, 'phone', '+7');
                          }}
                          onChange={(e) => handleCustomerContactChange(idx, 'phone', e.target.value)}
                          className="w-full p-2 bg-[#0F0F12] border border-slate-700 rounded-lg font-mono text-white"
                        />
                      </div>
                    </div>
                  </div>
                ))}

                {customerContacts.length < 4 && (
                  <button
                    type="button"
                    onClick={handleAddCustomerContact}
                    className="w-full py-2.5 px-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/60 hover:border-blue-400 text-blue-200 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-sm"
                  >
                    <Plus className="w-4 h-4 text-blue-400" />
                    <span>+ Добавить контактное лицо</span>
                  </button>
                )}
              </div>
            </div>

            {shiftType === '2-сменка' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Особенности по заказчику (1-я смена)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="1 смена: Подняться в каб. 204 к мастеру..."
                    value={customerNotesShift1}
                    onChange={(e) => setCustomerNotesShift1(e.target.value)}
                    className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white placeholder-slate-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-300 mb-1">
                    Особенности по заказчику (2-я смена)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="2 смена: Подписать путевой у дежурного диспетчера..."
                    value={customerNotesShift2}
                    onChange={(e) => setCustomerNotesShift2(e.target.value)}
                    className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white placeholder-slate-500"
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Особенности для водителя по заказчику / Инструкции
                </label>
                <textarea
                  rows={2}
                  placeholder="Подняться в каб. 204, найти Иванова А.В., подписать путевой лист у диспетчера..."
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white placeholder-slate-500"
                />
              </div>
            )}
          </div>

          {/* Tech Nuances */}
          <div className="bg-[#14141A] p-4 rounded-xl border border-slate-800 space-y-2">
            <h3 className="font-bold text-white text-xs">5. Особенности машины</h3>
            <textarea
              rows={2}
              placeholder="Вторая передача включается плавно&#10;Замок водительской двери с нюансом"
              value={techNuancesText}
              onChange={(e) => setTechNuancesText(e.target.value)}
              className="w-full p-2 bg-[#1A1A22] border border-slate-700 rounded-lg text-white"
            />
          </div>

          {/* Footer controls */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!!duplicateError}
              className={`px-5 py-2 text-white rounded-lg font-semibold flex items-center gap-2 shadow-md transition-colors ${
                duplicateError
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed opacity-60'
                  : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
              }`}
            >
              <Save className="w-4 h-4" />
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
