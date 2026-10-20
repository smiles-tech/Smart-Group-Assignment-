import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Maximize2,
  Minimize2,
  Copy,
  Check,
  X,
  Users,
  BookOpen,
  ExternalLink,
  RefreshCw,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Globe,
  Settings,
  HelpCircle,
} from 'lucide-react';
import { CourseSession } from '../types';

interface ProjectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: CourseSession;
  onQrRefreshed?: (newToken: string, newExpiresAt: number) => void;
}

export const ProjectorModal: React.FC<ProjectorModalProps> = ({
  isOpen,
  onClose,
  session,
  onQrRefreshed,
}) => {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [configUrls, setConfigUrls] = useState<{
    appUrl: string;
    devUrl: string;
    sharedUrl: string;
  } | null>(null);

  const [selectedBaseUrl, setSelectedBaseUrl] = useState<string>('');
  const [customBaseUrl, setCustomBaseUrl] = useState<string>('');
  const [showUrlSettings, setShowUrlSettings] = useState(false);
  const [show403Help, setShow403Help] = useState(false);

  // Fetch real backend Cloud Run URLs
  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => {
        setConfigUrls(data);
        if (data.appUrl) {
          // If window.location.origin is a google.com domain (e.g. aistudio.google.com),
          // using it will cause a 403 error on external phones! Always default to appUrl
          setSelectedBaseUrl(data.appUrl);
        } else {
          setSelectedBaseUrl(window.location.origin);
        }
      })
      .catch(() => {
        setSelectedBaseUrl(window.location.origin);
      });
  }, []);

  const currentToken = session.qrToken || '';
  const currentExpiresAt = session.qrTokenExpiresAt || Date.now() + 15 * 60 * 1000;

  // Determine effective base URL
  let effectiveBaseUrl = (selectedBaseUrl || window.location.origin).replace(/\/+$/, '');
  // Guard: If it points to internal aistudio.google.com, automatically swap to Cloud Run appUrl if known
  if (effectiveBaseUrl.includes('aistudio.google.com') && configUrls?.appUrl) {
    effectiveBaseUrl = configUrls.appUrl;
  }

  const dynamicJoinUrl = `${effectiveBaseUrl}?session=${session.id}&token=${currentToken}`;

  useEffect(() => {
    if (!isOpen) return;

    const updateTimer = () => {
      const remaining = Math.max(0, Math.floor((currentExpiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        handleRefreshQr();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isOpen, currentExpiresAt]);

  const handleRefreshQr = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}/refresh-qr`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        if (onQrRefreshed) {
          onQrRefreshed(data.qrToken, data.qrTokenExpiresAt);
        }
      }
    } catch (e) {
      console.error('Failed to rotate QR token:', e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(dynamicJoinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  if (!isOpen) return null;

  const activeStudents = session.students.filter((s) => !s.exitedAt);
  const totalGroups =
    activeStudents.length > 0
      ? Math.max(...activeStudents.map((s) => s.groupNumber))
      : 0;

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

  const isInternalGoogleUrl = effectiveBaseUrl.includes('aistudio.google.com');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/95 backdrop-blur-md overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl text-white flex flex-col items-center my-6">
        {/* Controls */}
        <div className="w-full flex items-center justify-between pb-4 border-b border-slate-800 mb-6 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-xs sm:text-sm font-semibold tracking-wider uppercase text-emerald-400">
              Live Classroom Projector Mode
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUrlSettings(!showUrlSettings)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Configure QR Base URL"
            >
              <Settings className="w-3.5 h-3.5 text-indigo-400" />
              <span>QR Host Settings</span>
            </button>

            <button
              onClick={handleRefreshQr}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
              title="Generate a fresh dynamic QR token"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Rotate QR</span>
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
              title="Close Projector View"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* 403 Warning if pointing to internal google url */}
        {isInternalGoogleUrl && (
          <div className="w-full mb-4 p-4 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-amber-100">
                Warning: Internal Google URL detected in QR Code
              </p>
              <p>
                Scanning an <code>aistudio.google.com</code> link causes a Google 403 error on external phones. Please switch to the Cloud Run App URL below.
              </p>
              {configUrls?.appUrl && (
                <button
                  onClick={() => setSelectedBaseUrl(configUrls.appUrl)}
                  className="mt-1 px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition"
                >
                  Switch to Cloud Run URL ({configUrls.appUrl})
                </button>
              )}
            </div>
          </div>
        )}

        {/* URL Settings Drawer */}
        {showUrlSettings && (
          <div className="w-full mb-6 p-4 rounded-2xl bg-slate-800/90 border border-slate-700 text-xs space-y-3 animate-fade-in">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-indigo-400" />
                Select QR Code Base URL
              </span>
              <button
                onClick={() => setShowUrlSettings(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {configUrls?.appUrl && (
                <button
                  type="button"
                  onClick={() => setSelectedBaseUrl(configUrls.appUrl)}
                  className={`p-3 rounded-xl border text-left transition ${
                    selectedBaseUrl === configUrls.appUrl
                      ? 'border-indigo-500 bg-indigo-950/60 text-white font-bold ring-2 ring-indigo-500/30'
                      : 'border-slate-700 hover:bg-slate-700/50 text-slate-300'
                  }`}
                >
                  <div className="font-semibold text-white">Direct Cloud Run URL (Recommended)</div>
                  <div className="font-mono text-[11px] text-slate-400 truncate mt-0.5">
                    {configUrls.appUrl}
                  </div>
                </button>
              )}

              {configUrls?.sharedUrl && (
                <button
                  type="button"
                  onClick={() => setSelectedBaseUrl(configUrls.sharedUrl)}
                  className={`p-3 rounded-xl border text-left transition ${
                    selectedBaseUrl === configUrls.sharedUrl
                      ? 'border-indigo-500 bg-indigo-950/60 text-white font-bold ring-2 ring-indigo-500/30'
                      : 'border-slate-700 hover:bg-slate-700/50 text-slate-300'
                  }`}
                >
                  <div className="font-semibold text-white">Shared App URL (Deployed/Public)</div>
                  <div className="font-mono text-[11px] text-slate-400 truncate mt-0.5">
                    {configUrls.sharedUrl}
                  </div>
                </button>
              )}
            </div>

            <div className="pt-2 flex items-center gap-2">
              <input
                type="text"
                value={customBaseUrl}
                onChange={(e) => setCustomBaseUrl(e.target.value)}
                placeholder="Or paste custom public domain / tunnel URL (e.g. https://mycourse.edu)"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs font-mono focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  if (customBaseUrl.trim()) {
                    setSelectedBaseUrl(customBaseUrl.trim());
                  }
                }}
                disabled={!customBaseUrl.trim()}
                className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition disabled:opacity-50"
              >
                Apply Custom
              </button>
            </div>
          </div>
        )}

        {/* Course Header */}
        <div className="text-center space-y-2 mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-semibold">
            <BookOpen className="w-4 h-4" />
            {session.courseCode}
          </div>
          <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white max-w-2xl">
            {session.courseTitle}
          </h2>
          <p className="text-slate-400 text-sm sm:text-base">
            Tutor: <span className="text-slate-200 font-medium">{session.tutorName}</span> • Max{' '}
            <span className="text-indigo-400 font-bold">{session.membersLimit} students</span> per group
          </p>
        </div>

        {/* Big Dynamic QR Code Card */}
        <div className="bg-white p-5 sm:p-7 rounded-3xl shadow-2xl flex flex-col items-center border-4 border-indigo-600/40 relative">
          <QRCodeSVG
            value={dynamicJoinUrl}
            size={280}
            level="H"
            includeMargin={true}
            className="w-56 h-56 sm:w-72 sm:h-72"
          />
          <div className="mt-3 flex items-center justify-between w-full px-2 gap-2 flex-wrap">
            <span className="text-[11px] sm:text-xs font-bold tracking-wider text-slate-800 uppercase">
              Scan with Smartphone Camera
            </span>
            <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
              <Clock className="w-3 h-3 text-indigo-600" />
              <span>Token: {formattedTime}</span>
            </div>
          </div>
        </div>

        {/* Security & 403 Troubleshooting Notice */}
        <div className="mt-4 flex flex-col items-center gap-2 text-xs text-slate-400 bg-slate-800/60 p-4 rounded-2xl border border-slate-700/50 max-w-xl text-center">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Dynamic QR Security:</strong> Tokens rotate every 15 minutes. Access URLs expire automatically when students exit.
            </span>
          </div>

          <button
            type="button"
            onClick={() => setShow403Help(!show403Help)}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1 cursor-pointer pt-1"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>Getting a &quot;403 That&apos;s an error&quot; on your phone? Click here to resolve</span>
          </button>

          {show403Help && (
            <div className="mt-2 text-left bg-slate-900/90 p-4 rounded-xl border border-slate-700 text-slate-300 space-y-2 text-xs animate-fade-in">
              <p className="font-bold text-white">Why Google 403 happens & how to fix it:</p>
              <ol className="list-decimal pl-4 space-y-1.5 text-slate-300">
                <li>
                  <strong>Phone scanning an internal Google domain:</strong> If your phone scans an address with <code>aistudio.google.com</code>, Google blocks it because external phones lack developer credentials. We have now routed the QR code directly to the Cloud Run host:
                  <div className="font-mono text-emerald-400 text-[11px] mt-0.5 break-all">
                    {effectiveBaseUrl}
                  </div>
                </li>
                <li>
                  <strong>Preview Environment Auth:</strong> In Google AI Studio Build, the development preview is private to your Google account (<code>{session.tutorEmail || 'developer'}</code>). Make sure your mobile browser is logged into Google with that same account, OR click <strong>Deploy / Share</strong> in AI Studio to make the link public to all students.
                </li>
                <li>
                  <strong>Instant In-Browser Simulator:</strong> You can also click <strong>&quot;Student Mobile View&quot;</strong> in the top navbar anytime to test student registration directly in your current browser!
                </li>
              </ol>
            </div>
          )}
        </div>

        {/* Live Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-xl my-6">
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-black text-indigo-400">
              {activeStudents.length}
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">
              Active Students
            </div>
          </div>

          <div className="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-black text-emerald-400">
              {totalGroups}
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">
              Groups Formed
            </div>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-slate-800/80 border border-slate-700/60 rounded-2xl p-4 text-center">
            <div className="text-2xl sm:text-3xl font-black text-amber-400">
              {session.membersLimit}
            </div>
            <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">
              Limit / Group
            </div>
          </div>
        </div>

        {/* Direct Link Box */}
        <div className="w-full max-w-xl flex items-center justify-between gap-3 bg-slate-800/50 border border-slate-700/60 rounded-xl p-3">
          <div className="truncate text-xs sm:text-sm text-slate-300 font-mono">
            {dynamicJoinUrl}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={copyToClipboard}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold transition cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy Dynamic Link'}
            </button>
            <a
              href={dynamicJoinUrl}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 transition"
              title="Open Portal in New Tab"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
