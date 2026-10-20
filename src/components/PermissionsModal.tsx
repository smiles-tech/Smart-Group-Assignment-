import React, { useState } from 'react';
import { ShieldCheck, Plus, Trash2, X, AlertCircle, Mail, UserCheck } from 'lucide-react';
import { CourseSession } from '../types';

interface PermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CourseSession;
  onUpdateSession: (updated: CourseSession) => void;
}

export const PermissionsModal: React.FC<PermissionsModalProps> = ({
  isOpen,
  onClose,
  session,
  onUpdateSession,
}) => {
  const [newEmail, setNewEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const allowedViewers = session.allowedViewers || [];

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Please enter a valid Google account email address.');
      return;
    }

    if (cleanEmail === session.tutorEmail.toLowerCase()) {
      setError('This email is already the course owner/tutor.');
      return;
    }

    if (allowedViewers.includes(cleanEmail)) {
      setError('This Google account is already authorized.');
      return;
    }

    const updatedList = [...allowedViewers, cleanEmail];
    await savePermissions(updatedList);
    setNewEmail('');
  };

  const handleRemoveEmail = async (emailToRemove: string) => {
    const updatedList = allowedViewers.filter((e) => e !== emailToRemove);
    await savePermissions(updatedList);
  };

  const savePermissions = async (updatedList: string[]) => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${session.id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedViewers: updatedList }),
      });

      if (!res.ok) {
        throw new Error('Failed to update Google account permissions.');
      }

      const updatedSession: CourseSession = await res.json();
      onUpdateSession(updatedSession);
    } catch (err: any) {
      setError(err.message || 'Error updating permissions.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Google Account Permissions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Authorize colleagues or administrators to view this course
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 flex items-center gap-2 text-rose-700 dark:text-rose-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Owner Box */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">
                Course Owner & Tutor
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {session.tutorEmail || session.tutorName}
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
              Full Access
            </span>
          </div>

          {/* Add Collaborator Form */}
          <form onSubmit={handleAddEmail} className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Grant View Permission to Google Account
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="e.g. colleague@university.edu"
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
              <button
                type="submit"
                disabled={isSaving || !newEmail.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              When they sign in with this Google account, they can view live student assignments and administrative records.
            </p>
          </form>

          {/* List of Allowed Viewers */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              Permitted Viewers ({allowedViewers.length})
            </span>

            {allowedViewers.length === 0 ? (
              <p className="text-xs text-slate-400 p-3 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
                No external Google accounts added yet. Only the course tutor can view this dashboard.
              </p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {allowedViewers.map((email) => (
                  <div
                    key={email}
                    className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <UserCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                        {email}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      disabled={isSaving}
                      className="text-slate-400 hover:text-rose-500 p-1 rounded-lg transition"
                      title="Revoke view permission"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
