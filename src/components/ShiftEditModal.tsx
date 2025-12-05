'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Shift, Pharmacist, PharmacyRules, FixedShiftPattern } from '@/types';
import { useLanguage } from '@/lib/language-context';

interface ShiftEditModalProps {
  shift: Shift | null;
  pharmacistShifts?: Shift[];
  pharmacist: Pharmacist | null;
  pharmacists: Pharmacist[];
  pharmacyRules: PharmacyRules | undefined;
  date: string;
  timeSlot?: string | null;
  onClose: () => void;
  onSave: (updatedShifts: Shift[]) => Promise<void>;
}

export default function ShiftEditModal({
  shift,
  pharmacistShifts = [],
  pharmacist,
  pharmacists,
  pharmacyRules,
  date,
  timeSlot,
  onClose,
  onSave,
}: ShiftEditModalProps) {
  const [selectedPharmacistId, setSelectedPharmacistId] = useState<string>(pharmacist?.id || '');
  const [selectedPatternId, setSelectedPatternId] = useState<string>('');
  const [useCustomTimes, setUseCustomTimes] = useState(false);
  const [morningEnabled, setMorningEnabled] = useState(true);
  const [afternoonEnabled, setAfternoonEnabled] = useState(true);
  const [morningStart, setMorningStart] = useState('09:00');
  const [morningEnd, setMorningEnd] = useState('12:30');
  const [afternoonStart, setAfternoonStart] = useState('13:00');
  const [afternoonEnd, setAfternoonEnd] = useState('17:30');
  const { t } = useLanguage();

  useEffect(() => {
    if (shift && pharmacyRules) {
      // Find morning and afternoon shifts from pharmacistShifts
      const morningShift = pharmacistShifts.find(s => s.type === 'morning');
      const afternoonShift = pharmacistShifts.find(s => s.type === 'afternoon');
      
      // Check if both shifts use the same pattern
      const patternId = morningShift?.patternId || afternoonShift?.patternId;
      const bothUseSamePattern = morningShift?.patternId === afternoonShift?.patternId && patternId;
      
      if (patternId && bothUseSamePattern) {
        setSelectedPatternId(patternId);
        setUseCustomTimes(false);
        
        // Load pattern times
        const pattern = pharmacyRules.fixedShiftPatterns?.find(p => p.id === patternId);
        if (pattern) {
          setMorningStart(pattern.morningShift.startTime);
          setMorningEnd(pattern.morningShift.endTime);
          setAfternoonStart(pattern.afternoonShift.startTime);
          setAfternoonEnd(pattern.afternoonShift.endTime);
          setMorningEnabled(!!morningShift);
          setAfternoonEnabled(!!afternoonShift);
        }
      } else {
        setUseCustomTimes(true);
        // Extract times from existing shifts
        if (morningShift) {
          setMorningStart(morningShift.startTime);
          setMorningEnd(morningShift.endTime);
          setMorningEnabled(true);
        } else {
          setMorningEnabled(false);
        }
        
        if (afternoonShift) {
          setAfternoonStart(afternoonShift.startTime);
          setAfternoonEnd(afternoonShift.endTime);
          setAfternoonEnabled(true);
        } else {
          setAfternoonEnabled(false);
        }
      }
    } else if (!shift && timeSlot) {
      // Empty slot clicked - initialize with default values
      setSelectedPharmacistId('');
      setSelectedPatternId('');
      setUseCustomTimes(true);
      setMorningEnabled(true);
      setAfternoonEnabled(true);
      // Set default times based on clicked time slot or use defaults
      setMorningStart('09:00');
      setMorningEnd('12:30');
      setAfternoonStart('13:00');
      setAfternoonEnd('17:30');
    }
  }, [shift, pharmacyRules, pharmacistShifts, timeSlot]);

  const handlePatternChange = (patternId: string) => {
    setSelectedPatternId(patternId);
    setUseCustomTimes(false);
    
    const pattern = pharmacyRules?.fixedShiftPatterns?.find(p => p.id === patternId);
    if (pattern) {
      setMorningStart(pattern.morningShift.startTime);
      setMorningEnd(pattern.morningShift.endTime);
      setAfternoonStart(pattern.afternoonShift.startTime);
      setAfternoonEnd(pattern.afternoonShift.endTime);
      setMorningEnabled(true);
      setAfternoonEnabled(true);
    }
  };

  const handleSave = async () => {
    if (!selectedPharmacistId) {
      alert(t.shiftModal.pleaseSelectPharmacist);
      return;
    }

    const selectedPharmacist = pharmacists.find(p => p.id === selectedPharmacistId);
    if (!selectedPharmacist) return;

    const updatedShifts: Shift[] = [];

    const baseShift: Partial<Shift> = shift ? {
      ...shift,
      pharmacistId: selectedPharmacistId,
      date: date,
    } : {
      pharmacistId: selectedPharmacistId,
      date: date,
      isBreakTime: false,
    };

    if (useCustomTimes || !selectedPatternId) {
      // Custom times
      if (morningEnabled) {
        updatedShifts.push({
          ...baseShift,
          id: `shift_${date}_${selectedPharmacistId}_morning`,
          type: 'morning',
          startTime: morningStart,
          endTime: morningEnd,
          patternId: undefined,
        } as Shift);
      }
      
      if (afternoonEnabled) {
        updatedShifts.push({
          ...baseShift,
          id: `shift_${date}_${selectedPharmacistId}_afternoon`,
          type: 'afternoon',
          startTime: afternoonStart,
          endTime: afternoonEnd,
          patternId: undefined,
        } as Shift);
      }
    } else {
      // Use pattern
      const pattern = pharmacyRules?.fixedShiftPatterns?.find(p => p.id === selectedPatternId);
      if (pattern) {
        if (morningEnabled) {
          updatedShifts.push({
            ...baseShift,
            id: `shift_${date}_${selectedPharmacistId}_morning`,
            type: 'morning',
            startTime: pattern.morningShift.startTime,
            endTime: pattern.morningShift.endTime,
            patternId: selectedPatternId,
          } as Shift);
        }
        
        if (afternoonEnabled) {
          updatedShifts.push({
            ...baseShift,
            id: `shift_${date}_${selectedPharmacistId}_afternoon`,
            type: 'afternoon',
            startTime: pattern.afternoonShift.startTime,
            endTime: pattern.afternoonShift.endTime,
            patternId: selectedPatternId,
          } as Shift);
        }
      }
    }

    // Always pass the pharmacistId even if shifts array is empty (for removal)
    // This ensures the parent can identify which pharmacist to remove
    if (updatedShifts.length === 0 && selectedPharmacistId) {
      // When removing, pass a special marker so parent knows to remove this pharmacist
      // We'll use a shift with a special flag or just ensure pharmacistId is accessible
      const result = onSave([]);
      if (result instanceof Promise) {
        await result;
      }
    } else {
      const result = onSave(updatedShifts);
      if (result instanceof Promise) {
        await result;
      }
    }
    // Don't close here - let HourlyCalendar close after state update
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {shift ? `${t.shiftModal.editShift} - ${pharmacist?.name || ''}` : t.shiftModal.createNewShift}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Pharmacist Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
{t.shiftModal.pharmacist}
            </label>
            <select
              value={selectedPharmacistId}
              onChange={(e) => setSelectedPharmacistId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">{t.shiftModal.selectPharmacist}</option>
              {pharmacists.filter(p => p.isActive).map((pharmacist) => (
                <option key={pharmacist.id} value={pharmacist.id}>
                  {pharmacist.name}
                </option>
              ))}
            </select>
          </div>

          {/* Pattern Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
{t.shiftModal.fixedShiftPattern}
            </label>
            <select
              value={selectedPatternId}
              onChange={(e) => {
                if (e.target.value) {
                  handlePatternChange(e.target.value);
                } else {
                  setSelectedPatternId('');
                  setUseCustomTimes(true);
                }
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">{t.shiftModal.customTimes}</option>
              {pharmacyRules?.fixedShiftPatterns?.map((pattern) => (
                <option key={pattern.id} value={pattern.id}>
                  {pattern.name} {pattern.shortForm ? `(${pattern.shortForm})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Custom Times Section */}
          <div className="space-y-4 border-t border-gray-200 pt-4">
            {(!morningEnabled && !afternoonEnabled) && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-2">
                <p className="text-sm text-yellow-800">
{t.shiftModal.bothShiftsDisabled}
                </p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">{t.shiftModal.morningShift}</h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={morningEnabled}
                  onChange={(e) => setMorningEnabled(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">{t.shiftModal.enable}</span>
              </label>
            </div>
            
            {morningEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">{t.shiftModal.startTime}</label>
                  <input
                    type="time"
                    value={morningStart}
                    onChange={(e) => setMorningStart(e.target.value)}
                    disabled={!useCustomTimes && selectedPatternId !== ''}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">{t.shiftModal.endTime}</label>
                  <input
                    type="time"
                    value={morningEnd}
                    onChange={(e) => setMorningEnd(e.target.value)}
                    disabled={!useCustomTimes && selectedPatternId !== ''}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">{t.shiftModal.afternoonShift}</h3>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={afternoonEnabled}
                  onChange={(e) => setAfternoonEnabled(e.target.checked)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-600">{t.shiftModal.enable}</span>
              </label>
            </div>
            
            {afternoonEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">{t.shiftModal.startTime}</label>
                  <input
                    type="time"
                    value={afternoonStart}
                    onChange={(e) => setAfternoonStart(e.target.value)}
                    disabled={!useCustomTimes && selectedPatternId !== ''}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">{t.shiftModal.endTime}</label>
                  <input
                    type="time"
                    value={afternoonEnd}
                    onChange={(e) => setAfternoonEnd(e.target.value)}
                    disabled={!useCustomTimes && selectedPatternId !== ''}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  />
                </div>
              </div>
            )}

            {selectedPatternId && !useCustomTimes && (
              <button
                onClick={() => {
                  setUseCustomTimes(true);
                  setSelectedPatternId('');
                }}
                className="text-sm text-blue-600 hover:text-blue-800 mt-2"
              >
{t.shiftModal.useCustomTimesInstead}
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
{t.common.cancel}
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedPharmacistId}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
{(!morningEnabled && !afternoonEnabled) ? t.shiftModal.removeFromDay : t.shiftModal.save}
          </button>
        </div>
      </div>
    </div>
  );
}
