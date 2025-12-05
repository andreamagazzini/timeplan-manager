'use client';

import { useState } from 'react';
import { Pharmacist, Shift, PharmacyRules } from '@/types';
import ShiftEditModal from './ShiftEditModal';

interface HourlyCalendarProps {
  pharmacists: Pharmacist[];
  shifts: Shift[];
  date: Date;
  pharmacyRules?: PharmacyRules;
  warnings?: string[];
  onShiftUpdate?: (updatedShifts: Shift[]) => void;
}

export default function HourlyCalendar({ pharmacists, shifts, date, pharmacyRules, warnings, onShiftUpdate }: HourlyCalendarProps) {
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedPharmacistShifts, setSelectedPharmacistShifts] = useState<Shift[]>([]);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Generate hourly time slots from 9:00 to 19:30 (every 30 minutes)
  const generateTimeSlots = () => {
    const slots = [];
    const startHour = 9;
    const endHour = 19;
    
    for (let hour = startHour; hour <= endHour; hour++) {
      // Add full hour slot
      slots.push({
        time: `${hour.toString().padStart(2, '0')}:00`,
        displayTime: `${hour}:00`,
        isHalfHour: false,
      });
      
      // Add half hour slot (except for the last hour)
      if (hour < endHour) {
        slots.push({
          time: `${hour.toString().padStart(2, '0')}:30`,
          displayTime: `${hour}:30`,
          isHalfHour: true,
        });
      }
    }
    // Add 19:30 if needed
    if (endHour === 19) {
      slots.push({
        time: '19:30',
        displayTime: '19:30',
        isHalfHour: true,
      });
    }
    
    return slots;
  };

  const timeSlots = generateTimeSlots();
  const dateStr = date.toISOString().split('T')[0];
  const dayShifts = shifts.filter(shift => shift.date === dateStr);

  // Convert time string to minutes since midnight
  const timeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };

  // Convert minutes to slot index (each slot is 30 minutes)
  const minutesToSlotIndex = (minutes: number): number => {
    const dayStart = 9 * 60; // 9:00 in minutes
    const minutesFromStart = minutes - dayStart;
    // Each slot is 30 minutes
    return Math.floor(minutesFromStart / 30);
  };

  // Get person color
  const getPersonColor = (pharmacistId: string) => {
    const colors = [
      'bg-blue-100 border-blue-300 text-blue-800',
      'bg-green-100 border-green-300 text-green-800',
      'bg-orange-100 border-orange-300 text-orange-800',
      'bg-purple-100 border-purple-300 text-purple-800',
      'bg-pink-100 border-pink-300 text-pink-800',
      'bg-indigo-100 border-indigo-300 text-indigo-800',
      'bg-red-100 border-red-300 text-red-800',
      'bg-yellow-100 border-yellow-300 text-yellow-800',
      'bg-teal-100 border-teal-300 text-teal-800',
      'bg-cyan-100 border-cyan-300 text-cyan-800',
    ];
    
    const pharmacistIndex = pharmacists.findIndex(p => p.id === pharmacistId);
    return colors[pharmacistIndex % colors.length] || 'bg-gray-100 border-gray-300 text-gray-800';
  };

  const getPharmacistName = (pharmacistId: string) => {
    const pharmacist = pharmacists.find(p => p.id === pharmacistId);
    if (!pharmacist) return '???';
    
    const nameParts = pharmacist.name.trim().split(/\s+/);
    
    if (nameParts.length >= 2) {
      // Two or more words: first 2 letters of first word + first letter of second word
      const firstWord = nameParts[0];
      const secondWord = nameParts[1];
      const firstPart = firstWord.length >= 2 ? firstWord.substring(0, 2) : firstWord;
      const secondPart = secondWord[0] || '';
      return (firstPart + secondPart).toUpperCase();
    } else {
      // Single word: use first 3 letters
      const name = nameParts[0];
      return name.length >= 3 ? name.substring(0, 3).toUpperCase() : name.toUpperCase().padEnd(3, name[0] || '?');
    }
  };

  const getPatternShortForm = (shift: Shift): string | null => {
    if (!shift.patternId || !pharmacyRules?.fixedShiftPatterns) {
      return null;
    }
    
    const pattern = pharmacyRules.fixedShiftPatterns.find(p => p.id === shift.patternId);
    const shortForm = pattern?.shortForm;
    
    // Return shortForm if it exists and is not empty
    return shortForm && shortForm.trim() ? shortForm.trim() : null;
  };

  // Calculate shift hours
  const calculateShiftHours = (startTime: string, endTime: string): number => {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    return (end - start) / 60; // Convert minutes to hours
  };

  // Format hours for display (e.g., 4h, 6h, 5.5h)
  const formatHours = (hours: number): string => {
    if (hours % 1 === 0) {
      return `${hours}h`;
    } else {
      // Round to 1 decimal place
      return `${hours.toFixed(1)}h`;
    }
  };

  // Group shifts by pharmacist and merge consecutive shifts (but preserve breaks)
  const getMergedShifts = (): Shift[] => {
    // Group by pharmacist
    const shiftsByPharmacist = dayShifts.reduce((acc, shift) => {
      if (!acc[shift.pharmacistId]) {
        acc[shift.pharmacistId] = [];
      }
      acc[shift.pharmacistId].push(shift);
      return acc;
    }, {} as Record<string, Shift[]>);

    const merged: Shift[] = [];

    // For each pharmacist, merge consecutive shifts
    Object.values(shiftsByPharmacist).forEach(pharmacistShifts => {
      // Sort by start time
      const sorted = pharmacistShifts.sort((a, b) => 
        timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
      );

      let current: Shift | null = null;

      sorted.forEach(shift => {
        if (!current) {
          current = shift;
        } else {
          const currentEnd = timeToMinutes(current.endTime);
          const shiftStart = timeToMinutes(shift.startTime);
          const gap = shiftStart - currentEnd;
          
          // Only merge if:
          // 1. There's no gap or very small gap (less than 5 minutes - for rounding errors)
          // 2. AND they're the same type (both morning or both afternoon)
          // This preserves breaks between morning and afternoon shifts
          const isSameType = current.type === shift.type;
          const isSmallGap = gap <= 5; // 5 minutes tolerance for rounding
          
          if (isSmallGap && isSameType) {
            // Merge shifts: preserve all fields from current, update endTime, and ensure patternId is preserved
            current = {
              ...current,
              endTime: shift.endTime,
              patternId: current.patternId || shift.patternId, // Preserve patternId (prefer current, fallback to shift)
            };
          } else {
            // Don't merge - preserve the break
            merged.push(current);
            current = shift;
          }
        }
      });

      if (current) {
        merged.push(current);
      }
    });

    return merged;
  };

  const mergedShifts = getMergedShifts();

  // Check if two shifts overlap in time
  const shiftsOverlap = (shift1: Shift, shift2: Shift): boolean => {
    const start1 = timeToMinutes(shift1.startTime);
    const end1 = timeToMinutes(shift1.endTime);
    const start2 = timeToMinutes(shift2.startTime);
    const end2 = timeToMinutes(shift2.endTime);
    
    return start1 < end2 && start2 < end1;
  };

  // Assign columns to shifts - same pharmacist always gets same column
  const assignColumns = (shifts: Shift[]): Map<Shift, number> => {
    const columnMap = new Map<Shift, number>();
    
    // Group shifts by pharmacist
    const shiftsByPharmacist = shifts.reduce((acc, shift) => {
      if (!acc[shift.pharmacistId]) {
        acc[shift.pharmacistId] = [];
      }
      acc[shift.pharmacistId].push(shift);
      return acc;
    }, {} as Record<string, Shift[]>);
    
    // Assign columns to pharmacists
    const pharmacistColumns = new Map<string, number>();
    const columns: string[][] = []; // Each column contains pharmacist IDs
    
    // Sort pharmacists by their first shift start time
    const sortedPharmacists = Object.entries(shiftsByPharmacist).sort((a, b) => {
      const aFirstShift = a[1].sort((s1, s2) => timeToMinutes(s1.startTime) - timeToMinutes(s2.startTime))[0];
      const bFirstShift = b[1].sort((s1, s2) => timeToMinutes(s1.startTime) - timeToMinutes(s2.startTime))[0];
      return timeToMinutes(aFirstShift.startTime) - timeToMinutes(bFirstShift.startTime);
    });
    
    sortedPharmacists.forEach(([pharmacistId, pharmacistShifts]) => {
      // Check if any of this pharmacist's shifts overlap with shifts in existing columns
      let placed = false;
      
      for (let colIndex = 0; colIndex < columns.length; colIndex++) {
        const columnPharmacistIds = columns[colIndex];
        
        // Check if this pharmacist's shifts overlap with any pharmacist in this column
        const hasOverlap = columnPharmacistIds.some(existingPharmacistId => {
          const existingShifts = shiftsByPharmacist[existingPharmacistId];
          // Check if any shift from this pharmacist overlaps with any shift from existing pharmacist
          return pharmacistShifts.some(shift => 
            existingShifts.some(existingShift => shiftsOverlap(shift, existingShift))
          );
        });
        
        if (!hasOverlap) {
          // This pharmacist can go in this column
          columnPharmacistIds.push(pharmacistId);
          pharmacistColumns.set(pharmacistId, colIndex);
          placed = true;
          break;
        }
      }
      
      // If no suitable column found, create a new one
      if (!placed) {
        columns.push([pharmacistId]);
        pharmacistColumns.set(pharmacistId, columns.length - 1);
      }
    });
    
    // Assign column numbers to all shifts based on their pharmacist
    shifts.forEach(shift => {
      const column = pharmacistColumns.get(shift.pharmacistId) || 0;
      columnMap.set(shift, column);
    });
    
    return columnMap;
  };

  const columnMap = assignColumns(mergedShifts);
  const maxColumns = Math.max(...Array.from(columnMap.values()), 0) + 1;

  // Calculate position and size for a shift block
  const getShiftBlockStyle = (shift: Shift) => {
    const startMinutes = timeToMinutes(shift.startTime);
    const endMinutes = timeToMinutes(shift.endTime);
    
    // Day starts at 9:00 = 540 minutes
    const dayStartMinutes = 9 * 60;
    
    // Calculate position from start of day
    const startOffset = startMinutes - dayStartMinutes;
    const endOffset = endMinutes - dayStartMinutes;
    
    // Each 30-minute slot is 24px, so each minute is 24/30 = 0.8px
    const pixelsPerMinute = 24 / 30;
    
    const top = startOffset * pixelsPerMinute;
    const height = (endOffset - startOffset) * pixelsPerMinute;
    
    // Calculate column position
    const column = columnMap.get(shift) || 0;
    const gap = 4; // Gap between columns in pixels
    const columnWidthPercent = 100 / maxColumns;
    const leftPercent = column * columnWidthPercent;
    
    return {
      top: `${top}px`,
      height: `${Math.max(height, 20)}px`, // Minimum height of 20px
      left: `calc(${leftPercent}% + ${gap / 2}px)`,
      width: `calc(${columnWidthPercent}% - ${gap}px)`,
    };
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
        <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">
          {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
        </h3>
          {warnings && warnings.length > 0 && (
            <div className="flex items-center gap-1" title={warnings.join('; ')}>
              <span className="text-yellow-600 text-xs">⚠️</span>
              <span className="text-xs text-yellow-700 font-medium">{warnings.length}</span>
            </div>
          )}
        </div>
        {warnings && warnings.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {warnings.map((warning, index) => (
              <p key={index} className="text-xs text-yellow-700">
                {warning}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Time slots with shift blocks */}
      <div className="max-h-96 overflow-y-auto relative">
        {/* Time column and shifts column container */}
        <div className="flex">
              {/* Time column */}
          <div className="w-16 flex-shrink-0">
            {timeSlots.map((slot) => (
              <div
                key={slot.time}
                className="w-16 px-2 py-1 text-xs text-gray-500 bg-gray-50 border-r border-gray-200 border-b border-gray-100 flex items-center justify-center"
                style={{ height: '24px' }}
              >
                {slot.displayTime}
              </div>
            ))}
          </div>
          
          {/* Shifts column - relative container for absolute positioned blocks */}
          <div 
            className="flex-1 relative" 
            style={{ minHeight: `${timeSlots.length * 24}px` }}
            onClick={(e) => {
              // Check if click is on a shift block (bubbled event)
              const target = e.target as HTMLElement;
              if (target.closest('[data-shift-block]')) {
                return; // Let shift block handle the click
              }
              
              // Click is on empty space - calculate which time slot was clicked
              const rect = e.currentTarget.getBoundingClientRect();
              const y = e.clientY - rect.top;
              const slotIndex = Math.floor(y / 24);
              
              if (slotIndex >= 0 && slotIndex < timeSlots.length) {
                const clickedTime = timeSlots[slotIndex].time;
                setSelectedShift(null);
                setSelectedPharmacistShifts([]);
                setSelectedTimeSlot(clickedTime);
                setIsModalOpen(true);
              }
            }}
          >
            {/* Time slot grid lines */}
            {timeSlots.map((slot, index) => (
              <div
                key={slot.time}
                className="absolute left-0 right-0 border-b border-gray-100"
                style={{ top: `${index * 24}px`, height: '24px' }}
              />
            ))}
            
            {/* Shift blocks */}
            {mergedShifts.map((shift) => {
              const style = getShiftBlockStyle(shift);
              
              return (
                    <div
                      key={shift.id}
                  data-shift-block
                  className={`absolute rounded border px-2 py-1 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${getPersonColor(shift.pharmacistId)}`}
                  style={{
                    ...style,
                    zIndex: 10,
                  }}
                  onClick={(e) => {
                    e.stopPropagation(); // Prevent triggering empty slot click
                    // Find all shifts for this pharmacist on this date
                    const pharmacistShifts = dayShifts.filter(
                      s => s.pharmacistId === shift.pharmacistId && s.date === shift.date
                    );
                    setSelectedShift(shift);
                    setSelectedPharmacistShifts(pharmacistShifts);
                    setSelectedTimeSlot(null);
                    setIsModalOpen(true);
                  }}
                >
                  <div className="flex flex-col justify-center h-full">
                    <span className="truncate font-medium">{getPharmacistName(shift.pharmacistId)}</span>
                    <div className="flex items-center gap-1">
                      {getPatternShortForm(shift) && (
                        <span className="text-xs opacity-75 truncate">
                          {getPatternShortForm(shift)}
                        </span>
                      )}
                      <span className="text-xs opacity-75 font-semibold">
                        {formatHours(calculateShiftHours(shift.startTime, shift.endTime))}
                      </span>
                    </div>
                    </div>
                </div>
              );
            })}
              </div>
            </div>
      </div>

      {/* Edit Modal */}
      {isModalOpen && (
        <ShiftEditModal
          shift={selectedShift}
          pharmacistShifts={selectedPharmacistShifts}
          pharmacist={selectedShift ? pharmacists.find(p => p.id === selectedShift.pharmacistId) || null : null}
          pharmacists={pharmacists}
          pharmacyRules={pharmacyRules}
          date={dateStr}
          timeSlot={selectedTimeSlot}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedShift(null);
            setSelectedPharmacistShifts([]);
            setSelectedTimeSlot(null);
          }}
          onSave={async (updatedShifts) => {
            if (onShiftUpdate) {
              // If removing (empty array), we need to pass the pharmacistId
              // Include it in a way that the parent can access
              if (updatedShifts.length === 0 && selectedShift) {
                // Create a temporary shift object with just the pharmacistId for identification
                const tempShift: Shift = {
                  id: 'temp_remove',
                  pharmacistId: selectedShift.pharmacistId,
                  date: dateStr,
                  startTime: '00:00',
                  endTime: '00:00',
                  type: 'morning',
                  isBreakTime: false,
                };
                // Pass it in a way that signals removal
                await onShiftUpdate([tempShift]);
              } else {
                await onShiftUpdate(updatedShifts);
              }
              // Close modal after update is complete
              setIsModalOpen(false);
              setSelectedShift(null);
              setSelectedPharmacistShifts([]);
              setSelectedTimeSlot(null);
            }
          }}
        />
      )}
    </div>
  );
}
