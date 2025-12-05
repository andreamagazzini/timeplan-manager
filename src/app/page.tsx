'use client';

import { useState } from 'react';
import { Users, Calendar, Settings } from 'lucide-react';
import Link from 'next/link';
import { useLanguage } from '@/lib/language-context';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function HomePage() {
  const [viewType, setViewType] = useState<'admin' | 'pharmacist' | null>(null);
  const { t } = useLanguage();

  if (viewType === 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md w-full">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">{t.home.redirectingAdmin}</h1>
          <Link 
            href="/admin"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 w-full justify-center"
          >
            {t.home.goToAdmin}
          </Link>
        </div>
      </div>
    );
  }

  if (viewType === 'pharmacist') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md w-full">
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 mb-4">{t.home.redirectingPharmacist}</h1>
          <Link 
            href="/pharmacist"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 w-full justify-center"
          >
            {t.home.goToPharmacist}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Language Switcher */}
        <div className="flex justify-end">
          <LanguageSwitcher />
        </div>

        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{t.home.title}</h1>
          <p className="text-gray-600">{t.home.subtitle}</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => setViewType('admin')}
            className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Settings className="h-5 w-5 mr-2" />
            {t.home.adminDashboard}
          </button>

          <button
            onClick={() => setViewType('pharmacist')}
            className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Calendar className="h-5 w-5 mr-2" />
            {t.home.pharmacistView}
          </button>
        </div>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            {t.home.adminDescription}<br />
            {t.home.pharmacistDescription}
          </p>
        </div>
      </div>
    </div>
  );
}
