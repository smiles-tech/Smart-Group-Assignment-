import React from 'react';
import { X, Smartphone } from 'lucide-react';
import { StudentPortal } from './StudentPortal';

interface StudentSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
}

export const StudentSimulatorModal: React.FC<StudentSimulatorModalProps> = ({
  isOpen,
  onClose,
  sessionId,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/75 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex flex-col items-center max-w-md w-full max-h-[92vh]">
        {/* Mobile Mockup Frame */}
        <div className="relative w-full bg-slate-900 border-4 border-slate-700/80 rounded-[40px] shadow-2xl overflow-hidden flex flex-col h-[750px] max-h-[90vh]">
          {/* Top Speaker / Camera Notch */}
          <div className="bg-slate-900 pt-3 pb-2 px-6 flex items-center justify-between border-b border-slate-800 shrink-0 z-20">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
              <Smartphone className="w-3.5 h-3.5 text-indigo-400" />
              <span>Student Phone View</span>
            </div>
            <div className="w-16 h-3.5 bg-slate-950 rounded-full mx-auto" />
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Screen Content */}
          <div className="flex-1 overflow-y-auto bg-slate-950">
            <StudentPortal sessionId={sessionId} />
          </div>

          {/* Bottom Home Indicator */}
          <div className="bg-slate-900 py-2 flex items-center justify-center shrink-0">
            <div className="w-24 h-1 bg-slate-700 rounded-full" />
          </div>
        </div>
      </div>
    </div>
  );
};
