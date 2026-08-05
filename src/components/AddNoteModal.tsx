import React, { useState } from 'react';
import { Vehicle, DriverNote } from '../types';
import { X, MessageSquarePlus, AlertTriangle } from 'lucide-react';

interface AddNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  vehicle: Vehicle | null;
  onSaveNote: (vehicleId: string, note: Omit<DriverNote, 'id' | 'date'>) => void;
}

export const AddNoteModal: React.FC<AddNoteModalProps> = ({
  isOpen,
  onClose,
  vehicle,
  onSaveNote
}) => {
  const [driverName, setDriverName] = useState('');
  const [text, setText] = useState('');
  const [category, setCategory] = useState<'нюанс' | 'неисправность' | 'заказчик' | 'пересмена'>('пересмена');
  const [important, setImportant] = useState(false);

  if (!isOpen || !vehicle) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    onSaveNote(vehicle.id, {
      driverName: driverName.trim() || 'Водитель',
      text: text.trim() || 'Заметка',
      category,
      important
    });

    setText('');
    setDriverName('');
    setImportant(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0F0F12] border border-slate-800 rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-fadeIn text-slate-100">
        {/* Header */}
        <div className="bg-[#141419] border-b border-slate-800 text-white p-4 px-6 flex items-center justify-between">
          <h2 className="text-base font-bold flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-amber-400" />
            Заметка для ТС № {vehicle.garageNumber}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          <div>
            <label className="block font-semibold text-slate-300 mb-1">
              Ваше ФИО
            </label>
            <input
              type="text"
              placeholder="Сидоров М.И."
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              className="w-full p-2.5 bg-[#1A1A22] border border-slate-700 rounded-lg text-white font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Категория</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="w-full p-2.5 bg-[#1A1A22] border border-slate-700 rounded-lg text-white font-medium"
              >
                <option value="пересмена" className="bg-[#1A1A22] text-white">Пересмена</option>
                <option value="заказчик" className="bg-[#1A1A22] text-white">Заказчик / Маршрут</option>
                <option value="нюанс" className="bg-[#1A1A22] text-white">Нюанс управления</option>
                <option value="неисправность" className="bg-[#1A1A22] text-white">Замечания</option>
              </select>
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-amber-300">
                <input
                  type="checkbox"
                  checked={important}
                  onChange={(e) => setImportant(e.target.checked)}
                  className="w-4 h-4 text-amber-500 rounded border-slate-700 focus:ring-amber-500 bg-[#16161D]"
                />
                <span className="flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  Важное
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-300 mb-1">
              Текст заметки
            </label>
            <textarea
              rows={3}
              placeholder="Введите информацию для сменщика..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full p-2.5 bg-[#1A1A22] border border-slate-700 rounded-lg text-white"
            />
          </div>

          <div className="pt-2 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-semibold shadow-md shadow-amber-600/30"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
