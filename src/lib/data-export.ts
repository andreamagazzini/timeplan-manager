import { db } from './db';
import { Pharmacist, Schedule, PharmacyRules } from '@/types';

export interface DataExport {
  pharmacists: Pharmacist[];
  schedules: Schedule[];
  pharmacyRules: PharmacyRules | null;
  exportedAt: string;
  version: string;
}

/**
 * Export all data from IndexedDB to JSON
 * Useful for backup and migration
 */
export async function exportAllData(): Promise<DataExport> {
  const pharmacyRules = await db.pharmacyRules.get('default');
  const data: DataExport = {
    pharmacists: await db.pharmacists.toArray(),
    schedules: await db.schedules.toArray(),
    pharmacyRules: pharmacyRules || null,
    exportedAt: new Date().toISOString(),
    version: '1.0',
  };
  
  return data;
}

/**
 * Download data export as JSON file
 */
export async function downloadDataExport(): Promise<void> {
  const data = await exportAllData();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `timeplan-manager-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import data from JSON export
 * Useful for migration and restore
 */
export async function importData(data: DataExport): Promise<void> {
  if (data.pharmacists && data.pharmacists.length > 0) {
    await db.pharmacists.bulkPut(data.pharmacists);
  }
  
  if (data.schedules && data.schedules.length > 0) {
    await db.schedules.bulkPut(data.schedules);
  }
  
  if (data.pharmacyRules) {
    await db.pharmacyRules.put({ ...data.pharmacyRules, id: 'default' });
  }
  
  console.log('✅ Data imported successfully');
}

/**
 * Import data from uploaded file
 */
export async function importFromFile(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target?.result as string) as DataExport;
        await importData(data);
        resolve();
      } catch {
        reject(new Error('Invalid file format'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
