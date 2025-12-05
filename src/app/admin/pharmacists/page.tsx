'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, User, X } from 'lucide-react';
import { DataManager } from '@/lib/data';
import { Pharmacist, PharmacyRules } from '@/types';
import { useLanguage } from '@/lib/language-context';

export default function PharmacistsPage() {
  const [pharmacists, setPharmacists] = useState<Pharmacist[]>([]);
  const [pharmacyRules, setPharmacyRules] = useState<PharmacyRules | null>(DataManager.getInstance().getPharmacyRules());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPharmacist, setEditingPharmacist] = useState<Pharmacist | null>(null);
  const { t } = useLanguage();

  useEffect(() => {
    const loadData = async () => {
      const dataManager = DataManager.getInstance();
      const loadedPharmacists = await dataManager.getPharmacistsAsync();
      const loadedPharmacyRules = await dataManager.getPharmacyRulesAsync();
      setPharmacists(loadedPharmacists);
      setPharmacyRules(loadedPharmacyRules);
    };
    loadData();
  }, []);

  const handleAddPharmacist = async (pharmacist: Omit<Pharmacist, 'id'>) => {
    const dataManager = DataManager.getInstance();
    const newPharmacist: Pharmacist = {
      ...pharmacist,
      id: `pharmacist_${Date.now()}`,
    };
    await dataManager.addPharmacist(newPharmacist);
    const updatedPharmacists = await dataManager.getPharmacistsAsync();
    setPharmacists(updatedPharmacists);
    setIsAddModalOpen(false);
  };

  const handleUpdatePharmacist = async (id: string, updates: Partial<Pharmacist>) => {
    const dataManager = DataManager.getInstance();
    await dataManager.updatePharmacist(id, updates);
    const updatedPharmacists = await dataManager.getPharmacistsAsync();
    setPharmacists(updatedPharmacists);
    setEditingPharmacist(null);
  };

  const handleDeletePharmacist = async (id: string) => {
    if (confirm(t.pharmacists.confirmDelete)) {
      const dataManager = DataManager.getInstance();
      await dataManager.deletePharmacist(id);
      const updatedPharmacists = await dataManager.getPharmacistsAsync();
      setPharmacists(updatedPharmacists);
    }
  };

  const getDayName = (dayName: string) => {
    return dayName || 'Unknown';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.pharmacists.title}</h1>
          <p className="text-gray-600">{t.pharmacists.subtitle}</p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t.pharmacists.addPharmacist}
        </button>
      </div>

      {/* Pharmacists Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {pharmacists.map((pharmacist) => (
          <div key={pharmacist.id} className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center">
                    <User className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="ml-4 flex-1">
                  <h3 className="text-lg font-medium text-gray-900">{pharmacist.name}</h3>
                  <p className="text-sm text-gray-500">{pharmacist.email}</p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setEditingPharmacist(pharmacist)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleDeletePharmacist(pharmacist.id)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">{t.pharmacists.weeklyHours}:</span>
                  <span className="font-medium text-gray-900">{pharmacist.weeklyHours}h</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-700">{t.pharmacists.status}:</span>
                  <span className={`font-medium ${pharmacist.isActive ? 'text-green-600' : 'text-red-600'}`}>
                    {pharmacist.isActive ? t.pharmacists.active : t.pharmacists.inactive}
                  </span>
                </div>
                
                {/* Day Preferences - Box visualization */}
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-xs font-medium text-gray-700 mb-2">{t.pharmacists.dayPreferencesLabel}</div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
                      // Get day abbreviation
                      const dayAbbr = day.substring(0, 3);
                      
                      // Check if this day has a pattern or free day
                      const dayPattern = pharmacist.fixedDayPatterns?.find(p => p.dayOfWeek === day);
                      const isFreeDay = dayPattern?.patternId === 'FREE_DAY' || 
                                       (pharmacist.freeDay === day && !pharmacist.fixedDayPatterns?.some(p => p.patternId === 'FREE_DAY'));
                      
                      let content = t.pharmacists.na;
                      let bgColor = 'bg-gray-100';
                      let textColor = 'text-gray-500';
                      
                      if (isFreeDay) {
                        content = '🎉';
                        bgColor = 'bg-blue-100';
                        textColor = 'text-blue-700';
                      } else if (dayPattern) {
                        const pattern = pharmacyRules.fixedShiftPatterns?.find(p => p.id === dayPattern.patternId);
                        content = pattern?.shortForm || dayPattern.patternId.substring(0, 3).toUpperCase();
                        bgColor = 'bg-green-100';
                        textColor = 'text-green-700';
                      }
                      
                      return (
                        <div
                          key={day}
                          className={`${bgColor} ${textColor} rounded-md p-1.5 text-center border border-gray-200`}
                        >
                          <div className="text-[10px] font-semibold mb-0.5 opacity-75">
                            {dayAbbr}
                          </div>
                          <div className="text-xs font-bold">
                            {content}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Pharmacist Modal */}
      {isAddModalOpen && (
        <PharmacistModal
          pharmacyRules={pharmacyRules}
          onSave={handleAddPharmacist}
          onClose={() => setIsAddModalOpen(false)}
        />
      )}

      {/* Edit Pharmacist Modal */}
      {editingPharmacist && (
        <PharmacistModal
          pharmacist={editingPharmacist}
          pharmacyRules={pharmacyRules}
          onSave={async (updates) => {
            // Extract only the fields that should be updated (exclude id)
            const { id, ...updateFields } = updates as Pharmacist;
            await handleUpdatePharmacist(editingPharmacist.id, updateFields);
          }}
          onClose={() => setEditingPharmacist(null)}
        />
      )}
    </div>
  );
}

