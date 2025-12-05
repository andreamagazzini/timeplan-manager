'use client';

import { useLanguage } from '@/lib/language-context';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { locale, setLocale } = useLanguage();

  return (
    <div className="flex items-center space-x-2">
      <Globe className="h-4 w-4 text-gray-500" />
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as 'en' | 'it')}
        className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="en">English</option>
        <option value="it">Italiano</option>
      </select>
    </div>
  );
}
