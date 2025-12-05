import { Schedule, Pharmacist } from '@/types';

/**
 * Escape special characters for iCalendar format
 */
function escapeICSValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')  // Escape backslash
    .replace(/;/g, '\\;')    // Escape semicolon
    .replace(/,/g, '\\,')    // Escape comma
    .replace(/\n/g, '\\n')   // Escape newline
    .replace(/\r/g, '');     // Remove carriage return
}

/**
 * Fold long lines according to iCalendar spec (max 75 chars per line)
 */
function foldICSLine(line: string): string {
  const maxLength = 75;
  if (line.length <= maxLength) {
    return line;
  }
  
  const parts: string[] = [];
  let remaining = line;
  
  while (remaining.length > maxLength) {
    parts.push(remaining.substring(0, maxLength));
    remaining = ' ' + remaining.substring(maxLength); // Space for continuation
  }
  
  if (remaining.length > 0) {
    parts.push(remaining);
  }
  
  return parts.join('\r\n');
}

/**
 * Get timezone identifier (e.g., "Europe/Rome")
 */
function getTimezoneId(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Format date in iCalendar format (UTC)
 * Google Calendar works better with UTC dates
 */
function formatICSDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${y}${m}${d}T${h}${min}${s}Z`; // Z indicates UTC
}

/**
 * Format date in iCalendar format (UTC) for DTSTAMP
 */
function formatICSDateUTC(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  const s = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}${m}${d}T${h}${min}${s}Z`; // Z indicates UTC
}

/**
 * Export schedules to iCalendar format (.ics) for Google Calendar import
 */
export function exportScheduleToICS(schedules: Schedule[], pharmacists: Pharmacist[]): string {
  const events: string[] = [];
  let eventCounter = 0;
  const now = new Date();
  
  schedules.forEach(schedule => {
    schedule.shifts.forEach(shift => {
      const pharmacist = pharmacists.find(p => p.id === shift.pharmacistId);
      if (!pharmacist) {
        console.warn(`Pharmacist not found for shift ${shift.id}`);
        return;
      }
      
      // Parse date and time
      const [year, month, day] = shift.date.split('-').map(Number);
      const [startHour, startMinute] = shift.startTime.split(':').map(Number);
      const [endHour, endMinute] = shift.endTime.split(':').map(Number);
      
      // Create date objects in local time, then convert to UTC
      const startDateLocal = new Date(year, month - 1, day, startHour, startMinute || 0, 0);
      const endDateLocal = new Date(year, month - 1, day, endHour, endMinute || 0, 0);
      
      // Validate dates
      if (isNaN(startDateLocal.getTime()) || isNaN(endDateLocal.getTime())) {
        console.warn(`Invalid date/time for shift ${shift.id}:`, shift.date, shift.startTime, shift.endTime);
        return;
      }
      
      // Ensure end date is after start date
      if (endDateLocal <= startDateLocal) {
        console.warn(`End time must be after start time for shift ${shift.id}`);
        return;
      }
      
      // Convert to UTC
      const startDateUTC = new Date(startDateLocal.toISOString());
      const endDateUTC = new Date(endDateLocal.toISOString());
      
      // Generate unique ID for event (shorter to avoid line folding issues)
      eventCounter++;
      const timestamp = Date.now();
      const uid = `shift-${shift.id}-${eventCounter}-${timestamp}@timeplan-manager.app`;
      
      // Escape pharmacist name and description
      const summary = escapeICSValue(pharmacist.name);
      const description = escapeICSValue(`Shift Type: ${shift.type}`);
      
      // Format dates (UTC for all)
      const dtStart = formatICSDate(startDateUTC);
      const dtEnd = formatICSDate(endDateUTC);
      const dtStamp = formatICSDateUTC(now);
      
      // Create event with all required fields
      const eventLines = [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${dtStamp}`,
        `CREATED:${dtStamp}`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'END:VEVENT'
      ];
      
      // Fold long lines and join
      const event = eventLines.map(foldICSLine).join('\r\n');
      
      events.push(event);
    });
  });
  
  console.log(`Exporting ${events.length} events to iCalendar format`);
  
  if (events.length === 0) {
    console.warn('No events to export. Check if schedules contain valid shifts.');
    // Return empty calendar if no events
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//TimePlan Manager//Schedule Export//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'END:VCALENDAR'
    ].map(foldICSLine).join('\r\n');
  }
  
  // Get timezone for VTIMEZONE
  const timezoneId = getTimezoneId();
  const timezoneOffset = -new Date().getTimezoneOffset();
  const offsetHours = Math.floor(Math.abs(timezoneOffset) / 60);
  const offsetMinutes = Math.abs(timezoneOffset) % 60;
  const offsetSign = timezoneOffset >= 0 ? '+' : '-';
  const offsetStr = `${offsetSign}${String(offsetHours).padStart(2, '0')}${String(offsetMinutes).padStart(2, '0')}`;
  
  // Create VTIMEZONE component (simplified, but Google Calendar accepts this)
  const vtimezone = [
    'BEGIN:VTIMEZONE',
    `TZID:${timezoneId}`,
    'BEGIN:STANDARD',
    `DTSTART:19700101T000000`,
    `TZOFFSETFROM:${offsetStr}`,
    `TZOFFSETTO:${offsetStr}`,
    `TZNAME:${timezoneId}`,
    'END:STANDARD',
    'END:VTIMEZONE'
  ].map(foldICSLine).join('\r\n');
  
  // Combine into calendar
  const calendarLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TimePlan//Schedule Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    vtimezone,
    ...events,
    'END:VCALENDAR'
  ];
  
  // Fold all lines and join
  const calendar = calendarLines.map(foldICSLine).join('\r\n');
  
  return calendar;
}

export function exportScheduleToCSV(schedules: Schedule[], pharmacists: Pharmacist[]): string {
  const headers = [
    'Date',
    'Pharmacist Name',
    'Pharmacist Email', 
    'Start Time',
    'End Time',
    'Shift Type',
    'Is Break Time'
  ];
  
  const rows = schedules.flatMap(schedule => 
    schedule.shifts.map(shift => {
      const pharmacist = pharmacists.find(p => p.id === shift.pharmacistId);
      return [
        shift.date,
        pharmacist?.name || 'Unknown',
        pharmacist?.email || '',
        shift.startTime,
        shift.endTime,
        shift.type,
        shift.isBreakTime ? 'Yes' : 'No'
      ];
    })
  );
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

export function exportPharmacistsToCSV(pharmacists: Pharmacist[]): string {
  const headers = [
    'ID',
    'Name',
    'Email',
    'Weekly Hours',
    'Free Day',
    'Is Active'
  ];
  
  const rows = pharmacists.map(pharmacist => [
    pharmacist.id,
    pharmacist.name,
    pharmacist.email,
    pharmacist.weeklyHours.toString(),
    pharmacist.freeDay.toString(),
    pharmacist.isActive ? 'Yes' : 'No'
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Download iCalendar file (.ics)
 */
export function downloadICS(content: string, filename: string): void {
  // Ensure content ends with newline (some parsers require this)
  const contentWithNewline = content.endsWith('\r\n') || content.endsWith('\n') 
    ? content 
    : content + '\r\n';
  
  // Use BOM for UTF-8 to ensure proper encoding
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + contentWithNewline], { type: 'text/calendar;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