interface PharmacistModalProps {
  pharmacist?: Pharmacist;
  pharmacyRules: PharmacyRules;
  onSave: (pharmacist: Pharmacist | Omit<Pharmacist, 'id'>) => void;
  onClose: () => void;
}

function PharmacistModal({ pharmacist, pharmacyRules, onSave, onClose }: PharmacistModalProps) {
  // Initialize formData: convert freeDay to fixedDayPatterns format
  const initializeFormData = () => {
    const fixedDayPatterns = pharmacist?.fixedDayPatterns || [];
    // If pharmacist has freeDay but no fixedDayPatterns with FREE_DAY, add it
    if (pharmacist?.freeDay && !fixedDayPatterns.some(p => p.patternId === 'FREE_DAY')) {
      fixedDayPatterns.push({
        dayOfWeek: pharmacist.freeDay,
        patternId: 'FREE_DAY',
      });
    }
    return {
      name: pharmacist?.name || '',
      email: pharmacist?.email || '',
      weeklyHours: pharmacist?.weeklyHours || 40,
      isActive: pharmacist?.isActive ?? true,
      fixedDayPatterns: fixedDayPatterns,
    };
  };

  const [formData, setFormData] = useState(initializeFormData());
  const [editingDay, setEditingDay] = useState<string | null>(null);
  
  const [newDayPattern, setNewDayPattern] = useState({
    dayOfWeek: '',
    patternId: '',
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (editingDay && !(event.target as Element).closest('.day-preference-box')) {
        setEditingDay(null);
      }
    };

    if (editingDay) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [editingDay]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Extract freeDay from fixedDayPatterns (for backward compatibility)
    const freeDayPatterns = formData.fixedDayPatterns.filter(p => p.patternId === 'FREE_DAY');
    const freeDay = freeDayPatterns.length > 0 ? freeDayPatterns[0].dayOfWeek : (pharmacist?.freeDay || 'Monday');
    
    // Keep FREE_DAY in fixedDayPatterns (it's now part of the standard structure)
    // But also set freeDay for backward compatibility
    const fixedDayPatterns = [...formData.fixedDayPatterns]; // Keep all patterns including FREE_DAY
    
    const pharmacistData = {
      ...formData,
      freeDay, // Keep for backward compatibility (use first free day or existing)
      fixedDayPatterns,
    };
    
    // If editing, include the id
    if (pharmacist) {
      (pharmacistData as Pharmacist).id = pharmacist.id;
    }
    
    onSave(pharmacistData);
  };

  const dayOptions = [
    { value: 'Monday', label: 'Monday' },
    { value: 'Tuesday', label: 'Tuesday' },
    { value: 'Wednesday', label: 'Wednesday' },
    { value: 'Thursday', label: 'Thursday' },
    { value: 'Friday', label: 'Friday' },
    { value: 'Saturday', label: 'Saturday' },
    { value: 'Sunday', label: 'Sunday' },
  ];

  // Get available days (days not already assigned)
  const getAvailableDays = () => {
    const assignedDays = formData.fixedDayPatterns.map(p => p.dayOfWeek);
    return dayOptions.filter(day => !assignedDays.includes(day.value));
  };

  // Get pattern options including "Free Day"
  const getPatternOptions = () => {
    const patternOptions = (pharmacyRules.fixedShiftPatterns || []).map(pattern => ({
      value: pattern.id,
      label: `${pattern.name}${pattern.shortForm ? ` (${pattern.shortForm})` : ''}`,
    }));
    
    // Add "Free Day" option at the beginning
    return [
      { value: 'FREE_DAY', label: 'Free Day' },
      ...patternOptions,
    ];
  };

  const handleAddDayPattern = () => {
    if (newDayPattern.dayOfWeek && newDayPattern.patternId) {
      setFormData({
        ...formData,
        fixedDayPatterns: [...formData.fixedDayPatterns, { ...newDayPattern }],
      });
      setNewDayPattern({ dayOfWeek: '', patternId: '' });
    }
  };

  const handleRemoveDayPattern = (index: number) => {
    setFormData({
      ...formData,
      fixedDayPatterns: formData.fixedDayPatterns.filter((_, i) => i !== index),
    });
  };

  const handleDayPatternChange = (day: string, patternId: string | null) => {
    // Remove existing pattern for this day
    const updatedPatterns = formData.fixedDayPatterns.filter(p => p.dayOfWeek !== day);
    
    // If patternId is not null and not 'N/A', add the new pattern
    if (patternId && patternId !== 'N/A') {
      updatedPatterns.push({
        dayOfWeek: day,
        patternId: patternId,
      });
    }
    
    setFormData({
      ...formData,
      fixedDayPatterns: updatedPatterns,
    });
    
    setEditingDay(null);
  };

  const getDayPattern = (day: string) => {
    return formData.fixedDayPatterns.find(p => p.dayOfWeek === day);
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" 
          onClick={onClose}
        ></div>

        <div 
          className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <form onSubmit={handleSubmit}>
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg leading-6 font-medium text-gray-900">
{pharmacist ? t.pharmacists.editPharmacist : t.pharmacists.addNewPharmacist}
                </h3>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-800">{t.pharmacists.name}</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800">{t.pharmacists.email}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-800">{t.pharmacists.weeklyHours}</label>
                  <input
                    type="number"
                    min="1"
                    max="40"
                    value={formData.weeklyHours}
                    onChange={(e) => setFormData({ ...formData, weeklyHours: parseInt(e.target.value) })}
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm text-gray-900"
                    required
                  />
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
{t.pharmacists.active}
                  </label>
                </div>

                {/* Day Preferences - Box visualization with clickable editing */}
                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-sm font-medium text-gray-800 mb-3">
{t.pharmacists.dayPreferences}
                  </label>
                  <div className="grid grid-cols-6 gap-1.5">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
                      const dayAbbr = day.substring(0, 3);
                      const dayPattern = getDayPattern(day);
                      const isFreeDay = dayPattern?.patternId === 'FREE_DAY';
                      
                      let content = t.pharmacists.na;
                      let bgColor = 'bg-gray-100';
                      let textColor = 'text-gray-500';
                      
                      if (isFreeDay) {
                        content = '🎉';
                        bgColor = 'bg-blue-100';
                        textColor = 'text-blue-700';
                      } else if (dayPattern) {
                        const pattern = pharmacyRules.fixedShiftPatterns?.find(p => p.id === dayPattern.patternId);
                        content = pattern?.shortForm || dayPattern.patternId.substring(0, 3).toUpperCase();
                        bgColor = 'bg-green-100';
                        textColor = 'text-green-700';
                      }
                      
                      const isEditing = editingDay === day;
                      
                      return (
                        <div key={day} className="relative day-preference-box">
                          {isEditing ? (
                            <div className="absolute z-50 w-full bg-white rounded-lg shadow-lg border-2 border-blue-500 overflow-hidden">
                              <div className="max-h-48 overflow-y-auto">
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDayPatternChange(day, null);
                                    setEditingDay(null);
                                  }}
                                  className={`w-full px-3 py-2 text-left text-xs font-semibold hover:bg-gray-100 transition-colors ${
                                    !dayPattern ? 'bg-blue-50 text-blue-700' : 'text-gray-900'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span>{t.pharmacists.na}</span>
                                    {!dayPattern && <span className="text-blue-600">✓</span>}
                                  </div>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    handleDayPatternChange(day, 'FREE_DAY');
                                    setEditingDay(null);
                                  }}
                                  className={`w-full px-3 py-2 text-left text-xs font-semibold hover:bg-blue-50 transition-colors ${
                                    isFreeDay ? 'bg-blue-50 text-blue-700' : 'text-gray-900'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span>{t.pharmacists.freeDayOption}</span>
                                    {isFreeDay && <span className="text-blue-600">✓</span>}
                                  </div>
                                </button>
                                {pharmacyRules.fixedShiftPatterns?.map((pattern) => {
                                  const isSelected = dayPattern?.patternId === pattern.id;
                                  return (
                                    <button
                                      key={pattern.id}
                                      type="button"
                                      onClick={() => {
                                        handleDayPatternChange(day, pattern.id);
                                        setEditingDay(null);
                                      }}
                                      className={`w-full px-3 py-2 text-left text-xs font-semibold hover:bg-green-50 transition-colors ${
                                        isSelected ? 'bg-green-50 text-green-700' : 'text-gray-900'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <span>{pattern.shortForm || pattern.name.substring(0, 3).toUpperCase()}</span>
                                        {isSelected && <span className="text-green-600">✓</span>}
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                          <div
                            onClick={() => {
                              if (isEditing) {
                                // If already editing, close it (reconfirm current selection)
                                setEditingDay(null);
                              } else {
                                setEditingDay(day);
                              }
                            }}
                            className={`${bgColor} ${textColor} rounded-md p-1.5 text-center border border-gray-200 cursor-pointer hover:border-blue-400 hover:shadow-sm transition-all relative z-10`}
                          >
                            <div className="text-[10px] font-semibold mb-0.5 opacity-75">
                              {dayAbbr}
                            </div>
                            <div className="text-xs font-bold">
                              {content}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
              <button
                type="submit"
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
              >
{pharmacist ? t.pharmacists.update : t.pharmacists.add} {t.pharmacists.title.slice(0, -1)}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              >
{t.common.cancel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
