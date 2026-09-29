import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { sendPasswordResetEmail, updatePassword } from 'firebase/auth';
import {
  Lock,
  KeyRound,
  Mail,
  Trash2,
  EyeOff,
  Eye,
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Info,
  FileText,
  Lightbulb,
  BookOpen,
  User,
  Moon,
  Sun,
  Camera,
  Type,
  Upload,
  RotateCcw,
  LifeBuoy,
  MessageCircle,
  Send,
  ArrowLeft,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import {
  auth,
  buildChatId,
  checkNicknameAvailability,
  getNicknameCooldownInfo,
  NICKNAME_COOLDOWN_DAYS,
  ONE_LOGO_DATA_URL,
  resolveUserBadge,
  SUPPORT_OFFICIAL_BADGE,
  SUPPORT_OFFICIAL_NAME,
  SUPPORT_OFFICIAL_UID,
} from '../firebase';
import {
  ChatMessage,
  ChatPeerTarget,
  ChatThread,
  MSU_CAMPUSES,
  SupportTicket,
  SupportTicketReply,
  UserPrivateInfo,
  UserPublicProfile,
} from '../types';
import { compressImageFile } from '../utils/fileHelpers';
import { supabase, uploadFileToSupabaseStorage } from '../supabaseClient';
import {
  DB_UPDATE_EVENT,
  getLocalSupportTickets,
  getLocalUsers,
  upsertLocalChatMessage,
  upsertLocalChatThread,
  upsertLocalNotification,
  upsertLocalSupportTicket,
} from '../utils/databaseRestore';
import { UserBadgeTag } from './UserBadgeTag';
import { AboutView } from './AboutView';
import { TermsView } from './TermsView';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';

export type SettingsSectionTab = 'account' | 'support' | 'about' | 'terms' | 'rules';
export type CharacterSizeOption = 'sm' | 'md' | 'lg' | 'xl';

interface SettingsViewProps {
  userProfile: UserPublicProfile;
  userPrivate: UserPrivateInfo | null;
  effectiveEmail: string;
  onUpdateProfile: (updates: {
    nickname: string;
    nicknameUpdatedAt: string;
    googleDisplayName?: string;
    photoURL?: string;
    campus: string;
    bio: string;
    defaultAnonymous: boolean;
  }) => Promise<void>;
  onRecordPasswordChange: () => Promise<void>;
  onBatchSetPostsAnonymity: (makeAnonymous: boolean) => Promise<number>;
  onDeleteAccountPermanently: () => Promise<void>;
  onNavigateTab?: (
    tab: 'about' | 'terms' | 'suggestions' | 'feed' | 'guidelines' | 'chats' | 'support'
  ) => void;
  onOpenChatWithPeer?: (peer: ChatPeerTarget) => void;
  initialSection?: SettingsSectionTab;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  charSize?: CharacterSizeOption;
  onChangeCharSize?: (size: CharacterSizeOption) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  userProfile,
  userPrivate,
  effectiveEmail,
  onUpdateProfile,
  onRecordPasswordChange,
  onBatchSetPostsAnonymity,
  onDeleteAccountPermanently,
  onNavigateTab,
  onOpenChatWithPeer,
  initialSection = 'account',
  isDarkMode = false,
  onToggleDarkMode,
  charSize = 'md',
  onChangeCharSize,
}) => {
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSectionTab>(initialSection);

  useEffect(() => {
    setActiveSettingsSection(initialSection);
  }, [initialSection]);

  // Contact Support state
  const [supportCategory, setSupportCategory] = useState('General Question / Help');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);
  const [supportStatus, setSupportStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);
  const [mySupportTickets, setMySupportTickets] = useState<SupportTicket[]>(() =>
    getLocalSupportTickets().filter((t) => t.userId === userProfile.uid)
  );
  const [ticketReplyDrafts, setTicketReplyDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    const refreshTickets = () => {
      setMySupportTickets(getLocalSupportTickets().filter((t) => t.userId === userProfile.uid));
    };
    refreshTickets();
    window.addEventListener(DB_UPDATE_EVENT, refreshTickets);
    return () => window.removeEventListener(DB_UPDATE_EVENT, refreshTickets);
  }, [userProfile.uid]);

  const handleSubmitSupportTicket = (e: React.FormEvent) => {
    e.preventDefault();
    setSupportStatus(null);
    const cleanSub = supportSubject.trim();
    const cleanMsg = supportMessage.trim();
    if (!cleanSub || !cleanMsg) {
      setSupportStatus({
        type: 'error',
        msg: 'Please enter both a subject and your question or request.',
      });
      return;
    }

    setIsSubmittingSupport(true);
    const adminUser =
      getLocalUsers().find(
        (u) => u.uid === '538a6246-5cc8-4c63-bbda-0507196f3d5d' || u.badge === 'developer'
      ) || null;
    const adminUid = adminUser?.uid || '538a6246-5cc8-4c63-bbda-0507196f3d5d';
    const supportUid = SUPPORT_OFFICIAL_UID;
    const chatId = buildChatId(userProfile.uid, supportUid);
    const ticketId = `tkt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const newTicket: SupportTicket = {
      id: ticketId,
      userId: userProfile.uid,
      userNickname: userProfile.nickname,
      userDisplayName: userProfile.googleDisplayName || userProfile.nickname,
      userPhotoURL: userProfile.photoURL || '',
      userEmail: effectiveEmail,
      userCampus: userProfile.campus,
      userBadge: resolveUserBadge(userProfile.badge),
      category: supportCategory,
      subject: cleanSub.slice(0, 160),
      message: cleanMsg.slice(0, 2500),
      status: 'open',
      chatId,
      adminId: supportUid,
      adminNickname: SUPPORT_OFFICIAL_NAME,
      replies: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    upsertLocalSupportTicket(newTicket);

    // Notify Admin about the new support request
    upsertLocalNotification({
      id: `notif_sup_${ticketId}`.slice(0, 120),
      recipientId: adminUid,
      actorId: userProfile.uid,
      actorNickname: userProfile.nickname,
      actorPhotoURL: userProfile.photoURL || '',
      actorBadge: resolveUserBadge(userProfile.badge),
      type: 'message',
      targetId: chatId,
      previewText: `🛟 Support Request (${supportCategory}): ${cleanSub}`.slice(0, 220),
      read: false,
      createdAt: Timestamp.now(),
    });

    setMySupportTickets(getLocalSupportTickets().filter((t) => t.userId === userProfile.uid));
    setSupportSubject('');
    setSupportMessage('');
    setIsSubmittingSupport(false);
    setSupportStatus({
      type: 'success',
      msg: 'Your support request has been sent to the Admin Dashboard! When Contact Support replies, you will receive it directly in your Messenger and see it below.',
    });
  };

  const handleUserReplyToSupportTicket = (ticket: SupportTicket) => {
    const draft = (ticketReplyDrafts[ticket.id] || '').trim();
    if (!draft) return;

    const supportUid = SUPPORT_OFFICIAL_UID;
    const supportNick = SUPPORT_OFFICIAL_NAME;
    const supportPhoto = ONE_LOGO_DATA_URL;
    const chatId = ticket.chatId || buildChatId(userProfile.uid, supportUid);
    const sortedUids = [userProfile.uid, supportUid].sort();
    const isMeUserA = sortedUids[0] === userProfile.uid;
    const userBadge = resolveUserBadge(userProfile.badge);

    const msgId = `msg_sup_usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const threadObj: ChatThread = {
      id: chatId,
      participantIds: sortedUids,
      userAId: isMeUserA ? userProfile.uid : supportUid,
      userANickname: isMeUserA ? userProfile.nickname : supportNick,
      userAPhotoURL: isMeUserA ? userProfile.photoURL || '' : supportPhoto,
      userABadge: isMeUserA ? userBadge : SUPPORT_OFFICIAL_BADGE,
      userBId: isMeUserA ? supportUid : userProfile.uid,
      userBNickname: isMeUserA ? supportNick : userProfile.nickname,
      userBPhotoURL: isMeUserA ? supportPhoto : userProfile.photoURL || '',
      userBBadge: isMeUserA ? SUPPORT_OFFICIAL_BADGE : userBadge,
      lastMessage: draft.slice(0, 280),
      lastSenderId: userProfile.uid,
      lastMessageRead: false,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const chatMsgObj: ChatMessage = {
      id: msgId,
      chatId,
      participantIds: sortedUids,
      senderId: userProfile.uid,
      recipientId: supportUid,
      senderNickname: userProfile.nickname,
      senderPhotoURL: userProfile.photoURL || '',
      senderBadge: userBadge,
      text: draft.slice(0, 2500),
      attachmentType: 'none',
      attachmentName: '',
      attachmentSize: 0,
      attachmentMime: '',
      attachmentDataUrl: '',
      read: false,
      createdAt: Timestamp.now(),
    };

    upsertLocalChatThread(threadObj);
    upsertLocalChatMessage(chatMsgObj);

    const existingReplies = Array.isArray(ticket.replies) ? ticket.replies : [];
    if (!existingReplies.some((r) => r.id === msgId)) {
      const replyEntry: SupportTicketReply = {
        id: msgId,
        senderId: userProfile.uid,
        senderNickname: userProfile.nickname,
        senderPhotoURL: userProfile.photoURL || '',
        senderBadge: userBadge,
        isAdmin: false,
        text: draft.slice(0, 2500),
        createdAt: Timestamp.now(),
      };
      upsertLocalSupportTicket({
        ...ticket,
        chatId,
        status: 'open',
        lastReplyText: draft.slice(0, 2500),
        lastReplyBy: userProfile.nickname,
        replies: [...existingReplies, replyEntry],
        updatedAt: Timestamp.now(),
      });
    }

    setTicketReplyDrafts((prev) => ({ ...prev, [ticket.id]: '' }));
    setMySupportTickets(getLocalSupportTickets().filter((t) => t.userId === userProfile.uid));
  };

  const renderContactSupportSection = () => (
    <section className="bg-white border border-[#E8DFDC] rounded-2xl p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-[#F2ECE9]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#7B1113]/10 text-[#7B1113] flex items-center justify-center shrink-0">
            <LifeBuoy className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-display text-xl text-[#7B1113]">
              Contact Support &amp; Help Desk
            </h2>
            <p className="text-xs text-[#6E5D5F]">
              Ask anything or request assistance. Sent directly to the Admin Dashboard — replies
              arrive in your Messenger!
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-[#F7EFE0] border border-[#D4AF37]/50 text-[11px] font-mono font-semibold text-[#7B1113]">
          Direct to Admin &amp; Messenger
        </span>
      </div>

      <form onSubmit={handleSubmitSupportTicket} className="space-y-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-[#1F1617]">Topic / Category</label>
            <select
              value={supportCategory}
              onChange={(e) => setSupportCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113] min-h-[38px]"
            >
              <option value="General Question / Help">General Question / Help</option>
              <option value="Account & Verification">Account &amp; Verification</option>
              <option value="Technical Issue / Bug">Technical Issue / Bug</option>
              <option value="Marketplace Inquiry">Marketplace Inquiry</option>
              <option value="Report Abuse / Safety">Report Abuse / Safety</option>
            </select>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-medium text-[#1F1617]">Subject</label>
            <input
              type="text"
              value={supportSubject}
              onChange={(e) => setSupportSubject(e.target.value)}
              maxLength={140}
              placeholder="Briefly describe what you need help with..."
              className="w-full px-3.5 py-2 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113] min-h-[38px]"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-[#1F1617]">
            Your Question or Support Message
          </label>
          <textarea
            value={supportMessage}
            onChange={(e) => setSupportMessage(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Ask anything or describe the issue in detail. Our Admin will reply to you via Messenger..."
            className="w-full px-3.5 py-2.5 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113]"
          />
        </div>

        {supportStatus && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
              supportStatus.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}
          >
            {supportStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{supportStatus.msg}</span>
          </div>
        )}

        <div className="flex items-center justify-end">
          <button
            type="submit"
            disabled={isSubmittingSupport}
            className="px-5 py-2 bg-[#7B1113] hover:bg-[#580B0C] disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer min-h-[38px]"
          >
            <Send className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{isSubmittingSupport ? 'Sending...' : 'Send to Support Desk'}</span>
          </button>
        </div>
      </form>

      {mySupportTickets.length > 0 && (
        <div className="pt-4 border-t border-[#F2ECE9] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#7B1113]">
              Your Support Tickets ({mySupportTickets.length})
            </h3>
            <span className="text-[11px] text-[#6E5D5F]">
              Replies sync automatically with your Messenger
            </span>
          </div>

          <div className="space-y-3">
            {mySupportTickets.map((t) => {
              const replies = Array.isArray(t.replies) ? t.replies : [];
              return (
                <div
                  key={t.id}
                  className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md bg-[#7B1113]/10 text-[#7B1113] text-[10px] font-mono font-semibold">
                          {t.category}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                            t.status === 'replied'
                              ? 'bg-emerald-100 text-emerald-800'
                              : t.status === 'resolved'
                              ? 'bg-stone-200 text-stone-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {t.status}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-[#1F1617] mt-1">{t.subject}</h4>
                    </div>

                    {onOpenChatWithPeer && (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChatWithPeer({
                            uid: SUPPORT_OFFICIAL_UID,
                            nickname: SUPPORT_OFFICIAL_NAME,
                            photoURL: ONE_LOGO_DATA_URL,
                            badge: SUPPORT_OFFICIAL_BADGE,
                          });
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[#7B1113] hover:bg-[#580B0C] text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Open in Messenger</span>
                      </button>
                    )}
                  </div>

                  <p className="text-xs text-[#1F1617] whitespace-pre-wrap bg-white p-3 rounded-lg border border-[#E8DFDC]">
                    {t.message}
                  </p>

                  {replies.length > 0 && (
                    <div className="space-y-2 pl-3 border-l-2 border-[#D4AF37]">
                      {replies.map((r) => (
                        <div
                          key={r.id}
                          className={`p-2.5 rounded-lg text-xs ${
                            r.isAdmin
                              ? 'bg-[#F7EFE0]/70 border border-[#D4AF37]/50 text-[#1F1617]'
                              : 'bg-white border border-[#E8DFDC] text-[#1F1617]'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="font-bold text-[#7B1113]">
                              {r.isAdmin ? 'Contact Support' : `You (@${r.senderNickname})`}
                            </span>
                            <UserBadgeTag badge={r.senderBadge} size="sm" />
                          </div>
                          <p className="whitespace-pre-wrap">{r.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {t.status !== 'resolved' && (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        value={ticketReplyDrafts[t.id] || ''}
                        onChange={(e) =>
                          setTicketReplyDrafts((prev) => ({
                            ...prev,
                            [t.id]: e.target.value,
                          }))
                        }
                        placeholder="Write a follow-up reply to Admin..."
                        className="flex-1 px-3 py-1.5 text-xs bg-white border border-[#E8DFDC] rounded-lg focus:outline-none focus:border-[#7B1113]"
                      />
                      <button
                        type="button"
                        onClick={() => handleUserReplyToSupportTicket(t)}
                        className="px-3 py-1.5 rounded-lg bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Send className="w-3 h-3 text-[#D4AF37]" />
                        <span>Reply</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );

  const [nickname, setNickname] = useState(userProfile.nickname);
  const [displayName, setDisplayName] = useState(
    userProfile.googleDisplayName || userProfile.nickname
  );
  const [photoURL, setPhotoURL] = useState(userProfile.photoURL || '');
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [campus, setCampus] = useState(userProfile.campus || MSU_CAMPUSES[0]);
  const [bio, setBio] = useState(userProfile.bio || '');

  useEffect(() => {
    setNickname(userProfile.nickname);
    setDisplayName(userProfile.googleDisplayName || userProfile.nickname);
    setPhotoURL(userProfile.photoURL || '');
    setCampus(userProfile.campus || MSU_CAMPUSES[0]);
    setBio(userProfile.bio || '');
  }, [
    userProfile.nickname,
    userProfile.googleDisplayName,
    userProfile.photoURL,
    userProfile.campus,
    userProfile.bio,
  ]);
  const [profileStatus, setProfileStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [isCheckingNick, setIsCheckingNick] = useState(false);
  const [nickAvailability, setNickAvailability] = useState<{
    available: boolean;
    reason?: string;
  } | null>(null);

  const [anonStatus, setAnonStatus] = useState<string | null>(null);
  const [anonTransitionState, setAnonTransitionState] = useState<'on' | 'off' | null>(null);
  const [isUpdatingAnon, setIsUpdatingAnon] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [forgotEmail, setForgotEmail] = useState(userPrivate?.email || effectiveEmail);
  const [forgotStatus, setForgotStatus] = useState<{
    type: 'success' | 'error';
    msg: string;
  } | null>(null);
  const [isSendingReset, setIsSendingReset] = useState(false);

  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const cooldown = getNicknameCooldownInfo(userProfile.nicknameUpdatedAt);
  const canEditNickname = cooldown.canChange;
  const isNicknameModified =
    nickname.trim().toLowerCase() !== userProfile.nickname.trim().toLowerCase();
  const userBadge = resolveUserBadge(userProfile.badge, effectiveEmail);

  useEffect(() => {
    let active = true;
    const cleaned = nickname.trim();
    if (!cleaned || !isNicknameModified) {
      setNickAvailability(null);
      setIsCheckingNick(false);
      return;
    }

    setIsCheckingNick(true);
    const timer = window.setTimeout(async () => {
      const check = await checkNicknameAvailability(cleaned, userProfile.uid, effectiveEmail);
      if (active) {
        setNickAvailability({ available: check.available, reason: check.reason });
        setIsCheckingNick(false);
      }
    }, 280);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [nickname, isNicknameModified, userProfile.uid, effectiveEmail]);

  const handleAvatarFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileStatus(null);
    setIsUploadingAvatar(true);
    try {
      const compressedDataUrl = await compressImageFile(file, 360, 0.82);
      const storageAvatarUrl = await uploadFileToSupabaseStorage({
        fileName: `avatar_${userProfile.uid || Date.now()}.jpg`,
        mimeType: 'image/jpeg',
        base64DataUrl: compressedDataUrl,
        folder: 'avatars',
      });
      setPhotoURL(storageAvatarUrl || compressedDataUrl);
      setAvatarFailed(false);
      setProfileStatus({
        type: 'success',
        msg: 'New profile photo uploaded to Supabase Storage! Click "Save Profile" below to apply it across the website.',
      });
    } catch (err) {
      setProfileStatus({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Could not process profile photo.',
      });
    } finally {
      setIsUploadingAvatar(false);
      if (avatarFileInputRef.current) {
        avatarFileInputRef.current.value = '';
      }
    }
  };

  const handleSaveProfileAndNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);
    const cleanedNick = nickname.trim();
    const cleanedDisplayName = displayName.trim() || cleanedNick;

    if (cleanedNick.length < 2 || cleanedNick.length > 32) {
      setProfileStatus({
        type: 'error',
        msg: 'Nickname must be 2 to 32 characters long.',
      });
      return;
    }

    if (isNicknameModified) {
      const check = await checkNicknameAvailability(cleanedNick, userProfile.uid, effectiveEmail);
      if (!check.available) {
        setNickAvailability({ available: false, reason: check.reason });
        setProfileStatus({
          type: 'error',
          msg: check.reason || `Nickname @${cleanedNick} is already used by another user.`,
        });
        return;
      }
    }

    setIsSavingProfile(true);
    try {
      const nextNicknameTimestamp = isNicknameModified
        ? new Date().toISOString()
        : userProfile.nicknameUpdatedAt;

      await onUpdateProfile({
        nickname: cleanedNick,
        nicknameUpdatedAt: nextNicknameTimestamp,
        googleDisplayName: cleanedDisplayName.slice(0, 100),
        photoURL: photoURL.slice(0, 350000),
        campus,
        bio: bio.trim().slice(0, 280),
        defaultAnonymous: userProfile.defaultAnonymous,
      });

      setProfileStatus({
        type: 'success',
        msg: 'Your profile changes (photo, name, nickname, campus, and bio) have been saved!',
      });
    } catch (err) {
      setProfileStatus({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Could not save profile.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleToggleDefaultAnonymous = async () => {
    setIsUpdatingAnon(true);
    setAnonStatus(null);
    const nextAnon = !userProfile.defaultAnonymous;
    setAnonTransitionState(nextAnon ? 'on' : 'off');
    window.setTimeout(() => {
      setAnonTransitionState(null);
    }, 2800);
    try {
      await onUpdateProfile({
        nickname: userProfile.nickname,
        nicknameUpdatedAt: userProfile.nicknameUpdatedAt,
        googleDisplayName: displayName.trim() || userProfile.googleDisplayName || userProfile.nickname,
        photoURL: photoURL || userProfile.photoURL || '',
        campus: userProfile.campus,
        bio: userProfile.bio,
        defaultAnonymous: nextAnon,
      });
      setAnonStatus(
        nextAnon
          ? 'Anonymous Mode is ON. Your nickname and photo will be hidden on new posts.'
          : 'Anonymous Mode is OFF. Your Gmail photo and nickname will show on new posts.'
      );
    } catch (err) {
      setAnonStatus(err instanceof Error ? err.message : 'Could not update setting.');
    } finally {
      setIsUpdatingAnon(false);
    }
  };

  const handleBatchAnonymize = async (makeAnon: boolean) => {
    setIsUpdatingAnon(true);
    setAnonStatus(null);
    setAnonTransitionState(makeAnon ? 'on' : 'off');
    window.setTimeout(() => {
      setAnonTransitionState(null);
    }, 2800);
    try {
      const count = await onBatchSetPostsAnonymity(makeAnon);
      setAnonStatus(
        makeAnon
          ? `Hidden your nickname on ${count} post(s).`
          : `Showed your Gmail photo and nickname on ${count} post(s).`
      );
    } catch (err) {
      setAnonStatus(err instanceof Error ? err.message : 'Could not update posts.');
    } finally {
      setIsUpdatingAnon(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword.length < 8) {
      setPasswordStatus({
        type: 'error',
        msg: 'New password must be at least 8 characters.',
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        type: 'error',
        msg: 'Passwords do not match.',
      });
      return;
    }

    setIsChangingPassword(true);
    try {
      supabase.auth.updateUser({ password: newPassword }).catch(() => {});
      if (auth.currentUser) {
        updatePassword(auth.currentUser, newPassword).catch(() => {});
      }
      await onRecordPasswordChange();
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({
        type: 'success',
        msg: 'Password changed.',
      });
    } catch (err) {
      setPasswordStatus({
        type: 'error',
        msg: err instanceof Error ? err.message : 'Could not change password.',
      });
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotStatus(null);
    const trimmed = forgotEmail.trim().toLowerCase();
    if (!trimmed) return;

    setIsSendingReset(true);
    try {
      supabase.auth
        .resetPasswordForEmail(trimmed, {
          redirectTo: window.location.origin,
        })
        .catch(() => {});
      sendPasswordResetEmail(auth, trimmed).catch(() => {});
      setForgotStatus({
        type: 'success',
        msg: `Password reset email sent to ${trimmed}. Check your inbox.`,
      });
    } finally {
      setIsSendingReset(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteConfirmText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm.');
      return;
    }
    setIsDeletingAccount(true);
    setDeleteError(null);
    try {
      await onDeleteAccountPermanently();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete account.');
      setIsDeletingAccount(false);
    }
  };

  const renderCommunityRulesSection = () => (
    <div className="bg-white border border-[#E8DFDC] rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#7B1113]/10 text-[#7B1113] border border-[#7B1113]/20 flex items-center justify-center shrink-0">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-display text-2xl text-[#7B1113]">ONE Community Rules</h2>
          <p className="text-xs text-[#6E5D5F] mt-0.5">
            Official community rules for all Mindanao State University students on ONE.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-[#6E5D5F]">
        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1.5">
          <h3 className="text-sm font-semibold text-[#7B1113]">1. Official MSU Email &amp; Badges</h3>
          <p>
            Only students with official MSU institutional emails (<span className="font-mono text-[#1F1617]">@s.msumain.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@msumain.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@msuiit.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@g.msuiit.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@sulat.msuiit.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@msugensan.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@msutawi-tawi.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@msunaawan.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@msumaguindanao.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@msusulu.edu.ph</span>,{' '}
            <span className="font-mono text-[#1F1617]">@msubuug.edu.ph</span>) can join.
            Every verified student receives a <strong>Verified</strong> badge, while the platform
            creator holds the <strong>Developer</strong> badge.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1.5">
          <h3 className="text-sm font-semibold text-[#7B1113]">
            2. Unique Nickname Only (No Email Shown)
          </h3>
          <p>
            Your posts and comments only show your unique nickname and badge — your email address is
            never shown publicly. Each nickname is unique and can be changed once every{' '}
            <strong>2 weeks (14 days)</strong>.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1.5">
          <h3 className="text-sm font-semibold text-[#7B1113]">
            3. Direct Chat &amp; Microsoft File Sharing
          </h3>
          <p>
            Click the <strong>Chat</strong> icon on any student&apos;s post, comment, or in the live{' '}
            <strong>Online MSUans / Offline Users</strong> panel to message them directly with read
            receipts and share <strong>Photos</strong>, <strong>Word</strong>,{' '}
            <strong>Excel</strong>, <strong>PowerPoint</strong>, or <strong>PDF</strong> files.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1.5">
          <h3 className="text-sm font-semibold text-[#7B1113]">
            4. Anonymous Mode &amp; Comment Replies
          </h3>
          <p>
            Turn on <strong>Anonymous Mode</strong> anytime to hide your nickname and show the{' '}
            <strong>Anonymous</strong> badge in the feed. Reply to any student comment or thread
            while maintaining respectful campus discourse.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1.5">
          <h3 className="text-sm font-semibold text-[#7B1113]">
            5. Zero Harassment &amp; No Doxxing
          </h3>
          <p>
            Personal attacks, threats, bullying, hate speech, or sharing private student personal
            information (phone numbers, home addresses, private IDs) are strictly prohibited.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1.5">
          <h3 className="text-sm font-semibold text-[#7B1113]">
            6. Academic Collaboration &amp; Integrity
          </h3>
          <p>
            Sharing study reviewers, lecture notes, and helpful materials is encouraged. Uploading
            active proctored exam answer keys or malicious files is prohibited.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-5 pb-12 dashboard-enter-anim">
      {activeSettingsSection === 'support' ? (
        <div className="space-y-4">
          <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#7B1113] text-[#D4AF37] border border-[#D4AF37] flex items-center justify-center shrink-0">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl text-[#7B1113]">
                  Contact Support Dashboard
                </h1>
                <p className="text-xs text-[#6E5D5F]">
                  Dedicated MSUan Help Desk — replies from Contact Support arrive in your Messenger
                </p>
              </div>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('feed')}
                className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Student Wall</span>
              </button>
            )}
          </div>
          {renderContactSupportSection()}
        </div>
      ) : activeSettingsSection === 'about' ? (
        <AboutView
          onGoToFeed={() => onNavigateTab?.('feed')}
          onGoToSuggestions={() => onNavigateTab?.('suggestions')}
          onGoToTerms={() => onNavigateTab?.('terms')}
        />
      ) : activeSettingsSection === 'terms' ? (
        <TermsView
          onGoToFeed={() => onNavigateTab?.('feed')}
          onGoToSuggestions={() => onNavigateTab?.('suggestions')}
          onGoToAbout={() => onNavigateTab?.('about')}
        />
      ) : activeSettingsSection === 'rules' ? (
        <div className="space-y-4">
          <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#7B1113] text-[#D4AF37] border border-[#D4AF37] flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-display text-2xl text-[#7B1113]">
                  Community Rules Dashboard
                </h1>
                <p className="text-xs text-[#6E5D5F]">
                  Official community guidelines &amp; standards for all MSUans on ONE
                </p>
              </div>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('feed')}
                className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Student Wall</span>
              </button>
            )}
          </div>
          {renderCommunityRulesSection()}
        </div>
      ) : (
        <>
      {/* 0. Appearance: Late-Night Study Dark Mode Toggle */}
      <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7B1113] text-[#D4AF37] border border-[#D4AF37]/50 flex items-center justify-center shrink-0">
              {isDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="font-display text-2xl text-[#7B1113]">
                Appearance &amp; Late-Night Study Mode
              </h2>
              <p className="text-xs text-[#6E5D5F] mt-0.5">
                Switch between warm daylight mode and low-glare dark mode for a comfortable MSU
                reading experience during late-night study sessions.
              </p>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={onToggleDarkMode}
            role="switch"
            aria-checked={isDarkMode}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 min-h-[38px] shrink-0 cursor-pointer ${
              isDarkMode
                ? 'bg-[#7B1113] text-white border border-[#D4AF37]'
                : 'bg-[#FAF8F5] text-[#1F1617] border border-[#E8DFDC] hover:bg-[#F2ECE9]'
            }`}
          >
            {isDarkMode ? (
              <>
                <Moon className="w-4 h-4 text-[#D4AF37]" />
                <span>Dark Mode: ON</span>
              </>
            ) : (
              <>
                <Sun className="w-4 h-4 text-[#7B1113]" />
                <span>Dark Mode: OFF</span>
              </>
            )}
          </motion.button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#F2ECE9]">
          <button
            type="button"
            onClick={() => {
              if (isDarkMode && onToggleDarkMode) onToggleDarkMode();
            }}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
              !isDarkMode
                ? 'bg-[#F7EFE0]/60 border-[#7B1113] ring-1 ring-[#7B1113]/30'
                : 'bg-[#FAF8F5] border-[#E8DFDC] hover:bg-[#F2ECE9]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <Sun className="w-4 h-4 text-[#7B1113] shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-[#1F1617]">Warm Daylight</p>
                <p className="text-[11px] text-[#6E5D5F] mt-0.5">
                  Warm ivory campus paper with Maroon &amp; Gold accents for daytime reading.
                </p>
              </div>
            </div>
            {!isDarkMode && (
              <CheckCircle2 className="w-4 h-4 text-[#7B1113] shrink-0 mt-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isDarkMode && onToggleDarkMode) onToggleDarkMode();
            }}
            className={`p-3.5 rounded-xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
              isDarkMode
                ? 'bg-[#7B1113] text-white border-[#D4AF37]'
                : 'bg-[#FAF8F5] border-[#E8DFDC] hover:bg-[#F2ECE9]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <Moon
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  isDarkMode ? 'text-[#D4AF37]' : 'text-[#7B1113]'
                }`}
              />
              <div>
                <p
                  className={`text-xs font-semibold ${
                    isDarkMode ? 'text-white' : 'text-[#1F1617]'
                  }`}
                >
                  Late-Night Study (Dark Mode)
                </p>
                <p
                  className={`text-[11px] mt-0.5 ${
                    isDarkMode ? 'text-[#F7EFE0]/85' : 'text-[#6E5D5F]'
                  }`}
                >
                  Low-glare dark obsidian surfaces to reduce eye strain during late-night study.
                </p>
              </div>
            </div>
            {isDarkMode && (
              <CheckCircle2 className="w-4 h-4 text-[#D4AF37] shrink-0 mt-0.5" />
            )}
          </button>
        </div>

        {/* Character Size / Text Scale Settings */}
        <div className="pt-4 border-t border-[#F2ECE9] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#7B1113]/10 text-[#7B1113] flex items-center justify-center shrink-0">
                <Type className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#7B1113]">
                  Character Size &amp; Text Scaling
                </h3>
                <p className="text-xs text-[#6E5D5F]">
                  Adjust the character size across posts, chat messages, and menus.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] border border-[#E8DFDC] text-xs font-mono font-semibold text-[#7B1113]">
              Current: {charSize.toUpperCase()}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {(
              [
                { id: 'sm', label: 'Small', desc: 'Compact text', sample: 'Aa' },
                { id: 'md', label: 'Medium', desc: 'Default size', sample: 'Aa' },
                { id: 'lg', label: 'Large', desc: 'Easier reading', sample: 'Aa' },
                { id: 'xl', label: 'Extra Large', desc: 'Maximum clarity', sample: 'Aa' },
              ] as const
            ).map((opt) => {
              const isSelected = charSize === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeCharSize?.(opt.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? 'bg-[#7B1113] text-white border-[#D4AF37] shadow-xs'
                      : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC] hover:bg-[#F2ECE9]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`font-display font-bold ${
                        opt.id === 'sm'
                          ? 'text-sm'
                          : opt.id === 'md'
                          ? 'text-base'
                          : opt.id === 'lg'
                          ? 'text-lg'
                          : 'text-xl'
                      } ${isSelected ? 'text-[#D4AF37]' : 'text-[#7B1113]'}`}
                    >
                      {opt.sample}
                    </span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-[#D4AF37]" />}
                  </div>
                  <div>
                    <p className="text-xs font-semibold">{opt.label}</p>
                    <p
                      className={`text-[11px] ${
                        isSelected ? 'text-[#F7EFE0]/80' : 'text-[#6E5D5F]'
                      }`}
                    >
                      {opt.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 1. Profile & Nickname Customization */}
      <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="font-display text-2xl text-[#7B1113]">
            Edit Profile, Photo &amp; Nickname
          </h2>
          <p className="text-xs text-[#6E5D5F] mt-0.5">
            Customize your profile picture, display name, unique @nickname, MSU campus, and bio.
          </p>
        </div>

        {/* Profile Photo & Identity Editor Box */}
        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative group shrink-0">
              <img
                src={photoURL && !avatarFailed ? photoURL : studentAvatarFallback}
                alt={displayName || userProfile.nickname}
                referrerPolicy="no-referrer"
                onError={() => setAvatarFailed(true)}
                className="w-16 h-16 rounded-full object-cover border-2 border-[#D4AF37] bg-white"
              />
              <button
                type="button"
                onClick={() => avatarFileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#7B1113] text-[#D4AF37] border border-[#D4AF37] flex items-center justify-center shadow-md cursor-pointer hover:bg-[#580B0C]"
                title="Upload new profile photo"
              >
                <Camera className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0 max-w-full">
                <span className="text-sm font-bold text-[#1F1617] truncate">
                  @{nickname || userProfile.nickname}
                </span>
                <UserBadgeTag
                  badge={userBadge}
                  isAnonymous={userProfile.defaultAnonymous}
                  size="md"
                />
              </div>
              <p className="text-xs font-medium text-[#1F1617] truncate">
                {displayName || userProfile.googleDisplayName}
              </p>
              <p className="text-[11px] font-mono text-[#6E5D5F] truncate mt-0.5">
                {userPrivate?.email || effectiveEmail} (Private — never shown on posts)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              ref={avatarFileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarFileSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => avatarFileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="px-3.5 py-2 rounded-xl bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              {isUploadingAvatar ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-3.5 h-3.5 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37]"
                />
              ) : (
                <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
              )}
              <span>{isUploadingAvatar ? 'Uploading Photo...' : 'Change Photo'}</span>
            </button>
            {photoURL && (
              <button
                type="button"
                onClick={() => {
                  setPhotoURL(auth.currentUser?.photoURL || '');
                  setAvatarFailed(false);
                }}
                className="px-3 py-2 rounded-xl bg-white hover:bg-[#F2ECE9] text-[#6E5D5F] border border-[#E8DFDC] text-xs font-medium flex items-center gap-1 cursor-pointer"
                title="Reset to default photo"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveProfileAndNickname} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1">
                Unique Nickname
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7B1113] font-mono text-sm">
                  @
                </span>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  minLength={2}
                  maxLength={32}
                  className="w-full pl-8 pr-3.5 py-2 text-sm border rounded-xl font-medium bg-white border-[#E8DFDC] text-[#1F1617] focus:outline-none focus:border-[#7B1113]"
                />
              </div>
              {isNicknameModified && (
                <div className="mt-1.5">
                  {isCheckingNick ? (
                    <p className="text-xs text-[#6E5D5F]">Checking availability...</p>
                  ) : nickAvailability ? (
                    <p
                      className={`text-xs flex items-center gap-1 font-medium ${
                        nickAvailability.available ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {nickAvailability.available ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>@{nickname.trim()} is available</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{nickAvailability.reason}</span>
                        </>
                      )}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={80}
                placeholder="Your display name"
                className="w-full px-3.5 py-2 text-sm border border-[#E8DFDC] rounded-xl bg-white text-[#1F1617] focus:outline-none focus:border-[#7B1113]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1">Campus</label>
              <select
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
                className="w-full px-3.5 py-2 text-sm border border-[#E8DFDC] rounded-xl bg-white focus:outline-none focus:border-[#7B1113]"
              >
                {MSU_CAMPUSES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1">Bio</label>
              <input
                type="text"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={280}
                placeholder="Short bio about yourself"
                className="w-full px-3.5 py-2 text-sm border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
              />
            </div>
          </div>

          {profileStatus && (
            <div
              className={`p-3 rounded-xl border text-xs ${
                profileStatus.type === 'error'
                  ? 'bg-rose-50 border-rose-100 text-rose-700'
                  : 'bg-emerald-50 border-emerald-100 text-emerald-700'
              }`}
            >
              {profileStatus.msg}
            </div>
          )}

          <button
            type="submit"
            disabled={
              isSavingProfile ||
              isCheckingNick ||
              (isNicknameModified && nickAvailability !== null && !nickAvailability.available)
            }
            className="px-5 py-2 bg-[#7B1113] hover:bg-[#580B0C] disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors min-h-[38px]"
          >
            {isSavingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </section>

      {/* 2. Anonymous Mode with Animated Transition */}
      <section
        className={`border rounded-2xl p-5 sm:p-6 space-y-4 transition-colors duration-300 ${
          userProfile.defaultAnonymous
            ? 'bg-[#FDFBF9] border-[#7B1113]/40'
            : 'bg-white border-[#E8DFDC]'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-2xl text-[#7B1113]">Anonymous Mode</h3>
            <p className="text-xs text-[#6E5D5F] mt-0.5">
              Hide your Gmail photo and nickname when you post or comment.
            </p>
          </div>
          <motion.button
            whileTap={{ scale: 0.95 }}
            type="button"
            onClick={handleToggleDefaultAnonymous}
            disabled={isUpdatingAnon}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 min-h-[38px] shrink-0 ${
              userProfile.defaultAnonymous
                ? 'bg-[#7B1113] text-white border border-[#D4AF37]'
                : 'bg-[#FAF8F5] text-[#1F1617] border border-[#E8DFDC] hover:bg-[#F2ECE9]'
            }`}
          >
            {userProfile.defaultAnonymous ? (
              <>
                <EyeOff className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Anonymous: ON</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>Anonymous: OFF</span>
              </>
            )}
          </motion.button>
        </div>

        {/* Animated Transition Banner when Anonymous Mode toggles */}
        <AnimatePresence mode="wait">
          {anonTransitionState && (
            <motion.div
              key={anonTransitionState}
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs font-medium ${
                anonTransitionState === 'on'
                  ? 'bg-[#7B1113] text-white border-[#D4AF37]'
                  : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC]'
              }`}
            >
              <EyeOff className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>
                {anonTransitionState === 'on'
                  ? 'Anonymous Mode is now ON — Your posts and comments will show the Anonymous badge.'
                  : `Anonymous Mode is OFF — Posting publicly as @${userProfile.nickname}.`}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F2ECE9]">
          <button
            type="button"
            onClick={() => handleBatchAnonymize(true)}
            disabled={isUpdatingAnon}
            className="px-3 py-1.5 bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#1F1617] border border-[#E8DFDC] rounded-lg text-xs font-medium"
          >
            Make all my past posts Anonymous
          </button>
          <button
            type="button"
            onClick={() => handleBatchAnonymize(false)}
            disabled={isUpdatingAnon}
            className="px-3 py-1.5 bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#1F1617] border border-[#E8DFDC] rounded-lg text-xs font-medium"
          >
            Show my nickname on all my past posts
          </button>
        </div>

        {anonStatus && (
          <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] text-xs text-[#1F1617]">
            {anonStatus}
          </div>
        )}
      </section>

      {/* 3 & 4. Change Password & Forgot Password */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-2xl text-[#7B1113]">Change Password</h3>
              <p className="text-xs text-[#6E5D5F]">Set a new password for your account.</p>
            </div>
            <Lock className="w-4 h-4 text-[#7B1113]" />
          </div>

          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1">
                Current Password (optional)
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                minLength={8}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 text-sm border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                placeholder="Type new password again"
                className="w-full px-3 py-2 text-sm border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                required
              />
            </div>

            {passwordStatus && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  passwordStatus.type === 'error'
                    ? 'bg-rose-50 border-rose-100 text-rose-700'
                    : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                }`}
              >
                {passwordStatus.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={isChangingPassword}
              className="w-full py-2.5 px-4 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-medium rounded-xl transition-colors flex items-center justify-center gap-1.5 min-h-[38px]"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{isChangingPassword ? 'Saving...' : 'Change Password'}</span>
            </button>
          </form>
        </section>

        <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-2xl text-[#7B1113]">Forgot Password</h3>
              <p className="text-xs text-[#6E5D5F]">
                Get a password reset link sent to your school email.
              </p>
            </div>
            <Mail className="w-4 h-4 text-[#7B1113]" />
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#1F1617] mb-1">
                Your School Email (.edu.ph)
              </label>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                required
              />
            </div>

            {forgotStatus && (
              <div
                className={`p-3 rounded-xl border text-xs ${
                  forgotStatus.type === 'error'
                    ? 'bg-rose-50 border-rose-100 text-rose-700'
                    : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                }`}
              >
                {forgotStatus.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={isSendingReset}
              className="w-full py-2.5 px-4 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-medium rounded-xl transition-colors flex items-center justify-center gap-1.5 min-h-[38px]"
            >
              <Mail className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{isSendingReset ? 'Sending...' : 'Send Reset Link'}</span>
            </button>
          </form>
        </section>
      </div>

      {/* 5. Delete Account */}
      <section className="bg-white border border-rose-200 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display text-2xl text-rose-800">Delete Account</h3>
            <p className="text-xs text-[#6E5D5F]">
              Permanently delete your account, profile, nickname, and all your posts.
            </p>
          </div>
          <AlertTriangle className="w-4 h-4 text-rose-700" />
        </div>

        <form
          onSubmit={handleDeleteAccount}
          className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3"
        >
          <div className="flex-1">
            <label className="block text-xs font-medium text-[#1F1617] mb-1">
              Type <span className="font-mono text-rose-700">DELETE</span> to confirm
            </label>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full px-3 py-2 text-sm font-mono border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-rose-700"
            />
          </div>

          <button
            type="submit"
            disabled={isDeletingAccount || deleteConfirmText.trim().toUpperCase() !== 'DELETE'}
            className="px-5 py-2 bg-rose-700 hover:bg-rose-800 disabled:bg-[#FAF8F5] disabled:text-[#6E5D5F] text-white text-xs font-medium rounded-xl transition-colors flex items-center justify-center gap-1.5 min-h-[38px] whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeletingAccount ? 'Deleting...' : 'Delete Account'}</span>
          </button>
        </form>

        {deleteError && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-xs text-rose-700">
            {deleteError}
          </div>
        )}
      </section>

      {/* Community Dashboards Quick Links */}
      <section className="bg-white border border-[#E8DFDC] rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-display text-xl text-[#7B1113]">
            Community Dashboards
          </h2>
          <p className="text-xs text-[#6E5D5F]">
            Open the dedicated dashboards for Contact Support, About Us, Terms, Community Rules, or Suggestion Box.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <button
            type="button"
            onClick={() => onNavigateTab?.('support')}
            className="p-3.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[#7B1113]">
              <LifeBuoy className="w-4 h-4 text-[#D4AF37]" />
              <span>Contact Support</span>
            </div>
            <p className="text-[11px] text-[#6E5D5F] mt-1">
              Direct help desk &amp; Messenger support.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab?.('about')}
            className="p-3.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[#7B1113]">
              <Info className="w-4 h-4 text-[#D4AF37]" />
              <span>About Us</span>
            </div>
            <p className="text-[11px] text-[#6E5D5F] mt-1">
              MSU student wall mission &amp; pillars.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab?.('terms')}
            className="p-3.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[#7B1113]">
              <FileText className="w-4 h-4 text-[#D4AF37]" />
              <span>Terms</span>
            </div>
            <p className="text-[11px] text-[#6E5D5F] mt-1">
              Terms of Service &amp; student safety.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab?.('guidelines')}
            className="p-3.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[#7B1113]">
              <BookOpen className="w-4 h-4 text-[#D4AF37]" />
              <span>Community Rules</span>
            </div>
            <p className="text-[11px] text-[#6E5D5F] mt-1">
              Community rules &amp; badge standards.
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigateTab?.('suggestions')}
            className="p-3.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] text-left transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-[#7B1113]">
              <Lightbulb className="w-4 h-4 text-[#D4AF37]" />
              <span>Suggestion Box</span>
            </div>
            <p className="text-[11px] text-[#6E5D5F] mt-1">
              Drop ideas &amp; upvote features.
            </p>
          </button>
        </div>
      </section>
      </>
      )}
    </div>
  );
};
