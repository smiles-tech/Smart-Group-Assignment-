import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Users,
  Crown,
  Phone,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  BookOpen,
  User,
  ArrowRight,
  LogOut,
  Clock,
  Lock,
} from 'lucide-react';
import { StudentViewData } from '../types';

interface StudentPortalProps {
  sessionId: string;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({ sessionId }) => {
  const [studentIdInput, setStudentIdInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');

  const [sessionInfo, setSessionInfo] = useState<{
    courseCode: string;
    courseTitle: string;
    tutorName: string;
    membersLimit: number;
    expiresInSeconds?: number;
  } | null>(null);

  const [studentData, setStudentData] = useState<StudentViewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isQrExpired, setIsQrExpired] = useState(false);
  const [isExited, setIsExited] = useState(false);

  const storageKey = `student_session_${sessionId}`;
  const tokenStorageKey = `student_token_${sessionId}`;

  // Read URL query parameters
  const queryParams = new URLSearchParams(window.location.search);
  const qrToken = queryParams.get('token') || '';

  // Initial load: validate QR token and check active session
  useEffect(() => {
    let isMounted = true;

    async function loadInitial() {
      setIsLoading(true);
      setError(null);
      setIsQrExpired(false);
      try {
        // Validate dynamic QR token and fetch course info
        const res = await fetch(`/api/sessions/${sessionId}?token=${encodeURIComponent(qrToken)}`);

        if (res.status === 403) {
          const errData = await res.json().catch(() => ({}));
          if (isMounted) {
            setIsQrExpired(true);
            setError(errData.error || 'QR code has expired. Please scan the current code displayed on the screen.');
          }
          return;
        }

        if (!res.ok) {
          throw new Error('Course session not found or link has expired.');
        }

        const data = await res.json();
        if (isMounted) {
          setSessionInfo({
            courseCode: data.courseCode,
            courseTitle: data.courseTitle,
            tutorName: data.tutorName,
            membersLimit: data.membersLimit,
            expiresInSeconds: data.expiresInSeconds,
          });
        }

        // Check if student was previously registered and active
        const savedStudentId = localStorage.getItem(storageKey);
        const savedSessionToken = localStorage.getItem(tokenStorageKey);

        if (savedStudentId) {
          const studentRes = await fetch(
            `/api/sessions/${sessionId}?studentId=${encodeURIComponent(savedStudentId)}&sessionToken=${encodeURIComponent(savedSessionToken || '')}`
          );

          if (studentRes.status === 401) {
            // Already exited
            localStorage.removeItem(storageKey);
            localStorage.removeItem(tokenStorageKey);
            if (isMounted) setIsExited(true);
          } else if (studentRes.ok) {
            const studentView: StudentViewData = await studentRes.json();
            if (isMounted) {
              setStudentData(studentView);
            }
          }
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Failed to load course session.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadInitial();
    return () => {
      isMounted = false;
    };
  }, [sessionId, qrToken, storageKey, tokenStorageKey]);

  // Real-time synchronization for student view: listen for updates
  useEffect(() => {
    if (!studentData?.student?.studentId) return;

    const currentStudentId = studentData.student.studentId;
    const currentSessionToken = studentData.sessionToken;
    let eventSource: EventSource | null = null;

    try {
      eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);

      eventSource.addEventListener('update', async () => {
        try {
          const res = await fetch(
            `/api/sessions/${sessionId}?studentId=${encodeURIComponent(currentStudentId)}&sessionToken=${encodeURIComponent(currentSessionToken)}`
          );
          if (res.status === 401) {
            setIsExited(true);
            setStudentData(null);
          } else if (res.ok) {
            const updatedView: StudentViewData = await res.json();
            setStudentData(updatedView);
          }
        } catch (e) {
          console.warn('Could not refresh student group view:', e);
        }
      });
    } catch (e) {
      console.warn('SSE error:', e);
    }

    return () => {
      eventSource?.close();
    };
  }, [sessionId, studentData?.student?.studentId, studentData?.sessionToken]);

  // Handle URL expiration on exit
  const handleExitSession = async () => {
    if (!studentData?.student?.studentId) {
      setIsExited(true);
      return;
    }

    const confirmed = window.confirm(
      'Exit this group session? Your temporary access URL will expire immediately.'
    );
    if (!confirmed) return;

    try {
      await fetch(`/api/sessions/${sessionId}/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentData.student.studentId,
          sessionToken: studentData.sessionToken,
        }),
      });
    } catch (e) {
      console.warn('Exit signal failed:', e);
    } finally {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(tokenStorageKey);
      setStudentData(null);
      setIsExited(true);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentIdInput.trim() || !nameInput.trim() || !phoneInput.trim()) {
      setError('Please fill in Student ID, Full Name, and Phone Number.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentIdInput.trim(),
          name: nameInput.trim(),
          phone: phoneInput.trim(),
          token: qrToken,
        }),
      });

      if (res.status === 403) {
        const errData = await res.json().catch(() => ({}));
        setIsQrExpired(true);
        setError(errData.error || 'QR code expired. Please scan the current QR code on the screen.');
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to join group.');
      }

      const assignedData: StudentViewData = await res.json();
      setStudentData(assignedData);
      localStorage.setItem(storageKey, assignedData.student.studentId);
      if (assignedData.sessionToken) {
        localStorage.setItem(tokenStorageKey, assignedData.sessionToken);
      }

      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err: any) {
      setError(err.message || 'An error occurred while joining the group.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-slate-400">Verifying dynamic security token...</p>
      </div>
    );
  }

  // State: QR Code Expired
  if (isQrExpired) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 mx-auto flex items-center justify-center">
            <Clock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white">QR Code Expired</h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              This dynamic QR code access link has expired for security reasons.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-white">How to join:</p>
            <p>Look at your classroom screen and scan the fresh QR code displayed by your tutor.</p>
          </div>
        </div>
      </div>
    );
  }

  // State: Exited Session -> URL expired
  if (isExited) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white">Session Exited</h2>
            <p className="text-sm text-slate-400 leading-relaxed">
              You have exited this group session. Your access URL has expired.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300">
            To view or join again, please rescan the active QR code displayed by your tutor.
          </div>
        </div>
      </div>
    );
  }

  if (error && !sessionInfo) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold">Session Unavailable</h2>
          <p className="text-sm text-slate-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Course Banner */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-30 px-4 py-3 sm:py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                  {sessionInfo?.courseCode}
                </span>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  {sessionInfo?.tutorName}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-white truncate max-w-xs sm:max-w-md">
                {sessionInfo?.courseTitle}
              </h1>
            </div>
          </div>

          {studentData && (
            <button
              onClick={handleExitSession}
              className="text-xs text-slate-300 hover:text-rose-400 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
              title="Exit and expire access URL"
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              <span>Exit & Expire</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-center">
        {!studentData ? (
          /* Student Registration Form */
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 animate-fade-in">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center mb-3">
                <Users className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-black text-white tracking-tight">
                Join Course Group
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Enter your details to be automatically assigned. First student in each group is designated Group Leader!
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Student ID Number *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={studentIdInput}
                    onChange={(e) => setStudentIdInput(e.target.value)}
                    placeholder="e.g. STU-2024-001 or 10842951"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-white placeholder-slate-500 font-mono text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                  />
                  <User className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Full Name *
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-white placeholder-slate-500 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Phone Number *
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="e.g. +1 555-0199 or 0541234567"
                    required
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-white placeholder-slate-500 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 focus:outline-none"
                  />
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Shared only with members in your assigned group so you can coordinate.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-indigo-600/30 transition flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-50 cursor-pointer mt-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Assigning your group...</span>
                  </>
                ) : (
                  <>
                    <span>Get My Group Assignment</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 text-center text-xs text-slate-500">
              🔒 Dynamic Security Active • Access link expires automatically upon exit
            </div>
          </div>
        ) : (
          /* Student Assigned Group Card */
          <div className="space-y-6 animate-fade-in">
            {/* Main Assignment Banner */}
            <div className="bg-gradient-to-br from-indigo-900/60 to-purple-900/40 border border-indigo-700/50 rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                <Users className="w-48 h-48" />
              </div>

              {/* Leader or Member Badge */}
              {studentData.isLeader ? (
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300 font-extrabold text-xs sm:text-sm uppercase tracking-wider mb-3 animate-pulse">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span>👑 You are the Group Leader!</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-semibold text-xs mb-3">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Assigned Member</span>
                </div>
              )}

              <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight mb-2">
                {studentData.groupName}
              </h2>

              <p className="text-slate-300 text-sm max-w-md mx-auto">
                Welcome <span className="text-white font-bold">{studentData.student.name}</span> (ID: {studentData.student.studentId}).
                {studentData.isLeader
                  ? ' As the first member assigned, you lead this group and coordinate with your tutor.'
                  : ` You have been assigned to ${studentData.groupName}. Coordinate with your team below.`}
              </p>
            </div>

            {/* Privacy Assurance Card */}
            <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 text-xs text-slate-400">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>
                  <strong>Privacy Guaranteed:</strong> You only see members of {studentData.groupName}.
                </span>
              </div>
              <button
                onClick={handleExitSession}
                className="text-xs text-rose-400 hover:underline shrink-0"
              >
                Exit Session
              </button>
            </div>

            {/* Teammates List */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-400" />
                  <h3 className="font-bold text-base text-white">
                    Members in {studentData.groupName}
                  </h3>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-800 text-indigo-300 border border-slate-700">
                  {studentData.groupMembers.length} / {studentData.session.membersLimit} Members
                </span>
              </div>

              <div className="space-y-3">
                {studentData.groupMembers.map((member) => {
                  const isCurrent =
                    member.studentId.toLowerCase() ===
                    studentData.student.studentId.toLowerCase();
                  const cleanPhone = member.phone.replace(/[^0-9+]/g, '');

                  return (
                    <div
                      key={member.studentId}
                      className={`p-4 rounded-2xl border transition ${
                        isCurrent
                          ? 'bg-indigo-950/40 border-indigo-700/60 ring-1 ring-indigo-500/20'
                          : 'bg-slate-950/80 border-slate-800'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm sm:text-base">
                              {member.name}
                            </span>
                            {isCurrent && (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-600 text-white">
                                You
                              </span>
                            )}
                            {member.isLeader && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                                <Crown className="w-3 h-3 text-amber-400" />
                                Group Leader
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                            <span>ID: {member.studentId}</span>
                            <span>•</span>
                            <span className="text-slate-300 flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {member.phone}
                            </span>
                          </div>
                        </div>

                        {/* Contact Buttons */}
                        <div className="flex items-center gap-2 self-start sm:self-center">
                          <a
                            href={`tel:${cleanPhone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition"
                            title="Call teammate"
                          >
                            <Phone className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Call</span>
                          </a>
                          <a
                            href={`https://wa.me/${cleanPhone.replace('+', '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700/40 text-xs font-semibold text-emerald-300 transition"
                            title="Message on WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                            <span>Message</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Open slot indicators if group isn't full yet */}
                {Array.from({
                  length: Math.max(
                    0,
                    studentData.session.membersLimit - studentData.groupMembers.length
                  ),
                }).map((_, idx) => (
                  <div
                    key={`slot-${idx}`}
                    className="p-3.5 rounded-2xl border border-dashed border-slate-800 text-slate-500 text-xs flex items-center justify-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full bg-slate-700 animate-pulse" />
                    <span>Open slot — waiting for next student to scan QR code</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-2">
              <p className="text-xs text-slate-400">
                When you leave class, click below to exit and expire your session link.
              </p>
              <button
                onClick={handleExitSession}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-semibold text-xs transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Exit & Expire Access URL</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
