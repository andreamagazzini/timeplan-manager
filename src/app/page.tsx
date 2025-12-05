'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, Users, Plus, Download, Trash2, X } from 'lucide-react';
import { DataManager } from '@/lib/data';
import { ScheduleGenerator } from '@/lib/scheduler';
import { exportScheduleToICS, downloadICS } from '@/lib/export';
import { Pharmacist, Schedule, Shift, PharmacyRules } from '@/types';
import { useLanguage } from '@/lib/language-context';
import HourlyCalendar from '@/components/HourlyCalendar';

export default function AdminDashboard() {
  const [pharmacists, setPharmacists] = useState<Pharmacist[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [pharmacyRules, setPharmacyRules] = useState<PharmacyRules | null>(DataManager.getInstance().getPharmacyRules());
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedWeeksForExport, setSelectedWeeksForExport] = useState<Set<string>>(new Set());
  const { t } = useLanguage();

  useEffect(() => {
    const loadData = async () => {
      const dataManager = DataManager.getInstance();
      const loadedPharmacists = await dataManager.getPharmacistsAsync();
      const loadedSchedules = await dataManager.getSchedulesAsync();
      const loadedPharmacyRules = await dataManager.getPharmacyRulesAsync();
      
      console.log('Admin page loaded data:');
      console.log('- Pharmacists:', loadedPharmacists.map(p => `${p.name} (freeDay: ${p.freeDay})`));
      console.log('- Laura specifically:', loadedPharmacists.find(p => p.name === 'Laura'));
      if (loadedPharmacyRules) {
        console.log('- Pharmacy Rules staffing requirements:', loadedPharmacyRules.staffingRequirements.map(r => 
          `${r.startTime}-${r.endTime} (${r.requiredPharmacists})`
        ).join(', '));
      }
      
      setPharmacists(loadedPharmacists);
      setSchedules(loadedSchedules);
      setPharmacyRules(loadedPharmacyRules);
    };
    
    loadData();
  }, []);

  const generateSchedule = async () => {
    try {
      const dataManager = DataManager.getInstance();
      const pharmacists = await dataManager.getPharmacistsAsync();
      const pharmacyRules = await dataManager.getPharmacyRulesAsync();
      
      if (!pharmacyRules) {
        alert(t.admin.noPharmacyRules);
        return;
      }
      
      console.log('Generating schedule with pharmacyRules:', pharmacyRules.staffingRequirements.map(r => 
        `${r.startTime}-${r.endTime} (${r.requiredPharmacists})`
      ).join(', '));

      // Calculate the Monday of the currently viewed week
      const weekDates = getWeekDates(currentWeek);
      const weekStartDate = weekDates[0]; // Monday of the viewed week
      
      console.log('Generating schedule for viewed week:', weekStartDate.toISOString().split('T')[0]);

      const generator = new ScheduleGenerator(pharmacists, pharmacyRules);
      const newSchedules = generator.generateSchedule(1, weekStartDate); // Generate for the viewed week

      console.log('Generated schedules:', newSchedules);
      console.log('Target week start:', weekStartDate.toISOString().split('T')[0]);

      // Merge with existing schedules (don't overwrite other weeks)
      const allSchedules = await dataManager.getSchedulesAsync();
      const weekStartStr = weekStartDate.toISOString().split('T')[0];
      const existingIndex = allSchedules.findIndex(s => s.weekStart === weekStartStr);
      
      if (existingIndex >= 0) {
        // Replace existing schedule for this week
        allSchedules[existingIndex] = newSchedules[0];
        console.log(`Replaced existing schedule for week ${weekStartStr}`);
      } else {
        // Add new schedule
        allSchedules.push(newSchedules[0]);
        console.log(`Added new schedule for week ${weekStartStr}`);
      }
      
      // Save all schedules
      dataManager.saveSchedules(allSchedules);
      setSchedules(allSchedules);
      
      console.log('Schedule generated successfully for week:', weekStartStr);
    } catch (error) {
      console.error('Error generating schedule:', error);
      alert(error instanceof Error ? error.message : t.admin.generateScheduleError);
    }
  };

  const clearCurrentWeek = () => {
    const weekStartStr = weekDates[0].toISOString().split('T')[0];
    const weekStartDate = weekDates[0];
    const weekLabel = weekStartDate.toLocaleDateString('it-IT', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
    if (confirm(t.admin.resetWeekConfirm.replace('{weekStart}', weekLabel))) {
      const dataManager = DataManager.getInstance();
      const updatedSchedules = schedules.filter(s => s.weekStart !== weekStartStr);
      dataManager.saveSchedules(updatedSchedules);
      setSchedules(updatedSchedules);
      console.log(`Week ${weekStartStr} cleared!`);
    }
  };

  const openExportModal = () => {
    // Initialize with all weeks selected
    const allWeekStarts = new Set(schedules.map(s => s.weekStart));
    setSelectedWeeksForExport(allWeekStarts);
    setIsExportModalOpen(true);
  };

  const handleExportSchedules = () => {
    if (selectedWeeksForExport.size === 0) {
      alert('Seleziona almeno una settimana da esportare'); // TODO: add to translations
      return;
    }
    
    const schedulesToExport = schedules.filter(s => selectedWeeksForExport.has(s.weekStart));
    const icsContent = exportScheduleToICS(schedulesToExport, pharmacists);
    downloadICS(icsContent, `pharmacy-schedules-${new Date().toISOString().split('T')[0]}.ics`);
    setIsExportModalOpen(false);
    setSelectedWeeksForExport(new Set());
  };

  const getWeekDates = (date: Date) => {
    const start = new Date(date);
    start.setDate(date.getDate() - date.getDay() + 1); // Monday
    
    const dates = [];
    for (let i = 0; i < 6; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(start.getDate() + i);
      dates.push(currentDate);
    }
    return dates;
  };

  const weekDates = getWeekDates(currentWeek);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  console.log('Admin - Current week:', currentWeek.toDateString());
  console.log('Admin - Week dates:', weekDates.map(d => d.toDateString()));
  console.log('Admin - Week start:', weekDates[0].toISOString().split('T')[0]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t.admin.title}</h1>
          <p className="text-gray-600">{t.admin.subtitle}</p>
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
          <button
            onClick={generateSchedule}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full sm:w-auto justify-center"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t.admin.generateSchedule}
          </button>
          <button
            onClick={clearCurrentWeek}
            className="inline-flex items-center px-4 py-2 border border-red-300 text-sm font-medium rounded-md shadow-sm text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 w-full sm:w-auto justify-center"
          >
            <Trash2 className="h-4 w-4 mr-2" />
{t.admin.resetWeek}
          </button>
          <button
            onClick={openExportModal}
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 w-full sm:w-auto justify-center"
          >
            <Download className="h-4 w-4 mr-2" />
            {t.admin.exportSchedules}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-3 sm:p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400" />
              </div>
              <div className="ml-3 sm:ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs sm:text-sm font-medium text-gray-500 truncate">
                    {t.admin.activePharmacists}
                  </dt>
                  <dd className="text-base sm:text-lg font-medium text-gray-900">
                    {pharmacists.filter(p => p.isActive).length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-3 sm:p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400" />
              </div>
              <div className="ml-3 sm:ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs sm:text-sm font-medium text-gray-500 truncate">
                    {t.admin.weeksScheduled}
                  </dt>
                  <dd className="text-base sm:text-lg font-medium text-gray-900">
                    {schedules.length}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-3 sm:p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400" />
              </div>
              <div className="ml-3 sm:ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs sm:text-sm font-medium text-gray-500 truncate">
                    {t.admin.totalShifts}
                  </dt>
                  <dd className="text-base sm:text-lg font-medium text-gray-900">
                    {schedules.reduce((total, schedule) => total + schedule.shifts.length, 0)}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-3 sm:p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {(() => {
                  const weekSchedule = schedules.find(s => s.weekStart === weekDates[0].toISOString().split('T')[0]);
                  const hasWarnings = weekSchedule?.warnings && Object.values(weekSchedule.warnings).some(w => w.length > 0);
                  return (
                    <div className={`h-5 w-5 sm:h-6 sm:w-6 rounded-full ${hasWarnings ? 'bg-yellow-400' : 'bg-green-400'}`}></div>
                  );
                })()}
              </div>
              <div className="ml-3 sm:ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-xs sm:text-sm font-medium text-gray-500 truncate">
                    {t.admin.coverageStatus}
                  </dt>
                  <dd className="text-base sm:text-lg font-medium text-gray-900">
                    {(() => {
                      const weekSchedule = schedules.find(s => s.weekStart === weekDates[0].toISOString().split('T')[0]);
                      const hasWarnings = weekSchedule?.warnings && Object.values(weekSchedule.warnings).some(w => w.length > 0);
                      return hasWarnings ? t.admin.hasWarnings : t.admin.optimal;
                    })()}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Weekly Hours Summary */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-3 py-4 sm:px-4 sm:py-5 sm:p-6">
          <h3 className="text-base sm:text-lg leading-6 font-medium text-gray-900 mb-4">
{t.admin.weeklyHoursSummary}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pharmacists.map(pharmacist => {
              const weekSchedule = schedules.find(s => s.weekStart === weekDates[0].toISOString().split('T')[0]);
              const pharmacistShifts = weekSchedule?.shifts.filter(shift => shift.pharmacistId === pharmacist.id) || [];
              const totalHours = pharmacistShifts.reduce((total, shift) => {
                const start = new Date(`2000-01-01T${shift.startTime}`);
                const end = new Date(`2000-01-01T${shift.endTime}`);
                const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                return total + hours;
              }, 0);
              
              // Count pattern usage - group by date and patternId
              // Morning and afternoon shifts on the same day with same pattern count as 1
              const patternCounts: Record<string, number> = {};
              const patternsByDate: Record<string, Set<string>> = {};
              
              pharmacistShifts.forEach(shift => {
                if (shift.patternId) {
                  // Group by date
                  if (!patternsByDate[shift.date]) {
                    patternsByDate[shift.date] = new Set();
                  }
                  patternsByDate[shift.date].add(shift.patternId);
                }
              });
              
              // Count unique patterns per day (morning+afternoon on same day = 1 count)
              Object.values(patternsByDate).forEach(patternSet => {
                patternSet.forEach(patternId => {
                  patternCounts[patternId] = (patternCounts[patternId] || 0) + 1;
                });
              });
              
              const isFullTime = pharmacist.weeklyHours >= 40;
              const hoursStatus = isFullTime ? 
                (totalHours >= 40 ? 'text-green-600' : 'text-red-600') : 
                'text-blue-600';
              
              return (
                <div key={pharmacist.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{pharmacist.name}</h4>
                      <p className="text-xs text-gray-500">
{t.admin.target} {pharmacist.weeklyHours}h/week
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold ${hoursStatus}`}>
                        {totalHours.toFixed(1)}h
                      </p>
                      <p className="text-xs text-gray-500">
                        {isFullTime ? (totalHours >= 40 ? t.admin.complete : t.admin.incomplete) : t.admin.partTime}
                      </p>
                    </div>
                  </div>
                  
                  {/* Pattern counts */}
                  {Object.keys(patternCounts).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <p className="text-xs font-medium text-gray-700 mb-1">{t.admin.patterns}</p>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(patternCounts).map(([patternId, count]) => {
                          const pattern = pharmacyRules?.fixedShiftPatterns?.find(p => p.id === patternId);
                          const patternName = pattern?.shortForm || pattern?.name || patternId;
                          return (
                            <span key={patternId} className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded">
                              {patternName}: {count}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="bg-white shadow rounded-lg">
        <div className="px-3 py-4 sm:px-4 sm:py-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4">
            <h3 className="text-base sm:text-lg leading-6 font-medium text-gray-900">
              {t.admin.currentWeekSchedule}
            </h3>
          </div>
          
          {/* Week Navigation */}
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <button
              onClick={() => setCurrentWeek(new Date(currentWeek.getTime() - 7 * 24 * 60 * 60 * 1000))}
              className="px-2 py-1 sm:px-3 text-xs sm:text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              {t.common.previous} Week
            </button>
            <span className="text-xs sm:text-sm font-medium text-gray-900 text-center">
              {weekDates[0].toLocaleDateString()} - {weekDates[5].toLocaleDateString()}
            </span>
            <button
              onClick={() => setCurrentWeek(new Date(currentWeek.getTime() + 7 * 24 * 60 * 60 * 1000))}
              className="px-2 py-1 sm:px-3 text-xs sm:text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              {t.common.next} Week
            </button>
          </div>

          {/* Hourly Calendar Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {dayNames.map((day, index) => {
              const dateStr = weekDates[index].toISOString().split('T')[0];
              let weekSchedule = schedules.find(s => s.weekStart === weekDates[0].toISOString().split('T')[0]);
              
              // Fallback: if no exact match, use the first available schedule
              if (!weekSchedule && schedules.length > 0) {
                weekSchedule = schedules[0];
                console.log(`No exact week match found, using first schedule:`, weekSchedule.weekStart);
              }
              
              const dayShifts = weekSchedule?.shifts.filter(shift => shift.date === dateStr) || [];
              const dayWarnings = weekSchedule?.warnings?.[dateStr] || [];
              
              console.log(`Day ${day} (${dateStr}):`, {
                weekSchedule: weekSchedule?.weekStart,
                lookingFor: weekDates[0].toISOString().split('T')[0],
                dayShifts: dayShifts.length,
                allSchedules: schedules.map(s => s.weekStart)
              });
              
              if (!pharmacyRules) {
                return (
                  <div key={day} className="p-4 text-center text-gray-500">
                    {t.admin.noPharmacyRules}
                  </div>
                );
              }
              
              return (
                <HourlyCalendar
                  key={day}
                  pharmacists={pharmacists}
                  shifts={dayShifts}
                  date={weekDates[index]}
                  pharmacyRules={pharmacyRules}
                  warnings={dayWarnings}
                  onShiftUpdate={async (updatedShifts) => {
                    // Update the schedule with new shifts
                    const dataManager = DataManager.getInstance();
                    const allSchedules = dataManager.getSchedules(); // Use sync version with cache
                    const dateStr = weekDates[index].toISOString().split('T')[0];
                    
                    // Get pharmacistId from updatedShifts
                    // Check if this is a removal (temp shift with id 'temp_remove')
                    const isRemoval = updatedShifts.length === 1 && updatedShifts[0]?.id === 'temp_remove';
                    const pharmacistId = updatedShifts[0]?.pharmacistId;
                    
                    if (!pharmacistId) {
                      console.warn('Cannot update shifts: no pharmacist ID found');
                      return;
                    }
                    
                    // Find the schedule for this week
                    let weekSchedule = allSchedules.find(s => s.weekStart === weekDates[0].toISOString().split('T')[0]);
                    
                    // If no schedule exists and we're adding shifts, create one
                    if (!weekSchedule) {
                      if (!isRemoval) {
                        weekSchedule = {
                          id: `schedule_${weekDates[0].toISOString().split('T')[0]}`,
                          weekStart: weekDates[0].toISOString().split('T')[0],
                          weekEnd: weekDates[5].toISOString().split('T')[0],
                          shifts: [],
                        };
                        allSchedules.push(weekSchedule);
                      } else {
                        // No schedule exists and we're removing - nothing to do
                        return;
                      }
                    }
                    
                    // Remove old shifts for this pharmacist on this date
                    weekSchedule.shifts = weekSchedule.shifts.filter(
                      s => !(s.pharmacistId === pharmacistId && s.date === dateStr)
                    );
                    
                    // Add new shifts (if not removing)
                    if (!isRemoval) {
                      weekSchedule.shifts.push(...updatedShifts);
                    }
                    
                    // Recalculate warnings for the entire week after shift changes
                    if (pharmacyRules) {
                      const generator = new ScheduleGenerator(pharmacists, pharmacyRules);
                      const recalculatedWarnings = generator.validateSchedule(weekSchedule);
                      weekSchedule.warnings = recalculatedWarnings;
                    }
                    
                    // Save updated schedules
                    dataManager.saveSchedules(allSchedules);
                    // Also update async to sync IndexedDB
                    await dataManager.saveSchedulesAsync(allSchedules).catch(console.error);
                    
                    // Create a new array reference to force React re-render
                    setSchedules([...allSchedules]);
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Export Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
{t.admin.selectWeeksToExport}
              </h2>
              <button
                onClick={() => {
                  setIsExportModalOpen(false);
                  setSelectedWeeksForExport(new Set());
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              {schedules.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
{t.admin.noWeeksAvailable}
                </p>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <button
                      onClick={() => {
                        const allWeekStarts = new Set(schedules.map(s => s.weekStart));
                        setSelectedWeeksForExport(allWeekStarts);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
{t.admin.selectAll}
                    </button>
                    <button
                      onClick={() => setSelectedWeeksForExport(new Set())}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
{t.admin.deselectAll}
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {schedules
                      .sort((a, b) => {
                        // Sort by weekStart date descending (most future first)
                        return new Date(b.weekStart).getTime() - new Date(a.weekStart).getTime();
                      })
                      .map((schedule) => {
                        const weekStartDate = new Date(schedule.weekStart);
                        const weekEndDate = new Date(schedule.weekEnd);
                        const weekLabel = `${weekStartDate.toLocaleDateString('it-IT', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        })} - ${weekEndDate.toLocaleDateString('it-IT', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        })}`;
                        const shiftCount = schedule.shifts.length;
                        const isSelected = selectedWeeksForExport.has(schedule.weekStart);
                        
                        return (
                          <label
                            key={schedule.id}
                            className={`flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 ${
                              isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const newSelected = new Set(selectedWeeksForExport);
                                if (e.target.checked) {
                                  newSelected.add(schedule.weekStart);
                                } else {
                                  newSelected.delete(schedule.weekStart);
                                }
                                setSelectedWeeksForExport(newSelected);
                              }}
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <div className="ml-3 flex-1">
                              <div className="text-sm font-medium text-gray-900">
                                {weekLabel}
                              </div>
                              <div className="text-xs text-gray-500">
{shiftCount} {t.admin.shifts}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setIsExportModalOpen(false);
                  setSelectedWeeksForExport(new Set());
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={handleExportSchedules}
                disabled={selectedWeeksForExport.size === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
{t.admin.export} ({selectedWeeksForExport.size})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
