import Dexie, { Table } from 'dexie';
import { Pharmacist, PharmacyRules, Schedule } from '@/types';

// IndexedDB Database Schema
export class TimePlanDB extends Dexie {
  pharmacists!: Table<Pharmacist, string>;
  schedules!: Table<Schedule, string>;
  pharmacyRules!: Table<PharmacyRules, string>;

  constructor() {
    super('TimePlanDB');
    
    // Define schema with indexes for fast queries
    this.version(3).stores({
      pharmacists: 'id, name, email, isActive',
      schedules: 'id, weekStart, weekEnd, [weekStart+weekEnd]', // Compound index for date range queries
      pharmacyRules: 'id'
    }).upgrade(async (tx) => {
      // Migration: Remove dayRules and googleCalendarSync tables if they exist
      // This will happen automatically when version changes
    });
  }
}

// Singleton instance
export const db = new TimePlanDB();

// Migration helper: Import from localStorage on first load
export async function migrateFromLocalStorage() {
  if (typeof window === 'undefined') return;
  
  // Check if migration already done
  const migrationDone = localStorage.getItem('indexeddb_migration_done');
  if (migrationDone === 'true') return;
  
  try {
    // Migrate pharmacists
    const pharmacists = localStorage.getItem('pharmacists');
    if (pharmacists) {
      const parsed = JSON.parse(pharmacists);
      await db.pharmacists.bulkPut(parsed);
    }
    
    // Migrate pharmacy rules
    const pharmacyRules = localStorage.getItem('pharmacyRules');
    if (pharmacyRules) {
      const parsed = JSON.parse(pharmacyRules);
      await db.pharmacyRules.put(parsed);
    }
    
    // Day rules are no longer used - removed
    
    // Migrate schedules
    const schedules = localStorage.getItem('schedules');
    if (schedules) {
      const parsed = JSON.parse(schedules);
      await db.schedules.bulkPut(parsed);
    }
    
    // Mark migration as done
    localStorage.setItem('indexeddb_migration_done', 'true');
    console.log('✅ Migrated data from localStorage to IndexedDB');
  } catch (error) {
    console.error('Migration error:', error);
  }
}
