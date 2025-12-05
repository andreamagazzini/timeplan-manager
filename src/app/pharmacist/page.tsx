'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, User } from 'lucide-react';
import { DataManager } from '@/lib/data';
import { Pharmacist, Schedule, Shift } from '@/types';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function PharmacistView() {
  const [pharmacist, setPharmacist] = useState<Pharmacist | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const { t } = useLanguage();

  useEffect(() => {
    const dataManager = DataManager.getInstance();
    // For demo purposes, we'll use the first pharmacist
    // In a real app, this would be based on authentication
    const pharmacists = dataManager.getPharmacists();
    if (pharmacists.length > 0) {
      setPharmacist(pharmacists[0]);
    }
    setSchedules(dataManager.getSchedules());
  }, []);

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

  const getPharmacistShifts = (pharmacistId: string, weekStart: string) => {
    const weekSchedule = schedules.find(s => s.weekStart === weekStart);
    if (!weekSchedule) return [];
    
    return weekSchedule.shifts.filter(shift => shift.pharmacistId === pharmacistId);
  };

  const weekDates = getWeekDates(currentWeek);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const weekStart = weekDates[0].toISOString().split('T')[0];

  if (!pharmacist) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-gray-900">{t.common.loading}</h2>
        </div>
      </div>
    );
  }

  const pharmacistShifts = getPharmacistShifts(pharmacist.id, weekStart);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4 sm:py-6">
            <div className="flex items-center">
              <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-blue-500 flex items-center justify-center">
                <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
              <div className="ml-3 sm:ml-4">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900">{pharmacist.name}</h1>
                <p className="text-sm sm:text-base text-gray-600">{t.pharmacist.title}</p>
              </div>
            </div>
            <div className="text-right">
              <LanguageSwitcher />
              <div className="mt-2">
                <p className="text-xs sm:text-sm text-gray-700">{t.pharmacist.weeklyHours}</p>
                <p className="text-sm sm:text-lg font-semibold text-gray-900">{pharmacist.weeklyHours}h</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <button
            onClick={() => setCurrentWeek(new Date(currentWeek.getTime() - 7 * 24 * 60 * 60 * 1000))}
            className="px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t.common.previous} Week
          </button>
          <div className="text-center">
            <h2 className="text-sm sm:text-lg font-semibold text-gray-900">
              {weekDates[0].toLocaleDateString()} - {weekDates[5].toLocaleDateString()}
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">{t.admin.weekSchedule}</p>
          </div>
          <button
            onClick={() => setCurrentWeek(new Date(currentWeek.getTime() + 7 * 24 * 60 * 60 * 1000))}
            className="px-3 py-2 sm:px-4 text-xs sm:text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            {t.common.next} Week
          </button>
        </div>

        {/* Color Legend */}
        <div className="bg-white shadow rounded-lg p-4 mb-4">
          <div className="flex flex-wrap gap-3 justify-center">
            <div className="flex items-center text-xs">
              <div className="w-3 h-3 bg-green-100 border border-green-300 rounded mr-1"></div>
              <span className="text-gray-700">Morning</span>
            </div>
            <div className="flex items-center text-xs">
              <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded mr-1"></div>
              <span className="text-gray-700">Afternoon</span>
            </div>
            <div className="flex items-center text-xs">
              <div className="w-3 h-3 bg-yellow-100 border border-yellow-300 rounded mr-1"></div>
              <span className="text-gray-700">Break</span>
            </div>
            <div className="flex items-center text-xs">
              <div className="w-3 h-3 bg-purple-100 border border-purple-300 rounded mr-1"></div>
              <span className="text-gray-700">Full Day</span>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-white shadow rounded-lg overflow-hidden mb-4 sm:mb-6">
          <div className="grid grid-cols-6">
            {/* Day Headers */}
            {dayNames.map((day) => (
              <div key={day} className="bg-gray-50 px-2 py-2 sm:px-4 sm:py-3 text-center text-xs sm:text-sm font-medium text-gray-700 border-b border-gray-200">
                {day}
              </div>
            ))}
            
            {/* Day Content */}
            {weekDates.map((date, index) => {
              const dateStr = date.toISOString().split('T')[0];
              const dayShifts = pharmacistShifts.filter(shift => shift.date === dateStr);
              
              return (
                <div key={index} className="border-r border-gray-200 min-h-[80px] sm:min-h-[120px] p-2 sm:p-3">
                  <div className="text-xs sm:text-sm font-medium text-gray-900 mb-1 sm:mb-2">
                    {date.getDate()}
                  </div>
                  
                  {dayShifts.length > 0 ? (
                    <div className="space-y-1">
                      {dayShifts.map((shift) => (
                        <div
                          key={shift.id}
                          className={`text-xs p-1 sm:p-2 rounded ${
                            shift.isBreakTime 
                              ? 'bg-yellow-100 text-yellow-800' 
                              : shift.type === 'morning'
                                ? 'bg-green-100 text-green-800'
                                : shift.type === 'afternoon'
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-purple-100 text-purple-800'
                          }`}
                        >
                          <div className="flex items-center">
                            <Clock className="h-2 w-2 sm:h-3 sm:w-3 mr-1" />
                            <span className="truncate">{shift.startTime} - {shift.endTime}</span>
                          </div>
                          <div className="text-xs text-gray-700 truncate">
                            {shift.type}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">{t.pharmacist.noShifts}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-3">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-3 sm:p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400" />
                </div>
                <div className="ml-3 sm:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-xs sm:text-sm font-medium text-gray-500 truncate">
                      {t.pharmacist.shiftsThisWeek}
                    </dt>
                    <dd className="text-base sm:text-lg font-medium text-gray-900">
                      {pharmacistShifts.length}
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
                      {t.pharmacist.hoursThisWeek}
                    </dt>
                    <dd className="text-base sm:text-lg font-medium text-gray-900">
                      {pharmacistShifts.reduce((total, shift) => {
                        const start = new Date(`2000-01-01T${shift.startTime}`);
                        const end = new Date(`2000-01-01T${shift.endTime}`);
                        const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
                        return total + hours;
                      }, 0).toFixed(1)}h
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
                  <div className="h-5 w-5 sm:h-6 sm:w-6 bg-green-400 rounded-full"></div>
                </div>
                <div className="ml-3 sm:ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-xs sm:text-sm font-medium text-gray-500 truncate">
                      {t.pharmacist.status}
                    </dt>
                    <dd className="text-base sm:text-lg font-medium text-gray-900">
                      {pharmacist.isActive ? t.common.active : t.common.inactive}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
