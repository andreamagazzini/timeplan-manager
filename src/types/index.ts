export interface Pharmacist {
  id: string;
  name: string;
  email: string;
  weeklyHours: number;
  freeDay: string; // 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  freeSaturdayWeek?: number; // Which week of the month they have Saturday off
  isActive: boolean;
  fixedDayPatterns?: Array<{
    dayOfWeek: string; // 'Monday', 'Tuesday', etc.
    patternId: string; // ID of the fixed shift pattern
  }>;
}

export interface PharmacyRules {
  id: string;
  name: string;
  openingTime: string; // "09:00"
  closingTime: string; // "19:30"
  breakStartTime: string; // "12:30"
  breakEndTime: string; // "14:00"
  maxHoursPerShift: number;
  maxHoursPerDay: number;
  fixedShiftPatterns?: FixedShiftPattern[];
  staffingRequirements: StaffingRequirement[];
}

export interface FixedShiftPattern {
  id: string;
  name: string;
  shortForm?: string; // Short abbreviation to display in calendar (e.g., "EM", "XL", "LM")
  morningShift: { startTime: string; endTime: string };
  afternoonShift: { startTime: string; endTime: string };
}

export interface StaffingRequirement {
  id: string;
  startTime: string;
  endTime: string;
  requiredPharmacists: number;
}

export interface Shift {
  id: string;
  pharmacistId: string;
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  type: 'morning' | 'afternoon' | 'full';
  isBreakTime: boolean;
  patternId?: string; // ID of the fixed shift pattern used (if applicable)
}

export interface Schedule {
  id: string;
  weekStart: string; // YYYY-MM-DD
  weekEnd: string; // YYYY-MM-DD
  shifts: Shift[];
  warnings?: Record<string, string[]>; // Date -> array of warning messages
}

export interface DayRules {
  dayOfWeek: number; // 0=Sunday, 1=Monday, etc.
  openingTime: string;
  closingTime: string;
  staffingRequirements: StaffingRequirement[];
}
