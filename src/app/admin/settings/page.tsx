'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Download, Upload, AlertTriangle } from 'lucide-react';
import { DataManager } from '@/lib/data';
import { PharmacyRules, StaffingRequirement, FixedShiftPattern } from '@/types';
import { exportAllData, downloadDataExport, importFromFile } from '@/lib/data-export';
import { useLanguage } from '@/lib/language-context';

export default function SettingsPage() {
  const dataManager = DataManager.getInstance();
  const [pharmacyRules, setPharmacyRules] = useState<PharmacyRules | null>(dataManager.getPharmacyRules());
  const [isEditing, setIsEditing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    const loadRules = async () => {
      const rules = await dataManager.getPharmacyRulesAsync();
      setPharmacyRules(rules);
    };
    loadRules();
  }, []);

  const handleSave = () => {
    if (!pharmacyRules) return;
    const dataManager = DataManager.getInstance();
    dataManager.savePharmacyRules(pharmacyRules);
    setIsEditing(false);
  };

  const addStaffingRequirement = () => {
    if (!pharmacyRules) return;
    const newRequirement: StaffingRequirement = {
      id: `req_${Date.now()}`,
      startTime: '09:00',
      endTime: '17:00',
      requiredPharmacists: 2,
    };
    setPharmacyRules({
      ...pharmacyRules,
      staffingRequirements: [...pharmacyRules.staffingRequirements, newRequirement],
    });
  };

  const removeStaffingRequirement = (id: string) => {
    if (!pharmacyRules) return;
    setPharmacyRules({
      ...pharmacyRules,
      staffingRequirements: pharmacyRules.staffingRequirements.filter(req => req.id !== id),
    });
  };

  const updateStaffingRequirement = (id: string, updates: Partial<StaffingRequirement>) => {
    if (!pharmacyRules) return;
    setPharmacyRules({
      ...pharmacyRules,
      staffingRequirements: pharmacyRules.staffingRequirements.map(req =>
        req.id === id ? { ...req, ...updates } : req
      ),
    });
  };

  const addFixedShiftPattern = () => {
    if (!pharmacyRules) return;
    const newPattern: FixedShiftPattern = {
      id: `pattern_${Date.now()}`,
      name: t.settings.newPattern,
      morningShift: { startTime: '09:00', endTime: '12:30' },
      afternoonShift: { startTime: '13:00', endTime: '17:30' },
    };
    setPharmacyRules({
      ...pharmacyRules,
      fixedShiftPatterns: [...(pharmacyRules.fixedShiftPatterns || []), newPattern],
    });
  };

  const removeFixedShiftPattern = (id: string) => {
    if (!pharmacyRules) return;
    setPharmacyRules({
      ...pharmacyRules,
      fixedShiftPatterns: pharmacyRules.fixedShiftPatterns?.filter(pattern => pattern.id !== id) || [],
    });
  };

  const updateFixedShiftPattern = (id: string, updates: Partial<FixedShiftPattern>) => {
    if (!pharmacyRules) return;
    setPharmacyRules({
      ...pharmacyRules,
      fixedShiftPatterns: pharmacyRules.fixedShiftPatterns?.map(pattern =>
        pattern.id === id ? { ...pattern, ...updates } : pattern
      ) || [],
    });
  };

  const handleExportAllData = async () => {
    try {
      await downloadDataExport();
      alert(t.settings.exportSuccess);
    } catch (error) {
      console.error('Export error:', error);
      alert(t.settings.exportError);
    }
  };

  const handleImportAllData = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      if (!confirm(t.settings.importConfirm)) {
        return;
      }
      
      setIsImporting(true);
      try {
        await importFromFile(file);
        alert(t.settings.importSuccess);
        window.location.reload();
      } catch (error) {
        console.error('Import error:', error);
        alert(t.settings.importError);
      } finally {
        setIsImporting(false);
      }
    };
    input.click();
  };

  const handleClearAllData = () => {
    if (confirm(t.settings.clearAllDataConfirm)) {
      const dataManager = DataManager.getInstance();
      dataManager.clearAllData();
      // Reload the page to get fresh data
      window.location.reload();
    }
  };


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.settings.title}</h1>
          <p className="text-gray-600">{t.settings.subtitle}</p>
        </div>
        <div className="flex space-x-3">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
{t.common.cancel}
              </button>
              <button
                onClick={handleSave}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
                <Save className="h-4 w-4 mr-2" />
{t.settings.saveChanges}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
              >
{t.settings.editSettings}
              </button>
              <button
                onClick={handleExportAllData}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                <Download className="h-4 w-4 mr-2" />
{t.settings.exportAllData}
              </button>
              <button
                onClick={handleImportAllData}
                disabled={isImporting}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isImporting ? t.settings.importing : t.settings.importAllData}
              </button>
              <button
                onClick={handleClearAllData}
                className="inline-flex items-center px-4 py-2 border border-red-600 text-sm font-medium rounded-md shadow-sm text-red-800 bg-red-50 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                {t.settings.clearAllData}
              </button>
            </>
          )}
        </div>
      </div>

      {/* General Settings */}
      {pharmacyRules ? (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
{t.settings.generalRules}
            </h3>
            
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-800">{t.settings.openingTime}</label>
                <input
                  type="time"
                  value={pharmacyRules.openingTime}
                  onChange={(e) => setPharmacyRules({ ...pharmacyRules, openingTime: e.target.value })}
                  disabled={!isEditing}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800">{t.settings.closingTime}</label>
                <input
                  type="time"
                  value={pharmacyRules.closingTime}
                  onChange={(e) => setPharmacyRules({ ...pharmacyRules, closingTime: e.target.value })}
                  disabled={!isEditing}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800">{t.settings.breakStartTime}</label>
                <input
                  type="time"
                  value={pharmacyRules.breakStartTime}
                  onChange={(e) => setPharmacyRules({ ...pharmacyRules, breakStartTime: e.target.value })}
                  disabled={!isEditing}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800">{t.settings.breakEndTime}</label>
                <input
                  type="time"
                  value={pharmacyRules.breakEndTime}
                  onChange={(e) => setPharmacyRules({ ...pharmacyRules, breakEndTime: e.target.value })}
                  disabled={!isEditing}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800">{t.settings.maxHoursPerShift}</label>
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={pharmacyRules.maxHoursPerShift}
                  onChange={(e) => setPharmacyRules({ ...pharmacyRules, maxHoursPerShift: parseInt(e.target.value) })}
                  disabled={!isEditing}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800">{t.settings.maxHoursPerDay}</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={pharmacyRules.maxHoursPerDay}
                  onChange={(e) => setPharmacyRules({ ...pharmacyRules, maxHoursPerDay: parseInt(e.target.value) })}
                  disabled={!isEditing}
                  className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <p className="text-gray-500">{t.settings.noPharmacyRules}</p>
          </div>
        </div>
      )}

      {/* Staffing Requirements */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
{t.settings.staffingRequirements}
            </h3>
            {isEditing && (
              <button
                onClick={addStaffingRequirement}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-blue-600 bg-blue-100 hover:bg-blue-200"
              >
                <Plus className="h-4 w-4 mr-1" />
{t.settings.addRequirement}
              </button>
            )}
          </div>

          <div className="space-y-4">
            {pharmacyRules && pharmacyRules.staffingRequirements && pharmacyRules.staffingRequirements.map((requirement) => (
              <div key={requirement.id} className="flex items-center space-x-4 p-4 border border-gray-200 rounded-lg">
                <div className="flex-1 grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-800">{t.settings.startTime}</label>
                    <input
                      type="time"
                      value={requirement.startTime}
                      onChange={(e) => updateStaffingRequirement(requirement.id, { startTime: e.target.value })}
                      disabled={!isEditing}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800">{t.settings.endTime}</label>
                    <input
                      type="time"
                      value={requirement.endTime}
                      onChange={(e) => updateStaffingRequirement(requirement.id, { endTime: e.target.value })}
                      disabled={!isEditing}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-800">{t.settings.requiredPharmacists}</label>
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={requirement.requiredPharmacists}
                      onChange={(e) => updateStaffingRequirement(requirement.id, { requiredPharmacists: parseInt(e.target.value) })}
                      disabled={!isEditing}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                    />
                  </div>
                </div>
                {isEditing && (
                  <button
                    onClick={() => removeStaffingRequirement(requirement.id)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed Shift Patterns */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg leading-6 font-medium text-gray-900">
{t.settings.fixedShiftPatterns}
            </h3>
            {isEditing && (
              <button
                onClick={addFixedShiftPattern}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-blue-600 bg-blue-100 hover:bg-blue-200"
              >
                <Plus className="h-4 w-4 mr-1" />
{t.settings.addPattern}
              </button>
            )}
          </div>

          <div className="space-y-4">
            {(pharmacyRules?.fixedShiftPatterns || []).map((pattern, index) => (
              <div key={pattern.id} className="border border-gray-200 rounded-lg p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
{t.settings.patternName}
                    </label>
                    <input
                      type="text"
                      value={pattern.name}
                      onChange={(e) => updateFixedShiftPattern(pattern.id, { name: e.target.value })}
                      disabled={!isEditing}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
{t.settings.shortForm}
                    </label>
                    <input
                      type="text"
                      value={pattern.shortForm || ''}
                      onChange={(e) => updateFixedShiftPattern(pattern.id, { shortForm: e.target.value })}
                      disabled={!isEditing}
                      placeholder={t.settings.shortFormPlaceholder}
                      maxLength={4}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
{t.settings.morningStart}
                    </label>
                    <input
                      type="time"
                      value={pattern.morningShift.startTime}
                      onChange={(e) => updateFixedShiftPattern(pattern.id, { 
                        morningShift: { ...pattern.morningShift, startTime: e.target.value }
                      })}
                      disabled={!isEditing}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
{t.settings.morningEnd}
                    </label>
                    <input
                      type="time"
                      value={pattern.morningShift.endTime}
                      onChange={(e) => updateFixedShiftPattern(pattern.id, { 
                        morningShift: { ...pattern.morningShift, endTime: e.target.value }
                      })}
                      disabled={!isEditing}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
{t.settings.afternoonStart}
                    </label>
                    <input
                      type="time"
                      value={pattern.afternoonShift.startTime}
                      onChange={(e) => updateFixedShiftPattern(pattern.id, { 
                        afternoonShift: { ...pattern.afternoonShift, startTime: e.target.value }
                      })}
                      disabled={!isEditing}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
{t.settings.afternoonEnd}
                    </label>
                    <input
                      type="time"
                      value={pattern.afternoonShift.endTime}
                      onChange={(e) => updateFixedShiftPattern(pattern.id, { 
                        afternoonShift: { ...pattern.afternoonShift, endTime: e.target.value }
                      })}
                      disabled={!isEditing}
                      className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-50 text-gray-900"
                    />
                  </div>
                </div>
                
                {isEditing && (
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={() => removeFixedShiftPattern(pattern.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
            
            {(!pharmacyRules?.fixedShiftPatterns || pharmacyRules.fixedShiftPatterns.length === 0) && (
              <div className="text-center py-8 text-gray-500">
{t.settings.noPatternsConfigured}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
