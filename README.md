# TimePlan Manager - Pharmacy Shift Scheduler

A modern Next.js application for automatic pharmacy shift scheduling with admin and pharmacist views.

## Features

### Admin Dashboard
- **Calendar View**: Hourly grid view showing all pharmacist shifts
- **Pharmacist Management**: Add, edit, and manage pharmacy staff with day preferences
- **Settings Configuration**: Set pharmacy hours, staffing requirements, and fixed shift patterns
- **Automatic Scheduling**: Generate optimized schedules based on configured rules
- **Export/Import**: Export schedules to iCalendar (.ics) format and backup/restore all data
- **Multi-language**: English and Italian support

### Pharmacist View
- **Personal Schedule**: View individual shifts and schedule
- **Week Navigation**: Browse through different weeks
- **Shift Details**: See shift times, types, and break periods

## Key Features

- **Smart Scheduling**: Automatic schedule generation with pattern balancing
- **Fixed Shift Patterns**: Predefined shift patterns for consistent scheduling
- **Day Preferences**: Set fixed shift patterns or free days for specific days
- **Part-time Support**: Accurate hour allocation for part-time pharmacists
- **Warning System**: Real-time validation of staffing requirements
- **Data Persistence**: IndexedDB for reliable client-side storage
- **Export to Calendar**: Export schedules in iCalendar format for Google Calendar and other calendar apps

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: Radix UI primitives
- **Icons**: Lucide React
- **Date Handling**: date-fns
- **Storage**: IndexedDB (via Dexie.js) for client-side persistence

## Getting Started

1. **Install dependencies**:
   ```bash
   npm install
   # or
   pnpm install
   ```

2. **Start development server**:
   ```bash
   npm run dev
   # or
   pnpm dev
   ```

3. **Open browser**: Navigate to `http://localhost:3000`

4. **Initial Setup**:
   - Go to Settings to configure pharmacy rules (opening hours, staffing requirements, fixed shift patterns)
   - Add pharmacists in the Pharmacists tab
   - Generate schedules in the Calendar tab

## Project Structure

```
src/
├── app/
│   ├── admin/              # Admin dashboard
│   │   ├── layout.tsx      # Admin layout with navbar
│   │   ├── page.tsx         # Calendar view and schedule generation
│   │   ├── pharmacists/    # Pharmacist management
│   │   └── settings/       # Pharmacy rules configuration
│   ├── pharmacist/          # Pharmacist view
│   └── page.tsx             # Home page with view selection
├── lib/
│   ├── data.ts              # Data management (IndexedDB)
│   ├── db.ts                # IndexedDB schema (Dexie)
│   ├── scheduler.ts         # Scheduling algorithm
│   ├── export.ts            # iCalendar export
│   ├── data-export.ts      # Backup/restore functionality
│   ├── i18n.ts              # Internationalization
│   └── language-context.tsx # Language context provider
├── types/
│   └── index.ts             # TypeScript type definitions
└── components/              # Reusable components
    ├── HourlyCalendar.tsx   # Calendar grid view
    ├── ShiftEditModal.tsx   # Shift editing modal
    ├── ExportWeeksModal.tsx # Week selection for export
    └── LanguageSwitcher.tsx # Language selector
```

## Scheduling Algorithm

The scheduling system implements a sophisticated day-by-day algorithm:

1. **Day-by-Day Assignment**: Processes each day independently
2. **Availability Filtering**: Filters pharmacists based on free days and fixed day patterns
3. **Fixed Pattern Assignment**: Assigns fixed shift patterns for specific days first
4. **Random Assignment**: Randomly assigns remaining shifts with pattern balancing
5. **Pattern Balancing**: Ensures balanced distribution of shift patterns per pharmacist
6. **Warning Resolution**: Attempts to resolve staffing requirement warnings through retries
7. **Part-time Optimization**: Precisely allocates hours for part-time pharmacists
8. **Warning Validation**: Real-time validation of staffing requirements with detailed warnings

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.
