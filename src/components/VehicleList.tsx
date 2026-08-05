import React, { useState } from 'react';
import { Vehicle } from '../types';
import { VehicleCard } from './VehicleCard';
import { Truck, Clock, ArrowRight, ShieldAlert, RotateCcw } from 'lucide-react';

interface VehicleListProps {
  allVehiclesCount: number;
  vehicles: Vehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  searchTerm: string;
  selectedColumn: string;
  onSelectColumn: (col: string) => void;
  selectedShift: string;
  onSelectShift: (shift: string) => void;
  onResetFilters: () => void;
  onEdit: (vehicle: Vehicle) => void;
  onAddNote: (vehicle: Vehicle) => void;
  onDeleteVehicle: (vehicleId: string) => void;
  onDeleteNote: (vehicleId: string, noteId: string) => void;
  onDeleteNuance: (vehicleId: string, index: number) => void;
}

const AUTO_COLUMNS: string[] = ['Все', '1', '3', '4', '5', '6', '7', '9', '10'];
const SHIFT_TYPES: string[] = ['Все смены', '1-сменка', '2-сменка'];

export const VehicleList: React.FC<VehicleListProps> = ({
  allVehiclesCount,
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  searchTerm,
  selectedColumn,
  onSelectColumn,
  selectedShift,
  onSelectShift,
  onResetFilters,
  onEdit,
  onAddNote,
  onDeleteVehicle,
  onDeleteNote,
  onDeleteNuance
}) => {
  const [showAllGrid, setShowAllGrid] = useState(false);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);

  // Filter Bar Component
  const renderFilterBar = () => (
    <div className="bg-[#0F0F12] rounded-2xl border border-slate-800 p-3.5 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      {/* Column buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-bold text-slate-400 mr-1">Колонна:</span>
        {AUTO_COLUMNS.map((col) => {
          const isSelected = selectedColumn === col;
          return (
            <button
              key={col}
              onClick={() => onSelectColumn(col)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                isSelected
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-[#16161D] text-slate-300 hover:bg-[#20202A] border border-slate-800'
              }`}
            >
              {col === 'Все' ? 'Все' : col}
            </button>
          );
        })}
      </div>

      {/* Shift selector */}
      <div className="flex items-center gap-2">
        <span className="font-bold text-slate-400">Смена:</span>
        <div className="flex items-center gap-1">
          {SHIFT_TYPES.map((sh) => (
            <button
              key={sh}
              onClick={() => onSelectShift(sh)}
              className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                selectedShift === sh
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#16161D] text-slate-300 hover:bg-[#20202A] border border-slate-800'
              }`}
            >
              {sh}
            </button>
          ))}
        </div>

        {(selectedColumn !== 'Все' || selectedShift !== 'Все смены') && (
          <button
            onClick={onResetFilters}
            className="px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg flex items-center gap-1 font-semibold transition-colors border border-slate-800 ml-1"
            title="Сбросить все фильтры"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );

  // If a single vehicle is selected by user search or click
  if (selectedVehicle) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Выбранный автомобиль:
          </span>
          <button
            onClick={() => {
              onSelectVehicle('');
              setShowAllGrid(true);
            }}
            className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center gap-1 bg-[#14141A] px-3 py-1.5 rounded-xl border border-slate-800 transition-colors"
          >
            <span>Показать список всех автомобилей ({allVehiclesCount})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
        <VehicleCard
          key={selectedVehicle.id}
          vehicle={selectedVehicle}
          onEdit={onEdit}
          onAddNote={onAddNote}
          onDeleteVehicle={onDeleteVehicle}
          onDeleteNote={onDeleteNote}
          onDeleteNuance={onDeleteNuance}
        />
      </div>
    );
  }

  // If no search term and user hasn't toggled "Show All", show clean empty state
  if (!searchTerm && !showAllGrid && selectedColumn === 'Все' && selectedShift === 'Все смены') {
    return (
      <div className="bg-[#0F0F12] rounded-2xl border border-slate-800 p-8 text-center shadow-xl my-4">
        <div className="w-12 h-12 bg-[#16161D] rounded-full flex items-center justify-center mx-auto text-blue-400 mb-3 border border-slate-800">
          <Truck className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-slate-100 mb-1">Автомобиль не выбран</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
          Введите гаражный номер в поле поиска выше, чтобы открыть карточку автомобиля, или нажмите кнопку ниже для просмотра списка.
        </p>
        <button
          onClick={() => setShowAllGrid(true)}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-2 shadow-lg shadow-blue-600/20"
        >
          <span>Показать список всех автомобилей ({allVehiclesCount})</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Render list view with column/shift filters
  return (
    <div className="space-y-4">
      {/* Filters (Shown only when viewing all vehicles list) */}
      {renderFilterBar()}

      {vehicles.length === 0 ? (
        <div className="bg-[#0F0F12] rounded-2xl border border-slate-800 p-10 text-center my-6">
          <div className="w-14 h-14 bg-[#16161D] rounded-full flex items-center justify-center mx-auto text-slate-500 mb-3 border border-slate-800">
            <Truck className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-100 mb-1">Автомобиль не найден</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
            Машины с таким гаражным номером или фильтрами не найдено. Нажмите «+ Добавить ТС» выше, чтобы добавить новую!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {vehicles.map((v) => (
            <div
              key={v.id}
              onClick={() => onSelectVehicle(v.id)}
              className="bg-[#0F0F12] rounded-2xl border border-slate-800 hover:border-blue-500/80 shadow-lg hover:shadow-blue-500/10 transition-all p-4 cursor-pointer flex flex-col justify-between group"
            >
              <div>
                {/* Header */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-1 bg-blue-950 text-blue-200 text-base font-mono font-bold rounded-xl border border-blue-800">
                      {v.garageNumber}
                    </span>
                    <span className="font-mono text-xs text-slate-300 font-semibold bg-[#16161D] px-2 py-0.5 rounded-md border border-slate-800">
                      {v.licensePlate}
                    </span>
                  </div>
                  <span className="text-[10px] font-semibold bg-[#16161D] text-slate-400 border border-slate-800 px-2 py-0.5 rounded-md uppercase">
                    {v.shiftType}
                  </span>
                </div>

                {/* Brand & Customer */}
                <h3 className="font-bold text-white text-sm group-hover:text-blue-400 transition-colors">
                  {v.brandModel}
                </h3>
                <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                  <strong className="text-slate-300">Заказчик:</strong> {v.customerName || 'Не указан'}
                </p>

                {/* MVZ & Time */}
                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1 font-mono text-blue-300 font-bold bg-blue-950/80 border border-blue-800/80 px-2 py-0.5 rounded-lg">
                    МВЗ: {v.mvzCode || '—'}
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                    <Clock className="w-3 h-3 text-emerald-400" />
                    Выезд: {v.shiftType === '2-сменка' ? (v.shift1Departure || v.departureTime || '—') : (v.departureTime || '—')}
                  </div>
                </div>

                {/* Tech nuances preview */}
                {v.techNuances && v.techNuances.length > 0 && (
                  <div className="mt-2 text-[11px] text-amber-200 bg-amber-950/40 p-1.5 rounded-lg border border-amber-900/60 line-clamp-1 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 shrink-0 text-amber-400" />
                    <span>{v.techNuances[0]}</span>
                  </div>
                )}
              </div>

              {/* Bottom footer button */}
              <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-semibold text-blue-400 group-hover:translate-x-1 transition-transform">
                <span>Открыть карточку ТС</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

