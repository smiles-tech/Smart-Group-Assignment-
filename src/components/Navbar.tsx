import React from 'react';
import { User } from 'firebase/auth';
import {
  Users,
  Plus,
  LogOut,
  FileSpreadsheet,
  Smartphone,
  BookOpen,
} from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import { CourseSession } from '../types';

interface NavbarProps {
  user: User | null;
  accessToken: string | null;
  isLoggingIn: boolean;
  onLogin: () => void;
  onLogout: () => void;
  sessions: CourseSession[];
  activeSession: CourseSession | null;
  onSelectSession: (session: CourseSession) => void;
  onNewSession: () => void;
  onOpenStudentPreview: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  accessToken,
  isLoggingIn,
  onLogin,
  onLogout,
  sessions,
  activeSession,
  onSelectSession,
  onNewSession,
  onOpenStudentPreview,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/30 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black text-base sm:text-lg text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <span>QR Group Assign</span>
              <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800">
                <FileSpreadsheet className="w-3 h-3" />
                Sheets Sync
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 hidden sm:block">
              Automatic Student Grouping & Google Sheets Synchronization
            </p>
          </div>
        </div>

        {/* Center / Course Switcher */}
        {sessions.length > 0 && activeSession && (
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
              <select
                value={activeSession.id}
                onChange={(e) => {
                  const s = sessions.find((item) => item.id === e.target.value);
                  if (s) onSelectSession(s);
                }}
                className="bg-transparent font-bold text-slate-800 dark:text-slate-200 focus:outline-none cursor-pointer"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    {s.courseCode} — {s.courseTitle}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Right Actions */}
        <div className="flex items-center gap-2.5">
          {activeSession && (
            <>
              <button
                onClick={onOpenStudentPreview}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition cursor-pointer"
                title="Preview what a student sees on their mobile device"
              >
                <Smartphone className="w-4 h-4 text-indigo-500" />
                <span className="hidden sm:inline">Student Mobile View</span>
              </button>

              <button
                onClick={onNewSession}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 font-semibold text-xs transition active:scale-95 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">New Course</span>
              </button>
            </>
          )}

          {/* User Profile or Google Sign In */}
          {user && accessToken ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-slate-800">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Tutor'}
                  className="w-8 h-8 rounded-full border border-indigo-500/50 shadow-xs object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className="hidden xl:block text-left text-xs leading-tight">
                <div className="font-bold text-slate-900 dark:text-white truncate max-w-[120px]">
                  {user.displayName || 'Tutor'}
                </div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  Sheets Active
                </div>
              </div>
              <button
                onClick={onLogout}
                className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                title="Sign out of Google"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <GoogleSignInButton
              onClick={onLogin}
              loading={isLoggingIn}
              text="Connect Sheets"
            />
          )}
        </div>
      </div>
    </header>
  );
};
