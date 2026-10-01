export type VehicleType =
  | 'легковая'
  | 'микроавтобус'
  | 'автобус'
  | 'вахтовка'
  | 'самосвал'
  | 'грузовой'
  | 'спецтехника';

export type ShiftType = '1-сменка' | '2-сменка';

export type AutoColumn = '1' | '3' | '4' | '5' | '6' | '7' | '9' | '10';

export interface DriverNote {
  id: string;
  date: string;
  driverName: string;
  text: string;
  important?: boolean;
  category?: 'нюанс' | 'неисправность' | 'заказчик' | 'пересмена';
}

export interface CustomerContactItem {
  name: string;
  phone: string;
}

export interface Vehicle {
  id: string;
  garageNumber: string; // e.g. "0142"
  licensePlate: string; // e.g. "В 452 ОР 89"
  brandModel: string; // e.g. "КАМАЗ 43118 (Вахтовка НеФАЗ)"
  vehicleType: VehicleType;
  autoColumn: AutoColumn;
  shiftType: ShiftType;
  
  // Schedule & Departure (1-сменка or general)
  departureTime: string; // e.g. "06:15"
  returnTime?: string; // e.g. "18:45"

  // 2-сменка specific details
  shift1Departure?: string; // e.g. "06:00"
  shift1Return?: string; // e.g. "18:00"
  shift1Driver?: string; // e.g. "Сидоров М.И."
  shift2Departure?: string; // e.g. "18:00"
  shift2Return?: string; // e.g. "06:00"
  shift2Driver?: string; // e.g. "Ковалев Д.В."

  parkingSpot: string; // e.g. "Стоянка АК-1, Бокс №4"
  pickupPoints: string[]; // general / 1-shift pickup points
  shift1PickupPoints?: string[]; // 1st shift specific routes/pickup points
  shift2PickupPoints?: string[]; // 2nd shift specific routes/pickup points
  
  // Customer & MVZ
  customerName: string; // e.g. "УЭВП"
  customerContactName?: string;
  customerPhone?: string; // e.g. "+7 (34949) 6-22-14"
  customerContact2Name?: string;
  customerPhone2?: string;
  customerContacts?: CustomerContactItem[];
  customerNotes?: string; // e.g. "Подняться в каб. 204, найти Иванова А.В., подписать путевой лист"
  customerNotesShift1?: string;
  customerNotesShift2?: string;
  mvzCode: string; // e.g. "4502.12.01"
  mvzDescription?: string;
  submissionLocation: string; // e.g. "Площадка ВП-4"

  // Vehicle Nuances & Equipment
  techNuances: string[];

  // Crew Members (Up to 4 drivers in shift rotation)
  crewMembers: {
    name: string;
    phone: string;
    role: '1 смена' | '2 смена' | 'Вахта' | 'На отдыхе' | 'Подменный' | 'Основной' | string;
  }[];
  
  // Notes
  notes: DriverNote[];

  // Meta
  lastUpdated: string;
}
