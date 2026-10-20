import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  PlusCircle,
  FolderOpen,
  Link,
  Users,
  BookOpen,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';
import { GoogleDriveSheet, CourseSession } from '../types';
import {
  createCourseSpreadsheet,
  listRecentSpreadsheets,
  extractSpreadsheetId,
} from '../services/googleSheets';

interface SetupSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  tutorUser: { displayName?: string | null; email?: string | null } | null;
  onSessionCreated: (session: CourseSession) => void;
}

export const SetupSessionModal: React.FC<SetupSessionModalProps> = ({
  isOpen,
  onClose,
  accessToken,
  tutorUser,
  onSessionCreated,
}) => {
  const [courseCode, setCourseCode] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [tutorName, setTutorName] = useState(tutorUser?.displayName || 'Course Tutor');
  const [membersLimit, setMembersLimit] = useState<number>(4);

  // Sheet Mode: 'create' | 'select' | 'custom'
  const [sheetMode, setSheetMode] = useState<'create' | 'select' | 'custom'>('create');
  const [recentSheets, setRecentSheets] = useState<GoogleDriveSheet[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState('');
  const [customSheetInput, setCustomSheetInput] = useState('');

  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tutorUser?.displayName) {
      setTutorName(tutorUser.displayName);
    }
  }, [tutorUser]);

  useEffect(() => {
    if (isOpen && accessToken && sheetMode === 'select' && recentSheets.length === 0) {
      loadSheets();
    }
  }, [isOpen, accessToken, sheetMode]);

  const loadSheets = async () => {
    if (!accessToken) return;
    setIsLoadingSheets(true);
    setErrorMessage(null);
    try {
      const sheets = await listRecentSpreadsheets(accessToken);
      setRecentSheets(sheets);
      if (sheets.length > 0 && !selectedSheetId) {
        setSelectedSheetId(sheets[0].id);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMessage('Could not load spreadsheets from Google Drive.');
    } finally {
      setIsLoadingSheets(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseCode.trim() || !courseTitle.trim()) {
      setErrorMessage('Please enter both Course Code and Course Title.');
      return;
    }

    if (membersLimit < 1) {
      setErrorMessage('Group members limit must be at least 1.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      let finalSpreadsheetId: string | null = null;
      let finalSpreadsheetUrl: string | null = null;
      let finalSpreadsheetTitle: string | null = null;

      if (accessToken) {
        if (sheetMode === 'create') {
          // Create new sheet
          const created = await createCourseSpreadsheet(
            accessToken,
            courseCode.trim().toUpperCase(),
            courseTitle.trim(),
            membersLimit
          );
          finalSpreadsheetId = created.id;
          finalSpreadsheetUrl = created.url;
          finalSpreadsheetTitle = created.title;
        } else if (sheetMode === 'select' && selectedSheetId) {
          finalSpreadsheetId = selectedSheetId;
          const matched = recentSheets.find((s) => s.id === selectedSheetId);
          finalSpreadsheetTitle = matched?.name || 'Selected Google Sheet';
          finalSpreadsheetUrl =
            matched?.webViewLink || `https://docs.google.com/spreadsheets/d/${selectedSheetId}/edit`;
        } else if (sheetMode === 'custom' && customSheetInput.trim()) {
          finalSpreadsheetId = extractSpreadsheetId(customSheetInput.trim());
          finalSpreadsheetTitle = 'Custom Google Sheet';
          finalSpreadsheetUrl = `https://docs.google.com/spreadsheets/d/${finalSpreadsheetId}/edit`;
        }
      }

      // Create session in backend
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseCode: courseCode.trim().toUpperCase(),
          courseTitle: courseTitle.trim(),
          tutorName: tutorName.trim(),
          tutorEmail: tutorUser?.email || '',
          membersLimit,
          spreadsheetId: finalSpreadsheetId,
          spreadsheetUrl: finalSpreadsheetUrl,
          spreadsheetTitle: finalSpreadsheetTitle,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create course session');
      }

      const createdSession: CourseSession = await res.json();
      onSessionCreated(createdSession);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'An error occurred during session creation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 my-8">
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              Set Up Course & Groups
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Configure course details, group member capacity, and Google Sheet sync
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-start gap-3 text-rose-700 dark:text-rose-300 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Course Code & Title */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Course Code *
              </label>
              <input
                type="text"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
                placeholder="e.g. CS101"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Course Title *
              </label>
              <input
                type="text"
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                placeholder="e.g. Introduction to Computer Science"
                required
                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Tutor & Group limit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Course Tutor / Instructor
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={tutorName}
                  onChange={(e) => setTutorName(e.target.value)}
                  placeholder="e.g. Dr. Jane Smith"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                Group Members Limit *
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={membersLimit}
                  onChange={(e) => setMembersLimit(parseInt(e.target.value, 10) || 1)}
                  required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <Users className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Each group will have at most {membersLimit} students before moving to the next group.
              </p>
            </div>
          </div>

          {/* Google Sheet Sync Setup */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 bg-slate-50/70 dark:bg-slate-800/40 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  Google Sheet Integration
                </span>
              </div>
              {accessToken ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Google Connected
                </span>
              ) : (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  Connect account to sync
                </span>
              )}
            </div>

            {accessToken ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSheetMode('create')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      sheetMode === 'create'
                        ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <PlusCircle className="w-4 h-4 mb-1" />
                    <span>Create New</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSheetMode('select');
                      if (recentSheets.length === 0) loadSheets();
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      sheetMode === 'select'
                        ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4 mb-1" />
                    <span>Select Existing</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSheetMode('custom')}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      sheetMode === 'custom'
                        ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 ring-2 ring-indigo-500/20'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <Link className="w-4 h-4 mb-1" />
                    <span>Paste Link/ID</span>
                  </button>
                </div>

                {sheetMode === 'create' && (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    A new Google Spreadsheet titled{' '}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      &quot;{courseCode || 'COURSE'} - Group Assignments ({courseTitle || 'Title'})&quot;
                    </span>{' '}
                    will be automatically created in your Google Drive with formatted columns and frozen headers.
                  </p>
                )}

                {sheetMode === 'select' && (
                  <div className="space-y-2">
                    {isLoadingSheets ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500 p-2">
                        <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                        Fetching your Google Spreadsheets...
                      </div>
                    ) : recentSheets.length > 0 ? (
                      <select
                        value={selectedSheetId}
                        onChange={(e) => setSelectedSheetId(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        {recentSheets.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-xs text-slate-500">
                        No spreadsheets found in your Drive. Switch to &apos;Create New&apos; or &apos;Paste Link&apos;.
                      </p>
                    )}
                  </div>
                )}

                {sheetMode === 'custom' && (
                  <input
                    type="text"
                    value={customSheetInput}
                    onChange={(e) => setCustomSheetInput(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/... or Spreadsheet ID"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Sign in with your Google account on the top bar to enable automatic Google Sheets synchronization.
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Setting up course...</span>
                </>
              ) : (
                <span>Launch & Display QR Code</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
