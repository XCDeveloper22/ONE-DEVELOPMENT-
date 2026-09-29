import React, { useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, UserCheck, CheckCircle2, AlertCircle, EyeOff, Eye } from 'lucide-react';
import { MSU_CAMPUSES } from '../types';
import {
  checkNicknameAvailability,
  resolveUserBadge,
  sanitizeNicknameInput,
} from '../firebase';
import { UserBadgeTag } from './UserBadgeTag';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';

interface NicknameOnboardingModalProps {
  currentUser: User;
  effectiveEmail: string;
  emailDomain: string;
  onCompleteOnboarding: (data: {
    nickname: string;
    campus: string;
    bio: string;
    defaultAnonymous: boolean;
    referralSource: string;
  }) => Promise<void>;
}

const REFERRAL_SOURCES = [
  'Facebook / MSU Campus Page',
  'Friend / Classmate / Blockmate',
  'TikTok / Instagram / Social Media',
  'Campus Org / Student Council',
  'Google Search / Direct Link',
  'Other',
] as const;

export const NicknameOnboardingModal: React.FC<NicknameOnboardingModalProps> = ({
  currentUser,
  effectiveEmail,
  onCompleteOnboarding,
}) => {
  const emailPrefix = (effectiveEmail.split('@')[0] || '').replace(/[^a-zA-Z0-9_]/g, '_');
  const rawSuggested = (currentUser.displayName || emailPrefix || 'msu_student')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);

  const initialSuggestedNick =
    rawSuggested.length >= 2 && rawSuggested !== 'one' && rawSuggested !== 'one_official'
      ? rawSuggested
      : `msu_${(currentUser.uid || 'student').replace(/[^a-zA-Z0-9]/g, '').slice(-4).toLowerCase() || 'user'}`;

  const [nickname, setNickname] = useState(initialSuggestedNick);
  const [campus, setCampus] = useState(MSU_CAMPUSES[0]);
  const [bio, setBio] = useState('');
  const [defaultAnonymous, setDefaultAnonymous] = useState(false);
  const [selectedReferral, setSelectedReferral] = useState<string>(REFERRAL_SOURCES[0]);
  const [customReferral, setCustomReferral] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const [isCheckingNick, setIsCheckingNick] = useState(false);
  const [nickStatus, setNickStatus] = useState<{
    available: boolean;
    reason?: string;
  } | null>(null);

  const userEditedNickRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const assignedBadge = resolveUserBadge(undefined, effectiveEmail);

  useEffect(() => {
    let active = true;
    const cleaned = nickname.trim().replace(/^@+/, '').trim();
    if (!cleaned) {
      setNickStatus(null);
      setIsCheckingNick(false);
      return;
    }

    setIsCheckingNick(true);
    const timer = window.setTimeout(async () => {
      const res = await checkNicknameAvailability(cleaned, currentUser.uid, effectiveEmail);
      if (!active || !isMountedRef.current) return;

      // If the auto-suggested nickname is already taken and the user hasn't typed yet, append a unique suffix
      if (!res.available && !userEditedNickRef.current) {
        const uidSuffix =
          (currentUser.uid || '')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(-4)
            .toLowerCase() || String(Math.floor(100 + Math.random() * 900));
        const fallbackCandidate = `${cleaned.slice(0, 24)}_${uidSuffix}`;
        userEditedNickRef.current = true;
        setNickname(fallbackCandidate);
        return;
      }

      setNickStatus({ available: res.available, reason: res.reason });
      setIsCheckingNick(false);
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [nickname, currentUser.uid]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const cleaned = sanitizeNicknameInput(nickname) || nickname.trim().replace(/^@+/, '').trim();
    setError(null);

    if (cleaned.length < 2) {
      setError('Please enter a nickname with at least 2 characters.');
      return;
    }

    setIsSaving(true);
    try {
      const check = await checkNicknameAvailability(cleaned, currentUser.uid, effectiveEmail);
      if (!check.available) {
        if (isMountedRef.current) {
          setNickStatus({ available: false, reason: check.reason });
          setError(check.reason || 'This nickname is already used by another user.');
          setIsSaving(false);
        }
        return;
      }

      const resolvedReferral =
        selectedReferral === 'Other'
          ? customReferral.trim() || 'Other (MSU Student Referral)'
          : selectedReferral;

      await onCompleteOnboarding({
        nickname: cleaned,
        campus: campus || MSU_CAMPUSES[0],
        bio: bio.trim().slice(0, 280),
        defaultAnonymous,
        referralSource: resolvedReferral.slice(0, 160),
      });
    } catch (err) {
      if (isMountedRef.current) {
        let friendlyMessage = err instanceof Error ? err.message : 'Could not save profile.';
        if (friendlyMessage.startsWith('{')) {
          try {
            const parsed = JSON.parse(friendlyMessage) as { error?: string };
            if (parsed?.error) {
              friendlyMessage = parsed.error;
            }
          } catch {
            // keep original message
          }
        }
        setError(friendlyMessage);
        setIsSaving(false);
      }
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1F1617] flex items-center justify-center p-4 relative">
      {/* Signing Up Loading Animation Overlay */}
      <AnimatePresence>
        {isSaving && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#7B1113]/95 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white"
          >
            <div className="relative w-20 h-20 flex items-center justify-center mb-5">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37]"
              />
              <span className="font-display text-2xl text-[#D4AF37]">ONE</span>
            </div>
            <h2 className="font-display text-2xl text-white">Setting up your profile</h2>
            <p className="text-xs text-[#F7EFE0]/80 mt-1">
              Saving @{nickname.trim()} with your{' '}
              {assignedBadge === 'developer' ? 'Developer' : 'Verified'}{' '}
              badge...
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white border border-[#E8DFDC] rounded-2xl overflow-hidden shadow-xs"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />

        <div className="p-6 sm:p-8 space-y-6">
          <div className="space-y-1">
            <h1 className="font-display text-3xl text-[#7B1113]">Choose Your Nickname</h1>
            <p className="text-xs text-[#6E5D5F]">
              Only your unique nickname and badge are shown on your posts.
            </p>
          </div>

          {/* Gmail Profile Preview with Assigned Badge */}
          <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center gap-3">
            <img
              src={
                currentUser.photoURL && !avatarFailed
                  ? currentUser.photoURL
                  : studentAvatarFallback
              }
              alt={currentUser.displayName || 'Gmail Profile'}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="w-11 h-11 rounded-full object-cover border-2 border-[#D4AF37] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-sm font-semibold text-[#1F1617] truncate">
                  @{nickname.trim() || 'your_nickname'}
                </span>
                <UserBadgeTag
                  badge={assignedBadge}
                  isAnonymous={defaultAnonymous}
                  size="sm"
                />
              </div>
              <p className="text-xs text-[#6E5D5F] truncate">
                {currentUser.displayName || 'MSU Student'}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Referral Source Question Sent to Admin Dashboards */}
            <div className="p-3.5 rounded-xl bg-[#FAF8F5] border-2 border-[#D4AF37]/70 space-y-2.5">
              <label className="block text-xs font-bold text-[#7B1113] leading-snug">
                Hi MSUan before you proceed where did you find this app ?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {REFERRAL_SOURCES.map((source) => {
                  const isChosen = selectedReferral === source;
                  return (
                    <button
                      key={source}
                      type="button"
                      onClick={() => setSelectedReferral(source)}
                      className={`px-2.5 py-2 rounded-lg text-xs font-medium text-left border transition-all cursor-pointer ${
                        isChosen
                          ? 'bg-[#7B1113] text-white border-[#D4AF37] font-semibold shadow-2xs'
                          : 'bg-white text-[#1F1617] border-[#E8DFDC] hover:bg-[#F2ECE9]'
                      }`}
                    >
                      {source}
                    </button>
                  );
                })}
              </div>
              {selectedReferral === 'Other' && (
                <input
                  type="text"
                  value={customReferral}
                  onChange={(e) => setCustomReferral(e.target.value)}
                  maxLength={140}
                  placeholder="Tell us where you heard about ONE..."
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-lg focus:outline-none focus:border-[#7B1113]"
                  required
                />
              )}
              <p className="text-[11px] text-[#6E5D5F]">
                Your response is sent directly to the Developer &amp; Admin Dashboard.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1.5">
                Unique Nickname
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7B1113] font-mono text-sm">
                  @
                </span>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => {
                    userEditedNickRef.current = true;
                    setNickname(e.target.value.replace(/^@+/, ''));
                    setError(null);
                  }}
                  minLength={2}
                  maxLength={32}
                  placeholder="your_nickname"
                  className={`w-full pl-8 pr-4 py-2.5 text-sm border rounded-xl focus:outline-none font-medium ${
                    nickStatus && !nickStatus.available
                      ? 'border-rose-400 focus:border-rose-600 bg-rose-50/30'
                      : 'border-[#E8DFDC] focus:border-[#7B1113]'
                  }`}
                  required
                />
              </div>

              {/* Real-time Nickname Uniqueness Status */}
              {isCheckingNick ? (
                <p className="mt-1.5 text-xs text-[#6E5D5F]">Checking nickname availability...</p>
              ) : nickStatus ? (
                <p
                  className={`mt-1.5 text-xs flex items-center gap-1.5 font-medium ${
                    nickStatus.available ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {nickStatus.available ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>@{nickname.trim()} is available!</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{nickStatus.reason}</span>
                    </>
                  )}
                </p>
              ) : null}

              <p className="mt-2 text-xs text-[#6E5D5F] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#7B1113] shrink-0" />
                <span>You can change your nickname once every 2 weeks (14 days).</span>
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1.5">Campus</label>
              <select
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-[#E8DFDC] rounded-xl bg-white focus:outline-none focus:border-[#7B1113]"
              >
                {MSU_CAMPUSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1.5">
                Short Bio (Optional)
              </label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={140}
                placeholder="e.g. MSU Main Campus"
                className="w-full px-3.5 py-2.5 text-sm border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
              />
            </div>

            <button
              type="button"
              onClick={() => setDefaultAnonymous((prev) => !prev)}
              className={`w-full flex items-center justify-between gap-3 p-3 rounded-xl border transition-all text-left ${
                defaultAnonymous
                  ? 'bg-[#7B1113] text-white border-[#D4AF37]'
                  : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                {defaultAnonymous ? (
                  <EyeOff className="w-4 h-4 text-[#D4AF37] shrink-0" />
                ) : (
                  <Eye className="w-4 h-4 text-[#7B1113] shrink-0" />
                )}
                <span className="text-xs font-medium">
                  Post as <strong>Anonymous</strong> by default
                </span>
              </div>
              <span className="text-[11px] font-mono">
                {defaultAnonymous ? 'ON' : 'OFF'}
              </span>
            </button>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                isSaving ||
                nickname.trim().replace(/^@+/, '').trim().length < 2 ||
                (nickStatus !== null && !nickStatus.available)
              }
              className="w-full py-3 px-5 bg-[#7B1113] hover:bg-[#580B0C] disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[46px] border border-[#D4AF37]/40 cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-[#D4AF37]" />
              <span>{isSaving ? 'Creating Account...' : 'Continue to ONE'}</span>
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
