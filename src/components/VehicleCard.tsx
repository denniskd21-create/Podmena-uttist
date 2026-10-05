import React, { useState, useEffect } from 'react';
import { Vehicle } from '../types';
import { getSavedShiftForVehicle, saveShiftForVehicle } from '../lib/storage';
import { formatPointCountdown, getPointTargetTimestamp } from '../lib/notifications';
import {
  Clock,
  MapPin,
  Building,
  AlertTriangle,
  UserCheck,
  Phone,
  MessageSquarePlus,
  Edit,
  Trash2,
  ShieldAlert,
  FileText,
  User,
  Plus,
  Share2,
  Check
} from 'lucide-react';

interface VehicleCardProps {
  vehicle: Vehicle;
  onEdit: (vehicle: Vehicle) => void;
  onAddNote: (vehicle: Vehicle) => void;
  onDeleteVehicle: (vehicleId: string) => void;
  onDeleteNote: (vehicleId: string, noteId: string) => void;
  onDeleteNuance: (vehicleId: string, index: number) => void;
}

export const VehicleCard: React.FC<VehicleCardProps> = ({
  vehicle,
  onEdit,
  onAddNote,
  onDeleteVehicle,
  onDeleteNote,
  onDeleteNuance
}) => {
  const [activeShiftTab, setActiveShiftTab] = useState<'1' | '2'>(() =>
    getSavedShiftForVehicle(vehicle.id)
  );
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [isSharedCopied, setIsSharedCopied] = useState(false);
  const [, setTick] = useState(0);

  // 1-second interval live ticker & event subscription for real-time second precision
  useEffect(() => {
    const handleTick = () => setTick((t) => t + 1);
    window.addEventListener('podmena_second_tick', handleTick);
    window.addEventListener('podmena_notification_fired', handleTick);
    window.addEventListener('podmena_schedule_updated', handleTick);
    const timer = setInterval(handleTick, 1000);
    return () => {
      window.removeEventListener('podmena_second_tick', handleTick);
      window.removeEventListener('podmena_notification_fired', handleTick);
      window.removeEventListener('podmena_schedule_updated', handleTick);
      clearInterval(timer);
    };
  }, []);

  // Sync saved shift when vehicle ID changes
  useEffect(() => {
    setActiveShiftTab(getSavedShiftForVehicle(vehicle.id));
    setShowConfirmDelete(false);
  }, [vehicle.id]);

  // Listen for shift change events
  useEffect(() => {
    const handleShiftChange = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.vehicleId === vehicle.id && custom.detail?.shift) {
        setActiveShiftTab(custom.detail.shift);
      }
    };
    window.addEventListener('vehicle_shift_changed', handleShiftChange);
    return () => window.removeEventListener('vehicle_shift_changed', handleShiftChange);
  }, [vehicle.id]);

  const handleShiftTabClick = (shift: '1' | '2') => {
    setActiveShiftTab(shift);
    saveShiftForVehicle(vehicle.id, shift);
  };

  const handleDeleteConfirm = () => {
    setShowConfirmDelete(false);
    onDeleteVehicle(vehicle.id);
  };

  const handleShare = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}#${vehicle.garageNumber}`;
    const shareTitle = `УТТиСТ Подменный Водитель — ТС ${vehicle.garageNumber}`;
    const shareText = `Автомобиль ${vehicle.brandModel} (гар. № ${vehicle.garageNumber}, гос. ${vehicle.licensePlate}), Колонна ${vehicle.autoColumn}, Заказчик: ${vehicle.customerName}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        setIsSharedCopied(true);
        setTimeout(() => setIsSharedCopied(false), 2500);
        return;
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
      }
    }

    // Fallback: Copy to clipboard
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareUrl;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setIsSharedCopied(true);
      setTimeout(() => setIsSharedCopied(false), 2500);
    } catch (e) {
      console.error('Failed to copy share link', e);
    }
  };

  const isTwoShift = vehicle.shiftType === '2-сменка';

  // Determine current active pickup points / route based on selected shift
  const currentPickupPoints = isTwoShift
    ? (activeShiftTab === '1'
        ? (vehicle.shift1PickupPoints && vehicle.shift1PickupPoints.length > 0 ? vehicle.shift1PickupPoints : vehicle.pickupPoints)
        : (vehicle.shift2PickupPoints && vehicle.shift2PickupPoints.length > 0 ? vehicle.shift2PickupPoints : []))
    : vehicle.pickupPoints;

  // Determine active customer notes based on selected shift
  const activeCustomerNotes = isTwoShift
    ? (activeShiftTab === '1'
        ? (vehicle.customerNotesShift1 || vehicle.customerNotes)
        : (vehicle.customerNotesShift2 || ''))
    : (vehicle.customerNotes || vehicle.customerNotesShift1);

  // Derive customer contacts list for vehicle card
  const customerContactsList = React.useMemo(() => {
    if (vehicle.customerContacts && vehicle.customerContacts.length > 0) {
      const filtered = vehicle.customerContacts.filter(
        (c) => (c.name && c.name.trim()) || (c.phone && c.phone.trim())
      );
      if (filtered.length > 0) return filtered;
    }
    const list: { name: string; phone: string }[] = [];
    if (vehicle.customerContactName || vehicle.customerPhone) {
      list.push({
        name: vehicle.customerContactName || '',
        phone: vehicle.customerPhone || ''
      });
    }
    if (vehicle.customerContact2Name || vehicle.customerPhone2) {
      list.push({
        name: vehicle.customerContact2Name || '',
        phone: vehicle.customerPhone2 || ''
      });
    }
    return list;
  }, [vehicle]);

  // Helper to check point time status: 'passed' | 'upcoming_soon' (<=15 min) | 'future' with second accuracy
  const getPointTimeStatus = (
    pointText: string
  ): {
    status: 'passed' | 'upcoming_soon' | 'future';
    minutesLeft?: number;
    diffSeconds?: number;
    formattedTimeLeft?: string;
  } => {
    if (!pointText) return { status: 'future' };
    const match = pointText.match(/^(\d{1,2})[:.](\d{2})/);
    if (!match) return { status: 'future' };
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (isNaN(hours) || isNaN(minutes)) return { status: 'future' };

    const pMins = hours * 60 + minutes;

    // Get active shift departure and return times
    let depStr = '';
    let retStr = '';
    if (isTwoShift) {
      if (activeShiftTab === '2') {
        depStr = vehicle.shift2Departure || '18:00';
        retStr = vehicle.shift2Return || '06:00';
      } else {
        depStr = vehicle.shift1Departure || vehicle.departureTime || '06:00';
        retStr = vehicle.shift1Return || vehicle.returnTime || '18:00';
      }
    } else {
      depStr = vehicle.departureTime || '06:00';
      retStr = vehicle.returnTime || '18:00';
    }

    const parseMins = (str: string) => {
      if (!str) return null;
      const m = str.match(/(\d{1,2})[:.](\d{2})/);
      return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : null;
    };

    const depMins = parseMins(depStr) ?? 360;
    const retMins = parseMins(retStr) ?? 1080;

    const now = new Date();
    const targetTs = getPointTargetTimestamp(now, pMins, depMins, retMins);
    const diffSeconds = Math.floor((targetTs - now.getTime()) / 1000);

    if (diffSeconds <= 0) {
      return { status: 'passed' };
    }

    const formattedTimeLeft = formatPointCountdown(diffSeconds);

    if (diffSeconds <= 15 * 60) {
      return {
        status: 'upcoming_soon',
        minutesLeft: Math.ceil(diffSeconds / 60),
        diffSeconds,
        formattedTimeLeft,
      };
    }

    return {
      status: 'future',
      minutesLeft: Math.ceil(diffSeconds / 60),
      diffSeconds,
      formattedTimeLeft,
    };
  };

  return (
    <div className="bg-[#0F0F12] rounded-2xl border border-slate-800 shadow-xl overflow-hidden text-slate-100">
      {/* HEADER BAR */}
      <div className="bg-[#141419] p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="px-3 py-1 bg-blue-600 rounded-xl text-xl font-mono font-bold text-white shadow-md shadow-blue-600/30 shrink-0">
            {vehicle.garageNumber}
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-white leading-tight">
              {vehicle.brandModel}
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs">
              <span className="font-mono bg-[#1C1C26] px-2 py-0.5 rounded border border-slate-700 text-slate-200 font-bold">
                {vehicle.licensePlate}
              </span>
              <span className="bg-blue-950/80 text-blue-300 px-2 py-0.5 rounded border border-blue-800 font-semibold">
                Колонна {vehicle.autoColumn}
              </span>
              <span className="bg-amber-950/80 text-amber-300 px-2 py-0.5 rounded border border-amber-800 font-semibold">
                {vehicle.vehicleType}
              </span>
              <span className="bg-emerald-950/80 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 font-semibold">
                {vehicle.shiftType}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 sm:pt-0 border-t sm:border-0 border-slate-800 flex-wrap">
          <button
            type="button"
            onClick={handleShare}
            className={`px-3 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
              isSharedCopied
                ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/50'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20'
            }`}
            title="Поделиться прямой ссылкой на этот автомобиль"
          >
            {isSharedCopied ? (
              <Check className="w-4 h-4 text-white" />
            ) : (
              <Share2 className="w-4 h-4 text-white" />
            )}
            <span>{isSharedCopied ? 'Ссылка скопирована!' : 'Поделиться'}</span>
          </button>

          <button
            onClick={() => onAddNote(vehicle)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <MessageSquarePlus className="w-4 h-4" />
            <span>Заметка</span>
          </button>
          <button
            onClick={() => onEdit(vehicle)}
            className="p-1.5 bg-[#1C1C26] hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition-colors"
            title="Редактировать машину"
          >
            <Edit className="w-4 h-4" />
          </button>
          
          {showConfirmDelete ? (
            <div className="flex items-center gap-1 bg-rose-950 border border-rose-800 p-1 rounded-xl">
              <span className="text-[11px] text-rose-200 font-bold px-1">Удалить?</span>
              <button
                onClick={handleDeleteConfirm}
                className="px-2 py-0.5 bg-rose-600 text-white font-bold text-xs rounded-lg hover:bg-rose-500"
              >
                Да
              </button>
              <button
                onClick={() => setShowConfirmDelete(false)}
                className="px-2 py-0.5 bg-slate-800 text-slate-300 font-bold text-xs rounded-lg hover:bg-slate-700"
              >
                Отмена
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirmDelete(true)}
              className="p-1.5 bg-[#1C1C26] hover:bg-rose-950 hover:text-rose-400 text-slate-400 rounded-xl border border-slate-700 transition-colors"
              title="Удалить машину"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* CORE CONTENT */}
      <div className="p-4 sm:p-5 space-y-4">
        {/* 2-SHIFT TOGGLE SWITCH (if shiftType === '2-сменка') */}
        {isTwoShift && (
          <div className="bg-[#141419] p-2 rounded-2xl border border-slate-800 flex items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-300 pl-2 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Двухсменная работа (выберите смену):</span>
            </div>
            <div className="flex items-center gap-1 bg-[#09090C] p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => handleShiftTabClick('1')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeShiftTab === '1'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                1-я смена
              </button>
              <button
                onClick={() => handleShiftTabClick('2')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeShiftTab === '2'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                2-я смена
              </button>
            </div>
          </div>
        )}

        {/* THREE CORE DATA BLOCKS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* BLOCK 1: MVZ CODE */}
          <div className="bg-[#14141A] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Код МВЗ
              </span>
              <p className="text-2xl font-mono font-bold text-blue-400 mt-1">
                {vehicle.mvzCode || '—'}
              </p>
            </div>
          </div>

          {/* BLOCK 2: DEPARTURE & PARKING */}
          <div className="bg-[#14141A] border border-slate-800 rounded-2xl p-4 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              {isTwoShift ? `Выезд (${activeShiftTab}-я смена)` : 'Выезд и Стоянка'}
            </span>

            {isTwoShift ? (
              <div className="space-y-1 text-xs">
                <div className="bg-[#1A1A22] p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Время смены:</span>
                  <p className="font-mono text-base font-bold text-emerald-400">
                    {activeShiftTab === '1'
                      ? vehicle.shift1Departure || vehicle.departureTime || '—'
                      : vehicle.shift2Departure || '—'}
                    {' '}—{' '}
                    {activeShiftTab === '1'
                      ? vehicle.shift1Return || vehicle.returnTime || '—'
                      : vehicle.shift2Return || '—'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-1 text-xs">
                <div className="bg-[#1A1A22] p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Время выезда:</span>
                  <p className="font-mono text-base font-bold text-emerald-400">
                    {vehicle.departureTime || '—'}
                    {vehicle.returnTime && (
                      <span className="text-slate-400 text-xs font-normal">
                        {' '}(возврат: {vehicle.returnTime})
                      </span>
                    )}
                  </p>
                </div>
                {vehicle.parkingSpot && (
                  <div className="bg-[#1A1A22] p-2 rounded-xl border border-slate-800 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <div>
                      <span className="text-slate-400 block text-[10px]">Стоянка:</span>
                      <p className="font-bold text-slate-200">{vehicle.parkingSpot}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* BLOCK 3: CUSTOMER */}
          <div className="bg-[#14141A] border border-slate-800 rounded-2xl p-4 space-y-2 flex flex-col justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block flex items-center gap-1 mb-1">
                <Building className="w-3.5 h-3.5 text-blue-400" />
                Заказчик и Подача
              </span>
              <div className="mt-1 space-y-1 text-xs">
                <div className="bg-[#1A1A22] p-2 rounded-xl border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Заказчик:</span>
                  <p className="font-bold text-white">{vehicle.customerName || '—'}</p>
                </div>
                {vehicle.submissionLocation && (
                  <div className="bg-[#1A1A22] p-2 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Место подачи:</span>
                    <p className="font-medium text-slate-200">{vehicle.submissionLocation}</p>
                  </div>
                )}
                {activeCustomerNotes && (
                  <div className="bg-[#1A1A22] p-2 rounded-xl border border-blue-900/40 bg-blue-950/20 text-xs mt-1">
                    <span className="text-blue-400 font-bold block text-[10px] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                      <FileText className="w-3 h-3 text-blue-400" />
                      Особенности по заказчику {isTwoShift ? `(${activeShiftTab}-я смена)` : ''}:
                    </span>
                    <p className="text-slate-200 leading-relaxed font-medium whitespace-pre-line text-[11px]">
                      {activeCustomerNotes}
                    </p>
                  </div>
                )}
              </div>
            </div>
            {/* Contacts & Call buttons */}
            {customerContactsList.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {customerContactsList.map((contact, idx) => (
                  contact.phone ? (
                    <a
                      key={idx}
                      href={`tel:${contact.phone}`}
                      className="w-full py-2 px-3 bg-blue-950/80 hover:bg-blue-900 border border-blue-800 text-blue-200 rounded-xl font-bold text-xs flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 transition-colors text-center leading-snug shadow-sm active:scale-[0.99]"
                      title={`Позвонить контактному лицу: ${contact.name || contact.phone}`}
                    >
                      <Phone className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                      <span className="break-words">
                        {contact.name ? `${contact.name}:` : `Контакт #${idx + 1}:`}
                      </span>
                      <span className="whitespace-nowrap font-mono">{contact.phone}</span>
                    </a>
                  ) : contact.name ? (
                    <div
                      key={idx}
                      className="py-1.5 px-3 bg-[#1A1A22] border border-slate-800 text-slate-300 rounded-xl text-xs flex items-center gap-2"
                    >
                      <User className="w-3.5 h-3.5 shrink-0 text-blue-400" />
                      <span className="font-semibold text-slate-400">{`Контакт #${idx + 1}:`}</span>
                      <span className="font-medium text-white truncate">{contact.name}</span>
                    </div>
                  ) : null
                ))}
              </div>
            )}
          </div>
        </div>

        {/* PICKUP POINTS / ROUTE (SHIFT SPECIFIC IF 2-SHIFT) */}
        {currentPickupPoints && currentPickupPoints.length > 0 && (
          <div className="bg-[#14141A] rounded-2xl p-3.5 border border-slate-800 text-xs">
            <span className="font-bold text-slate-300 block mb-1.5">
              {isTwoShift ? `Маршрут и точки сбора (${activeShiftTab}-я смена):` : 'Маршрут и точки сбора:'}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {currentPickupPoints.map((point, index) => {
                const { status, formattedTimeLeft } = getPointTimeStatus(point);
                const isPassed = status === 'passed';
                const isUpcomingSoon = status === 'upcoming_soon';

                return (
                  <div
                    key={index}
                    className={`p-2 rounded-xl border flex items-start justify-between gap-2 text-slate-200 transition-all ${
                      isUpcomingSoon
                        ? 'bg-amber-950/80 border-amber-500/90 shadow-lg shadow-amber-950/50 ring-1 ring-amber-500/50'
                        : isPassed
                        ? 'bg-[#18261E] border-emerald-800/80'
                        : 'bg-[#1A1A22] border-slate-800'
                    }`}
                  >
                    <div className="flex items-start gap-2 min-w-0 flex-1">
                      <span
                        className={`w-4 h-4 rounded-full flex items-center justify-center font-mono font-bold text-[10px] shrink-0 border mt-0.5 ${
                          isUpcomingSoon
                            ? 'bg-amber-500 text-black border-amber-300 font-black animate-pulse'
                            : isPassed
                            ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm shadow-emerald-500/40'
                            : 'bg-blue-950 text-blue-300 border-blue-800'
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className={`break-words whitespace-pre-wrap flex-1 text-xs leading-snug ${isUpcomingSoon ? 'text-amber-200 font-bold' : isPassed ? 'text-emerald-200 font-medium' : 'text-slate-200'}`}>
                        {point}
                      </span>
                    </div>

                    {isUpcomingSoon && formattedTimeLeft && (
                      <span className="px-2 py-0.5 bg-amber-500 text-black font-black text-[10px] rounded-lg animate-pulse shrink-0 whitespace-nowrap mt-0.5">
                        {formattedTimeLeft}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TECHNICAL NUANCES & QUIRKS (WITH INDIVIDUAL DELETE) */}
        <div className="bg-[#14141A] rounded-2xl p-4 border border-slate-800 text-xs space-y-2">
          <h3 className="font-bold text-white flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Особенности машины (Опыт водителей)
          </h3>
          {vehicle.techNuances && vehicle.techNuances.length > 0 ? (
            <ul className="space-y-1.5">
              {vehicle.techNuances.map((nuance, idx) => (
                <li
                  key={idx}
                  className="bg-amber-950/30 border border-amber-900/40 p-2 rounded-xl text-amber-100 flex items-start justify-between gap-2"
                >
                  <div className="flex items-start gap-2">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span>{nuance}</span>
                  </div>
                  <button
                    onClick={() => onDeleteNuance(vehicle.id, idx)}
                    className="p-1 hover:bg-rose-950 hover:text-rose-400 text-slate-400 rounded-lg transition-colors shrink-0"
                    title="Удалить особенность"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-slate-500 py-1">Особых замечаний нет.</p>
          )}
        </div>

        {/* CREW MEMBERS */}
        {vehicle.crewMembers && vehicle.crewMembers.length > 0 && (
          <div className="bg-[#14141A] rounded-2xl p-3.5 border border-slate-800 text-xs">
            <h3 className="font-bold text-white flex items-center gap-1.5 border-b border-slate-800 pb-2 mb-2">
              <UserCheck className="w-4 h-4 text-blue-400" />
              Закреплённый экипаж
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {vehicle.crewMembers.map((member, i) => (
                <div key={i} className="bg-[#1A1A22] p-2.5 rounded-xl border border-slate-800 flex flex-col justify-between gap-1.5">
                  <div>
                    <p className="font-bold text-white text-xs">{member.name}</p>
                  </div>
                  {member.phone && (
                    <a
                      href={`tel:${member.phone}`}
                      className="mt-1 w-full py-1.5 px-2 bg-blue-950/80 hover:bg-blue-900 border border-blue-800 text-blue-200 rounded-lg font-bold text-xs flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 transition-colors text-center leading-snug"
                    >
                      <Phone className="w-3 h-3 shrink-0" />
                      <span className="whitespace-nowrap font-mono">{member.phone}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SHIFT NOTES (WITH INDIVIDUAL DELETE) */}
        <div className="bg-[#14141A] rounded-2xl p-4 border border-slate-800 space-y-3 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="font-bold text-white flex items-center gap-1.5">
              <MessageSquarePlus className="w-4 h-4 text-amber-400" />
              Заметки водителей ({vehicle.notes.length})
            </h3>
            <button
              onClick={() => onAddNote(vehicle)}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-lg text-xs transition-colors"
            >
              Добавить заметку
            </button>
          </div>

          {vehicle.notes.length === 0 ? (
            <p className="text-slate-500 text-center py-2">
              Заметок пока нет. Нажмите «+ Заметка», чтобы оставить информацию сменщику.
            </p>
          ) : (
            <div className="space-y-2">
              {vehicle.notes.map((note) => (
                <div
                  key={note.id}
                  className={`p-3 rounded-xl border flex items-start justify-between gap-2 ${
                    note.important
                      ? 'bg-amber-950/40 border-amber-800 text-amber-100'
                      : 'bg-[#1A1A22] border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 font-bold">
                      <span className="text-white">{note.driverName || 'Водитель'}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(note.date).toLocaleString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="text-slate-300 whitespace-pre-wrap">{note.text}</p>
                  </div>

                  <button
                    onClick={() => onDeleteNote(vehicle.id, note.id)}
                    className="p-1 hover:bg-rose-950 hover:text-rose-400 text-slate-400 rounded-lg transition-colors shrink-0"
                    title="Удалить заметку"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
