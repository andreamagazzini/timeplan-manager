import { Pharmacist, Schedule, Shift, PharmacyRules, FixedShiftPattern } from '@/types';

export class ScheduleGenerator {
  private pharmacists: Pharmacist[];
  private pharmacyRules: PharmacyRules;

  constructor(pharmacists: Pharmacist[], pharmacyRules: PharmacyRules) {
    this.pharmacists = pharmacists.filter(p => p.isActive);
    this.pharmacyRules = pharmacyRules;
    
    console.log('Scheduler initialized with:');
    console.log('- Pharmacists:', this.pharmacists.map(p => `${p.name} (${p.weeklyHours}h, freeDay: "${p.freeDay}")`));
    console.log('- Workdays array: [1, 2, 3, 4, 5, 6] = [Monday, Tuesday, Wednesday, Thursday, Friday, Saturday]');
    console.log('- Day mapping: Index 0=Monday, Index 1=Tuesday, ..., Index 5=Saturday');
    console.log('- Free day comparison: Now using string comparison (e.g., "Monday" === "Monday")');
    console.log('- Pharmacy rules:', pharmacyRules);
  }

  generateSchedule(weeks: number = 1, startDate?: Date): Schedule[] {
    // Auto-adapt break duration if needed
    this.adaptBreakDuration();

    const schedules: Schedule[] = [];
    
    // Calculate week start (Monday) - use provided startDate or default to current week
    let weekStartDate: Date;
    if (startDate) {
      // Use provided date and calculate Monday of that week
      weekStartDate = new Date(startDate);
      weekStartDate.setDate(startDate.getDate() - startDate.getDay() + 1); // Start from Monday
    } else {
      // Default to current week
      const today = new Date();
      weekStartDate = new Date(today);
      weekStartDate.setDate(today.getDate() - today.getDay() + 1); // Start from Monday
    }
    
    console.log('Scheduler - Start date provided:', startDate?.toDateString() || 'none (using today)');
    console.log('Scheduler - Week start:', weekStartDate.toDateString());

    for (let week = 0; week < weeks; week++) {
      const weekStart = new Date(weekStartDate);
      weekStart.setDate(weekStartDate.getDate() + week * 7);
      
      console.log(`Scheduler - Generating week ${week}:`, weekStart.toDateString());
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 5); // Saturday

      let schedule = this.generateWeekSchedule(weekStart, week);
      
      // Validate schedule and add warnings
      let warnings = this.validateSchedule(schedule);
      const hasWarnings = Object.values(warnings).some(dayWarnings => dayWarnings.length > 0);
      
      // If there are warnings, try different pattern assignments to resolve them
      if (hasWarnings) {
        console.log(`⚠️ Warnings detected, attempting to resolve by trying different pattern assignments...`);
        const bestSchedule = this.tryResolveWarnings(weekStart, week, schedule, warnings);
        if (bestSchedule) {
          schedule = bestSchedule;
          warnings = this.validateSchedule(schedule);
          const stillHasWarnings = Object.values(warnings).some(dayWarnings => dayWarnings.length > 0);
          if (!stillHasWarnings) {
            console.log(`✅ Warnings resolved with different pattern assignment`);
          } else {
            console.log(`⚠️ Warnings could not be fully resolved`);
          }
        }
      }
      
      schedule.warnings = warnings;
      schedules.push(schedule);
    }

