import React from 'react';
import { motion } from 'motion/react';
import {
  FileText,
  ShieldAlert,
  CheckCircle2,
  Lock,
  AlertTriangle,
  Scale,
  Users,
  ArrowLeft,
} from 'lucide-react';

interface TermsViewProps {
  onGoToFeed?: () => void;
  onGoToSuggestions?: () => void;
  onGoToAbout?: () => void;
}

export const TermsView: React.FC<TermsViewProps> = ({
  onGoToFeed,
  onGoToSuggestions,
  onGoToAbout,
}) => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8 dashboard-enter-anim">
      {/* Header Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-[#E8DFDC] rounded-2xl p-6 sm:p-8 space-y-3 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B1113]/10 text-[#7B1113] border border-[#7B1113]/20 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-2xl text-[#7B1113]">Terms of Service &amp; Guidelines</h1>
              <p className="text-xs text-[#6E5D5F]">
                Rules for participation, respectful discourse, and student safety on ONE.
              </p>
            </div>
          </div>
          {onGoToFeed && (
            <button
              type="button"
              onClick={onGoToFeed}
              className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Student Wall</span>
            </button>
          )}
        </div>

        <p className="text-xs sm:text-sm text-[#1F1617] leading-relaxed break-words pt-1">
          By accessing or using <strong>ONE (Student Wall · MSUan)</strong>, you agree to comply with and be bound by the following Terms of Service and Community Standards. Please read them carefully.
        </p>

        <div className="flex flex-wrap gap-2 text-[11px] text-[#6E5D5F] pt-1 border-t border-[#F2ECE9]">
          <span>Effective: Academic Year 2026–2027</span>
          <span>·</span>
          <span>Applies to: All verified official MSU institutional email users</span>
        </div>
      </motion.div>

      {/* Sections Grid */}
      <div className="space-y-4">
        {/* 1. Verified Access & Eligibility */}
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1F1617]">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>1. Eligibility & Verified Institutional Access</span>
          </div>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words pl-6">
            ONE is solely accessible to currently enrolled students, faculty, or alumni with valid Mindanao State University institutional email addresses (<span className="font-mono text-[#7B1113]">@s.msumain.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msumain.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msuiit.edu.ph</span>, <span className="font-mono text-[#7B1113]">@g.msuiit.edu.ph</span>, <span className="font-mono text-[#7B1113]">@sulat.msuiit.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msugensan.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msutawi-tawi.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msunaawan.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msumaguindanao.edu.ph</span>, <span className="font-mono text-[#7B1113]">@msusulu.edu.ph</span>, and <span className="font-mono text-[#7B1113]">@msubuug.edu.ph</span>). Creating accounts with generic <span className="font-mono">.edu.ph</span> or non-MSU emails is not permitted.
          </p>
        </div>

        {/* 2. Community Standards & Code of Conduct */}
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-3 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1F1617]">
            <Users className="w-4 h-4 text-[#7B1113] shrink-0" />
            <span>2. Community Code of Conduct</span>
          </div>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words pl-6">
            We celebrate spirited discussions, student humor, academic rants, and constructive criticism. However, the following behaviors are strictly prohibited:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pl-6">
            <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-100 text-xs text-rose-900 space-y-1">
              <span className="font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                Zero Harassment & Threats
              </span>
              <p className="text-[11px] text-rose-800">
                Threats of physical harm, hate speech, bullying, religious slurs, or harassment targeting individual students or faculty.
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-100 text-xs text-rose-900 space-y-1">
              <span className="font-semibold flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-rose-600" />
                No Doxxing or Private PII
              </span>
              <p className="text-[11px] text-rose-800">
                Never post private phone numbers, home addresses, personal student ID records, or non-public personal credentials.
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-100 text-xs text-rose-900 space-y-1">
              <span className="font-semibold flex items-center gap-1">
                <Scale className="w-3.5 h-3.5 text-rose-600" />
                Academic Integrity
              </span>
              <p className="text-[11px] text-rose-800">
                Sharing lecture reviewers and study notes is encouraged. Leaking active examination answer keys or proctored exam questionnaires is prohibited.
              </p>
            </div>

            <div className="p-2.5 rounded-xl bg-rose-50/60 border border-rose-100 text-xs text-rose-900 space-y-1">
              <span className="font-semibold flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                Non-Consensual Media
              </span>
              <p className="text-[11px] text-rose-800">
                Uploading intimate photos, videos recorded without consent, or malicious visual content is grounds for immediate ban.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Anonymity Privileges & Account Responsibility */}
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1F1617]">
            <Lock className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>3. Anonymity & Account Accountability</span>
          </div>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words pl-6">
            The optional anonymous posting feature protects your identity from other students and faculty. However, anonymity does not shield criminal acts, cyber-libel, or threats of violence under applicable Philippine cybercrime laws (RA 10175). Users remain responsible for content generated under their sessions.
          </p>
        </div>

        {/* 4. Intellectual Property & Shared Materials */}
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1F1617]">
            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
            <span>4. Shared Documents & Files</span>
          </div>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words pl-6">
            Files uploaded to the Shared Files repository (PDFs, Word docs, PowerPoint presentations, Excel spreadsheets, lecture photos) must be for academic, review, or educational campus purposes. You retain ownership of your original notes while granting peer students read/download access for study collaboration.
          </p>
        </div>

        {/* 5. Moderation & Termination */}
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-2.5 shadow-xs">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1F1617]">
            <Scale className="w-4 h-4 text-[#7B1113] shrink-0" />
            <span>5. Moderation, Content Removal, and Account Deletion</span>
          </div>
          <p className="text-xs text-[#6E5D5F] leading-relaxed break-words pl-6">
            ONE maintains student safety through community reporting and automated safeguards. Posts or comments violating these guidelines will be removed. Users may also delete their own account and profile data permanently at any time through the Settings panel.
          </p>
        </div>
      </div>

      {/* Suggestion Box Link */}
      <div className="bg-[#FAF8F5] border border-[#E8DFDC] rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-[#1F1617]">Have feedback or proposed policy changes?</h3>
          <p className="text-xs text-[#6E5D5F] mt-0.5">
            Submit your thoughts to our Suggestion Box to help improve ONE for all MSUans.
          </p>
        </div>
        {onGoToSuggestions && (
          <button
            type="button"
            onClick={onGoToSuggestions}
            className="px-4 py-2 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
          >
            Open Suggestion Box
          </button>
        )}
      </div>
    </div>
  );
};
