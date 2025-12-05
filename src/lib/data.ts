import { Pharmacist, PharmacyRules, Shift, Schedule } from '@/types';
import { db, migrateFromLocalStorage } from './db';

// DayRules removed - now using only PharmacyRules for all days

// Simple localStorage-based data management
export class DataManager {
  private static instance: DataManager;
  
  // Cache for sync methods
  private cache: {
    pharmacists?: Pharmacist[];
    pharmacyRules?: PharmacyRules;
    schedules?: Schedule[];
    initialized: boolean;
  } = { initialized: false };
  
  static getInstance(): DataManager {
    if (!DataManager.instance) {
      DataManager.instance = new DataManager();
    }
    return DataManager.instance;
  }

  // Initialize: Migrate from localStorage on first use
  private async init(): Promise<void> {
    if (typeof window !== 'undefined' && !this.cache.initialized) {
      await migrateFromLocalStorage();
      this.cache.initialized = true;
    }
  }

  // Pharmacists - Async version
  async getPharmacistsAsync(): Promise<Pharmacist[]> {
    if (typeof window === 'undefined') return [];
    await this.init();
    const pharmacists = await db.pharmacists.toArray();
    this.cache.pharmacists = pharmacists;
    return pharmacists;
  }

  // Pharmacists - Sync version (uses cache)
  getPharmacists(): Pharmacist[] {
    if (typeof window === 'undefined') return [];
    if (this.cache.pharmacists) {
      return this.cache.pharmacists;
    }
    // Trigger async load in background
    this.getPharmacistsAsync().catch(console.error);
    // Fallback to localStorage for immediate access
    const stored = localStorage.getItem('pharmacists');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.cache.pharmacists = parsed;
        return parsed;
      } catch {
        return [];
      }
    }
    return [];
  }

  async savePharmacistsAsync(pharmacists: Pharmacist[]): Promise<void> {
    if (typeof window === 'undefined') return;
    await this.init();
    await db.pharmacists.bulkPut(pharmacists);
    this.cache.pharmacists = pharmacists;
    // Also update localStorage for backward compatibility
    localStorage.setItem('pharmacists', JSON.stringify(pharmacists));
  }

  savePharmacists(pharmacists: Pharmacist[]): void {
    if (typeof window === 'undefined') return;
    this.cache.pharmacists = pharmacists;
    // Update localStorage immediately
    localStorage.setItem('pharmacists', JSON.stringify(pharmacists));
    // Update IndexedDB in background
    this.savePharmacistsAsync(pharmacists).catch(console.error);
  }

  async addPharmacist(pharmacist: Pharmacist): Promise<void> {
    await this.init();
    await db.pharmacists.add(pharmacist);
  }

  async updatePharmacist(id: string, updates: Partial<Pharmacist>): Promise<void> {
    await this.init();
    
    // Get the current pharmacist to merge updates properly
    const current = await db.pharmacists.get(id);
    if (!current) {
      throw new Error(`Pharmacist with id ${id} not found`);
    }
    
    // Merge updates with current data
    const updatedPharmacist: Pharmacist = {
      ...current,
      ...updates,
    };
    
    // Update IndexedDB with the complete object
    await db.pharmacists.put(updatedPharmacist);
    
    // Update cache
    if (this.cache.pharmacists) {
      const index = this.cache.pharmacists.findIndex(p => p.id === id);
      if (index !== -1) {
        this.cache.pharmacists[index] = updatedPharmacist;
      } else {
        // If not in cache, reload it
        this.cache.pharmacists = await db.pharmacists.toArray();
      }
    }
    
    // Also update localStorage for backward compatibility
    const allPharmacists = await db.pharmacists.toArray();
    localStorage.setItem('pharmacists', JSON.stringify(allPharmacists));
  }

  async deletePharmacist(id: string): Promise<void> {
    await this.init();
    await db.pharmacists.delete(id);
  }

  // Pharmacy Rules - Async version
  async getPharmacyRulesAsync(): Promise<PharmacyRules | null> {
    if (typeof window === 'undefined') return null;
    await this.init();
    const rules = await db.pharmacyRules.get('default');
    this.cache.pharmacyRules = rules || null;
    return rules || null;
  }

  // Pharmacy Rules - Sync version
  getPharmacyRules(): PharmacyRules | null {
    if (typeof window === 'undefined') return null;
    if (this.cache.pharmacyRules) {
      return this.cache.pharmacyRules;
    }
    this.getPharmacyRulesAsync().catch(console.error);
    const stored = localStorage.getItem('pharmacyRules');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.cache.pharmacyRules = parsed;
        return parsed;
      } catch {
        return null;
      }
    }
    return null;
  }

  async savePharmacyRulesAsync(rules: PharmacyRules): Promise<void> {
    if (typeof window === 'undefined') return;
    await this.init();
    await db.pharmacyRules.put({ ...rules, id: 'default' });
    this.cache.pharmacyRules = rules;
    localStorage.setItem('pharmacyRules', JSON.stringify(rules));
  }

  savePharmacyRules(rules: PharmacyRules): void {
    if (typeof window === 'undefined') return;
    this.cache.pharmacyRules = rules;
    localStorage.setItem('pharmacyRules', JSON.stringify(rules));
    this.savePharmacyRulesAsync(rules).catch(console.error);
  }

  // DayRules removed - now using only PharmacyRules for all days

  // Schedules - Async version
  async getSchedulesAsync(): Promise<Schedule[]> {
    if (typeof window === 'undefined') return [];
    await this.init();
    const schedules = await db.schedules.toArray();
    this.cache.schedules = schedules;
    return schedules;
  }

  // Schedules - Sync version
  getSchedules(): Schedule[] {
    if (typeof window === 'undefined') return [];
    if (this.cache.schedules) {
      return this.cache.schedules;
    }
    this.getSchedulesAsync().catch(console.error);
    const stored = localStorage.getItem('schedules');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        this.cache.schedules = parsed;
        return parsed;
      } catch {
        return [];
      }
    }
    return [];
  }

  // Get schedule by week start date (fast indexed query)
  async getScheduleByWeekStart(weekStart: string): Promise<Schedule | undefined> {
    if (typeof window === 'undefined') return undefined;
    await this.init();
    return await db.schedules.where('weekStart').equals(weekStart).first();
  }

  async saveSchedulesAsync(schedules: Schedule[]): Promise<void> {
    if (typeof window === 'undefined') return;
    await this.init();
    await db.schedules.bulkPut(schedules);
    this.cache.schedules = schedules;
    localStorage.setItem('schedules', JSON.stringify(schedules));
  }

  saveSchedules(schedules: Schedule[]): void {
    if (typeof window === 'undefined') return;
    this.cache.schedules = schedules;
    localStorage.setItem('schedules', JSON.stringify(schedules));
    this.saveSchedulesAsync(schedules).catch(console.error);
  }

  async clearSchedules(): Promise<void> {
    if (typeof window === 'undefined') return;
    await this.init();
    await db.schedules.clear();
  }

  // Utility method to clear all data (useful for debugging)
  async clearAllData(): Promise<void> {
    if (typeof window === 'undefined') return;
    await this.init();
    await db.pharmacists.clear();
    await db.pharmacyRules.clear();
    await db.schedules.clear();
    
    // Also clear localStorage
    localStorage.removeItem('pharmacists');
    localStorage.removeItem('pharmacyRules');
    localStorage.removeItem('schedules');
    
    // Clear cache
    this.cache.pharmacists = [];
    this.cache.pharmacyRules = null;
    this.cache.schedules = [];
    
    console.log('All data cleared (IndexedDB and localStorage)');
  }

  async addScheduleAsync(schedule: Schedule): Promise<void> {
    await this.init();
    await db.schedules.add(schedule);
    // Update cache
    const schedules = await this.getSchedulesAsync();
    schedules.push(schedule);
    this.cache.schedules = schedules;
    localStorage.setItem('schedules', JSON.stringify(schedules));
  }

  addSchedule(schedule: Schedule): void {
    const schedules = this.getSchedules();
    schedules.push(schedule);
    this.saveSchedules(schedules);
  }

  async updateSchedule(schedule: Schedule): Promise<void> {
    await this.init();
    await db.schedules.put(schedule);
  }
}
