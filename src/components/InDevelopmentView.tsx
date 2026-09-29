import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ExternalLink,
  Sparkles,
  Copy,
  Check,
} from 'lucide-react';

interface InDevelopmentViewProps {
  onEnterPreview?: () => void;
  onDeveloperSignIn?: () => void;
  isLoggedIn?: boolean;
  currentUserEmail?: string | null;
  siteName?: string;
}

const FACEBOOK_PAGE_URL = 'https://www.facebook.com/ONEWall2026';

export const InDevelopmentView: React.FC<InDevelopmentViewProps> = ({
  siteName = 'ONE',
}) => {
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(FACEBOOK_PAGE_URL);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      const tempInput = document.createElement('input');
      tempInput.value = FACEBOOK_PAGE_URL;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  return (
    <div className="h-screen h-dvh w-screen w-full bg-[#FAF8F5] text-[#1F1617] flex flex-col justify-between overflow-hidden relative selection:bg-[#7B1113] selection:text-white">
      {/* Ambient Fullscreen Background Glows */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#7B1113]/8 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-[#D4AF37]/12 blur-3xl pointer-events-none" />

      {/* 1. Full-Width Top Header Bar */}
      <header className="w-full shrink-0 border-b border-[#E8DFDC] bg-white/70 backdrop-blur-md z-10">
        <div className="h-1 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#7B1113] border border-[#D4AF37] flex items-center justify-center shadow-xs">
              <span className="font-display text-sm font-bold text-[#D4AF37]">
                {siteName}
              </span>
            </div>
            <div>
              <span className="text-xs sm:text-sm font-bold tracking-tight text-[#1F1617]">
                ONE
              </span>
              <span className="hidden sm:inline text-xs text-[#6E5D5F] ml-2 pl-2 border-l border-[#E8DFDC]">
                Mindanao State University
              </span>
            </div>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#7B1113]/10 border border-[#7B1113]/20 text-[#7B1113] text-[11px] font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#D4AF37] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7B1113]" />
            </span>
            <span>45% Done</span>
          </div>
        </div>
      </header>

      {/* 2. Fullscreen Central Content Hero */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-2 sm:py-4 flex flex-col items-center justify-center gap-3 sm:gap-4.5 min-h-0 z-10">
        {/* Animated Brand Emblem */}
        <motion.div
          animate={{
            y: [0, -4, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="relative group select-none cursor-default shrink-0"
        >
          {/* Outer Golden Aura Glow Pulse */}
          <motion.div
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.7, 0.3],
            }}
            transition={{
              duration: 2.6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute -inset-2 rounded-3xl bg-[#D4AF37]/35 blur-lg pointer-events-none"
          />

          {/* Main ONE Tile */}
          <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-b from-[#7B1113] to-[#580B0C] border-2 sm:border-[2.5px] border-[#D4AF37] flex items-center justify-center shadow-xl shadow-[#7B1113]/25 overflow-hidden">
            {/* Diagonal Light Shimmer Sweep across the badge */}
            <motion.div
              animate={{
                x: ['-150%', '220%'],
              }}
              transition={{
                repeat: Infinity,
                duration: 2.6,
                ease: 'easeInOut',
                repeatDelay: 0.8,
              }}
              className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/35 to-transparent -skew-x-12 pointer-events-none"
            />

            {/* Golden ONE Logo Text */}
            <motion.span
              animate={{
                scale: [1, 1.04, 1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#D4AF37] drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]"
            >
              {siteName}
            </motion.span>
          </div>
        </motion.div>

        {/* Headings */}
        <div className="text-center space-y-1 sm:space-y-1.5 shrink-0">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl text-[#7B1113] font-bold tracking-tight">
            Website is Under Development
          </h1>
          <p className="text-xs sm:text-sm text-[#6E5D5F] max-w-md mx-auto leading-relaxed">
            An online community and student wall for Mindanao State University.
          </p>
        </div>

        {/* Progress Module */}
        <div className="w-full bg-white/90 backdrop-blur-sm border border-[#E8DFDC] rounded-2xl p-3.5 sm:p-4 shadow-xs text-left space-y-2 shrink-0">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[#1F1617] flex items-center gap-1.5 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span>Progress</span>
            </span>
            <span className="font-mono text-[#7B1113] font-bold text-xs bg-[#7B1113]/10 px-2.5 py-0.5 rounded-md">
              45% Done
            </span>
          </div>

          {/* Continuous Animating Progress Bar */}
          <div className="w-full h-3 sm:h-3.5 bg-[#E8DFDC] rounded-full overflow-hidden p-0.5 relative shadow-inner">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: '45%',
                backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
              }}
              transition={{
                width: { duration: 1.2, ease: 'easeOut' },
                backgroundPosition: { repeat: Infinity, duration: 4, ease: 'linear' },
              }}
              style={{
                backgroundImage:
                  'linear-gradient(90deg, #7B1113 0%, #B84A28 20%, #D4AF37 50%, #B84A28 80%, #7B1113 100%)',
                backgroundSize: '250% 100%',
              }}
              className="h-full rounded-full relative overflow-hidden shadow-[0_0_12px_rgba(212,175,55,0.45)]"
            >
              {/* Continuous Shimmer Sweep */}
              <motion.div
                className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/60 to-transparent pointer-events-none"
                animate={{ x: ['-100%', '200%'] }}
                transition={{
                  repeat: Infinity,
                  duration: 1.8,
                  ease: 'easeInOut',
                  repeatDelay: 0.3,
                }}
              />

              {/* Pulsing Highlight Spark at 45% Edge */}
              <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/40 blur-[1px] animate-pulse" />
            </motion.div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#6E5D5F] font-mono leading-none pt-0.5">
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Facebook Page Module */}
        <div className="w-full bg-white/90 backdrop-blur-sm border border-[#1877F2]/30 rounded-2xl p-3.5 sm:p-4 shadow-xs text-center space-y-2.5 shrink-0">
          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 rounded-full bg-[#1877F2] text-white flex items-center justify-center shrink-0 shadow-2xs">
              <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
            <h2 className="text-xs font-bold text-[#1F1617] uppercase tracking-wide">
              Follow Our Facebook Page
            </h2>
          </div>

          <p className="text-[11px] text-[#6E5D5F] leading-snug">
            While you wait, please check our Facebook page for news and updates.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href={FACEBOOK_PAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 px-4 bg-[#1877F2] hover:bg-[#166fe5] text-white font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer group"
            >
              <svg className="w-3.5 h-3.5 fill-current shrink-0" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span>Visit Our Facebook Page</span>
              <ExternalLink className="w-3 h-3 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0" />
            </a>

            <button
              type="button"
              onClick={handleCopyLink}
              className="py-2.5 px-3 bg-white hover:bg-[#FAF8F5] text-[#6E5D5F] hover:text-[#1F1617] border border-[#E8DFDC] rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              title="Copy link"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="text-emerald-700 font-semibold text-[11px]">Link Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-[11px]">Copy Link</span>
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* 3. Full-Width Footer */}
      <footer className="w-full shrink-0 border-t border-[#E8DFDC] bg-white/70 backdrop-blur-md py-2.5 px-4 text-center z-10">
        <p className="text-[11px] text-[#6E5D5F]">
          &copy; {new Date().getFullYear()} ONE — ONEWall. All rights reserved.
        </p>
      </footer>
    </div>
  );
};