    return schedules;
  }

  private generateWeekSchedule(weekStart: Date, weekNumber: number): Schedule {
    const shifts: Shift[] = [];
    const workdays = [1, 2, 3, 4, 5, 6]; // Monday to Saturday
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Track pattern usage per pharmacist: pharmacistId -> patternId -> count
    const patternUsage: Record<string, Record<string, number>> = this.pharmacists.reduce((acc, pharmacist) => {
      acc[pharmacist.id] = {};
      this.pharmacyRules.fixedShiftPatterns?.forEach(pattern => {
        acc[pharmacist.id][pattern.id] = 0;
      });
      return acc;
    }, {} as Record<string, Record<string, number>>);

    // Track shifts assigned so far (for checking max 2 per pattern per week)
    // This will be built up day by day

    // Process each day
    for (let dayIndex = 0; dayIndex < workdays.length; dayIndex++) {
      const dayName = dayNames[dayIndex];
      const currentDate = new Date(weekStart);
      currentDate.setDate(weekStart.getDate() + dayIndex);
      const dateStr = currentDate.toISOString().split('T')[0];

      console.log(`\n=== Processing ${dayName} (${dateStr}) ===`);

      // Step 1: Get pharmacists available for this day (exclude free days)
      const availablePharmacists = this.pharmacists.filter(ph => {
        if (!ph.isActive) return false;
        if (this.isFreeDay(ph, dayName)) return false;
        if (dayName === 'Saturday' && ph.freeSaturdayWeek === weekNumber) return false;
        return true;
      });

      if (availablePharmacists.length < 3) {
        console.warn(`⚠️ Not enough pharmacists for ${dayName} (only ${availablePharmacists.length} available)`);
        continue;
      }

      // Step 2: Assign fixed patterns for this day
      const fixedAssignments: Array<{ pharmacist: Pharmacist; pattern: FixedShiftPattern }> = [];
      const remainingPharmacists: Pharmacist[] = [];

      availablePharmacists.forEach(ph => {
        const fixedPattern = ph.fixedDayPatterns?.find(p => p.dayOfWeek === dayName);
        if (fixedPattern && fixedPattern.patternId !== 'FREE_DAY') {
          const pattern = this.pharmacyRules.fixedShiftPatterns?.find(p => p.id === fixedPattern.patternId);
          if (pattern) {
            fixedAssignments.push({ pharmacist: ph, pattern });
            console.log(`📌 Fixed pattern: ${ph.name} -> ${pattern.name} on ${dayName}`);
          } else {
            remainingPharmacists.push(ph);
          }
        } else {
          remainingPharmacists.push(ph);
        }
      });

      // Step 3: Assign remaining pharmacists randomly, avoiding >2 same pattern per week
      const patterns = this.pharmacyRules.fixedShiftPatterns || [];
      if (patterns.length === 0) {
        console.warn(`⚠️ No fixed shift patterns defined`);
        continue;
      }

      // Try random assignments with retry if warnings occur
      const maxRetries = 50;
      let bestDayShifts: Shift[] = [];
      let bestWarnings: string[] = [];
      let bestRetry = -1;

      for (let retry = 0; retry < maxRetries; retry++) {
        const dayShifts: Shift[] = [];
        const shuffledPharmacists = [...remainingPharmacists].sort(() => Math.random() - 0.5);
        const shuffledPatterns = [...patterns].sort(() => Math.random() - 0.5);

        // Assign patterns to remaining pharmacists
        shuffledPharmacists.forEach((ph, idx) => {
          // Find a pattern that doesn't exceed 2 uses per week for this pharmacist
          let assignedPattern: FixedShiftPattern | null = null;
          
          for (const pattern of shuffledPatterns) {
            const currentCount = patternUsage[ph.id]?.[pattern.id] || 0;
            if (currentCount < 2) {
              assignedPattern = pattern;
              break;
            }
          }

          // If all patterns are at max, use the least used one
          if (!assignedPattern) {
            assignedPattern = shuffledPatterns.reduce((min, p) => {
              const minCount = patternUsage[ph.id]?.[min.id] || 0;
              const pCount = patternUsage[ph.id]?.[p.id] || 0;
              return pCount < minCount ? p : min;
            });
          }

          // Create shifts for this pattern
          const morningShift: Shift = {
            id: `shift_${dateStr}_${ph.id}_morning`,
            pharmacistId: ph.id,
            date: dateStr,
            startTime: assignedPattern.morningShift.startTime,
            endTime: assignedPattern.morningShift.endTime,
            type: 'morning',
            isBreakTime: false,
            patternId: assignedPattern.id,
          };

          const afternoonShift: Shift = {
            id: `shift_${dateStr}_${ph.id}_afternoon`,
            pharmacistId: ph.id,
            date: dateStr,
            startTime: assignedPattern.afternoonShift.startTime,
            endTime: assignedPattern.afternoonShift.endTime,
            type: 'afternoon',
            isBreakTime: false,
            patternId: assignedPattern.id,
          };

          dayShifts.push(morningShift, afternoonShift);
          patternUsage[ph.id][assignedPattern.id] = (patternUsage[ph.id][assignedPattern.id] || 0) + 1;
        });

        // Add fixed assignments
        fixedAssignments.forEach(({ pharmacist, pattern }) => {
          const morningShift: Shift = {
            id: `shift_${dateStr}_${pharmacist.id}_morning`,
            pharmacistId: pharmacist.id,
            date: dateStr,
            startTime: pattern.morningShift.startTime,
            endTime: pattern.morningShift.endTime,
            type: 'morning',
            isBreakTime: false,
            patternId: pattern.id,
          };

          const afternoonShift: Shift = {
            id: `shift_${dateStr}_${pharmacist.id}_afternoon`,
            pharmacistId: pharmacist.id,
            date: dateStr,
            startTime: pattern.afternoonShift.startTime,
            endTime: pattern.afternoonShift.endTime,
            type: 'afternoon',
            isBreakTime: false,
            patternId: pattern.id,
          };

          dayShifts.push(morningShift, afternoonShift);
          patternUsage[pharmacist.id][pattern.id] = (patternUsage[pharmacist.id][pattern.id] || 0) + 1;
        });

        // Check for warnings on this day (create temporary schedule with all shifts so far + current day)
        const tempSchedule: Schedule = {
          id: `temp_${dateStr}`,
          weekStart: weekStart.toISOString().split('T')[0],
          weekEnd: new Date(weekStart.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          shifts: [...shifts, ...dayShifts],
        };
        const warnings = this.validateSchedule(tempSchedule);
        const dayWarnings = warnings[dateStr] || [];

        if (dayWarnings.length === 0) {
          // No warnings - use this assignment
          bestDayShifts = dayShifts;
          bestRetry = retry;
          break;
        }

        // Keep track of best (fewest warnings)
        if (retry === 0 || dayWarnings.length < bestWarnings.length) {
          bestDayShifts = dayShifts;
          bestWarnings = dayWarnings;
          bestRetry = retry;
        }

        // Reset pattern usage for remaining pharmacists in this retry (keep fixed assignments)
        remainingPharmacists.forEach(ph => {
          patterns.forEach(pattern => {
            // Only reset if this pharmacist doesn't have a fixed assignment
            const hasFixed = fixedAssignments.some(fa => fa.pharmacist.id === ph.id);
            if (!hasFixed) {
              // Get current count from already assigned shifts (previous days)
              const previousCount = shifts.filter(s => 
                s.pharmacistId === ph.id && s.patternId === pattern.id
              ).length;
              patternUsage[ph.id][pattern.id] = previousCount;
            }
          });
        });
      }

      if (bestWarnings.length > 0) {
        console.log(`⚠️ Day ${dayName} has ${bestWarnings.length} warnings after ${bestRetry + 1} retries`);
        // Try to adjust part-time shifts to resolve warnings
        bestDayShifts = this.adjustPartTimeShiftsForWarnings(bestDayShifts, dateStr, bestWarnings);
      } else {
        console.log(`✅ Day ${dayName} assigned successfully (retry ${bestRetry + 1})`);
      }

      // Update pattern usage for the selected assignment (count morning+afternoon as 1 pattern use)
      const patternCountsForDay: Record<string, Record<string, number>> = {};
      bestDayShifts.forEach(shift => {
        if (shift.patternId) {
          if (!patternCountsForDay[shift.pharmacistId]) {
            patternCountsForDay[shift.pharmacistId] = {};
          }
          patternCountsForDay[shift.pharmacistId][shift.patternId] = 
            (patternCountsForDay[shift.pharmacistId][shift.patternId] || 0) + 1;
        }
      });
      
      // Update pattern usage (morning+afternoon = 1 pattern use)
      Object.keys(patternCountsForDay).forEach(phId => {
        Object.keys(patternCountsForDay[phId]).forEach(patternId => {
          // Only count once per day (morning+afternoon together)
          patternUsage[phId][patternId] = (patternUsage[phId][patternId] || 0) + 1;
        });
      });

      shifts.push(...bestDayShifts);
    }

    // Step 4: After entire week is assigned, adjust part-time hours
    const adjustedShifts = this.adjustPartTimeHours(shifts, weekStart);

    const schedule = {
      id: `schedule_${weekStart.toISOString().split('T')[0]}`,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: new Date(weekStart.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      shifts: adjustedShifts,
    };

    return schedule;
  }

  // Validate schedule and return warnings for each day
  validateSchedule(schedule: Schedule): Record<string, string[]> {
    const warnings: Record<string, string[]> = {};
    const workdays = [1, 2, 3, 4, 5, 6];
    
    // Parse week start date
    const weekStart = new Date(schedule.weekStart);
    
    for (let dayIndex = 0; dayIndex < workdays.length; dayIndex++) {
      const dayOfWeek = workdays[dayIndex];
      const currentDate = new Date(weekStart);
      currentDate.setDate(weekStart.getDate() + dayIndex);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const dayShifts = schedule.shifts.filter(shift => shift.date === dateStr);
      const dayWarnings: string[] = [];
      
      // Check staffing requirements (using pharmacyRules for all days)
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[dayOfWeek];
      console.log(`Validating day ${dayName}: Found ${this.pharmacyRules.staffingRequirements.length} staffing requirements:`, 
        this.pharmacyRules.staffingRequirements.map(r => `${r.startTime}-${r.endTime} (${r.requiredPharmacists})`));
      
      this.pharmacyRules.staffingRequirements.forEach(requirement => {
        const reqStart = this.timeToMinutes(requirement.startTime);
        const reqEnd = this.timeToMinutes(requirement.endTime);
        const required = requirement.requiredPharmacists;
        
        // Check every 30 minutes within the requirement period
        // Track continuous periods where coverage is insufficient
        interface InsufficientPeriod {
          start: number;
          end: number;
          minCount: number;
        }
        
        const insufficientPeriods: InsufficientPeriod[] = [];
        let currentPeriod: InsufficientPeriod | null = null;
        
        // Check every 30 minutes, but don't exceed the requirement end time
        // We check at the start of each 30-minute slot
        for (let checkTime = reqStart; checkTime < reqEnd; checkTime += 30) {
          const pharmacistIdsWorking = new Set<string>();
          
          dayShifts.forEach(shift => {
            const shiftStart = this.timeToMinutes(shift.startTime);
            const shiftEnd = this.timeToMinutes(shift.endTime);
            
            // Check if pharmacist is working at this exact moment
            if (shiftStart <= checkTime && shiftEnd > checkTime) {
              pharmacistIdsWorking.add(shift.pharmacistId);
            }
          });
          
          const pharmacistsWorking = pharmacistIdsWorking.size;
          
          if (pharmacistsWorking < required) {
            // Coverage is insufficient at this time
            // Calculate the end of this check period (don't exceed requirement end)
            const periodEnd = Math.min(checkTime + 30, reqEnd);
            
            if (currentPeriod) {
              // Continue the current period (extend end time)
              currentPeriod.end = periodEnd;
              // Update minimum count if this is lower
              if (pharmacistsWorking < currentPeriod.minCount) {
                currentPeriod.minCount = pharmacistsWorking;
              }
            } else {
              // Start a new period
              currentPeriod = {
                start: checkTime,
                end: periodEnd,
                minCount: pharmacistsWorking,
              };
            }
          } else {
            // Coverage is sufficient - end current period if any
            if (currentPeriod) {
              insufficientPeriods.push(currentPeriod);
              currentPeriod = null;
            }
          }
        }
        
        // Don't forget the last period if it extends to the end
        if (currentPeriod) {
          // Make sure we don't exceed the requirement end time
          currentPeriod.end = Math.min(currentPeriod.end, reqEnd);
          insufficientPeriods.push(currentPeriod);
        }
        
        // Report each insufficient period (only within requirement boundaries)
        insufficientPeriods.forEach(period => {
          // Ensure period doesn't extend beyond requirement
          const periodStart = Math.max(period.start, reqStart);
          const periodEnd = Math.min(period.end, reqEnd);
          
          // Only report if there's actually an insufficient period
          if (periodStart < periodEnd) {
            const startTimeStr = this.minutesToTime(periodStart);
            const endTimeStr = this.minutesToTime(periodEnd);
            const reqStartStr = this.minutesToTime(reqStart);
            const reqEndStr = this.minutesToTime(reqEnd);
            dayWarnings.push(
              `Insufficient coverage ${startTimeStr}-${endTimeStr}: ${period.minCount}/${required} (requirement: ${reqStartStr}-${reqEndStr})`
            );
          }
        });
      });
      
      // Check pharmacy rules: max hours per shift, max hours per day, minimum shift duration
      const pharmacistDailyHours: Record<string, number> = {};
      dayShifts.forEach(shift => {
        if (!pharmacistDailyHours[shift.pharmacistId]) {
          pharmacistDailyHours[shift.pharmacistId] = 0;
        }
        const shiftHours = this.calculateShiftHours(shift.startTime, shift.endTime);
        pharmacistDailyHours[shift.pharmacistId] += shiftHours;
        
        // Check minimum shift duration (2 hours for morning/afternoon shifts)
        if ((shift.type === 'morning' || shift.type === 'afternoon') && shiftHours < 2) {
          const pharmacist = this.pharmacists.find(p => p.id === shift.pharmacistId);
          dayWarnings.push(
            `Shift too short: ${pharmacist?.name || shift.pharmacistId} has a ${shift.type} shift of ${shiftHours.toFixed(1)}h (minimum: 2h)`
          );
        }
        
        // Check max hours per shift
        if (shiftHours > this.pharmacyRules.maxHoursPerShift) {
          const pharmacist = this.pharmacists.find(p => p.id === shift.pharmacistId);
          dayWarnings.push(
            `Shift exceeds max hours: ${pharmacist?.name || shift.pharmacistId} works ${shiftHours.toFixed(1)}h (max: ${this.pharmacyRules.maxHoursPerShift}h)`
          );
        }
      });
      
      // Check max hours per day
      Object.entries(pharmacistDailyHours).forEach(([pharmacistId, totalHours]) => {
        if (totalHours > this.pharmacyRules.maxHoursPerDay) {
          const pharmacist = this.pharmacists.find(p => p.id === pharmacistId);
          dayWarnings.push(
            `Daily hours exceeded: ${pharmacist?.name || pharmacistId} works ${totalHours.toFixed(1)}h (max: ${this.pharmacyRules.maxHoursPerDay}h)`
          );
        }
      });
      
      if (dayWarnings.length > 0) {
        warnings[dateStr] = dayWarnings;
      }
    }
    
    return warnings;
  }

  // Helper function to check if a pharmacist has a free day on a specific day
  private isFreeDay(pharmacist: Pharmacist, dayName: string): boolean {
    // Check legacy freeDay field
    if (pharmacist.freeDay === dayName) {
      return true;
    }
    // Check fixedDayPatterns for FREE_DAY pattern
    if (pharmacist.fixedDayPatterns?.some(p => p.patternId === 'FREE_DAY' && p.dayOfWeek === dayName)) {
      return true;
    }
    return false;
  }

  private getAvailablePharmacists(dayName: string, weekNumber: number, weeklyHours: Record<string, number>): Pharmacist[] {
    console.log(`\n=== Getting available pharmacists for ${dayName} ===`);
    
    const availablePharmacists = this.pharmacists
      .filter(pharmacist => {
        const freeDay = pharmacist.freeDay || pharmacist.fixedDayPatterns?.find(p => p.patternId === 'FREE_DAY')?.dayOfWeek || 'None';
        console.log(`\nChecking ${pharmacist.name}:`);
        console.log(`  - Free day: ${freeDay}`);
        console.log(`  - Current day: ${dayName}`);
        console.log(`  - Weekly hours: ${pharmacist.weeklyHours}`);
        console.log(`  - Hours left this week: ${weeklyHours[pharmacist.id]}`);
        console.log(`  - Free day match: ${this.isFreeDay(pharmacist, dayName)}`);
        
        // Special debug for Laura
        if (pharmacist.name === 'Laura') {
          console.log(`  🔍 LAURA DEBUG:`);
          console.log(`    - Laura's freeDay: "${pharmacist.freeDay}"`);
          console.log(`    - Laura's fixedDayPatterns: ${JSON.stringify(pharmacist.fixedDayPatterns)}`);
          console.log(`    - Current dayName: "${dayName}"`);
          console.log(`    - Should be excluded: ${this.isFreeDay(pharmacist, dayName)}`);
        }
        
        // Check if pharmacist has this day as free day
        if (this.isFreeDay(pharmacist, dayName)) {
          console.log(`  ❌ ${pharmacist.name} is not available on ${dayName} (free day)`);
          return false;
        }

        // Check if pharmacist has Saturday off this week (Saturday rotation)
        if (dayName === 'Saturday' && pharmacist.freeSaturdayWeek === weekNumber) {
          console.log(`  ❌ ${pharmacist.name} has Saturday off this week (rotation)`);
          return false;
        }

        // For 40h/week pharmacists, they must work 5 days (8h/day)
        // So they need at least 8 hours left to work this day
        if (pharmacist.weeklyHours >= 40) {
          const daysWorked = Math.floor((pharmacist.weeklyHours - weeklyHours[pharmacist.id]) / 8);
          const daysLeft = 5 - daysWorked; // 5 working days per week
          
          console.log(`  - Days worked: ${daysWorked}/5`);
          console.log(`  - Days left: ${daysLeft}`);
          
          if (daysLeft <= 0) {
            console.log(`  ❌ ${pharmacist.name} has already worked 5 days this week`);
            return false;
          }
          
          if (weeklyHours[pharmacist.id] < 8) {
            console.log(`  ❌ ${pharmacist.name} needs at least 8 hours left (has ${weeklyHours[pharmacist.id]})`);
            return false;
          }
        } else {
          // For part-time pharmacists, they should work every day (except free day)
          // Don't filter them out based on remaining hours - they need to work every day
          // The assignment logic will handle distributing their hours
          const remainingHours = weeklyHours[pharmacist.id] ?? pharmacist.weeklyHours;
          if (remainingHours <= 0) {
            console.log(`  ⚠️ ${pharmacist.name} has no hours left (${remainingHours}), but will still be considered for assignment`);
            // Still return true - let the assignment logic handle it
          }
        }

        console.log(`  ✅ ${pharmacist.name} is available`);
        return true;
      })
      .sort((a, b) => {
        // Prioritize pharmacists whose free day is furthest from current day
        const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const aFreeDay = a.freeDay || a.fixedDayPatterns?.find(p => p.patternId === 'FREE_DAY')?.dayOfWeek || 'Monday';
        const bFreeDay = b.freeDay || b.fixedDayPatterns?.find(p => p.patternId === 'FREE_DAY')?.dayOfWeek || 'Monday';
        const aDistance = Math.abs(dayOrder.indexOf(aFreeDay) - dayOrder.indexOf(dayName));
        const bDistance = Math.abs(dayOrder.indexOf(bFreeDay) - dayOrder.indexOf(dayName));
        return bDistance - aDistance;
      });

    console.log(`\nFinal available pharmacists for ${dayName}: ${availablePharmacists.map(p => p.name).join(', ')}`);
    return availablePharmacists;
  }

  private generateDayShifts(
    date: Date,
    availablePharmacists: Pharmacist[],
    weeklyHours: Record<string, number>,
    patternRotationTracker: Record<string, { pharmacist: Pharmacist; patternIndex: number; dailyPatterns: string[] }>,
    dayIndex: number,
    dayName: string,
    partTimeWorkingDaysRemaining?: Record<string, number>,
    pharmacistPatternUsage?: Record<string, Record<string, number>>
  ): Shift[] {
    const shifts: Shift[] = [];
    const dateStr = date.toISOString().split('T')[0];

    // Create shift assignments based on staffing requirements
    const shiftAssignments = this.createShiftAssignments(availablePharmacists, patternRotationTracker, dayIndex, dayName, weeklyHours, partTimeWorkingDaysRemaining, pharmacistPatternUsage);

    shiftAssignments.forEach((assignment) => {
      const pharmacist = assignment.pharmacist;
      const shiftType = assignment.shiftType;
      const startTime = assignment.startTime;
      const endTime = assignment.endTime;

      // Create shifts based on the assignment type
      // Ensure minimum shift duration of 2 hours for morning/afternoon shifts
      let totalShiftHours = 0; // Track hours for shifts actually created
      
      if (shiftType === 'morning') {
        // Morning shift only - ensure minimum duration of 2 hours
        const actualStartTime = startTime;
        let actualEndTime = endTime;
        let shiftHours = this.calculateShiftHours(startTime, endTime);
        
        // If shift is too short, extend it to meet minimum 2 hours
        if (shiftHours < 2) {
          const startMinutes = this.timeToMinutes(startTime);
          const minEndMinutes = startMinutes + (2 * 60); // 2 hours minimum
          const closingMinutes = this.timeToMinutes(this.pharmacyRules.closingTime);
          
          if (minEndMinutes <= closingMinutes) {
            actualEndTime = this.minutesToTime(minEndMinutes);
            shiftHours = 2;
            console.log(`  ⚠️ Extended morning shift for ${pharmacist.name} from ${startTime}-${endTime} to ${actualStartTime}-${actualEndTime} to meet 2h minimum`);
          } else {
            // Can't extend forward - try to create a minimum shift from opening time
            const openingMinutes = this.timeToMinutes(this.pharmacyRules.openingTime);
            const minEndFromOpening = openingMinutes + (2 * 60);
            if (minEndFromOpening <= closingMinutes) {
              actualEndTime = this.minutesToTime(minEndFromOpening);
              shiftHours = 2;
              console.log(`  ⚠️ Created minimum 2h morning shift for ${pharmacist.name} from opening time (${this.pharmacyRules.openingTime}-${actualEndTime})`);
            } else {
              console.warn(`⚠️ Cannot create morning shift for ${pharmacist.name}: pharmacy hours too short`);
              return; // Skip this assignment - can't create valid shift
            }
          }
        }
        
        shifts.push({
          id: `shift_${dateStr}_${pharmacist.id}_morning`,
          pharmacistId: pharmacist.id,
          date: dateStr,
          startTime: actualStartTime,
          endTime: actualEndTime,
          type: 'morning',
          isBreakTime: false,
          patternId: assignment.patternId,
        });
        totalShiftHours += shiftHours;
      } else if (shiftType === 'afternoon') {
        // Afternoon shift only - ensure minimum duration of 2 hours
        let actualStartTime = startTime;
        let actualEndTime = endTime;
        let shiftHours = this.calculateShiftHours(startTime, endTime);
        
        // If shift is too short, extend it to meet minimum 2 hours
        if (shiftHours < 2) {
          const startMinutes = this.timeToMinutes(startTime);
          const minEndMinutes = startMinutes + (2 * 60); // 2 hours minimum
          const closingMinutes = this.timeToMinutes(this.pharmacyRules.closingTime);
          
          if (minEndMinutes <= closingMinutes) {
            actualEndTime = this.minutesToTime(minEndMinutes);
            shiftHours = 2;
            console.log(`  ⚠️ Extended afternoon shift for ${pharmacist.name} from ${startTime}-${endTime} to ${actualStartTime}-${actualEndTime} to meet 2h minimum`);
          } else {
            // Can't extend forward - try to start earlier to get 2 hours
            const minStartMinutes = closingMinutes - (2 * 60);
            const breakEndMinutes = this.timeToMinutes(this.pharmacyRules.breakEndTime);
            
            if (minStartMinutes >= breakEndMinutes) {
              actualStartTime = this.minutesToTime(minStartMinutes);
              actualEndTime = this.pharmacyRules.closingTime;
              shiftHours = 2;
              console.log(`  ⚠️ Adjusted afternoon shift for ${pharmacist.name} to meet 2h minimum (${actualStartTime}-${actualEndTime})`);
            } else {
              console.warn(`⚠️ Cannot create afternoon shift for ${pharmacist.name}: not enough time after break`);
              return; // Skip this assignment - can't create valid shift
            }
          }
        }
        
        shifts.push({
          id: `shift_${dateStr}_${pharmacist.id}_afternoon`,
          pharmacistId: pharmacist.id,
          date: dateStr,
          startTime: actualStartTime,
          endTime: actualEndTime,
          type: 'afternoon',
          isBreakTime: false,
          patternId: assignment.patternId,
        });
        totalShiftHours += shiftHours;
      } else if (shiftType === 'full') {
        // Full day - split at the pharmacy break time
        // This is used for fallback cases or patterns without breaks
        // Validate minimum duration for each part
        const morningStart = this.timeToMinutes(startTime);
        const morningEnd = this.timeToMinutes(this.pharmacyRules.breakStartTime);
        let morningHours = (morningEnd - morningStart) / 60;
        
        const afternoonStart = this.timeToMinutes(this.pharmacyRules.breakEndTime);
        const afternoonEnd = this.timeToMinutes(endTime);
        let afternoonHours = (afternoonEnd - afternoonStart) / 60;
        
        // For part-time pharmacists, ensure we create at least one valid shift part
        const isPartTime = pharmacist.weeklyHours < 40;
        
        if (morningHours >= 2) {
          shifts.push({
            id: `shift_${dateStr}_${pharmacist.id}_morning`,
            pharmacistId: pharmacist.id,
            date: dateStr,
            startTime: startTime,
            endTime: this.pharmacyRules.breakStartTime,
            type: 'morning',
            isBreakTime: false,
            patternId: assignment.patternId,
          });
          totalShiftHours += morningHours;
        } else if (isPartTime && morningHours > 0) {
          // For part-time, use morning even if slightly short (will be extended to 2h minimum)
          shifts.push({
            id: `shift_${dateStr}_${pharmacist.id}_morning`,
            pharmacistId: pharmacist.id,
            date: dateStr,
            startTime: startTime,
            endTime: this.pharmacyRules.breakStartTime,
            type: 'morning',
            isBreakTime: false,
            patternId: assignment.patternId,
          });
          totalShiftHours += Math.max(2, morningHours); // At least 2h
          morningHours = Math.max(2, morningHours);
        } else {
          console.warn(`⚠️ Skipping morning part of full shift for ${pharmacist.name}: duration ${morningHours.toFixed(1)}h is less than minimum 2h`);
        }

        if (afternoonHours >= 2) {
          shifts.push({
            id: `shift_${dateStr}_${pharmacist.id}_afternoon`,
            pharmacistId: pharmacist.id,
            date: dateStr,
            startTime: this.pharmacyRules.breakEndTime,
            endTime: endTime,
            type: 'afternoon',
            isBreakTime: false,
            patternId: assignment.patternId,
          });
          totalShiftHours += afternoonHours;
        } else if (isPartTime && afternoonHours > 0) {
          // For part-time, use afternoon even if slightly short (will be extended to 2h minimum)
          shifts.push({
            id: `shift_${dateStr}_${pharmacist.id}_afternoon`,
            pharmacistId: pharmacist.id,
            date: dateStr,
            startTime: this.pharmacyRules.breakEndTime,
            endTime: endTime,
            type: 'afternoon',
            isBreakTime: false,
            patternId: assignment.patternId,
          });
          totalShiftHours += Math.max(2, afternoonHours); // At least 2h
          afternoonHours = Math.max(2, afternoonHours);
        } else {
          console.warn(`⚠️ Skipping afternoon part of full shift for ${pharmacist.name}: duration ${afternoonHours.toFixed(1)}h is less than minimum 2h`);
        }
        
        // If no shifts were created for part-time, create a minimum shift
        if (isPartTime && totalShiftHours === 0) {
          const openingMinutes = this.timeToMinutes(this.pharmacyRules.openingTime);
          const minEndMinutes = openingMinutes + (2 * 60);
          const closingMinutes = this.timeToMinutes(this.pharmacyRules.closingTime);
          
          if (minEndMinutes <= closingMinutes) {
            shifts.push({
              id: `shift_${dateStr}_${pharmacist.id}_morning`,
              pharmacistId: pharmacist.id,
              date: dateStr,
              startTime: this.pharmacyRules.openingTime,
              endTime: this.minutesToTime(minEndMinutes),
              type: 'morning',
              isBreakTime: false,
              patternId: assignment.patternId,
            });
            totalShiftHours = 2;
            console.log(`  ⚠️ Created minimum 2h shift for part-time ${pharmacist.name} as fallback`);
          }
        }
      }

      // Update weekly hours - only deduct hours for shifts actually created
      if (totalShiftHours > 0) {
        weeklyHours[pharmacist.id] -= totalShiftHours;
        console.log(`Deducted ${totalShiftHours.toFixed(1)} hours from ${pharmacist.name} (${startTime}-${endTime})`);
      } else {
        console.warn(`⚠️ No shifts created for ${pharmacist.name} - hours not deducted`);
      }
    });

    return shifts;
  }

  private createShiftAssignments(
    availablePharmacists: Pharmacist[],
    patternRotationTracker: Record<string, { pharmacist: Pharmacist; patternIndex: number; dailyPatterns: string[] }>,
    dayIndex: number,
    dayName: string,
    weeklyHours: Record<string, number>,
    partTimeWorkingDaysRemaining?: Record<string, number>,
    pharmacistPatternUsage?: Record<string, Record<string, number>>
  ): Array<{
    pharmacist: Pharmacist;
    shiftType: 'morning' | 'afternoon' | 'full';
    startTime: string;
    endTime: string;
    patternId?: string;
  }> {
    const assignments: Array<{
      pharmacist: Pharmacist;
      shiftType: 'morning' | 'afternoon' | 'full';
      startTime: string;
      endTime: string;
      patternId?: string;
    }> = [];

    // Separate pharmacists by their weekly hours
    const fullTimePharmacists = availablePharmacists.filter(p => p.weeklyHours >= 40);
    const partTimePharmacists = availablePharmacists.filter(p => p.weeklyHours < 40);

    console.log(`Full-time pharmacists (40h+): ${fullTimePharmacists.map(p => p.name).join(', ')}`);
    console.log(`Part-time pharmacists (<40h): ${partTimePharmacists.map(p => p.name).join(', ')}`);

    // Assign full-time pharmacists using smart rotation that considers staffing requirements
    if (this.pharmacyRules.fixedShiftPatterns && fullTimePharmacists.length > 0) {
      console.log('\n=== Smart Rotation Pattern Assignment ===');
      
      const patterns = this.pharmacyRules.fixedShiftPatterns;
      const patternAssignments: { pharmacist: Pharmacist; pattern: FixedShiftPattern }[] = [];
      
      // Create a coverage tracker to monitor staffing requirements
      const coverageTracker = this.createCoverageTracker();
      
      // Track pattern usage for balancing
      const patternUsageCount = patterns.map(() => 0);
      
      // Separate pharmacists with fixed patterns for this day from those without
      const pharmacistsWithFixedPattern: Array<{ pharmacist: Pharmacist; pattern: FixedShiftPattern; patternIndex: number }> = [];
      const pharmacistsWithoutFixedPattern: Pharmacist[] = [];
      
      fullTimePharmacists.forEach((pharmacist) => {
        const fixedDayPattern = pharmacist.fixedDayPatterns?.find(
          dp => dp.dayOfWeek === dayName
        );
        
        if (fixedDayPattern) {
          const fixedPattern = patterns.find(p => p.id === fixedDayPattern.patternId);
          if (fixedPattern) {
            const patternIndex = patterns.findIndex(p => p.id === fixedPattern.id);
            pharmacistsWithFixedPattern.push({ pharmacist, pattern: fixedPattern, patternIndex });
            console.log(`📌 Fixed day pattern: ${pharmacist.name} will use ${fixedPattern.name} on ${dayName}`);
          } else {
            console.warn(`⚠️ Fixed pattern ${fixedDayPattern.patternId} not found for ${pharmacist.name} on ${dayName}, will use rotation`);
            pharmacistsWithoutFixedPattern.push(pharmacist);
          }
        } else {
          pharmacistsWithoutFixedPattern.push(pharmacist);
        }
      });
      
      // First, assign all pharmacists with fixed patterns
      pharmacistsWithFixedPattern.forEach(({ pharmacist, pattern, patternIndex }) => {
        patternAssignments.push({ pharmacist, pattern });
        patternUsageCount[patternIndex]++;
        
        // Update pharmacist pattern usage tracker (even for fixed patterns, for consistency)
        if (pharmacistPatternUsage && pharmacistPatternUsage[pharmacist.id]) {
          pharmacistPatternUsage[pharmacist.id][pattern.id] = (pharmacistPatternUsage[pharmacist.id][pattern.id] || 0) + 1;
        }
        
        // Update coverage tracker
        this.updateCoverageTracker(coverageTracker, pattern);
        
        // Don't update rotation tracker for fixed patterns
        const tracker = patternRotationTracker[pharmacist.id];
        tracker.dailyPatterns.push(pattern.name);
      });
      
      // Then, assign remaining pharmacists using rotation/balancing logic
      pharmacistsWithoutFixedPattern.forEach((pharmacist) => {
        const tracker = patternRotationTracker[pharmacist.id];
        let patternIndex = tracker.patternIndex;
        let pattern = patterns[patternIndex];
        
        // Check if we need to prioritize staffing requirements over rotation
        const unmetRequirements = this.pharmacyRules.staffingRequirements.filter(req => {
          const key = `${req.startTime}-${req.endTime}`;
          return coverageTracker[key] < req.requiredPharmacists;
        });
        
        if (unmetRequirements.length > 0) {
          console.log(`⚠️ Unmet requirements detected for ${pharmacist.name}, finding best pattern`);
          
          // Find the pattern that helps most with unmet requirements
          // But also consider pattern balance
          let bestPattern = pattern;
          let bestScore = 0;
          
          patterns.forEach((testPattern, testIndex) => {
            let score = 0;
            unmetRequirements.forEach(req => {
              const patternHelps = this.patternHelpsWithRequirement(testPattern, req);
              if (patternHelps) {
                const coveragePercentage = this.calculatePatternCoveragePercentage(testPattern, req);
                score += coveragePercentage;
              }
            });
            
            // Add balance bonus: prefer less-used patterns
            const usageCount = patternUsageCount[testIndex];
            const balanceBonus = (Math.max(...patternUsageCount) - usageCount) * 10;
            score += balanceBonus;
            
            if (score > bestScore) {
              bestPattern = testPattern;
              bestScore = score;
              patternIndex = testIndex;
            }
          });
          
          pattern = bestPattern;
          console.log(`✅ Selected pattern ${pattern.name} for ${pharmacist.name} (score: ${bestScore})`);
        } else {
          // No unmet requirements - use balanced rotation
          // Ensure pattern balance per pharmacist: max difference of 1 between counts
          const pharmacistUsage = pharmacistPatternUsage?.[pharmacist.id] || {};
          
          // Get current usage counts for this pharmacist
          const pharmacistPatternCounts = patterns.map((p, idx) => ({
            pattern: p,
            index: idx,
            count: pharmacistUsage[p.id] || 0,
            dayUsage: patternUsageCount[idx],
          }));
          
          // Calculate global pattern distribution across all full-time pharmacists (including those with fixed patterns)
          // This helps ensure overall balance between pharmacists
          const globalPatternDistribution: Record<string, { min: number; max: number; avg: number; currentDiff: number }> = {};
          patterns.forEach(p => {
            const counts: number[] = [];
            fullTimePharmacists.forEach(ph => {
              const phUsage = pharmacistPatternUsage?.[ph.id] || {};
              counts.push(phUsage[p.id] || 0);
            });
            if (counts.length > 0) {
              const min = Math.min(...counts);
              const max = Math.max(...counts);
              globalPatternDistribution[p.id] = {
                min,
                max,
                avg: counts.reduce((a, b) => a + b, 0) / counts.length,
                currentDiff: max - min, // Current imbalance
              };
            }
          });
          
          // Find min and max usage for this pharmacist
          const minCount = Math.min(...pharmacistPatternCounts.map(p => p.count));
          const maxCount = Math.max(...pharmacistPatternCounts.map(p => p.count));
          
          // Filter to patterns that maintain balance (max difference of 1)
          const balancedPatterns = pharmacistPatternCounts.filter(p => {
            // If we use this pattern, will it keep max difference <= 1?
            const newCount = p.count + 1;
            const newMin = Math.min(minCount, ...pharmacistPatternCounts.filter(pp => pp.index !== p.index).map(pp => pp.count));
            const newMax = Math.max(newCount, ...pharmacistPatternCounts.filter(pp => pp.index !== p.index).map(pp => pp.count));
            return (newMax - newMin) <= 1;
          });
          
          // If we have balanced options, use them; otherwise use the least used
          const candidates = balancedPatterns.length > 0 ? balancedPatterns : pharmacistPatternCounts;
          
          // Among candidates, prefer:
          // 1. Patterns that maintain balance (if balanced options exist)
          // 2. Patterns that help with global balance (reduce max-min difference across all pharmacists)
          // 3. Least used by this pharmacist
          // 4. Least used globally today (for overall balance)
          candidates.sort((a, b) => {
            // First: prefer patterns that maintain balance
            const aBalanced = balancedPatterns.some(p => p.index === a.index);
            const bBalanced = balancedPatterns.some(p => p.index === b.index);
            if (aBalanced !== bBalanced) return aBalanced ? -1 : 1;
            
            // Second: STRONGLY prefer patterns that improve global balance (reduce max-min difference)
            const aGlobal = globalPatternDistribution[a.pattern.id];
            const bGlobal = globalPatternDistribution[b.pattern.id];
            if (aGlobal && bGlobal) {
              // Calculate how much this assignment would improve global balance
              const aNewCount = a.count + 1;
              const aNewMax = Math.max(aGlobal.max, aNewCount);
              const aNewMin = Math.min(aGlobal.min, aNewCount);
              const aGlobalDiff = aNewMax - aNewMin;
              
              const bNewCount = b.count + 1;
              const bNewMax = Math.max(bGlobal.max, bNewCount);
              const bNewMin = Math.min(bGlobal.min, bNewCount);
              const bGlobalDiff = bNewMax - bNewMin;
              
              // Strongly prefer patterns that reduce global imbalance
              if (aGlobalDiff !== bGlobalDiff) {
                // If one maintains balance (diff <= 1) and the other doesn't, prefer the balanced one
                if (aGlobalDiff <= 1 && bGlobalDiff > 1) return -1;
                if (bGlobalDiff <= 1 && aGlobalDiff > 1) return 1;
                // Otherwise prefer the one with smaller difference
                return aGlobalDiff - bGlobalDiff;
              }
            }
            
            // Third: prefer least used by this pharmacist
            if (a.count !== b.count) return a.count - b.count;
            
            // Fourth: prefer least used globally today
            return a.dayUsage - b.dayUsage;
          });
          
          const selected = candidates[0];
          patternIndex = selected.index;
          pattern = selected.pattern;
          
          console.log(`Assigning ${pharmacist.name} to ${pattern.name} (balanced: pharmacist usage ${selected.count}, day usage ${selected.dayUsage}, min=${minCount}, max=${maxCount})`);
        }
        
        patternAssignments.push({ pharmacist, pattern });
        patternUsageCount[patternIndex]++;
        
        // Update pharmacist pattern usage tracker
        if (pharmacistPatternUsage && pharmacistPatternUsage[pharmacist.id]) {
          pharmacistPatternUsage[pharmacist.id][pattern.id] = (pharmacistPatternUsage[pharmacist.id][pattern.id] || 0) + 1;
        }
        
        // Update coverage tracker
        this.updateCoverageTracker(coverageTracker, pattern);
        
        // Update rotation tracker for next day
        tracker.patternIndex = (tracker.patternIndex + 1) % patterns.length;
        tracker.dailyPatterns.push(pattern.name);
      });
      
      // Now create assignments for each pattern assignment
      patternAssignments.forEach(({ pharmacist, pattern }) => {
        console.log(`Creating shifts for ${pharmacist.name} with pattern ${pattern.name}:`);
        
        // Check if there's a gap between morning and afternoon shifts (break time)
        const morningEnd = this.timeToMinutes(pattern.morningShift.endTime);
        const afternoonStart = this.timeToMinutes(pattern.afternoonShift.startTime);
        const hasBreak = afternoonStart > morningEnd;
        
        if (hasBreak) {
          const breakDuration = afternoonStart - morningEnd;
          const breakHours = Math.floor(breakDuration / 60);
          const breakMinutes = breakDuration % 60;
          console.log(`  Pattern has break: ${pattern.morningShift.endTime} - ${pattern.afternoonShift.startTime} (${breakHours}h ${breakMinutes}m)`);
          
          // Add morning shift assignment
          assignments.push({
            pharmacist,
            shiftType: 'morning',
            startTime: pattern.morningShift.startTime,
            endTime: pattern.morningShift.endTime,
            patternId: pattern.id,
          });
          
          // Add afternoon shift assignment
          assignments.push({
            pharmacist,
            shiftType: 'afternoon',
            startTime: pattern.afternoonShift.startTime,
            endTime: pattern.afternoonShift.endTime,
            patternId: pattern.id,
          });
        } else {
          // No break - create as full day
          console.log(`  Pattern has no break - creating full day shift`);
          assignments.push({
            pharmacist,
            shiftType: 'full',
            startTime: pattern.morningShift.startTime,
            endTime: pattern.afternoonShift.endTime,
            patternId: pattern.id,
          });
        }
        
        console.log(`  Morning: ${pattern.morningShift.startTime}-${pattern.morningShift.endTime}`);
        console.log(`  Afternoon: ${pattern.afternoonShift.startTime}-${pattern.afternoonShift.endTime}`);
      });
    } else {
      // Fallback: if no fixed patterns, assign full-time pharmacists to full days
      fullTimePharmacists.forEach((pharmacist) => {
        console.log(`Assigning ${pharmacist.name} to full day (fallback)`);
        assignments.push({
          pharmacist,
          shiftType: 'full',
          startTime: this.pharmacyRules.openingTime,
          endTime: this.pharmacyRules.closingTime,
        });
      });
    }

    // Now assign part-time pharmacists LAST
    // Part-time pharmacists should work every day (Monday-Saturday) except their free day
    // They should get exactly their weekly hours distributed across their working days
    if (partTimePharmacists.length > 0 && this.pharmacyRules.fixedShiftPatterns) {
      console.log('\n=== Assigning Part-Time Pharmacists ===');
      
      // Update coverage tracker after full-time assignments
      const coverageTracker = this.createCoverageTracker();
      assignments.forEach(assignment => {
        const pattern = this.pharmacyRules.fixedShiftPatterns?.find(p => p.id === assignment.patternId);
        if (pattern) {
          this.updateCoverageTracker(coverageTracker, pattern);
        } else {
          // For non-pattern assignments, manually update coverage
          this.pharmacyRules.staffingRequirements.forEach(req => {
            const assignmentStart = this.timeToMinutes(assignment.startTime);
            const assignmentEnd = this.timeToMinutes(assignment.endTime);
            const reqStart = this.timeToMinutes(req.startTime);
            const reqEnd = this.timeToMinutes(req.endTime);
            
            if (assignmentStart < reqEnd && assignmentEnd > reqStart) {
              const key = `${req.startTime}-${req.endTime}`;
              coverageTracker[key] = (coverageTracker[key] || 0) + 1;
            }
          });
        }
      });
      
      // For each part-time pharmacist, calculate daily hours and assign for this day
      // IMPORTANT: Part-time pharmacists MUST work every day (except free day) to get exactly their weekly hours
      for (const pharmacist of partTimePharmacists) {
        // Skip if this is their free day (use isFreeDay to check both freeDay and fixedDayPatterns)
        if (this.isFreeDay(pharmacist, dayName)) {
          console.log(`  ⏭️ Skipping ${pharmacist.name} on ${dayName} (free day)`);
          continue;
        }
        
        // Check if already assigned today (shouldn't happen, but check anyway)
        const isAssigned = assignments.some(a => a.pharmacist.id === pharmacist.id);
        if (isAssigned) {
          console.log(`  ✓ ${pharmacist.name} already assigned today`);
          continue;
        }
        
        // Ensure pharmacist is in availablePharmacists list
        // If not, they might have been filtered out incorrectly
        const isInAvailable = availablePharmacists.some(p => p.id === pharmacist.id);
        if (!isInAvailable) {
          console.log(`  ⚠️ ${pharmacist.name} is not in availablePharmacists but should be (part-time must work every day)`);
          // Continue anyway - we'll try to assign them
        }
        
        // Calculate how many working days this pharmacist has
        // Monday to Saturday = 6 days, minus free day (if they have one) = 5 or 6 days
        const hasFreeDay = pharmacist.freeDay || pharmacist.fixedDayPatterns?.some(p => p.patternId === 'FREE_DAY');
        const workingDaysPerWeek = hasFreeDay ? 5 : 6;
        const weeklyHoursTotal = pharmacist.weeklyHours;
        
        // Get remaining hours and working days for this pharmacist
        const remainingHours = weeklyHours[pharmacist.id] ?? pharmacist.weeklyHours;
        const remainingWorkingDays = partTimeWorkingDaysRemaining?.[pharmacist.id] ?? workingDaysPerWeek;
        
        // Calculate how many hours to assign today
        // Part-time pharmacists MUST work every day (except free day) to get exactly their weekly hours
        const dailyHoursTarget = weeklyHoursTotal / workingDaysPerWeek;
        
        let hoursToAssignToday: number;
        
        if (remainingWorkingDays === 1) {
          // Last working day: assign ALL remaining hours to ensure exact weekly total
          hoursToAssignToday = remainingHours;
          console.log(`  📍 Last day for ${pharmacist.name}: assigning all remaining ${hoursToAssignToday.toFixed(1)}h`);
        } else {
          // Not last day: assign daily target, but ensure we have enough hours left for remaining days
          // If remaining hours are less than what we need for remaining days, adjust
          const hoursNeededForRemainingDays = dailyHoursTarget * (remainingWorkingDays - 1);
          
          if (remainingHours >= hoursNeededForRemainingDays + dailyHoursTarget) {
            // Have enough hours: assign daily target
            hoursToAssignToday = dailyHoursTarget;
          } else if (remainingHours > hoursNeededForRemainingDays) {
            // Can assign some today, but need to reserve for remaining days
            hoursToAssignToday = remainingHours - hoursNeededForRemainingDays;
            console.log(`  ⚠️ ${pharmacist.name}: adjusting hours to ${hoursToAssignToday.toFixed(1)}h to ensure enough for remaining ${remainingWorkingDays - 1} days`);
          } else {
            // Not enough hours for remaining days - assign minimum to ensure they work today
            // This shouldn't happen if hours are tracked correctly, but handle it
            hoursToAssignToday = Math.max(0.5, remainingHours / remainingWorkingDays);
            console.log(`  ⚠️ ${pharmacist.name}: low hours (${remainingHours.toFixed(1)}h), assigning ${hoursToAssignToday.toFixed(1)}h today`);
          }
        }
        
        // Ensure minimum assignment
        if (hoursToAssignToday < 0.1) {
          // This should only happen if truly no hours left, which shouldn't happen
          console.log(`  ❌ ${pharmacist.name} has no hours remaining (${remainingHours.toFixed(1)}h), but must work - assigning minimum 0.5h`);
          hoursToAssignToday = 0.5;
        }
        
        console.log(`\n  👤 Assigning ${pharmacist.name} (target: ${dailyHoursTarget.toFixed(1)}h/day, assigning: ${hoursToAssignToday.toFixed(1)}h today)`);
        
        // Find unmet requirements to prioritize covering
        const unmetRequirements = this.pharmacyRules.staffingRequirements.filter(req => {
          const key = `${req.startTime}-${req.endTime}`;
          return (coverageTracker[key] || 0) < req.requiredPharmacists;
        });
        
        // Try to find a pattern that covers unmet requirements and fits the hours
        let assigned = false;
        const patterns = this.pharmacyRules.fixedShiftPatterns || [];
        
        // First, try to cover unmet requirements
        if (unmetRequirements.length > 0) {
          // Sort by priority (largest gaps first)
          unmetRequirements.sort((a, b) => {
            const aCoverage = coverageTracker[`${a.startTime}-${a.endTime}`] || 0;
            const bCoverage = coverageTracker[`${b.startTime}-${b.endTime}`] || 0;
            const aGap = a.requiredPharmacists - aCoverage;
            const bGap = b.requiredPharmacists - bCoverage;
            return bGap - aGap;
          });
          
          for (const requirement of unmetRequirements) {
            const bestPattern = this.findBestPatternForRequirement(
              requirement,
              patterns,
              hoursToAssignToday
            );
            
            if (bestPattern) {
              const adjustedShift = this.adjustPatternForPartTimeExact(
                bestPattern,
                requirement,
                hoursToAssignToday
              );
              
              if (adjustedShift) {
        assignments.push({
          pharmacist,
                  shiftType: adjustedShift.shiftType,
                  startTime: adjustedShift.startTime,
                  endTime: adjustedShift.endTime,
                  patternId: bestPattern.id,
                });
                
                // Update coverage tracker
                this.pharmacyRules.staffingRequirements.forEach(req => {
                  const reqKey = `${req.startTime}-${req.endTime}`;
                  const shiftStart = this.timeToMinutes(adjustedShift.startTime);
                  const shiftEnd = this.timeToMinutes(adjustedShift.endTime);
                  const reqStart = this.timeToMinutes(req.startTime);
                  const reqEnd = this.timeToMinutes(req.endTime);
                  
                  if (shiftStart < reqEnd && shiftEnd > reqStart) {
                    coverageTracker[reqKey] = (coverageTracker[reqKey] || 0) + 1;
                  }
                });
                
                const shiftHours = this.calculateShiftHours(adjustedShift.startTime, adjustedShift.endTime);
                // Don't deduct hours here - they will be deducted when the shift is actually created
                // weeklyHours[pharmacist.id] = remainingHours - shiftHours;
                
                // Decrement remaining working days
                if (partTimeWorkingDaysRemaining) {
                  partTimeWorkingDaysRemaining[pharmacist.id] = (partTimeWorkingDaysRemaining[pharmacist.id] ?? workingDaysPerWeek) - 1;
                }
                
                assigned = true;
                console.log(`    ✅ Assigned to cover requirement ${requirement.startTime}-${requirement.endTime} (${adjustedShift.startTime}-${adjustedShift.endTime}, ${shiftHours.toFixed(1)}h, pattern: ${bestPattern.name}, ${partTimeWorkingDaysRemaining?.[pharmacist.id] ?? 0} days remaining)`);
                break;
              }
            }
          }
        }
        
        // If not assigned yet, assign using a pattern that fits the exact hours needed
        if (!assigned) {
          // Find the best pattern that can be adjusted to exactly match hoursToAssignToday
          let bestPattern: FixedShiftPattern | null = null;
          let bestShift: { shiftType: 'morning' | 'afternoon' | 'full'; startTime: string; endTime: string } | null = null;
          let bestScore = 0;
          
          for (const pattern of patterns) {
            const morningHours = this.calculateShiftHours(pattern.morningShift.startTime, pattern.morningShift.endTime);
            const afternoonHours = this.calculateShiftHours(pattern.afternoonShift.startTime, pattern.afternoonShift.endTime);
            const fullHours = morningHours + afternoonHours;
            
            // Try different shift configurations
            const configs = [
              { type: 'full' as const, hours: fullHours, start: pattern.morningShift.startTime, end: pattern.afternoonShift.endTime },
              { type: 'afternoon' as const, hours: afternoonHours, start: pattern.afternoonShift.startTime, end: pattern.afternoonShift.endTime },
              { type: 'morning' as const, hours: morningHours, start: pattern.morningShift.startTime, end: pattern.morningShift.endTime },
            ];
            
            for (const config of configs) {
              // Check if we can adjust this config to match hoursToAssignToday
              if (config.hours <= hoursToAssignToday + 0.5 && config.hours >= hoursToAssignToday - 0.5) {
                // Can use as-is or with slight adjustment
                const score = 100 - Math.abs(config.hours - hoursToAssignToday) * 10;
                if (score > bestScore) {
                  bestScore = score;
                  bestPattern = pattern;
                  bestShift = {
                    shiftType: config.type,
                    startTime: config.start,
                    endTime: config.end,
                  };
                }
              } else if (config.hours < hoursToAssignToday) {
                // Can extend the shift to match hours needed
                const extensionNeeded = hoursToAssignToday - config.hours;
                const endMinutes = this.timeToMinutes(config.end);
                const extendedEndMinutes = endMinutes + (extensionNeeded * 60);
                const extendedEnd = this.minutesToTime(extendedEndMinutes);
                
                // Check if extended time is within pharmacy hours
                const closingMinutes = this.timeToMinutes(this.pharmacyRules.closingTime);
                if (extendedEndMinutes <= closingMinutes) {
                  const score = 80 - Math.abs((extendedEndMinutes - endMinutes) / 60 - extensionNeeded) * 10;
                  if (score > bestScore) {
                    bestScore = score;
                    bestPattern = pattern;
                    bestShift = {
                      shiftType: config.type,
                      startTime: config.start,
                      endTime: extendedEnd,
                    };
                  }
                }
              } else if (config.hours > hoursToAssignToday) {
                // Can shorten the shift to match hours needed
                const reductionNeeded = config.hours - hoursToAssignToday;
                const startMinutes = this.timeToMinutes(config.start);
                const endMinutes = this.timeToMinutes(config.end);
                const reducedEndMinutes = endMinutes - (reductionNeeded * 60);
                
                // Check if reduced time is valid
                if (reducedEndMinutes > startMinutes) {
                  const reducedEnd = this.minutesToTime(reducedEndMinutes);
                  const score = 70 - Math.abs((endMinutes - reducedEndMinutes) / 60 - reductionNeeded) * 10;
                  if (score > bestScore) {
                    bestScore = score;
                    bestPattern = pattern;
                    bestShift = {
                      shiftType: config.type,
                      startTime: config.start,
                      endTime: reducedEnd,
                    };
                  }
                }
              }
            }
          }
          
          if (bestPattern && bestShift) {
            assignments.push({
              pharmacist,
              shiftType: bestShift.shiftType,
              startTime: bestShift.startTime,
              endTime: bestShift.endTime,
              patternId: bestPattern.id,
            });
            
            // Update coverage tracker
            this.pharmacyRules.staffingRequirements.forEach(req => {
              const reqKey = `${req.startTime}-${req.endTime}`;
              const shiftStart = this.timeToMinutes(bestShift!.startTime);
              const shiftEnd = this.timeToMinutes(bestShift!.endTime);
              const reqStart = this.timeToMinutes(req.startTime);
              const reqEnd = this.timeToMinutes(req.endTime);
              
              if (shiftStart < reqEnd && shiftEnd > reqStart) {
                coverageTracker[reqKey] = (coverageTracker[reqKey] || 0) + 1;
              }
            });
            
            const shiftHours = this.calculateShiftHours(bestShift.startTime, bestShift.endTime);
            // Don't deduct hours here - they will be deducted when the shift is actually created
            // weeklyHours[pharmacist.id] = remainingHours - shiftHours;
            
            // Decrement remaining working days
            if (partTimeWorkingDaysRemaining) {
              partTimeWorkingDaysRemaining[pharmacist.id] = (partTimeWorkingDaysRemaining[pharmacist.id] ?? workingDaysPerWeek) - 1;
            }
            
            assigned = true;
            console.log(`    📅 Assigned to pattern ${bestPattern.name} (${bestShift.startTime}-${bestShift.endTime}, ${shiftHours.toFixed(1)}h, ${partTimeWorkingDaysRemaining?.[pharmacist.id] ?? 0} days remaining)`);
          }
        }
        
        // Fallback: If still not assigned, create a custom shift to ensure assignment
        if (!assigned) {
          console.log(`    ⚠️ Could not find pattern for ${pharmacist.name}, creating custom shift (target: ${hoursToAssignToday.toFixed(1)}h)`);
          
          // Find the best pattern as a base, even if it doesn't match exactly
          let fallbackPattern: FixedShiftPattern | null = null;
          let fallbackShift: { shiftType: 'morning' | 'afternoon' | 'full'; startTime: string; endTime: string } | null = null;
          
          // Try to find any pattern that can be adjusted
          for (const pattern of patterns) {
            const morningHours = this.calculateShiftHours(pattern.morningShift.startTime, pattern.morningShift.endTime);
            const afternoonHours = this.calculateShiftHours(pattern.afternoonShift.startTime, pattern.afternoonShift.endTime);
            const fullHours = morningHours + afternoonHours;
            
            // Prefer full pattern if it's close
            if (Math.abs(fullHours - hoursToAssignToday) <= 2) {
              fallbackPattern = pattern;
              // Adjust end time to match exact hours
              const startMinutes = this.timeToMinutes(pattern.morningShift.startTime);
              const targetEndMinutes = startMinutes + (hoursToAssignToday * 60);
              const targetEnd = this.minutesToTime(targetEndMinutes);
              const closingMinutes = this.timeToMinutes(this.pharmacyRules.closingTime);
              
              if (targetEndMinutes <= closingMinutes) {
                fallbackShift = {
          shiftType: 'full',
                  startTime: pattern.morningShift.startTime,
                  endTime: targetEnd,
                };
                break;
              }
            } else if (Math.abs(afternoonHours - hoursToAssignToday) <= 1.5) {
              fallbackPattern = pattern;
              const startMinutes = this.timeToMinutes(pattern.afternoonShift.startTime);
              const targetEndMinutes = startMinutes + (hoursToAssignToday * 60);
              const targetEnd = this.minutesToTime(targetEndMinutes);
              const closingMinutes = this.timeToMinutes(this.pharmacyRules.closingTime);
              
              if (targetEndMinutes <= closingMinutes) {
                fallbackShift = {
                  shiftType: 'afternoon',
                  startTime: pattern.afternoonShift.startTime,
                  endTime: targetEnd,
                };
                break;
              }
            } else if (Math.abs(morningHours - hoursToAssignToday) <= 1.5) {
              fallbackPattern = pattern;
              const startMinutes = this.timeToMinutes(pattern.morningShift.startTime);
              const targetEndMinutes = startMinutes + (hoursToAssignToday * 60);
              const targetEnd = this.minutesToTime(targetEndMinutes);
              
              fallbackShift = {
                shiftType: 'morning',
                startTime: pattern.morningShift.startTime,
                endTime: targetEnd,
              };
              break;
            }
          }
          
          // If still no pattern, create a simple shift from opening to target hours
          if (!fallbackShift) {
            const openingMinutes = this.timeToMinutes(this.pharmacyRules.openingTime);
            const targetEndMinutes = openingMinutes + (hoursToAssignToday * 60);
            const targetEnd = this.minutesToTime(targetEndMinutes);
            const closingMinutes = this.timeToMinutes(this.pharmacyRules.closingTime);
            
            if (targetEndMinutes <= closingMinutes) {
              fallbackShift = {
                shiftType: 'full',
                startTime: this.pharmacyRules.openingTime,
                endTime: targetEnd,
              };
            } else {
              // If can't fit from opening, start from a time that fits
              const adjustedStartMinutes = closingMinutes - (hoursToAssignToday * 60);
              const adjustedStart = this.minutesToTime(adjustedStartMinutes);
              if (adjustedStartMinutes >= openingMinutes) {
                fallbackShift = {
                  shiftType: 'full',
                  startTime: adjustedStart,
                  endTime: this.pharmacyRules.closingTime,
                };
              }
            }
          }
          
          if (fallbackShift) {
            assignments.push({
              pharmacist,
              shiftType: fallbackShift.shiftType,
              startTime: fallbackShift.startTime,
              endTime: fallbackShift.endTime,
              patternId: fallbackPattern?.id,
            });
            
            // Update coverage tracker
            this.pharmacyRules.staffingRequirements.forEach(req => {
              const reqKey = `${req.startTime}-${req.endTime}`;
              const shiftStart = this.timeToMinutes(fallbackShift!.startTime);
              const shiftEnd = this.timeToMinutes(fallbackShift!.endTime);
              const reqStart = this.timeToMinutes(req.startTime);
              const reqEnd = this.timeToMinutes(req.endTime);
              
              if (shiftStart < reqEnd && shiftEnd > reqStart) {
                coverageTracker[reqKey] = (coverageTracker[reqKey] || 0) + 1;
              }
            });
            
            const shiftHours = this.calculateShiftHours(fallbackShift.startTime, fallbackShift.endTime);
            // Don't deduct hours here - they will be deducted when the shift is actually created
            // weeklyHours[pharmacist.id] = remainingHours - shiftHours;
            
            // Decrement remaining working days
            if (partTimeWorkingDaysRemaining) {
              partTimeWorkingDaysRemaining[pharmacist.id] = (partTimeWorkingDaysRemaining[pharmacist.id] ?? workingDaysPerWeek) - 1;
            }
            
            assigned = true;
            console.log(`    ✅ Fallback: Assigned custom shift (${fallbackShift.startTime}-${fallbackShift.endTime}, ${shiftHours.toFixed(1)}h, ${partTimeWorkingDaysRemaining?.[pharmacist.id] ?? 0} days remaining)`);
          } else {
            console.log(`    ❌ ERROR: Could not create fallback shift for ${pharmacist.name}`);
            // If we couldn't create a shift, we still need to ensure they work
            // Try to create a minimum 2-hour shift from opening time
            const openingMinutes = this.timeToMinutes(this.pharmacyRules.openingTime);
            const minShiftEndMinutes = openingMinutes + (2 * 60); // 2 hours minimum
            const minShiftEnd = this.minutesToTime(minShiftEndMinutes);
            const closingMinutes = this.timeToMinutes(this.pharmacyRules.closingTime);
            
            if (minShiftEndMinutes <= closingMinutes) {
              assignments.push({
                pharmacist,
                shiftType: 'morning',
                startTime: this.pharmacyRules.openingTime,
                endTime: minShiftEnd,
                patternId: undefined,
              });
              
              const shiftHours = 2;
              // Don't deduct hours here - they will be deducted when the shift is actually created
              // weeklyHours[pharmacist.id] = remainingHours - shiftHours;
              
              if (partTimeWorkingDaysRemaining) {
                partTimeWorkingDaysRemaining[pharmacist.id] = (partTimeWorkingDaysRemaining[pharmacist.id] ?? workingDaysPerWeek) - 1;
              }
              
              console.log(`    ⚠️ Created minimum 2h shift as last resort (${this.pharmacyRules.openingTime}-${minShiftEnd}, ${shiftHours}h)`);
            } else {
              console.log(`    ❌ CRITICAL: Cannot create any shift for ${pharmacist.name} - pharmacy hours too short`);
            }
          }
        }
      }
    }

    console.log(`Total assignments created: ${assignments.length}`);
    assignments.forEach((assignment, index) => {
      console.log(`Assignment ${index + 1}: ${assignment.pharmacist.name} - ${assignment.shiftType} (${assignment.startTime}-${assignment.endTime})`);
    });

    return assignments;
  }

  /**
   * Find the best fixed shift pattern that covers a requirement
   */
  private findBestPatternForRequirement(
    requirement: { startTime: string; endTime: string; requiredPharmacists: number },
    patterns: FixedShiftPattern[],
    remainingHours: number
  ): FixedShiftPattern | null {
    const reqStart = this.timeToMinutes(requirement.startTime);
    const reqEnd = this.timeToMinutes(requirement.endTime);
    
    let bestPattern: FixedShiftPattern | null = null;
    let bestScore = 0;
    
    for (const pattern of patterns) {
      const morningStart = this.timeToMinutes(pattern.morningShift.startTime);
      const morningEnd = this.timeToMinutes(pattern.morningShift.endTime);
      const afternoonStart = this.timeToMinutes(pattern.afternoonShift.startTime);
      const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
      
      // Check if pattern covers the requirement
      const morningCovers = morningStart <= reqStart && morningEnd >= reqEnd;
      const afternoonCovers = afternoonStart <= reqStart && afternoonEnd >= reqEnd;
      const fullCovers = morningStart <= reqStart && afternoonEnd >= reqEnd;
      
      if (!morningCovers && !afternoonCovers && !fullCovers) {
        continue; // Pattern doesn't cover requirement
      }
      
      // Calculate coverage score
      let score = 0;
      if (fullCovers) {
        score = 100; // Full coverage is best
      } else if (afternoonCovers) {
        score = 70; // Afternoon coverage
      } else if (morningCovers) {
        score = 50; // Morning coverage
      }
      
      // Prefer patterns that fit within remaining hours
      const morningHours = this.calculateShiftHours(pattern.morningShift.startTime, pattern.morningShift.endTime);
      const afternoonHours = this.calculateShiftHours(pattern.afternoonShift.startTime, pattern.afternoonShift.endTime);
      const fullHours = morningHours + afternoonHours;
      
      if (remainingHours >= fullHours) {
        score += 20; // Can do full pattern
      } else if (remainingHours >= afternoonHours) {
        score += 10; // Can do afternoon
      } else if (remainingHours >= morningHours) {
        score += 5; // Can do morning
      } else {
        score -= 50; // Can't fit, heavily penalize
      }
      
      if (score > bestScore) {
        bestPattern = pattern;
        bestScore = score;
      }
    }
    
    return bestPattern;
  }

  /**
   * Adjust a pattern to fit exact hours needed and requirement
   */
  private adjustPatternForPartTimeExact(
    pattern: FixedShiftPattern,
    requirement: { startTime: string; endTime: string; requiredPharmacists: number },
    exactHours: number
  ): { shiftType: 'morning' | 'afternoon' | 'full'; startTime: string; endTime: string } | null {
    const reqStart = this.timeToMinutes(requirement.startTime);
    const reqEnd = this.timeToMinutes(requirement.endTime);
    const morningStart = this.timeToMinutes(pattern.morningShift.startTime);
    const morningEnd = this.timeToMinutes(pattern.morningShift.endTime);
    const afternoonStart = this.timeToMinutes(pattern.afternoonShift.startTime);
    const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
    
    const morningHours = this.calculateShiftHours(pattern.morningShift.startTime, pattern.morningShift.endTime);
    const afternoonHours = this.calculateShiftHours(pattern.afternoonShift.startTime, pattern.afternoonShift.endTime);
    const fullHours = morningHours + afternoonHours;
    
    // Check what covers the requirement
    const morningCovers = morningStart <= reqStart && morningEnd >= reqEnd;
    const afternoonCovers = afternoonStart <= reqStart && afternoonEnd >= reqEnd;
    const fullCovers = morningStart <= reqStart && afternoonEnd >= reqEnd;
    
    // Try to use the smallest shift that covers the requirement and matches exact hours
    if (morningCovers && Math.abs(morningHours - exactHours) < 0.5) {
      // Morning only covers requirement and matches hours
      return {
        shiftType: 'morning',
        startTime: pattern.morningShift.startTime,
        endTime: pattern.morningShift.endTime,
      };
    } else if (morningCovers && morningHours < exactHours) {
      // Morning covers but need to extend
      const extensionNeeded = exactHours - morningHours;
      const extendedEndMinutes = morningEnd + (extensionNeeded * 60);
      const extendedEnd = this.minutesToTime(extendedEndMinutes);
      return {
        shiftType: 'morning',
        startTime: pattern.morningShift.startTime,
        endTime: extendedEnd,
      };
    } else if (afternoonCovers && Math.abs(afternoonHours - exactHours) < 0.5) {
      // Afternoon only covers requirement and matches hours
      return {
        shiftType: 'afternoon',
        startTime: pattern.afternoonShift.startTime,
        endTime: pattern.afternoonShift.endTime,
      };
    } else if (afternoonCovers && afternoonHours < exactHours) {
      // Afternoon covers but need to extend
      const extensionNeeded = exactHours - afternoonHours;
      const extendedEndMinutes = afternoonEnd + (extensionNeeded * 60);
      const extendedEnd = this.minutesToTime(extendedEndMinutes);
      return {
        shiftType: 'afternoon',
        startTime: pattern.afternoonShift.startTime,
        endTime: extendedEnd,
      };
    } else if (fullCovers && Math.abs(fullHours - exactHours) < 0.5) {
      // Full pattern covers requirement and matches hours
      return {
        shiftType: 'full',
        startTime: pattern.morningShift.startTime,
        endTime: pattern.afternoonShift.endTime,
      };
    } else if (fullCovers && fullHours < exactHours) {
      // Full covers but need to extend afternoon
      const extensionNeeded = exactHours - fullHours;
      const extendedEndMinutes = afternoonEnd + (extensionNeeded * 60);
      const extendedEnd = this.minutesToTime(extendedEndMinutes);
      return {
        shiftType: 'full',
        startTime: pattern.morningShift.startTime,
        endTime: extendedEnd,
      };
    } else if (fullCovers && fullHours > exactHours) {
      // Full covers but need to reduce
      const reductionNeeded = fullHours - exactHours;
      const reducedEndMinutes = afternoonEnd - (reductionNeeded * 60);
      if (reducedEndMinutes > morningStart) {
        const reducedEnd = this.minutesToTime(reducedEndMinutes);
        return {
          shiftType: 'full',
          startTime: pattern.morningShift.startTime,
          endTime: reducedEnd,
        };
      }
    }
    
    return null; // Can't fit
  }

  /**
   * Adjust a pattern to fit remaining hours and requirement
   */
  private adjustPatternForPartTime(
    pattern: FixedShiftPattern,
    requirement: { startTime: string; endTime: string; requiredPharmacists: number },
    remainingHours: number
  ): { shiftType: 'morning' | 'afternoon' | 'full'; startTime: string; endTime: string } | null {
    const reqStart = this.timeToMinutes(requirement.startTime);
    const reqEnd = this.timeToMinutes(requirement.endTime);
    const morningStart = this.timeToMinutes(pattern.morningShift.startTime);
    const morningEnd = this.timeToMinutes(pattern.morningShift.endTime);
    const afternoonStart = this.timeToMinutes(pattern.afternoonShift.startTime);
    const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
    
    const morningHours = this.calculateShiftHours(pattern.morningShift.startTime, pattern.morningShift.endTime);
    const afternoonHours = this.calculateShiftHours(pattern.afternoonShift.startTime, pattern.afternoonShift.endTime);
    const fullHours = morningHours + afternoonHours;
    
    // Check what covers the requirement
    const morningCovers = morningStart <= reqStart && morningEnd >= reqEnd;
    const afternoonCovers = afternoonStart <= reqStart && afternoonEnd >= reqEnd;
    const fullCovers = morningStart <= reqStart && afternoonEnd >= reqEnd;
    
    // Try to use the smallest shift that covers the requirement and fits remaining hours
    if (morningCovers && remainingHours >= morningHours) {
      // Morning only covers requirement
      return {
        shiftType: 'morning',
        startTime: pattern.morningShift.startTime,
        endTime: pattern.morningShift.endTime,
      };
    } else if (afternoonCovers && remainingHours >= afternoonHours) {
      // Afternoon only covers requirement
      return {
        shiftType: 'afternoon',
        startTime: pattern.afternoonShift.startTime,
        endTime: pattern.afternoonShift.endTime,
      };
    } else if (fullCovers && remainingHours >= fullHours * 0.8) {
      // Full pattern covers requirement, allow slight reduction
      return {
        shiftType: 'full',
        startTime: pattern.morningShift.startTime,
        endTime: pattern.afternoonShift.endTime,
      };
    } else if (fullCovers && remainingHours >= afternoonHours) {
      // Can't do full, but afternoon covers requirement
      return {
        shiftType: 'afternoon',
        startTime: pattern.afternoonShift.startTime,
        endTime: pattern.afternoonShift.endTime,
      };
    } else if (fullCovers && remainingHours >= morningHours) {
      // Can't do full or afternoon, but morning covers requirement
      return {
        shiftType: 'morning',
        startTime: pattern.morningShift.startTime,
        endTime: pattern.morningShift.endTime,
      };
    }
    
    return null; // Can't fit
  }

  private validateAndFillStaffingRequirements(
    assignments: Array<{
      pharmacist: Pharmacist;
      shiftType: 'morning' | 'afternoon' | 'full';
      startTime: string;
      endTime: string;
      patternId?: string;
    }>,
    partTimePharmacists: Pharmacist[]
  ): void {
    console.log('\n=== Validating Staffing Requirements ===');

    this.pharmacyRules.staffingRequirements.forEach(requirement => {
      console.log(`\nChecking requirement: ${requirement.startTime}-${requirement.endTime} (need ${requirement.requiredPharmacists})`);
      
      // Count how many pharmacists are working during this time period
      const pharmacistsWorking = assignments.filter(assignment => {
        const assignmentStart = this.timeToMinutes(assignment.startTime);
        const assignmentEnd = this.timeToMinutes(assignment.endTime);
        const requirementStart = this.timeToMinutes(requirement.startTime);
        const requirementEnd = this.timeToMinutes(requirement.endTime);
        
        // Check if assignment overlaps with requirement period
        const hasOverlap = assignmentStart < requirementEnd && assignmentEnd > requirementStart;
        
        if (hasOverlap) {
          console.log(`  ✅ ${assignment.pharmacist.name} working ${assignment.startTime}-${assignment.endTime} covers this period`);
        }
        
        return hasOverlap;
      }).length;
      
      console.log(`  Current coverage: ${pharmacistsWorking}/${requirement.requiredPharmacists}`);
      
      // If we don't have enough coverage, try to add more pharmacists
      if (pharmacistsWorking < requirement.requiredPharmacists) {
        const needed = requirement.requiredPharmacists - pharmacistsWorking;
        console.log(`  ⚠️ Need ${needed} more pharmacists for this period`);
        
        // Find available part-time pharmacists who aren't already assigned
        const availablePharmacists = partTimePharmacists.filter(pharmacist => 
          !assignments.some(a => a.pharmacist.id === pharmacist.id)
        );
        
        console.log(`  Available part-time pharmacists: ${availablePharmacists.map(p => p.name).join(', ')}`);
        
        // Assign additional pharmacists to cover this requirement
        for (let i = 0; i < needed && i < availablePharmacists.length; i++) {
          const pharmacist = availablePharmacists[i];
        
        // Determine shift type based on time
        let shiftType: 'morning' | 'afternoon' | 'full';
        if (requirement.startTime < this.pharmacyRules.breakStartTime) {
          shiftType = 'morning';
        } else if (requirement.endTime > this.pharmacyRules.breakEndTime) {
          shiftType = 'afternoon';
        } else {
          shiftType = 'full';
        }

        assignments.push({
          pharmacist,
          shiftType,
          startTime: requirement.startTime,
          endTime: requirement.endTime,
        });

          console.log(`  ➕ Assigned ${pharmacist.name} to ${shiftType} shift (${requirement.startTime}-${requirement.endTime})`);
        }
        
        if (needed > availablePharmacists.length) {
          console.log(`  ❌ Warning: Not enough available pharmacists to meet requirement!`);
        }
      } else {
        console.log(`  ✅ Requirement satisfied`);
      }
    });
  }

  private timeToMinutes(timeString: string): number {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  private createCoverageTracker(): Record<string, number> {
    const tracker: Record<string, number> = {};
    this.pharmacyRules.staffingRequirements.forEach(req => {
      tracker[`${req.startTime}-${req.endTime}`] = 0;
    });
    return tracker;
  }

  private findBestPatternForPharmacist(
    pharmacist: Pharmacist,
    patterns: FixedShiftPattern[],
    coverageTracker: Record<string, number>,
    alreadyAssignedPatterns: FixedShiftPattern[]
  ): FixedShiftPattern {
    console.log(`  Analyzing patterns for ${pharmacist.name}:`);
    console.log(`  Already assigned patterns: ${alreadyAssignedPatterns.map(p => p.name).join(', ')}`);
    
    // Score each pattern based on multiple factors
    const patternScores = patterns.map(pattern => {
      let score = 0;
      
      console.log(`    Pattern ${pattern.name}:`);
      
      // Factor 1: Help with unmet requirements (most important)
      const unmetRequirements = this.pharmacyRules.staffingRequirements.filter(req => {
        const key = `${req.startTime}-${req.endTime}`;
        return coverageTracker[key] < req.requiredPharmacists;
      });
      
      unmetRequirements.forEach(req => {
        const key = `${req.startTime}-${req.endTime}`;
        const currentCoverage = coverageTracker[key];
        const needed = req.requiredPharmacists - currentCoverage;
        
        // Check if this pattern helps with this requirement
        const patternHelps = this.patternHelpsWithRequirement(pattern, req);
        
        if (patternHelps && needed > 0) {
          // Calculate how much of the requirement this pattern covers
          const coveragePercentage = this.calculatePatternCoveragePercentage(pattern, req);
          
          // Score based on both need and coverage quality
          const baseScore = needed * 100;
          const coverageBonus = (coveragePercentage / 100) * 50; // Bonus for better coverage
          const requirementScore = baseScore + coverageBonus;
          
          score += requirementScore;
          console.log(`      ✅ Helps with ${req.startTime}-${req.endTime} (needed: ${needed}, coverage: ${coveragePercentage}%, +${requirementScore})`);
        } else {
          console.log(`      ❌ Doesn't help with ${req.startTime}-${req.endTime}`);
        }
      });
      
      // Factor 2: Variety bonus - prefer patterns not already used
      const patternUsageCount = alreadyAssignedPatterns.filter(p => p.id === pattern.id).length;
      const varietyBonus = Math.max(0, 3 - patternUsageCount) * 50; // Bonus for unused patterns
      score += varietyBonus;
      console.log(`      Variety bonus: +${varietyBonus} (used ${patternUsageCount} times)`);
      
      // Factor 3: Coverage completeness - prefer patterns that cover more time periods
      const coverageScore = this.calculatePatternCoverageScore(pattern);
      score += coverageScore;
      console.log(`      Coverage score: +${coverageScore}`);
      
      // Factor 4: Closing time penalty - heavily penalize patterns that don't work until closing
      const closingTime = this.pharmacyRules.closingTime;
      const closingMinutes = this.timeToMinutes(closingTime);
      const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
      
      if (afternoonEnd < closingMinutes) {
        const closingPenalty = -200; // Heavy penalty for not working until closing
        score += closingPenalty;
        console.log(`      Closing time penalty: ${closingPenalty} (ends at ${pattern.afternoonShift.endTime}, closing at ${closingTime})`);
      } else {
        console.log(`      Closing time bonus: +0 (works until ${pattern.afternoonShift.endTime})`);
      }
      
      console.log(`      Total score: ${score}`);
      return { pattern, score };
    });
    
    // Sort by score (highest first) and return the best pattern
    patternScores.sort((a, b) => b.score - a.score);
    const bestPattern = patternScores[0].pattern;
    
    console.log(`  Best pattern: ${bestPattern.name} (score: ${patternScores[0].score})`);
    console.log(`  All scores: ${patternScores.map(p => `${p.pattern.name}:${p.score}`).join(', ')}`);
    return bestPattern;
  }

  private calculatePatternCoverageScore(pattern: FixedShiftPattern): number {
    let score = 0;
    
    // Check how many requirements this pattern helps with
    this.pharmacyRules.staffingRequirements.forEach(req => {
      const patternHelps = this.patternHelpsWithRequirement(pattern, req);
      if (patternHelps) {
        score += 10; // Base score for helping with any requirement
      }
    });
    
    return score;
  }

  private patternHelpsWithRequirement(pattern: FixedShiftPattern, requirement: { startTime: string; endTime: string; requiredPharmacists: number }): boolean {
    const reqStart = this.timeToMinutes(requirement.startTime);
    const reqEnd = this.timeToMinutes(requirement.endTime);
    
    // Check if morning shift helps
    const morningStart = this.timeToMinutes(pattern.morningShift.startTime);
    const morningEnd = this.timeToMinutes(pattern.morningShift.endTime);
    const morningHelps = morningStart < reqEnd && morningEnd > reqStart;
    
    // Check if afternoon shift helps
    const afternoonStart = this.timeToMinutes(pattern.afternoonShift.startTime);
    const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
    const afternoonHelps = afternoonStart < reqEnd && afternoonEnd > reqStart;
    
    const helps = morningHelps || afternoonHelps;
    
    // Additional logging for debugging
    if (helps) {
      console.log(`        Pattern ${pattern.name} helps with ${requirement.startTime}-${requirement.endTime}:`);
      if (morningHelps) {
        console.log(`          Morning shift ${pattern.morningShift.startTime}-${pattern.morningShift.endTime} overlaps`);
      }
      if (afternoonHelps) {
        console.log(`          Afternoon shift ${pattern.afternoonShift.startTime}-${pattern.afternoonShift.endTime} overlaps`);
      }
    }
    
    return helps;
  }

  private calculatePatternCoveragePercentage(pattern: FixedShiftPattern, requirement: { startTime: string; endTime: string; requiredPharmacists: number }): number {
    const reqStart = this.timeToMinutes(requirement.startTime);
    const reqEnd = this.timeToMinutes(requirement.endTime);
    const reqDuration = reqEnd - reqStart;
    
    let totalCoverage = 0;
    
    // Check morning shift coverage
    const morningStart = this.timeToMinutes(pattern.morningShift.startTime);
    const morningEnd = this.timeToMinutes(pattern.morningShift.endTime);
    const morningOverlapStart = Math.max(morningStart, reqStart);
    const morningOverlapEnd = Math.min(morningEnd, reqEnd);
    if (morningOverlapStart < morningOverlapEnd) {
      totalCoverage += morningOverlapEnd - morningOverlapStart;
    }
    
    // Check afternoon shift coverage
    const afternoonStart = this.timeToMinutes(pattern.afternoonShift.startTime);
    const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
    const afternoonOverlapStart = Math.max(afternoonStart, reqStart);
    const afternoonOverlapEnd = Math.min(afternoonEnd, reqEnd);
    if (afternoonOverlapStart < afternoonOverlapEnd) {
      totalCoverage += afternoonOverlapEnd - afternoonOverlapStart;
    }
    
    const coveragePercentage = (totalCoverage / reqDuration) * 100;
    return Math.round(coveragePercentage);
  }

  private updateCoverageTracker(
    coverageTracker: Record<string, number>,
    pattern: FixedShiftPattern
  ): void {
    this.pharmacyRules.staffingRequirements.forEach(req => {
      const key = `${req.startTime}-${req.endTime}`;
      const reqStart = this.timeToMinutes(req.startTime);
      const reqEnd = this.timeToMinutes(req.endTime);
      
      // Check if morning shift covers this requirement
      const morningStart = this.timeToMinutes(pattern.morningShift.startTime);
      const morningEnd = this.timeToMinutes(pattern.morningShift.endTime);
      const morningOverlapStart = Math.max(morningStart, reqStart);
      const morningOverlapEnd = Math.min(morningEnd, reqEnd);
      if (morningOverlapStart < morningOverlapEnd) {
        // Calculate coverage percentage for morning shift
        const morningCoveragePercentage = ((morningOverlapEnd - morningOverlapStart) / (reqEnd - reqStart)) * 100;
        coverageTracker[key] += morningCoveragePercentage / 100; // Add fractional coverage
      }
      
      // Check if afternoon shift covers this requirement
      const afternoonStart = this.timeToMinutes(pattern.afternoonShift.startTime);
      const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
      const afternoonOverlapStart = Math.max(afternoonStart, reqStart);
      const afternoonOverlapEnd = Math.min(afternoonEnd, reqEnd);
      if (afternoonOverlapStart < afternoonOverlapEnd) {
        // Calculate coverage percentage for afternoon shift
        const afternoonCoveragePercentage = ((afternoonOverlapEnd - afternoonOverlapStart) / (reqEnd - reqStart)) * 100;
        coverageTracker[key] += afternoonCoveragePercentage / 100; // Add fractional coverage
      }
    });
  }

  private calculateShiftHours(startTime: string, endTime: string): number {
    const start = new Date(`2000-01-01T${startTime}`);
    const end = new Date(`2000-01-01T${endTime}`);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  }

  private fixClosingTimeCoverage(
    patternAssignments: Array<{ pharmacist: Pharmacist; pattern: FixedShiftPattern }>,
    patterns: FixedShiftPattern[],
  ): void {
    console.log('\n=== Fixing Closing Time Coverage ===');
    
    const closingTime = this.pharmacyRules.closingTime;
    const closingMinutes = this.timeToMinutes(closingTime);
    
    // Find patterns that work until closing time
    const closingPatterns = patterns.filter(pattern => {
      const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
      return afternoonEnd >= closingMinutes;
    });
    
    console.log(`Patterns that work until ${closingTime}: ${closingPatterns.map(p => p.name).join(', ')}`);
    
    // Find pharmacists with patterns that don't work until closing
    const pharmacistsToReassign = patternAssignments.filter(({ pattern }) => {
      const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
      return afternoonEnd < closingMinutes;
    });
    
    console.log(`Pharmacists to reassign: ${pharmacistsToReassign.map(p => p.pharmacist.name).join(', ')}`);
    
    // Reassign them to patterns that work until closing
    pharmacistsToReassign.forEach((assignment, index) => {
      if (index < closingPatterns.length) {
        const newPattern = closingPatterns[index];
        console.log(`Reassigning ${assignment.pharmacist.name} from ${assignment.pattern.name} to ${newPattern.name}`);
        assignment.pattern = newPattern;
      }
    });
    
    // Final check
    const finalClosingCoverage = patternAssignments.filter(({ pattern }) => {
      const afternoonEnd = this.timeToMinutes(pattern.afternoonShift.endTime);
      return afternoonEnd >= closingMinutes;
    }).length;
    
    console.log(`Final closing coverage: ${finalClosingCoverage} pharmacists working until ${closingTime}`);
  }

  /**
   * Try to resolve warnings by attempting different pattern assignments
   * Returns the best schedule found, or null if no improvement
   * 
   * Strategy: Try different pattern assignments for pharmacists who don't have
   * fixed day patterns or free days, exploring various combinations
   */
  private tryResolveWarnings(
    weekStart: Date,
    weekNumber: number,
    originalSchedule: Schedule,
    originalWarnings: Record<string, string[]>
  ): Schedule | null {
    const patterns = this.pharmacyRules.fixedShiftPatterns;
    if (!patterns || patterns.length === 0) {
      return null;
    }

    const originalWarningCount = Object.values(originalWarnings).reduce(
      (sum, warnings) => sum + warnings.length,
      0
    );

    let bestSchedule: Schedule | null = null;
    let bestWarningCount = originalWarningCount;

    // Identify pharmacists we can reassign (those without fixed day patterns)
    const reassignablePharmacists = this.pharmacists.filter(pharmacist => {
      // Can reassign if they don't have fixed day patterns set
      return !pharmacist.fixedDayPatterns || pharmacist.fixedDayPatterns.length === 0;
    });

    console.log(`🔄 Attempting to resolve warnings by trying different pattern assignments for ${reassignablePharmacists.length} reassignable pharmacists`);

    // Try different strategies:
    // 1. Different starting pattern indices for rotation
    // 2. Different pattern selection priorities (requirements-first vs balance-first)
    // 3. Try different pattern combinations per day
    const maxAttempts = Math.min(patterns.length * reassignablePharmacists.length * 2, 50); // Increased attempts
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Create a new pattern rotation tracker with different starting indices
      // Vary the starting pattern more aggressively
      const patternRotationTracker = this.pharmacists.reduce((acc, pharmacist) => {
        // For reassignable pharmacists, try different starting patterns
        const isReassignable = reassignablePharmacists.some(p => p.id === pharmacist.id);
        
        if (isReassignable) {
          // Try different starting patterns based on attempt
          // Use a more varied approach: cycle through patterns, try different offsets
          const pharmacistIndex = reassignablePharmacists.findIndex(p => p.id === pharmacist.id);
          const patternOffset = Math.floor(attempt / reassignablePharmacists.length) % patterns.length;
          const startIndex = (pharmacistIndex + patternOffset + attempt) % patterns.length;
          acc[pharmacist.id] = {
            pharmacist,
            patternIndex: startIndex,
            dailyPatterns: [] as string[],
          };
        } else {
          // For pharmacists with fixed patterns, keep original rotation
          const hash = pharmacist.id.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
          const startIndex = hash % patterns.length;
          acc[pharmacist.id] = {
            pharmacist,
            patternIndex: startIndex,
            dailyPatterns: [] as string[],
          };
        }
        return acc;
      }, {} as Record<string, { pharmacist: Pharmacist; patternIndex: number; dailyPatterns: string[] }>);

      // Generate schedule with this rotation
      const testSchedule = this.generateWeekScheduleWithRotation(weekStart, weekNumber, patternRotationTracker);
      
      // Validate the test schedule
      const testWarnings = this.validateSchedule(testSchedule);
      const testWarningCount = Object.values(testWarnings).reduce(
        (sum, warnings) => sum + warnings.length,
        0
      );

      // If this schedule has fewer warnings, keep it
      if (testWarningCount < bestWarningCount) {
        bestSchedule = testSchedule;
        bestWarningCount = testWarningCount;
        console.log(`📊 Attempt ${attempt + 1}: Found schedule with ${testWarningCount} warnings (down from ${originalWarningCount})`);
        
        // If we found a schedule with no warnings, we're done
        if (testWarningCount === 0) {
          console.log(`✅ Found perfect schedule on attempt ${attempt + 1}`);
          break;
        }
      }
    }

    if (bestSchedule && bestWarningCount < originalWarningCount) {
      console.log(`✅ Improved schedule: reduced warnings from ${originalWarningCount} to ${bestWarningCount}`);
      return bestSchedule;
    } else if (bestSchedule) {
      console.log(`⚠️ No improvement found after ${maxAttempts} attempts`);
    }

    return bestSchedule; // Return best found, even if not better than original
  }

  /**
   * Generate week schedule with a specific pattern rotation tracker
   * (Used for trying different pattern assignments)
   */
  private generateWeekScheduleWithRotation(
    weekStart: Date,
    weekNumber: number,
    patternRotationTracker: Record<string, { pharmacist: Pharmacist; patternIndex: number; dailyPatterns: string[] }>
  ): Schedule {
    const shifts: Shift[] = [];
    const workdays = [1, 2, 3, 4, 5, 6]; // Monday to Saturday
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // Track hours for each pharmacist this week
    const weeklyHours = this.pharmacists.reduce((acc, pharmacist) => {
      acc[pharmacist.id] = pharmacist.weeklyHours;
      return acc;
    }, {} as Record<string, number>);
    
    // Track remaining working days for each part-time pharmacist
    const partTimeWorkingDaysRemaining = this.pharmacists
      .filter(p => p.weeklyHours < 40)
      .reduce((acc, pharmacist) => {
        const hasFreeDay = pharmacist.freeDay || pharmacist.fixedDayPatterns?.some(p => p.patternId === 'FREE_DAY');
        const workingDaysPerWeek = hasFreeDay ? 5 : 6;
        acc[pharmacist.id] = workingDaysPerWeek;
        return acc;
      }, {} as Record<string, number>);

    for (let dayIndex = 0; dayIndex < workdays.length; dayIndex++) {
      const dayOfWeek = workdays[dayIndex];
      const dayName = dayNames[dayIndex];
      const currentDate = new Date(weekStart);
      currentDate.setDate(weekStart.getDate() + dayIndex);

      // Get available pharmacists for this day
      const availablePharmacists = this.getAvailablePharmacists(dayName, weekNumber, weeklyHours);
      
      if (availablePharmacists.length < 3) {
        continue;
      }

      // Generate shifts for this day
      const dayShifts = this.generateDayShifts(
        currentDate,
        availablePharmacists,
        weeklyHours,
        patternRotationTracker,
        dayIndex,
        dayName,
        partTimeWorkingDaysRemaining
      );

      shifts.push(...dayShifts);
    }

    return {
      id: `schedule_${weekStart.toISOString().split('T')[0]}`,
      weekStart: weekStart.toISOString().split('T')[0],
      weekEnd: new Date(weekStart.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      shifts,
    };
  }

  private adaptBreakDuration(): void {
    const breakStart = new Date(`2000-01-01T${this.pharmacyRules.breakStartTime}`);
    const breakEnd = new Date(`2000-01-01T${this.pharmacyRules.breakEndTime}`);
    const breakDurationHours = (breakEnd.getTime() - breakStart.getTime()) / (1000 * 60 * 60);
    
    // Auto-adapt break duration if it's outside the valid range
    if (breakDurationHours < 0.5) {
      // Too short - extend break to 30 minutes
      const newBreakEnd = new Date(breakStart.getTime() + 30 * 60 * 1000);
      this.pharmacyRules.breakEndTime = newBreakEnd.toTimeString().slice(0, 5);
      console.log(`Break duration too short, extended to 30 minutes: ${this.pharmacyRules.breakStartTime} - ${this.pharmacyRules.breakEndTime}`);
    } else if (breakDurationHours > 2.5) {
      // Too long - reduce break to 2.5 hours
      const newBreakEnd = new Date(breakStart.getTime() + 2.5 * 60 * 60 * 1000);
      this.pharmacyRules.breakEndTime = newBreakEnd.toTimeString().slice(0, 5);
      console.log(`Break duration too long, reduced to 2.5 hours: ${this.pharmacyRules.breakStartTime} - ${this.pharmacyRules.breakEndTime}`);
    }
  }

  private getDayName(dayOfWeek: number): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[dayOfWeek];
  }

  /**
   * Adjust part-time shifts to resolve warnings by moving morning/afternoon shifts
   */
  private adjustPartTimeShiftsForWarnings(
    dayShifts: Shift[],
    dateStr: string,
    warnings: string[]
  ): Shift[] {
    // Find part-time pharmacists in this day
    const partTimePharmacists = this.pharmacists.filter(p => p.weeklyHours < 40);
    const adjustedShifts = [...dayShifts];

    // For each warning, try to adjust part-time shifts
    warnings.forEach(warning => {
      // Parse warning to find time range (e.g., "Insufficient coverage 17:00-19:30: 2/3")
      const timeMatch = warning.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
      if (!timeMatch) return;

      const reqStart = this.timeToMinutes(timeMatch[1]);
      const reqEnd = this.timeToMinutes(timeMatch[2]);

      // Find part-time shifts that could be moved to cover this requirement
      partTimePharmacists.forEach(ph => {
        const phShifts = adjustedShifts.filter(s => s.pharmacistId === ph.id && s.date === dateStr);
        
        phShifts.forEach(shift => {
          const shiftStart = this.timeToMinutes(shift.startTime);
          const shiftEnd = this.timeToMinutes(shift.endTime);

          // If afternoon shift ends before requirement, try to extend it
          if (shift.type === 'afternoon' && shiftEnd < reqEnd && shiftEnd >= reqStart) {
            const newEnd = Math.min(reqEnd, this.timeToMinutes(this.pharmacyRules.closingTime));
            if (newEnd > shiftEnd) {
              shift.endTime = this.minutesToTime(newEnd);
              console.log(`  🔄 Extended ${ph.name}'s afternoon shift to ${shift.endTime} to cover requirement`);
            }
          }
          // If morning shift, try to move afternoon earlier or extend it
          else if (shift.type === 'morning' && shiftEnd <= reqStart) {
            const afternoonShift = phShifts.find(s => s.type === 'afternoon');
            if (afternoonShift) {
              const newStart = Math.max(reqStart, this.timeToMinutes(this.pharmacyRules.breakEndTime));
              if (newStart < this.timeToMinutes(afternoonShift.startTime)) {
                afternoonShift.startTime = this.minutesToTime(newStart);
                console.log(`  🔄 Moved ${ph.name}'s afternoon shift to start at ${afternoonShift.startTime}`);
              }
            }
          }
        });
      });
    });

    return adjustedShifts;
  }

  /**
   * Adjust part-time hours after entire week is assigned
   * Removes extra hours recursively, avoiding warnings
   */
  private adjustPartTimeHours(shifts: Shift[], weekStart: Date): Shift[] {
    const partTimePharmacists = this.pharmacists.filter(p => p.weeklyHours < 40);
    const adjustedShifts = [...shifts];

    partTimePharmacists.forEach(ph => {
      const phShifts = adjustedShifts.filter(s => s.pharmacistId === ph.id);
      
      // Calculate total hours assigned
      let totalHours = 0;
      phShifts.forEach(shift => {
        totalHours += this.calculateShiftHours(shift.startTime, shift.endTime);
      });

      const targetHours = ph.weeklyHours;
      const extraHours = totalHours - targetHours;

      if (extraHours <= 0.1) {
        // Already at target or under - no adjustment needed
        return;
      }

      console.log(`\n📊 Adjusting ${ph.name}: ${totalHours.toFixed(1)}h assigned, target: ${targetHours}h, extra: ${extraHours.toFixed(1)}h`);

      // Get working days (exclude free day)
      const workingDays = phShifts
        .map(s => s.date)
        .filter((date, index, self) => self.indexOf(date) === index)
        .sort();

      const daysCount = workingDays.length;
      const hoursPerDayToRemove = extraHours / daysCount;

      // Try to remove hours from each day
      let remainingExtra = extraHours;
      const processedDays = new Set<string>();

      while (remainingExtra > 0.1 && processedDays.size < daysCount) {
        const hoursToRemoveThisRound = remainingExtra / (daysCount - processedDays.size);
        
        workingDays.forEach(dateStr => {
          if (processedDays.has(dateStr)) return;
          if (remainingExtra <= 0.1) return;

          const dayShifts = phShifts.filter(s => s.date === dateStr);
          const dayTotalHours = dayShifts.reduce((sum, s) => sum + this.calculateShiftHours(s.startTime, s.endTime), 0);

          // Don't remove if it would make the day too short (minimum 2h per shift part)
          if (dayTotalHours - hoursToRemoveThisRound < 4) {
            processedDays.add(dateStr);
            return;
          }

          // Try different options: remove from end of afternoon, start of afternoon, end of morning, start of morning
          // Choose the option that doesn't cause warnings or causes the fewest warnings
          const morningShift = dayShifts.find(s => s.type === 'morning');
          const afternoonShift = dayShifts.find(s => s.type === 'afternoon');

          interface RemovalOption {
            name: string;
            apply: () => void;
            revert: () => void;
          }

          const options: RemovalOption[] = [];
          const originalShifts = dayShifts.map(s => ({ ...s })); // Save original state

          // Option 1: Remove from end of afternoon shift
          if (afternoonShift) {
            const currentHours = this.calculateShiftHours(afternoonShift.startTime, afternoonShift.endTime);
            const newHours = Math.max(2, currentHours - hoursToRemoveThisRound);
            const reduction = currentHours - newHours;
            
            if (reduction > 0) {
              const originalEnd = afternoonShift.endTime;
              options.push({
                name: 'afternoon-end',
                apply: () => {
                  const newEnd = this.timeToMinutes(afternoonShift.startTime) + (newHours * 60);
                  afternoonShift.endTime = this.minutesToTime(newEnd);
                },
                revert: () => {
                  afternoonShift.endTime = originalEnd;
                }
              });
            }
          }

          // Option 2: Remove from start of afternoon shift
          if (afternoonShift) {
            const currentHours = this.calculateShiftHours(afternoonShift.startTime, afternoonShift.endTime);
            const newHours = Math.max(2, currentHours - hoursToRemoveThisRound);
            const reduction = currentHours - newHours;
            
            if (reduction > 0) {
              const originalStart = afternoonShift.startTime;
              const breakEndMinutes = this.timeToMinutes(this.pharmacyRules.breakEndTime);
              options.push({
                name: 'afternoon-start',
                apply: () => {
                  const newStartMinutes = this.timeToMinutes(afternoonShift.endTime) - (newHours * 60);
                  const newStart = Math.max(breakEndMinutes, newStartMinutes);
                  afternoonShift.startTime = this.minutesToTime(newStart);
                },
                revert: () => {
                  afternoonShift.startTime = originalStart;
                }
              });
            }
          }

          // Option 3: Remove from end of morning shift
          if (morningShift && remainingExtra > 0.1) {
            const currentHours = this.calculateShiftHours(morningShift.startTime, morningShift.endTime);
            const newHours = Math.max(2, currentHours - Math.min(hoursToRemoveThisRound, remainingExtra));
            const reduction = currentHours - newHours;
            
            if (reduction > 0) {
              const originalEnd = morningShift.endTime;
              options.push({
                name: 'morning-end',
                apply: () => {
                  const newEnd = this.timeToMinutes(morningShift.startTime) + (newHours * 60);
                  morningShift.endTime = this.minutesToTime(newEnd);
                },
                revert: () => {
                  morningShift.endTime = originalEnd;
                }
              });
            }
          }

          // Option 4: Remove from start of morning shift
          if (morningShift && remainingExtra > 0.1) {
            const currentHours = this.calculateShiftHours(morningShift.startTime, morningShift.endTime);
            const newHours = Math.max(2, currentHours - Math.min(hoursToRemoveThisRound, remainingExtra));
            const reduction = currentHours - newHours;
            
            if (reduction > 0) {
              const originalStart = morningShift.startTime;
              const openingMinutes = this.timeToMinutes(this.pharmacyRules.openingTime);
              options.push({
                name: 'morning-start',
                apply: () => {
                  const newStartMinutes = this.timeToMinutes(morningShift.endTime) - (newHours * 60);
                  const newStart = Math.max(openingMinutes, newStartMinutes);
                  morningShift.startTime = this.minutesToTime(newStart);
                },
                revert: () => {
                  morningShift.startTime = originalStart;
                }
              });
            }
          }

          // Try each option and find the best one (no warnings or fewest warnings)
          let bestOption: RemovalOption | null = null;
          let bestWarningCount = Infinity;
          let bestReduction = 0;

          for (const option of options) {
            // Apply the option
            option.apply();

            // Check for warnings
            const tempSchedule: Schedule = {
              id: `temp_${weekStart.toISOString().split('T')[0]}`,
              weekStart: weekStart.toISOString().split('T')[0],
              weekEnd: new Date(weekStart.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              shifts: adjustedShifts,
            };
            const warnings = this.validateSchedule(tempSchedule);
            const dayWarnings = warnings[dateStr] || [];
            const warningCount = dayWarnings.length;

            // Calculate reduction for this option (compare with original day hours)
            const dayShiftsAfter = adjustedShifts.filter(s => s.pharmacistId === ph.id && s.date === dateStr);
            const hoursAfter = dayShiftsAfter.reduce((sum, s) => sum + this.calculateShiftHours(s.startTime, s.endTime), 0);
            const reduction = dayTotalHours - hoursAfter;
            
            // Ensure reduction doesn't exceed what we want to remove
            const actualReduction = Math.min(reduction, hoursToRemoveThisRound);

            // If no warnings and good reduction, this is the best option
            if (warningCount === 0 && actualReduction > 0) {
              if (actualReduction > bestReduction || bestOption === null) {
                bestOption = option;
                bestWarningCount = 0;
                bestReduction = actualReduction;
              }
            }
            // If has warnings but fewer than previous best, keep it as backup
            else if (warningCount < bestWarningCount || (warningCount === bestWarningCount && actualReduction > bestReduction)) {
              bestOption = option;
              bestWarningCount = warningCount;
              bestReduction = actualReduction;
            }

            // Revert to try next option
            option.revert();
          }

          // Apply the best option
          if (bestOption) {
            bestOption.apply();
            remainingExtra -= bestReduction;
            console.log(`  ✂️ Reduced ${ph.name}'s ${bestOption.name} shift on ${dateStr} by ${bestReduction.toFixed(1)}h${bestWarningCount > 0 ? ` (${bestWarningCount} warnings)` : ''}`);

            // If best option still has warnings, mark day as processed to avoid further attempts
            if (bestWarningCount > 0) {
              console.log(`  ⚠️ Best option still has ${bestWarningCount} warnings, marking day as processed`);
              processedDays.add(dateStr);
            } else {
              processedDays.add(dateStr);
            }
          } else {
            // No valid option found - mark day as processed
            console.log(`  ⚠️ No valid option to remove hours from ${dateStr}, marking as processed`);
            processedDays.add(dateStr);
          }
        });
      }

      if (remainingExtra > 0.1) {
        console.log(`  ⚠️ Could not remove all extra hours for ${ph.name}, ${remainingExtra.toFixed(1)}h remaining`);
      } else {
        console.log(`  ✅ Successfully adjusted ${ph.name}'s hours to target`);
      }
    });

    return adjustedShifts;
  }
}
