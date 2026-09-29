import React from 'react';
import { motion } from 'motion/react';
import {
  ShieldCheck,
  Users,
  EyeOff,
  BookOpen,
  MessageCircle,
  Sparkles,
  MapPin,
  Heart,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { MSU_CAMPUSES } from '../types';

interface AboutViewProps {
  onGoToFeed?: () => void;
  onGoToSuggestions?: () => void;
  onGoToTerms?: () => void;
}

export const AboutView: React.FC<AboutViewProps> = ({
  onGoToFeed,
  onGoToSuggestions,
  onGoToTerms,
}) => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8 dashboard-enter-anim">
      {/* Top Dashboard Navigation Bar */}
      {onGoToFeed && (
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#7B1113] text-[#D4AF37] border border-[#D4AF37] flex items-center justify-center shrink-0">
              <span className="font-display text-sm font-bold">ONE</span>
            </div>
            <div>
              <h2 className="font-display text-lg text-[#7B1113] leading-none">
                About Us Dashboard
              </h2>
              <p className="text-[11px] text-[#6E5D5F] mt-0.5">
                Mission, verified MSU campus network &amp; student features
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGoToFeed}
            className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Student Wall</span>
          </button>
        </div>
      )}

      {/* Hero Banner in MSU Maroon & Gold */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7B1113] via-[#580B0C] to-[#3B0708] text-white p-6 sm:p-10 border border-[#D4AF37]/40 shadow-sm"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#D4AF37]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Mindanao State University System</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#580B0C] border-2 border-[#D4AF37] flex items-center justify-center shrink-0 shadow-md">
              <span className="font-display text-2xl text-[#D4AF37] tracking-tight">ONE</span>
            </div>
            <div>
              <h1 className="font-display text-2xl sm:text-3xl text-white">
                About ONE · Student Wall · MSUan
              </h1>
              <p className="text-xs sm:text-sm text-[#F7EFE0]/80">
                Student Wall · MSUan — The authentic digital student square for Mindanao State University.
              </p>
            </div>
          </div>

          <p className="text-sm sm:text-base text-[#F7EFE0]/90 leading-relaxed max-w-2xl break-words">
            <strong>ONE</strong> was created by MSUans for MSUans—providing an unfiltered,
            verified, and respectful community for student voices, academic struggles, campus rants,
            lecture materials, and genuine peer connections across all MSU campuses.
          </p>

          <div className="pt-2 flex flex-wrap gap-2.5">
            {onGoToFeed && (
              <button
                type="button"
                onClick={onGoToFeed}
                className="px-4 py-2 bg-[#D4AF37] hover:bg-[#c49f2e] text-[#1F1617] rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>Explore Student Wall</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
            {onGoToSuggestions && (
              <button
                type="button"
                onClick={onGoToSuggestions}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>💡 Open Suggestion Box</span>
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Core Pillars Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-[#7B1113]/10 text-[#7B1113] border border-[#7B1113]/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="font-display text-lg text-[#1F1617]">Verified MSU Email Only</h3>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words">
            Access is exclusive to students with official MSU institutional emails (<span className="font-mono text-[#7B1113]">@s.msumain.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msumain.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msuiit.edu.ph</span>, <span className="font-mono text-[#7B1113]">@g.msuiit.edu.ph</span>, <span className="font-mono text-[#7B1113]">@sulat.msuiit.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msugensan.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msutawi-tawi.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msunaawan.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msumaguindanao.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msusulu.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msubuug.edu.ph</span>).
          </p>
        </div>

        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-[#D4AF37]/15 text-[#7B1113] border border-[#D4AF37]/40 flex items-center justify-center">
            <EyeOff className="w-5 h-5" />
          </div>
          <h3 className="font-display text-lg text-[#1F1617]">Optional Anonymity</h3>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words">
            Post and comment openly as your unique verified <span className="font-mono">@nickname</span>, or switch on 1-click Anonymity per post/comment to speak your truth without fear.
          </p>
        </div>

        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center">
            <MessageCircle className="w-5 h-5" />
          </div>
          <h3 className="font-display text-lg text-[#1F1617]">Unlimited Peer Replies</h3>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words">
            Reply to comments over and over without artificial restrictions. Discuss, debate, and support classmates directly on any post or thread.
          </p>
        </div>

        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <h3 className="font-display text-lg text-[#1F1617]">Study Reviewers & Files</h3>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words">
            Share and download study reviewers, lecture notes, PDFs, PowerPoint slides, Word documents, and spreadsheets across colleges.
          </p>
        </div>

        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="font-display text-lg text-[#1F1617]">1-on-1 Student Chat</h3>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words">
            Directly connect and chat privately with fellow verified students who post publicly, expanding campus friendships and academic groups.
          </p>
        </div>

        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
            <Heart className="w-5 h-5 text-[#7B1113]" />
          </div>
          <h3 className="font-display text-lg text-[#1F1617]">Campus Community Spirit</h3>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words">
            Built to celebrate Mindanao State University traditions, campus life in Marawi and regional campuses, and foster solidarity among students.
          </p>
        </div>
      </div>

      {/* MSU Campuses Supported */}
      <div className="bg-white border border-[#E8DFDC] rounded-2xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-[#7B1113]" />
          <h2 className="font-display text-xl text-[#7B1113]">MSU System Campuses</h2>
        </div>
        <p className="text-xs text-[#6E5D5F]">
          Verified students from across the Mindanao State University network participate in ONE:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-1">
          {MSU_CAMPUSES.map((campus) => (
            <div
              key={campus}
              className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] text-xs font-medium text-[#1F1617] flex items-center gap-2"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] shrink-0" />
              <span className="truncate">{campus}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Community Guidelines Reference */}
      <div className="bg-[#FAF8F5] border border-[#E8DFDC] rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#1F1617]">Need to review our standards?</h3>
          <p className="text-xs text-[#6E5D5F] mt-0.5">
            Read our Terms of Service & Community Guidelines for acceptable behavior on the Student Wall.
          </p>
        </div>
        {onGoToTerms && (
          <button
            type="button"
            onClick={onGoToTerms}
            className="px-4 py-2 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
          >
            View Terms & Guidelines
          </button>
        )}
      </div>
    </div>
  );
};
