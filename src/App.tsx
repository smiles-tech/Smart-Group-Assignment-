import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  FileSpreadsheet,
  QrCode,
  Users,
  CheckCircle2,
  Sparkles,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Lock,
} from 'lucide-react';
import { initAuth, googleSignIn, logout, getAccessToken } from './services/firebaseAuth';
import { Navbar } from './components/Navbar';
import { SetupSessionModal } from './components/SetupSessionModal';
import { TutorDashboard } from './components/TutorDashboard';
import { StudentPortal } from './components/StudentPortal';
import { StudentSimulatorModal } from './components/StudentSimulatorModal';
import { CourseSession } from './types';
import { GoogleSignInButton } from './components/GoogleSignInButton';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Sessions state
  const [sessions, setSessions] = useState<CourseSession[]>([]);
  const [activeSession, setActiveSession] = useState<CourseSession | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(true);

  // Modals
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);

  // Check URL params for student mode
  const [studentSessionId, setStudentSessionId] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('session');
  });

  // Listen for Firebase Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(currentUser);
        setAccessToken(token);
        setAuthChecked(true);
      },
      () => {
        setUser(null);
        setAccessToken(null);
        setAuthChecked(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Fetch all sessions (annotated with user permissions)
  useEffect(() => {
    fetchSessions();
  }, [user]);

  const fetchSessions = async () => {
    setIsLoadingSessions(true);
    try {
      const emailQuery = user?.email ? `?userEmail=${encodeURIComponent(user.email)}` : '';
      const res = await fetch(`/api/sessions${emailQuery}`);
      if (res.ok) {
        const list: CourseSession[] = await res.json();
        setSessions(list);
        if (list.length > 0 && !activeSession) {
          setActiveSession(list[0]);
        } else if (activeSession) {
          const fresh = list.find((s) => s.id === activeSession.id);
          if (fresh) setActiveSession(fresh);
        }
      }
    } catch (e) {
      console.warn('Failed to fetch course sessions:', e);
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAccessToken(result.accessToken);
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setAccessToken(null);
  };

  const handleSessionCreated = (newSession: CourseSession) => {
    setSessions((prev) => [newSession, ...prev]);
    setActiveSession(newSession);
  };

  const handleUpdateSession = (updatedSession: CourseSession) => {
    setActiveSession(updatedSession);
    setSessions((prev) =>
      prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
    );
  };

  // If URL has ?session=... this device scanned the QR code as a student!
  if (studentSessionId) {
    return <StudentPortal sessionId={studentSessionId} />;
  }

  return (
    <div className="min-h-screen bg-slate-100/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      {/* Top Navbar */}
      <Navbar
        user={user}
        accessToken={accessToken}
        isLoggingIn={isLoggingIn}
        onLogin={handleLogin}
        onLogout={handleLogout}
        sessions={sessions}
        activeSession={activeSession}
        onSelectSession={(s) => setActiveSession(s)}
        onNewSession={() => setIsSetupModalOpen(true)}
        onOpenStudentPreview={() => setIsSimulatorOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!activeSession ? (
          /* Welcome & Getting Started Screen */
          <div className="max-w-4xl mx-auto py-8 sm:py-12 space-y-10 animate-fade-in">
            {/* Hero Section */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-semibold">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                <span>Smart Classroom Grouping & Sync</span>
              </div>
              <h1 className="text-3xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight max-w-2xl mx-auto leading-tight">
                Automatic Student Grouping with QR Codes & Google Sheets
              </h1>
              <p className="text-slate-600 dark:text-slate-300 text-base sm:text-lg max-w-xl mx-auto">
                Project a QR code in class. Students scan with their phones to register, get auto-assigned to groups with designated leaders, and synchronize live with your Google Spreadsheet.
              </p>

              {/* Action Buttons */}
              <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
                {!accessToken ? (
                  <GoogleSignInButton
                    onClick={handleLogin}
                    loading={isLoggingIn}
                    text="Connect Google Sheet & Start"
                  />
                ) : (
                  <button
                    onClick={() => setIsSetupModalOpen(true)}
                    className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base shadow-lg shadow-indigo-600/30 transition active:scale-95 cursor-pointer"
                  >
                    <BookOpen className="w-5 h-5" />
                    <span>Create First Course Session</span>
                    <ArrowRight className="w-5 h-5" />
                  </button>
                )}

                {!accessToken && (
                  <button
                    onClick={() => setIsSetupModalOpen(true)}
                    className="text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 underline"
                  >
                    Continue without Google Account (Local Mode)
                  </button>
                )}
              </div>
            </div>

            {/* 4-Step Process Guide */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-6">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 font-black text-base flex items-center justify-center">
                  1
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Connect Google Sheets
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Sign in with your Google account to automatically create and sync class rosters directly into Google Sheets.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-purple-100 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 font-black text-base flex items-center justify-center">
                  2
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Set Course & Limits
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Enter Course Code (e.g. CS101), Course Title, and maximum members per group (e.g. 4 students).
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 font-black text-base flex items-center justify-center">
                  3
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Display Projector QR
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Open Projector Mode on the classroom screen. Students scan the QR code using their smartphone cameras.
                </p>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-xs space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 font-black text-base flex items-center justify-center">
                  4
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Auto Group & Leader
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Students enter ID, Name & Phone. First person in each group becomes Group Leader. Only their group is shown!
                </p>
              </div>
            </div>
          </div>
        ) : (activeSession as any).userRole === 'unauthorized' ? (
          /* Permission Required Screen */
          <div className="max-w-md mx-auto my-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-xl animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 mx-auto flex items-center justify-center">
              <Lock className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                Google Account Permission Required
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                You are signed in as <strong className="text-slate-800 dark:text-slate-200">{user?.email || 'Guest'}</strong>.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 leading-relaxed text-left space-y-2">
              <p>
                This course dashboard for <strong className="text-slate-900 dark:text-white">{activeSession.courseCode}</strong> is restricted by the course tutor.
              </p>
              <p>
                To view this dashboard, ask the tutor (<strong className="text-indigo-600 dark:text-indigo-400">{activeSession.tutorEmail}</strong>) to add your Google email address (<strong className="text-slate-800 dark:text-slate-200">{user?.email}</strong>) to the allowed permissions list.
              </p>
            </div>
            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={handleLogin}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition"
              >
                Sign in with a different Google Account
              </button>
            </div>
          </div>
        ) : (
          /* Active Dashboard (Owner or Authorized Viewer) */
          <div>
            {(activeSession as any).userRole === 'viewer' && (
              <div className="mb-4 p-3.5 rounded-2xl bg-indigo-50/90 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3 text-xs text-indigo-900 dark:text-indigo-300">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    <strong>Authorized Viewer:</strong> Signed in as {user?.email}. You have verified Google account permission to view this course roster and live sync status.
                  </span>
                </div>
              </div>
            )}
            <TutorDashboard
              session={activeSession}
              accessToken={accessToken}
              onUpdateSession={handleUpdateSession}
              onOpenNewSessionModal={() => setIsSetupModalOpen(true)}
            />
          </div>
        )}
      </main>

      {/* Setup Course Modal */}
      <SetupSessionModal
        isOpen={isSetupModalOpen}
        onClose={() => setIsSetupModalOpen(false)}
        accessToken={accessToken}
        tutorUser={user}
        onSessionCreated={handleSessionCreated}
      />

      {/* Student Smartphone Simulator Modal */}
      {activeSession && (
        <StudentSimulatorModal
          isOpen={isSimulatorOpen}
          onClose={() => setIsSimulatorOpen(false)}
          sessionId={activeSession.id}
        />
      )}
    </div>
  );
}
