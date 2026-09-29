import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Image as ImageIcon,
  Video,
  FileText,
  FileSpreadsheet,
  Presentation,
  File as FileIcon,
  EyeOff,
  Eye,
  X,
  Send,
  CheckCircle2,
  ShieldCheck,
  BookOpen,
  Upload,
} from 'lucide-react';
import { AttachmentType, POST_CATEGORIES, PostCategory, UserPublicProfile } from '../types';
import { resolveUserBadge } from '../firebase';
import {
  formatFileSize,
  getAttachmentMeta,
  ProcessedAttachment,
  processUploadedFile,
} from '../utils/fileHelpers';
import { UserBadgeTag } from './UserBadgeTag';
import { PdfReviewerViewer } from './PdfReviewerViewer';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';

interface PostComposerProps {
  userProfile: UserPublicProfile;
  onCreatePost: (payload: {
    title: string;
    content: string;
    category: PostCategory;
    isAnonymous: boolean;
    attachment: ProcessedAttachment | null;
  }) => Promise<void>;
  onCloseMobileSheet?: () => void;
}

const UPLOAD_BUTTONS: {
  type: AttachmentType;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { type: 'photo', label: 'Photo', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'pdf', label: 'Upload Files', icon: Upload },
];

export const PostComposer: React.FC<PostComposerProps> = ({
  userProfile,
  onCreatePost,
  onCloseMobileSheet,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<PostCategory>('Academic Rant');
  const [isAnonymous, setIsAnonymous] = useState<boolean>(userProfile.defaultAnonymous);
  const [anonTransitionBanner, setAnonTransitionBanner] = useState<'on' | 'off' | null>(null);
  const [attachment, setAttachment] = useState<ProcessedAttachment | null>(null);
  const [showPdfDraftPreview, setShowPdfDraftPreview] = useState(false);
  const [activeUploadTarget, setActiveUploadTarget] = useState<AttachmentType>('none');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justPosted, setJustPosted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerTimerRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setIsAnonymous(userProfile.defaultAnonymous);
  }, [userProfile.defaultAnonymous]);

  // Auto-expand textarea height as user types so full post content is always visible without overlapping
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(150, el.scrollHeight)}px`;
  }, [content]);

  useEffect(() => {
    return () => {
      if (bannerTimerRef.current) {
        window.clearTimeout(bannerTimerRef.current);
      }
    };
  }, []);

  const handleToggleAnonymous = () => {
    const nextState = !isAnonymous;
    setIsAnonymous(nextState);
    setAnonTransitionBanner(nextState ? 'on' : 'off');
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
    }
    bannerTimerRef.current = window.setTimeout(() => {
      setAnonTransitionBanner(null);
    }, 2400);
  };

  const handleTriggerFileUpload = (type: AttachmentType) => {
    setActiveUploadTarget(type);
    setError(null);
    if (fileInputRef.current) {
      if (type === 'pdf') {
        fileInputRef.current.accept =
          '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';
      } else {
        const meta = getAttachmentMeta(type);
        fileInputRef.current.accept = meta.acceptAttr;
      }
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessingFile(true);
    setError(null);
    try {
      const processed = await processUploadedFile(file, activeUploadTarget);
      setAttachment(processed);
      setShowPdfDraftPreview(false);
      if (
        ['pdf', 'word', 'excel', 'ppt'].includes(processed.attachmentType) &&
        category === 'Academic Rant'
      ) {
        setCategory('Study Materials');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach file.');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedContent = content.trim();
    if (!trimmedContent && !attachment) {
      setError('Please write something or attach a photo, video, or file before posting.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await new Promise((r) => setTimeout(r, 300));
      await onCreatePost({
        title: title.trim().slice(0, 160),
        content: trimmedContent.slice(0, 5000),
        category,
        isAnonymous,
        attachment,
      });
      setTitle('');
      setContent('');
      setAttachment(null);
      setShowPdfDraftPreview(false);
      setIsSubmitting(false);
      setJustPosted(true);
      setTimeout(() => {
        setJustPosted(false);
        if (onCloseMobileSheet) {
          onCloseMobileSheet();
        }
      }, 650);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish post.');
      setIsSubmitting(false);
    }
  };

  const attachmentMeta = attachment ? getAttachmentMeta(attachment.attachmentType) : null;
  const userBadge = resolveUserBadge(userProfile.badge);

  return (
    <form
      onSubmit={handleSubmit}
      className={`relative border rounded-2xl p-4 sm:p-5 space-y-3.5 transition-colors duration-300 ${
        isAnonymous
          ? 'bg-[#FDFBF9] border-[#7B1113]/35'
          : 'bg-white border-[#E8DFDC]'
      }`}
    >
      {/* Top Gold & Maroon Accent Line */}
      <div className="absolute top-0 left-3 right-3 h-1 rounded-b-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />

      {/* Uploading & Posting Animation Overlay */}
      <AnimatePresence>
        {(isProcessingFile || isSubmitting || justPosted) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center rounded-2xl"
          >
            {justPosted ? (
              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex flex-col items-center space-y-2.5"
              >
                <div className="w-12 h-12 rounded-full bg-[#7B1113] text-[#D4AF37] flex items-center justify-center shadow-md border-2 border-[#D4AF37]">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="font-display text-2xl text-[#7B1113]">Posted to ONE</p>
                <p className="text-xs text-[#6E5D5F]">Your post is now live on the Student Wall</p>
              </motion.div>
            ) : isProcessingFile ? (
              <div className="flex flex-col items-center space-y-3.5 max-w-xs w-full">
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 rounded-full border-3 border-[#7B1113]/15 border-t-[#7B1113] border-r-[#D4AF37]"
                  />
                  <motion.div
                    animate={{ y: [2, -3, 2] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-9 h-9 rounded-full bg-[#7B1113] text-[#D4AF37] flex items-center justify-center shadow-xs"
                  >
                    <Upload className="w-4 h-4" />
                  </motion.div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#7B1113]">
                    Uploading {activeUploadTarget !== 'none' ? activeUploadTarget.toUpperCase() : 'File'}...
                  </p>
                  <p className="text-[11px] text-[#6E5D5F]">
                    Optimizing &amp; preparing attachment for instant preview
                  </p>
                </div>
                <div className="w-48 h-1.5 bg-[#F2ECE9] rounded-full overflow-hidden border border-[#E8DFDC]">
                  <motion.div
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-full h-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center space-y-3.5 max-w-xs w-full">
                <div className="relative w-14 h-14 flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                    className="absolute inset-0 rounded-full border-3 border-[#7B1113]/20 border-t-[#7B1113] border-r-[#D4AF37]"
                  />
                  <Send className="w-5 h-5 text-[#7B1113]" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-[#7B1113]">Publishing your post...</p>
                  <p className="text-[11px] text-[#6E5D5F]">Syncing to all MSUans in real time</p>
                </div>
                <div className="w-48 h-1.5 bg-[#F2ECE9] rounded-full overflow-hidden border border-[#E8DFDC]">
                  <motion.div
                    initial={{ width: '15%' }}
                    animate={{ width: '95%' }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]"
                  />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated Anonymous Transition Banner */}
      <AnimatePresence mode="wait">
        {anonTransitionBanner && (
          <motion.div
            key={anonTransitionBanner}
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25 }}
            className={`px-3.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-medium ${
              anonTransitionBanner === 'on'
                ? 'bg-[#7B1113] text-white border-[#D4AF37]/50'
                : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC]'
            }`}
          >
            <div className="flex items-center gap-2">
              {anonTransitionBanner === 'on' ? (
                <EyeOff className="w-4 h-4 text-[#D4AF37] shrink-0" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#7B1113] shrink-0" />
              )}
              <span>
                {anonTransitionBanner === 'on'
                  ? 'Anonymous Mode is now ON — Your nickname & photo are hidden on this post.'
                  : `Anonymous Mode is OFF — Posting as @${userProfile.nickname}.`}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Row: User Nickname + Badge + Anonymous Switch + Topic Picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-[#F2ECE9] pt-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={isAnonymous ? 'anon-identity' : 'public-identity'}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 6 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2.5 min-w-0 w-full sm:w-auto"
          >
            {isAnonymous ? (
              <motion.div
                initial={{ rotate: -15, scale: 0.85 }}
                animate={{ rotate: 0, scale: 1 }}
                className="w-9 h-9 rounded-full bg-[#7B1113] text-[#D4AF37] flex items-center justify-center shrink-0 border border-[#D4AF37]"
              >
                <EyeOff className="w-4 h-4" />
              </motion.div>
            ) : (
              <img
                src={
                  userProfile.photoURL && !avatarFailed
                    ? userProfile.photoURL
                    : studentAvatarFallback
                }
                alt={userProfile.nickname}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-9 h-9 rounded-full object-cover border border-[#D4AF37] shrink-0"
              />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-sm min-w-0 max-w-full">
                <span className="font-semibold text-[#1F1617] truncate">
                  {isAnonymous ? 'Anonymous Student' : `@${userProfile.nickname}`}
                </span>
                <UserBadgeTag
                  badge={isAnonymous ? 'verified' : userBadge}
                  isAnonymous={isAnonymous}
                  size="sm"
                />
              </div>
              <div className="text-xs text-[#6E5D5F] truncate">
                {isAnonymous ? 'Identity hidden · Badge shown in feed' : 'Only your nickname & badge are shown'}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={handleToggleAnonymous}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 whitespace-nowrap min-h-[36px] cursor-pointer ${
              isAnonymous
                ? 'bg-[#7B1113] text-white border-[#D4AF37] shadow-xs'
                : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC] hover:bg-[#F2ECE9]'
            }`}
          >
            {isAnonymous ? (
              <EyeOff className="w-3.5 h-3.5 text-[#D4AF37]" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            <span>{isAnonymous ? 'Anonymous: ON' : 'Anonymous: OFF'}</span>
          </motion.button>

          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as PostCategory)}
            aria-label="Topic"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FAF8F5] border border-[#E8DFDC] text-[#1F1617] focus:outline-none focus:border-[#7B1113] min-h-[36px] max-w-full"
          >
            {POST_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Title & Rant Inputs — Auto-expanding full view when typing on mobile */}
      <div className="space-y-2.5">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          placeholder="Title (optional)"
          className="w-full px-3.5 py-2 text-sm font-medium text-[#1F1617] bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113] placeholder:text-[#9E8E90]"
        />

        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          maxLength={5000}
          placeholder="Write your rant, situation, or share school notes (optional when uploading a photo/video)..."
          className="w-full min-h-[150px] px-3.5 py-2.5 text-sm text-[#1F1617] bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113] placeholder:text-[#9E8E90] resize-y leading-relaxed overflow-y-auto"
        />
        <div className="flex items-center justify-between text-[11px] font-mono text-[#6E5D5F] px-1">
          <span>Full post view auto-expands as you type</span>
          <span>{content.length}/5000</span>
        </div>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Upload file"
      />

      {/* Selected File Preview */}
      {attachment && attachmentMeta && (
        <div className="p-3 rounded-xl border border-[#D4AF37]/50 bg-[#F7EFE0]/40 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {attachment.attachmentType === 'photo' ? (
                <img
                  src={attachment.previewUrl || attachment.attachmentDataUrl}
                  alt={attachment.attachmentName}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-lg object-cover border border-[#E8DFDC] shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[#7B1113] text-[#D4AF37] flex items-center justify-center font-mono text-xs font-semibold shrink-0">
                  {attachmentMeta.extBadge}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#1F1617] truncate">
                  {attachment.attachmentName}
                </p>
                <p className="text-xs text-[#6E5D5F] font-mono tabular-nums">
                  {attachmentMeta.label} · {formatFileSize(attachment.attachmentSize)}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {attachment.attachmentType === 'pdf' && (
                <button
                  type="button"
                  onClick={() => setShowPdfDraftPreview((prev) => !prev)}
                  className="px-2.5 py-1.5 bg-white hover:bg-[#F2ECE9] text-[#7B1113] border border-[#7B1113]/30 rounded-lg text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>{showPdfDraftPreview ? 'Hide Preview' : 'Preview PDF'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setAttachment(null);
                  setShowPdfDraftPreview(false);
                }}
                className="p-2 text-[#6E5D5F] hover:text-[#7B1113] rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                title="Remove file"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {attachment.attachmentType === 'pdf' && showPdfDraftPreview && (
            <div className="pt-1">
              <PdfReviewerViewer
                rawUrl={attachment.previewUrl || attachment.attachmentDataUrl}
                resolvedUrl={attachment.previewUrl || attachment.attachmentDataUrl}
                fileName={attachment.attachmentName}
                fileSize={attachment.attachmentSize}
              />
            </div>
          )}

          {attachment.attachmentType === 'photo' &&
            (attachment.previewUrl || attachment.attachmentDataUrl) && (
              <div className="rounded-xl overflow-hidden border border-[#E8DFDC] bg-white">
                <img
                  src={attachment.previewUrl || attachment.attachmentDataUrl}
                  alt={attachment.attachmentName}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-64 object-contain mx-auto"
                />
              </div>
            )}

          {attachment.attachmentType === 'video' &&
            (attachment.previewUrl || attachment.attachmentDataUrl) && (
              <div className="rounded-xl overflow-hidden border border-[#E8DFDC] bg-black">
                <video
                  src={attachment.previewUrl || attachment.attachmentDataUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-64 object-contain mx-auto"
                />
              </div>
            )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Bottom Bar: Upload Buttons + Post Button */}
      <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {UPLOAD_BUTTONS.map((btn) => {
            const IconComponent = btn.icon;
            const isSelected =
              btn.type === 'pdf'
                ? Boolean(
                    attachment &&
                      ['pdf', 'word', 'excel', 'ppt'].includes(attachment.attachmentType)
                  )
                : attachment?.attachmentType === btn.type;
            return (
              <button
                key={btn.type}
                type="button"
                onClick={() => handleTriggerFileUpload(btn.type)}
                disabled={isProcessingFile}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 min-h-[36px] cursor-pointer ${
                  isSelected
                    ? 'bg-[#7B1113] border-[#7B1113] text-white'
                    : 'bg-white border-[#E8DFDC] text-[#1F1617] hover:bg-[#FAF8F5]'
                }`}
              >
                <IconComponent
                  className={`w-3.5 h-3.5 ${isSelected ? 'text-[#D4AF37]' : 'text-[#7B1113]'}`}
                />
                <span>{btn.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="submit"
          disabled={isSubmitting || isProcessingFile}
          className="w-full sm:w-auto px-5 py-2.5 sm:py-2 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap min-h-[42px] sm:min-h-[38px] sm:ml-auto border border-[#D4AF37]/40 cursor-pointer"
        >
          <Send className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{isProcessingFile ? 'Uploading...' : 'Post'}</span>
        </button>
      </div>
    </form>
  );
};
