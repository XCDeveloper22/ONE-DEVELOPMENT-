import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert,
  LogOut,
  RefreshCw,
  Info,
  FileText,
  X,
} from 'lucide-react';
import { signInWithGoogle } from '../supabaseClient';
import { AboutView } from './AboutView';
import { TermsView } from './TermsView';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';

interface AuthGateProps {
  currentUser: User | null;
  isSigningIn: boolean;
  authError: string | null;
  onGoogleSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onVerifiedEmailSignIn?: (email: string) => Promise<void>;
  onBackToInDevelopment?: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  currentUser,
  isSigningIn,
  authError,
  onGoogleSignIn,
  onSignOut,
  onBackToInDevelopment,
}) => {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [publicInfoModal, setPublicInfoModal] = useState<'about' | 'terms' | null>(null);

  const handleContinueWithGoogle = async () => {
    if (onGoogleSignIn) {
      await onGoogleSignIn();
      return;
    }
    await signInWithGoogle();
  };

  // =========================================================================
  // STATE B: Signed in with @gmail.com (Blocked — School Email Required)
  // =========================================================================
  if (currentUser) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] text-[#1F1617] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-md bg-white border border-[#E8DFDC] rounded-2xl overflow-hidden shadow-xs"
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />

          <div className="p-6 sm:p-8 space-y-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#7B1113]/10 border border-[#7B1113]/20 flex items-center justify-center mx-auto text-[#7B1113]">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h1 className="font-display text-3xl text-[#7B1113]">
                Verified MSU Email Required
              </h1>
              <p className="text-sm text-[#6E5D5F] leading-relaxed">
                <strong>ONE</strong> is exclusively for official MSU institutional Google accounts:
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 text-[11px] font-mono text-[#7B1113]">
                <span className="px-2.5 py-0.5 rounded-lg bg-[#FAF8F5] border border-[#E8DFDC]">
                  ex: @msumain.edu.ph
                </span>
              </div>
            </div>

            {/* Current Gmail Account */}
            <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center gap-3 text-left">
              <img
                src={
                  currentUser.photoURL && !avatarFailed
                    ? currentUser.photoURL
                    : studentAvatarFallback
                }
                alt={currentUser.displayName || 'Google User'}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-10 h-10 rounded-full object-cover border border-[#D4AF37] shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#1F1617] truncate">
                  {currentUser.displayName || 'Google User'}
                </p>
                <p className="text-xs font-mono text-[#6E5D5F] truncate">
                  {currentUser.email || 'No email'}
                </p>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={handleContinueWithGoogle}
                disabled={isSigningIn}
                className="w-full py-3 px-4 bg-[#7B1113] hover:bg-[#580B0C] text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[46px] cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 text-[#D4AF37] ${isSigningIn ? 'animate-spin' : ''}`} />
                <span>Switch Google Account</span>
              </button>

              <button
                onClick={onSignOut}
                className="w-full py-2.5 px-4 bg-white hover:bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC] text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // =========================================================================
  // STATE A: Simple, Minimalist MSU Maroon & Gold Login Dashboard
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1F1617] flex flex-col items-center justify-center p-4 relative">
      {/* Signing In / Signing Up Full-Screen Loading Animation */}
      <AnimatePresence>
        {isSigningIn && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#7B1113]/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white"
          >
            <div className="relative w-20 h-20 flex items-center justify-center mb-5">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37]"
              />
              <motion.div
                animate={{ scale: [0.95, 1.05, 0.95] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="font-display text-2xl text-[#D4AF37]"
              >
                ONE
              </motion.div>
            </div>
            <h2 className="font-display text-2xl text-white">Signing in with Google</h2>
            <p className="text-xs text-[#F7EFE0]/80 mt-1">
              Verifying your account access...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Simple Centered Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm bg-white border border-[#E8DFDC] rounded-2xl overflow-hidden shadow-xs"
      >
        {/* MSU Maroon & Gold Top Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />

        {onBackToInDevelopment && (
          <div className="px-4 py-2 bg-[#580B0C] border-b border-[#D4AF37]/30 flex items-center justify-between text-xs text-white">
            <span className="text-[11px] text-[#D4AF37] font-semibold">Preview Mode</span>
            <button
              type="button"
              onClick={onBackToInDevelopment}
              className="text-[11px] text-[#F7EFE0] hover:text-white underline underline-offset-2 cursor-pointer"
            >
              ← Back to In Development
            </button>
          </div>
        )}

        <div className="p-7 sm:p-8 space-y-5 text-center">
          {/* MSU Maroon & Gold Crest Badge - Only the logo emblem, text ONE below logo is hidden */}
          <div className="space-y-2.5">
            <div className="w-14 h-14 rounded-2xl bg-[#7B1113] border-2 border-[#D4AF37] flex items-center justify-center mx-auto shadow-xs">
              <span className="font-display text-2xl text-[#D4AF37] tracking-tight">ONE</span>
            </div>
            <p className="text-xs font-medium text-[#6E5D5F]">
              Student Wall · MSUan
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-[#6E5D5F] leading-relaxed">
              Sign in with your official MSU school Google account:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1 text-[11px] font-mono text-[#7B1113]">
              <span className="px-2.5 py-0.5 rounded-md bg-[#FAF8F5] border border-[#E8DFDC]">
                ex: @msumain.edu.ph
              </span>
            </div>
          </div>

          {authError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 text-left">
              {authError}
            </div>
          )}

          {/* Primary Google Sign-In Button */}
          <button
            onClick={handleContinueWithGoogle}
            disabled={isSigningIn}
            className="w-full py-3 px-5 bg-[#7B1113] hover:bg-[#580B0C] text-white font-medium text-sm rounded-xl transition-colors flex items-center justify-center gap-3 min-h-[48px] border border-[#D4AF37]/40 whitespace-nowrap cursor-pointer"
          >
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.4 1 3.5 3.6 1.6 7.4l3.7 2.8C6.2 7.2 8.9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.6l3.7 2.9c2.2-2 3.7-5 3.7-8.7z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.3 14.8c-.2-.8-.4-1.6-.4-2.5s.2-1.7.4-2.5L1.6 7C.6 9 0 11.2 0 13.5s.6 4.5 1.6 6.5l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3.1 0-5.8-2.1-6.7-5l-3.7 2.8C3.5 20.9 7.4 24 12 24z"
                />
              </svg>
            </div>
            <span>Continue with Google</span>
          </button>

          {/* Public About Us & Terms links */}
          <div className="pt-3 border-t border-[#F2ECE9] flex flex-wrap items-center justify-center gap-4 text-xs text-[#6E5D5F]">
            <button
              type="button"
              onClick={() => setPublicInfoModal('about')}
              className="hover:text-[#7B1113] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <Info className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>About Us</span>
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => setPublicInfoModal('terms')}
              className="hover:text-[#7B1113] flex items-center gap-1 cursor-pointer transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Terms &amp; Guidelines</span>
            </button>
          </div>
        </div>
      </motion.div>

      {/* Public Info Modal for About Us / Terms */}
      <AnimatePresence>
        {publicInfoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="w-full max-w-3xl max-h-[90vh] bg-[#FAF8F5] border border-[#E8DFDC] rounded-3xl overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="px-5 py-3.5 bg-[#7B1113] text-white border-b border-[#D4AF37]/40 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setPublicInfoModal('about')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      publicInfoModal === 'about'
                        ? 'bg-[#D4AF37] text-[#1F1617] font-semibold'
                        : 'text-[#F7EFE0] hover:bg-white/10'
                    }`}
                  >
                    About Us
                  </button>
                  <button
                    type="button"
                    onClick={() => setPublicInfoModal('terms')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                      publicInfoModal === 'terms'
                        ? 'bg-[#D4AF37] text-[#1F1617] font-semibold'
                        : 'text-[#F7EFE0] hover:bg-white/10'
                    }`}
                  >
                    Terms &amp; Guidelines
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPublicInfoModal(null)}
                  className="p-1.5 text-white/80 hover:text-white rounded-lg cursor-pointer"
                  title="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto flex-1">
                {publicInfoModal === 'about' ? (
                  <AboutView
                    onGoToTerms={() => setPublicInfoModal('terms')}
                  />
                ) : (
                  <TermsView
                    onGoToAbout={() => setPublicInfoModal('about')}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
