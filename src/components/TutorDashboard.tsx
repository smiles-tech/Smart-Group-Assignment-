import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  QrCode,
  FileSpreadsheet,
  RefreshCw,
  ExternalLink,
  Crown,
  Phone,
  Search,
  Plus,
  Trash2,
  Download,
  AlertCircle,
  CheckCircle2,
  Share2,
  ChevronRight,
  ShieldAlert,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { CourseSession, Student } from '../types';
import { syncGroupsToSpreadsheet, fetchStudentsFromSpreadsheet } from '../services/googleSheets';
import { ConfirmationModal } from './ConfirmationModal';
import { ProjectorModal } from './ProjectorModal';
import { PermissionsModal } from './PermissionsModal';

interface TutorDashboardProps {
  session: CourseSession;
  accessToken: string | null;
  onUpdateSession: (updated: CourseSession) => void;
  onOpenNewSessionModal: () => void;
}

export const TutorDashboard: React.FC<TutorDashboardProps> = ({
  session,
  accessToken,
  onUpdateSession,
  onOpenNewSessionModal,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'cards' | 'table'>('cards');
  const [isProjectorOpen, setIsProjectorOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(session.lastSyncedAt);

  // Confirmation modal state
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    isDestructive: boolean;
    action: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    confirmLabel: 'Confirm',
    isDestructive: false,
    action: async () => {},
  });

  const [isModalLoading, setIsModalLoading] = useState(false);
  const prevStudentCount = useRef(session.students.length);

  // Real-time synchronization via SSE
  useEffect(() => {
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(`/api/sessions/${session.id}/stream`);

      eventSource.addEventListener('update', async () => {
        try {
          const res = await fetch(`/api/sessions/${session.id}`);
          if (res.ok) {
            const freshSession: CourseSession = await res.json();
            onUpdateSession(freshSession);
          }
        } catch (e) {
          console.warn('Error refreshing session:', e);
        }
      });
    } catch (e) {
      console.warn('SSE connection failed:', e);
    }

    return () => {
      eventSource?.close();
    };
  }, [session.id, onUpdateSession]);

  // Auto-sync to Google Sheet when student count changes
  useEffect(() => {
    if (session.students.length !== prevStudentCount.current) {
      prevStudentCount.current = session.students.length;
      if (accessToken && session.spreadsheetId) {
        performSyncSilent();
      }
    }
  }, [session.students.length, accessToken, session.spreadsheetId]);

  const performSyncSilent = async () => {
    if (!accessToken || !session.spreadsheetId) return;
    try {
      setIsSyncing(true);
      await syncGroupsToSpreadsheet(
        accessToken,
        session.spreadsheetId,
        session,
        session.students
      );
      const now = new Date().toLocaleTimeString();
      setLastSyncTime(now);
      setSyncStatus('Auto-synced with Google Sheets');

      // Update backend lastSyncedAt
      fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastSyncedAt: now }),
      }).catch(() => {});
    } catch (err: any) {
      console.error('Silent sync failed:', err);
      setSyncStatus(`Sync issue: ${err.message || 'Check permissions'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSyncClick = () => {
    if (!accessToken) {
      alert('Please connect your Google Account first using the sign-in button above.');
      return;
    }
    if (!session.spreadsheetId) {
      alert('No Google Spreadsheet is connected to this course session.');
      return;
    }

    setConfirmModalConfig({
      isOpen: true,
      title: 'Synchronize Roster to Google Sheets?',
      description: `This will update the "Group Assignments" spreadsheet in your Google Drive with the latest ${session.students.length} student assignments and group leader allocations.`,
      confirmLabel: 'Sync Roster',
      isDestructive: false,
      action: async () => {
        setIsModalLoading(true);
        try {
          await syncGroupsToSpreadsheet(
            accessToken,
            session.spreadsheetId!,
            session,
            session.students
          );
          const now = new Date().toLocaleTimeString();
          setLastSyncTime(now);
          setSyncStatus('Successfully synchronized with Google Sheets');
        } catch (err: any) {
          console.error('Manual sync failed:', err);
          alert(`Sync failed: ${err.message}`);
        } finally {
          setIsModalLoading(false);
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const handleRemoveStudentClick = (student: Student) => {
    setConfirmModalConfig({
      isOpen: true,
      title: `Remove Student ${student.name}?`,
      description: `Are you sure you want to remove ${student.name} (ID: ${student.studentId}) from Group ${student.groupNumber}? If this student was the group leader, leadership will automatically transfer to the next student in the group.`,
      confirmLabel: 'Remove Student',
      isDestructive: true,
      action: async () => {
        setIsModalLoading(true);
        try {
          const res = await fetch(
            `/api/sessions/${session.id}/students/${encodeURIComponent(student.studentId)}`,
            {
              method: 'DELETE',
            }
          );
          if (res.ok) {
            // Refetch session
            const freshRes = await fetch(`/api/sessions/${session.id}`);
            if (freshRes.ok) {
              const fresh = await freshRes.json();
              onUpdateSession(fresh);
            }
          }
        } catch (err: any) {
          console.error('Failed to remove student:', err);
          alert(`Failed to remove student: ${err.message}`);
        } finally {
          setIsModalLoading(false);
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // Pull roster from Google Sheet directly to sync with the data sheet
  const handlePullFromSheet = async () => {
    if (!accessToken || !session.spreadsheetId) {
      alert('Please connect your Google account and ensure a Google Sheet is linked.');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('Reading from Google Sheet...');
    try {
      const sheetStudents = await fetchStudentsFromSpreadsheet(accessToken, session.spreadsheetId);
      const res = await fetch(`/api/sessions/${session.id}/sync-from-sheet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: sheetStudents }),
      });

      if (res.ok) {
        const updated = await res.json();
        onUpdateSession(updated);
        const now = new Date().toLocaleTimeString();
        setLastSyncTime(now);
        setSyncStatus(`Synchronized ${sheetStudents.length} student(s) from Google Sheet`);
      } else {
        throw new Error('Could not update session with sheet data');
      }
    } catch (e: any) {
      console.error('Failed to pull from Google Sheet:', e);
      alert(`Could not pull from sheet: ${e.message}`);
      setSyncStatus('Sheet read error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Reset entire course roster
  const handleClearRoster = () => {
    setConfirmModalConfig({
      isOpen: true,
      title: 'Clear Course Roster?',
      description: `Are you sure you want to remove all ${session.students.length} student assignments? This will reset the groups so new students can scan and be assigned from Group 1.`,
      confirmLabel: 'Clear Roster',
      isDestructive: true,
      action: async () => {
        setIsModalLoading(true);
        try {
          const res = await fetch(`/api/sessions/${session.id}/students`, {
            method: 'DELETE',
          });
          if (res.ok) {
            const freshRes = await fetch(`/api/sessions/${session.id}`);
            if (freshRes.ok) {
              const fresh = await freshRes.json();
              onUpdateSession(fresh);
              // Also sync clean sheet
              if (accessToken && session.spreadsheetId) {
                await syncGroupsToSpreadsheet(accessToken, session.spreadsheetId, fresh, []);
                setLastSyncTime(new Date().toLocaleTimeString());
                setSyncStatus('Google Sheet cleared and synchronized');
              }
            }
          }
        } catch (e: any) {
          alert(`Error clearing roster: ${e.message}`);
        } finally {
          setIsModalLoading(false);
          setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  const exportCSV = () => {
    const headers = ['Group', 'Role', 'Student ID', 'Full Name', 'Phone Number', 'Joined Time'];
    const rows = session.students.map((s) => [
      `Group ${s.groupNumber}`,
      s.isLeader ? 'Group Leader' : 'Member',
      `"${s.studentId}"`,
      `"${s.name}"`,
      `"${s.phone}"`,
      `"${new Date(s.joinedAt).toLocaleString()}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${session.courseCode}_Group_Assignments.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Compute grouped students
  const groupsMap: Record<number, Student[]> = {};
  session.students.forEach((s) => {
    if (!groupsMap[s.groupNumber]) {
      groupsMap[s.groupNumber] = [];
    }
    groupsMap[s.groupNumber].push(s);
  });

  const totalGroups = Object.keys(groupsMap).length;
  const sortedGroupNumbers = Object.keys(groupsMap)
    .map(Number)
    .sort((a, b) => a - b);

  const filteredStudents = session.students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.studentId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `group ${s.groupNumber}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner / Course Status Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 font-mono font-bold text-sm">
                <BookOpen className="w-4 h-4" />
                {session.courseCode}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                Tutor: <strong className="text-slate-700 dark:text-slate-200">{session.tutorName}</strong>
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                Limit: {session.membersLimit} students / group
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {session.courseTitle}
            </h1>

            {/* Google Sheet Sync Info */}
            <div className="flex items-center gap-3 text-xs flex-wrap pt-1">
              {session.spreadsheetUrl ? (
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="font-semibold">
                    {session.spreadsheetTitle || 'Connected Google Sheet'}
                  </span>
                  <a
                    href={session.spreadsheetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-bold inline-flex items-center gap-0.5 hover:text-emerald-800 dark:hover:text-emerald-100"
                  >
                    <span>Open Sheet</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  <span>No Google Sheet linked yet</span>
                </div>
              )}

              {lastSyncTime && (
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Synced: {lastSyncTime}
                </span>
              )}

              {isSyncing && (
                <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Syncing to Google Sheets...
                </span>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => setIsProjectorOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 transition active:scale-95 cursor-pointer"
            >
              <QrCode className="w-5 h-5" />
              <span>Projector / QR Code</span>
            </button>

            {session.spreadsheetId && (
              <>
                <button
                  onClick={handleManualSyncClick}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Push latest student assignments to Google Sheets"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Push to Sheet</span>
                </button>

                <button
                  onClick={handlePullFromSheet}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold text-sm hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition active:scale-95 cursor-pointer disabled:opacity-50"
                  title="Pull existing roster directly from the Google Sheet"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Pull from Sheet</span>
                </button>
              </>
            )}

            {session.students.length > 0 && (
              <button
                onClick={handleClearRoster}
                className="inline-flex items-center gap-1.5 px-3 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 dark:hover:bg-rose-950/30 text-slate-600 dark:text-slate-400 text-xs font-semibold transition cursor-pointer"
                title="Clear all student assignments"
              >
                <Trash2 className="w-4 h-4" />
                <span>Reset</span>
              </button>
            )}

            <button
              onClick={() => setIsPermissionsOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-3 rounded-2xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs sm:text-sm transition cursor-pointer"
              title="Manage Google accounts permitted to view"
            >
              <ShieldAlert className="w-4 h-4 text-indigo-500" />
              <span>Permissions {(session.allowedViewers || []).length > 0 ? `(${(session.allowedViewers || []).length})` : ''}</span>
            </button>

            <button
              onClick={exportCSV}
              disabled={session.students.length === 0}
              className="inline-flex items-center gap-1.5 p-3 rounded-2xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm transition cursor-pointer disabled:opacity-40"
              title="Export as CSV"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Students</span>
            <Users className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {session.students.length}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Assigned into groups</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Groups</span>
            <Crown className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {totalGroups}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">With assigned leaders</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Group Capacity</span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {session.membersLimit}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Max members per group</p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Google Sheets</span>
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-base font-bold text-slate-900 dark:text-white truncate">
            {session.spreadsheetId ? '🟢 Real-time Sync' : '⚠️ Not connected'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {lastSyncTime ? `Last sync: ${lastSyncTime}` : 'Awaiting sync'}
          </p>
        </div>
      </div>

      {/* Main Content Area: Groups Cards or Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 sm:p-7 shadow-sm space-y-6">
        {/* Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('cards')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                activeTab === 'cards'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Group Cards ({totalGroups})
            </button>
            <button
              onClick={() => setActiveTab('table')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition cursor-pointer ${
                activeTab === 'table'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Full Roster Table ({session.students.length})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search student or group..."
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        {/* Empty State */}
        {session.students.length === 0 ? (
          <div className="py-16 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 mx-auto flex items-center justify-center">
              <QrCode className="w-8 h-8" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Waiting for Students to Join
              </h3>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                Display the QR code on your classroom projector or screen so students can scan and enter their details.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
              <button
                onClick={() => setIsProjectorOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition active:scale-95 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>Show QR Code on Screen</span>
              </button>
              {session.spreadsheetId && (
                <button
                  onClick={handlePullFromSheet}
                  disabled={isSyncing}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 font-semibold text-xs sm:text-sm transition cursor-pointer disabled:opacity-50"
                  title="Check if students exist in Google Sheet"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Pull from Google Sheet</span>
                </button>
              )}
            </div>
          </div>
        ) : activeTab === 'cards' ? (
          /* Cards View */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {sortedGroupNumbers.map((gNum) => {
              const members = groupsMap[gNum] || [];
              const leader = members.find((m) => m.isLeader) || members[0];
              const remainingSlots = Math.max(0, session.membersLimit - members.length);
              const isFilled = members.length >= session.membersLimit;

              return (
                <div
                  key={`group-${gNum}`}
                  className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    {/* Group Header */}
                    <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-700/60 mb-4">
                      <div>
                        <h3 className="font-extrabold text-lg text-slate-900 dark:text-white">
                          Group {gNum}
                        </h3>
                        <span className="text-[11px] text-slate-500">
                          {members.length} of {session.membersLimit} students
                        </span>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          isFilled
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                            : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                        }`}
                      >
                        {isFilled ? 'Full' : `${remainingSlots} Slots Left`}
                      </span>
                    </div>

                    {/* Members List */}
                    <div className="space-y-2.5">
                      {members.map((stu) => (
                        <div
                          key={stu.studentId}
                          className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/70 flex items-center justify-between gap-3 group"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-slate-900 dark:text-white text-sm truncate">
                                {stu.name}
                              </span>
                              {stu.isLeader && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                                  <Crown className="w-3 h-3 text-amber-500" />
                                  Leader
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                              <span>ID: {stu.studentId}</span>
                              <span>•</span>
                              <span className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
                                <Phone className="w-3 h-3" />
                                {stu.phone}
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleRemoveStudentClick(stu)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="Remove student from group"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}

                      {/* Remaining empty slots */}
                      {Array.from({ length: remainingSlots }).map((_, idx) => (
                        <div
                          key={`empty-${idx}`}
                          className="p-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700/60 text-slate-400 text-xs flex items-center justify-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                          <span>Open slot</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Leader Contact footer */}
                  {leader && (
                    <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between text-xs text-slate-500">
                      <span>Leader: {leader.name}</span>
                      <a
                        href={`tel:${leader.phone}`}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-semibold"
                      >
                        <Phone className="w-3 h-3" />
                        Call Leader
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Table View */
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-xs uppercase font-bold text-slate-700 dark:text-slate-300 tracking-wider">
                <tr>
                  <th className="px-4 py-3">Group</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Full Name</th>
                  <th className="px-4 py-3">Phone Number</th>
                  <th className="px-4 py-3">Assigned At</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-normal">
                {filteredStudents.map((stu) => (
                  <tr
                    key={stu.studentId}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                      Group {stu.groupNumber}
                    </td>
                    <td className="px-4 py-3">
                      {stu.isLeader ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                          <Crown className="w-3 h-3 text-amber-500" />
                          Group Leader
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">Member</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900 dark:text-slate-200">
                      {stu.studentId}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                      {stu.name}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <a
                        href={`tel:${stu.phone}`}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        {stu.phone}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(stu.joinedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRemoveStudentClick(stu)}
                        className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 p-1 rounded-lg transition"
                        title="Remove student"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Projector Modal */}
      <ProjectorModal
        isOpen={isProjectorOpen}
        onClose={() => setIsProjectorOpen(false)}
        session={session}
        onQrRefreshed={(newToken, newExpiresAt) => {
          onUpdateSession({
            ...session,
            qrToken: newToken,
            qrTokenExpiresAt: newExpiresAt,
          });
        }}
      />

      {/* Permissions Modal for Authorizing Other Google Accounts */}
      <PermissionsModal
        isOpen={isPermissionsOpen}
        onClose={() => setIsPermissionsOpen(false)}
        session={session}
        onUpdateSession={onUpdateSession}
      />

      {/* Explicit User Confirmation Modal for Destructive/Mutating Operations */}
      <ConfirmationModal
        isOpen={confirmModalConfig.isOpen}
        title={confirmModalConfig.title}
        description={confirmModalConfig.description}
        confirmLabel={confirmModalConfig.confirmLabel}
        isDestructive={confirmModalConfig.isDestructive}
        isLoading={isModalLoading}
        onConfirm={confirmModalConfig.action}
        onCancel={() => setConfirmModalConfig((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
