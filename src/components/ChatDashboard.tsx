import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  Eye,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  Presentation,
  Send,
  Trash2,
  Video,
  X,
  FolderOpen,
  Inbox,
  Search,
  Minimize2,
  SmilePlus,
  Lock,
  Upload,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  deleteDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  buildChatId,
  canUseFirestore,
  db,
  formatPeerDisplayName,
  handleFirestoreError,
  isOneOfficialAccount,
  isUserCurrentlyOnline,
  ONE_OFFICIAL_UID,
  OperationType,
  resolvePeerAvatar,
  resolveUserBadge,
} from '../firebase';
import {
  AttachmentType,
  ChatMessage,
  ChatPeerTarget,
  ChatThread,
  NotificationItem,
  UserPresence,
  UserPublicProfile,
} from '../types';
import {
  decodeDocumentPreviewText,
  formatFileSize,
  getAttachmentMeta,
  ProcessedAttachment,
  processUploadedFile,
  resolveMediaAttachmentUrl,
  triggerAttachmentDownload,
} from '../utils/fileHelpers';
import { formatRelativeTime } from './PostCard';
import { UserBadgeTag } from './UserBadgeTag';
import { PdfReviewerViewer } from './PdfReviewerViewer';
import { playChatNotificationSound } from '../utils/soundEffects';
import {
  DB_UPDATE_EVENT,
  deleteLocalChatMessage,
  deleteLocalChatThreadForUser,
  getLocalChatMessages,
  markLocalChatThreadRead,
  upsertLocalChatMessage,
  upsertLocalChatThread,
  upsertLocalNotification,
} from '../utils/databaseRestore';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';
import campusStudyFallback from '../assets/images/campus_study_notes_1790401783483.jpg';

interface ChatDashboardProps {
  currentUserProfile: UserPublicProfile;
  threads: ChatThread[];
  presenceList: UserPresence[];
  activePeer: ChatPeerTarget | null;
  onSelectPeer: (peer: ChatPeerTarget | null) => void;
  isMobileFullDashboard?: boolean;
  isDesktopFullDashboard?: boolean;
  onCloseFullDashboard?: () => void;
  onMinimizeToPopup?: () => void;
  notifications?: NotificationItem[];
  onMarkChatThreadRead?: (chatId: string, peerUid: string) => Promise<void>;
  onMarkAllRead?: () => Promise<void>;
}

const CHAT_UPLOAD_BUTTONS: {
  type: AttachmentType;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { type: 'photo', label: 'Photo', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'pdf', label: 'Upload Files', icon: Upload },
];

const CHAT_REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍'] as const;

export const ChatMessageItem: React.FC<{
  msg: ChatMessage;
  isOwn: boolean;
  currentUserId?: string;
  isLastReadOwnMessage?: boolean;
  peerNickname?: string;
  peerPhotoURL?: string;
  onPreviewAttachment: (msg: ChatMessage, resolvedUrl: string) => void;
  onDeleteMessage: (msgId: string) => void;
  onMarkMessageRead: (msgId: string) => void;
  onReactMessage?: (msgId: string, emoji: string) => void;
}> = ({
  msg,
  isOwn,
  currentUserId,
  isLastReadOwnMessage = false,
  peerNickname,
  peerPhotoURL,
  onPreviewAttachment,
  onDeleteMessage,
  onMarkMessageRead,
  onReactMessage,
}) => {
  const [resolvedUrl, setResolvedUrl] = useState('');
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);

  useEffect(() => {
    let active = true;
    setImgFailed(false);
    const raw = msg.attachmentDataUrl || '';
    if (!raw) {
      setResolvedUrl('');
      setIsLoadingMedia(false);
      return;
    }
    setIsLoadingMedia(true);
    resolveMediaAttachmentUrl(raw)
      .then((resolved) => {
        if (active) {
          setResolvedUrl(resolved || raw);
          setIsLoadingMedia(false);
        }
      })
      .catch(() => {
        if (active) {
          setResolvedUrl(raw);
          setIsLoadingMedia(false);
        }
      });
    return () => {
      active = false;
    };
  }, [msg.attachmentDataUrl]);

  const attMeta = getAttachmentMeta(msg.attachmentType);
  const reactionsMap = msg.reactions || {};
  const reactionEntries = Object.entries(reactionsMap).filter(([, emoji]) => Boolean(emoji));
  const myReaction = currentUserId ? reactionsMap[currentUserId] : undefined;

  // Group reactions by emoji for Messenger-style pill display
  const groupedReactions = reactionEntries.reduce<Record<string, number>>((acc, [, emoji]) => {
    acc[emoji] = (acc[emoji] || 0) + 1;
    return acc;
  }, {});

  return (
    <div
      onClick={() => {
        if (!isOwn && !msg.read) {
          onMarkMessageRead(msg.id);
        }
      }}
      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} space-y-1.5 cursor-pointer group relative min-w-0 w-full`}
    >
      {/* Non-overlapping Emoji Reaction Picker Bar (stays inside chat column on both Mobile & Desktop) */}
      {showReactionPicker && onReactMessage && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`max-w-full bg-white border border-[#E8DFDC] rounded-full shadow-md px-2 py-1 flex flex-wrap items-center gap-1 z-20 ${
            isOwn ? 'self-end' : 'self-start'
          }`}
        >
          {CHAT_REACTION_EMOJIS.map((emoji) => {
            const isSelected = myReaction === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onReactMessage(msg.id, emoji);
                  setShowReactionPicker(false);
                }}
                className={`w-7 h-7 rounded-full flex items-center justify-center text-base hover:scale-115 transition-transform cursor-pointer ${
                  isSelected ? 'bg-[#7B1113]/15 ring-1 ring-[#7B1113]' : 'hover:bg-[#FAF8F5]'
                }`}
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}

      {/* Message Bubble + Non-Overlapping Side Action Controls */}
      <div
        className={`flex items-end gap-1.5 max-w-[92%] sm:max-w-[82%] min-w-0 ${
          isOwn ? 'flex-row-reverse' : 'flex-row'
        }`}
      >
        <div
          className={`relative min-w-0 max-w-full rounded-2xl px-3.5 py-2.5 space-y-2 transition-shadow overflow-hidden ${
            isOwn
              ? 'bg-[#7B1113] text-white rounded-br-xs shadow-xs'
              : msg.read
              ? 'bg-white border border-[#E8DFDC] text-[#1F1617] rounded-bl-xs'
              : 'bg-[#FFFDF7] border-2 border-[#D4AF37] text-[#1F1617] rounded-bl-xs shadow-xs'
          }`}
        >
          {msg.text && (
            <p className="text-sm leading-relaxed whitespace-pre-line break-words [word-break:break-word]">
              {msg.text}
            </p>
          )}

          {msg.attachmentType !== 'none' && msg.attachmentName && (
            <div className="pt-0.5">
              {msg.attachmentType === 'photo' ? (
                <div className="rounded-xl overflow-hidden border border-black/10 bg-black/5">
                  {isLoadingMedia && !resolvedUrl ? (
                    <div className="h-40 w-56 flex items-center justify-center text-xs opacity-75">
                      Loading photo...
                    </div>
                  ) : (
                    <img
                      src={!imgFailed && resolvedUrl ? resolvedUrl : campusStudyFallback}
                      alt="Chat attachment"
                      referrerPolicy="no-referrer"
                      onError={() => setImgFailed(true)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewAttachment(msg, resolvedUrl);
                      }}
                      className="max-h-64 w-full object-contain bg-black/5 cursor-zoom-in block"
                    />
                  )}
                </div>
              ) : msg.attachmentType === 'video' ? (
                <div
                  className="rounded-xl overflow-hidden border border-black/15 bg-black"
                  onClick={(e) => e.stopPropagation()}
                >
                  {isLoadingMedia && !resolvedUrl ? (
                    <div className="h-44 w-60 flex items-center justify-center text-xs text-white/80">
                      Loading video...
                    </div>
                  ) : resolvedUrl ? (
                    <video
                      key={resolvedUrl}
                      src={resolvedUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="max-h-64 w-full object-contain bg-black block"
                    />
                  ) : (
                    <div className="p-4 text-xs text-white/80 text-center">
                      Video preview unavailable
                    </div>
                  )}
                </div>
              ) : (
                <div
                  className={`p-2.5 rounded-xl border flex items-center justify-between gap-2.5 min-w-0 ${
                    isOwn
                      ? 'bg-[#580B0C] border-[#D4AF37]/40 text-white'
                      : 'bg-[#FAF8F5] border-[#E8DFDC] text-[#1F1617]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono text-[11px] font-semibold shrink-0 ${
                        isOwn
                          ? 'bg-[#7B1113] text-[#D4AF37]'
                          : 'bg-white text-[#7B1113] border border-[#E8DFDC]'
                      }`}
                    >
                      {attMeta.extBadge}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">{msg.attachmentName}</p>
                      <p
                        className={`text-[11px] font-mono tabular-nums truncate ${
                          isOwn ? 'text-[#F7EFE0]/80' : 'text-[#6E5D5F]'
                        }`}
                      >
                        {attMeta.label} · {formatFileSize(msg.attachmentSize)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewAttachment(msg, resolvedUrl);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 min-h-[30px] ${
                        isOwn
                          ? 'bg-white/15 hover:bg-white/25 text-white'
                          : 'bg-white hover:bg-[#F2ECE9] text-[#1F1617] border border-[#E8DFDC]'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerAttachmentDownload(resolvedUrl, msg.attachmentName);
                      }}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 min-h-[30px] ${
                        isOwn ? 'bg-[#D4AF37] text-[#1F1617]' : 'bg-[#7B1113] text-white'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Message Actions: React Emoji Button + Delete (for own message) */}
        <div className="flex items-center gap-1 shrink-0 pb-0.5">
          {onReactMessage && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowReactionPicker((prev) => !prev);
              }}
              className={`w-7 h-7 rounded-full border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                showReactionPicker || myReaction
                  ? 'bg-[#FAF8F5] border-[#D4AF37] text-[#7B1113] opacity-100'
                  : 'bg-white/95 border-[#E8DFDC] text-[#6E5D5F] hover:text-[#7B1113] hover:border-[#D4AF37] opacity-100'
              }`}
              title="React to message"
              aria-label="React to message"
            >
              {myReaction ? (
                <span className="text-xs leading-none">{myReaction}</span>
              ) : (
                <SmilePlus className="w-3.5 h-3.5" />
              )}
            </button>
          )}

          {isOwn && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteMessage(msg.id);
              }}
              className="w-7 h-7 rounded-full bg-white/95 border border-[#E8DFDC] text-[#6E5D5F] hover:text-rose-700 hover:border-rose-200 flex items-center justify-center opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer shrink-0"
              title="Delete message"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Dedicated Non-Overlapping Active Reactions Row Below Bubble */}
      {reactionEntries.length > 0 && (
        <div
          className={`flex flex-wrap items-center gap-1 px-1 ${
            isOwn ? 'justify-end self-end' : 'justify-start self-start'
          }`}
        >
          {Object.entries(groupedReactions).map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (onReactMessage) onReactMessage(msg.id, emoji);
              }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-[#E8DFDC] shadow-2xs text-xs text-[#1F1617] hover:border-[#D4AF37] transition-colors cursor-pointer"
              title="Click to toggle reaction"
            >
              <span>{emoji}</span>
              {count > 1 && (
                <span className="text-[10px] font-mono font-semibold text-[#6E5D5F]">
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Messenger-Style Relative Timestamp + Sent / Seen Status Below the Message */}
      <div
        className={`flex items-center gap-1.5 px-1 text-[11px] text-[#6E5D5F] font-mono tabular-nums ${
          isOwn ? 'justify-end' : 'justify-start'
        }`}
      >
        <span>{formatRelativeTime(msg.createdAt)}</span>
        <span aria-hidden="true">·</span>
        {isOwn ? (
          msg.read ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-sans font-medium">
              <CheckCheck className="w-3 h-3 text-emerald-600 shrink-0" />
              <span>
                {isLastReadOwnMessage
                  ? `Seen${msg.readAt ? ` ${formatRelativeTime(msg.readAt)}` : ''}`
                  : 'Seen'}
              </span>
              {isLastReadOwnMessage && (
                <img
                  src={peerPhotoURL || studentAvatarFallback}
                  alt={peerNickname || 'Seen'}
                  referrerPolicy="no-referrer"
                  className="w-3.5 h-3.5 rounded-full object-cover border border-emerald-500 shrink-0 ml-0.5"
                />
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5 font-sans">
              <Check className="w-3 h-3 text-[#9E8E90] shrink-0" />
              <span>Sent</span>
            </span>
          )
        ) : (
          <span className="font-sans">{msg.read ? 'Sent' : 'Unread · Sent'}</span>
        )}
      </div>
    </div>
  );
};

export const ChatDashboard: React.FC<ChatDashboardProps> = ({
  currentUserProfile,
  threads,
  presenceList,
  activePeer,
  onSelectPeer,
  isMobileFullDashboard = false,
  isDesktopFullDashboard = false,
  onCloseFullDashboard,
  onMinimizeToPopup,
  notifications = [],
  onMarkChatThreadRead,
  onMarkAllRead,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [attachment, setAttachment] = useState<ProcessedAttachment | null>(null);
  const [activeUploadType, setActiveUploadType] = useState<AttachmentType>('none');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSharedFilesDrawer, setShowSharedFilesDrawer] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread'>('all');
  const [inboxSearch, setInboxSearch] = useState('');
  const [previewTarget, setPreviewTarget] = useState<{
    msg: ChatMessage;
    url: string;
  } | null>(null);
  const [confirmDeleteChatTarget, setConfirmDeleteChatTarget] = useState<{
    chatId: string;
    peerName: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const currentUserBadge = resolveUserBadge(currentUserProfile.badge);

  // Auto-select first thread peer on desktop if none selected
  useEffect(() => {
    if (!isMobileFullDashboard && !activePeer && threads.length > 0) {
      const first = threads[0];
      const isUserA = first.userAId === currentUserProfile.uid;
      onSelectPeer({
        uid: isUserA ? first.userBId : first.userAId,
        nickname: isUserA ? first.userBNickname : first.userANickname,
        photoURL: isUserA ? first.userBPhotoURL : first.userAPhotoURL,
        badge: isUserA ? first.userBBadge : first.userABadge,
      });
    }
  }, [isMobileFullDashboard, activePeer, threads, currentUserProfile.uid, onSelectPeer]);

  const activeChatId = activePeer
    ? buildChatId(currentUserProfile.uid, activePeer.uid)
    : null;

  // Mark all unread incoming messages in the active chat as read
  const markActiveConversationRead = useCallback(async () => {
    if (!activeChatId || !activePeer) return;

    const existingThread = threads.find((t) => t.id === activeChatId);
    const unreadMsgs = messages.filter(
      (m) => m.recipientId === currentUserProfile.uid && !m.read
    );
    if (
      unreadMsgs.length > 0 ||
      (existingThread &&
        existingThread.lastSenderId === activePeer.uid &&
        !existingThread.lastMessageRead)
    ) {
      markLocalChatThreadRead(activeChatId, currentUserProfile.uid);
      setMessages(getLocalChatMessages(activeChatId, currentUserProfile.uid));
      if (canUseFirestore(currentUserProfile.uid)) {
        const batch = writeBatch(db);
        for (const m of unreadMsgs) {
          batch.update(doc(db, 'chats', activeChatId, 'messages', m.id), {
            read: true,
            readAt: serverTimestamp(),
          });
        }
        if (
          existingThread &&
          existingThread.lastSenderId === activePeer.uid &&
          !existingThread.lastMessageRead
        ) {
          batch.update(doc(db, 'chats', activeChatId), {
            lastMessageRead: true,
            lastMessageReadAt: serverTimestamp(),
          });
        }
        batch.commit().catch(() => {
          for (const m of unreadMsgs) {
            updateDoc(doc(db, 'chats', activeChatId, 'messages', m.id), {
              read: true,
              readAt: serverTimestamp(),
            }).catch(() => {});
          }
          if (
            existingThread &&
            existingThread.lastSenderId === activePeer.uid &&
            !existingThread.lastMessageRead
          ) {
            updateDoc(doc(db, 'chats', activeChatId), {
              lastMessageRead: true,
              lastMessageReadAt: serverTimestamp(),
            }).catch(() => {});
          }
        });
      }
    }

    // Also mark matching notifications as read
    if (onMarkChatThreadRead) {
      onMarkChatThreadRead(activeChatId, activePeer.uid).catch(() => {});
    }
  }, [activeChatId, activePeer, messages, threads, currentUserProfile.uid, onMarkChatThreadRead]);

  // Click on a specific message to mark it read
  const handleMarkSingleMessageRead = async (msgId: string) => {
    if (!activeChatId) return;
    const targetMsg = messages.find((m) => m.id === msgId);
    if (targetMsg) {
      upsertLocalChatMessage({
        ...targetMsg,
        read: true,
        readAt: Timestamp.now(),
      });
    }
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, read: true, readAt: Timestamp.now() } : m))
    );
    if (activePeer) {
      const existingThread = threads.find((t) => t.id === activeChatId);
      if (
        existingThread &&
        existingThread.lastSenderId === activePeer.uid &&
        !existingThread.lastMessageRead
      ) {
        upsertLocalChatThread({
          ...existingThread,
          lastMessageRead: true,
          lastMessageReadAt: Timestamp.now(),
        });
      }
      if (onMarkChatThreadRead) {
        onMarkChatThreadRead(activeChatId, activePeer.uid).catch(() => {});
      }
    }
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'chats', activeChatId, 'messages', msgId), {
        read: true,
        readAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `chats/${activeChatId}/messages/${msgId}`);
      });
      if (activePeer) {
        const existingThread = threads.find((t) => t.id === activeChatId);
        if (
          existingThread &&
          existingThread.lastSenderId === activePeer.uid &&
          !existingThread.lastMessageRead
        ) {
          updateDoc(doc(db, 'chats', activeChatId), {
            lastMessageRead: true,
            lastMessageReadAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
    }
  };

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    const initialLocal = getLocalChatMessages(activeChatId, currentUserProfile.uid);
    setMessages(initialLocal);
    markLocalChatThreadRead(activeChatId, currentUserProfile.uid);
    if (activePeer && onMarkChatThreadRead) {
      onMarkChatThreadRead(activeChatId, activePeer.uid).catch(() => {});
    }

    const handleLocalUpdate = (ev: Event) => {
      const customEv = ev as CustomEvent<{ collection?: string }>;
      const col = customEv.detail?.collection;
      if (!col || col === 'all' || col === 'messages') {
        const latest = getLocalChatMessages(activeChatId, currentUserProfile.uid);
        setMessages(latest);
        if (latest.some((m) => m.recipientId === currentUserProfile.uid && !m.read)) {
          markLocalChatThreadRead(activeChatId, currentUserProfile.uid);
          if (activePeer && onMarkChatThreadRead) {
            onMarkChatThreadRead(activeChatId, activePeer.uid).catch(() => {});
          }
        }
      }
    };
    window.addEventListener(DB_UPDATE_EVENT, handleLocalUpdate);

    const messagesPath = `chats/${activeChatId}/messages`;
    let unsub = () => {};
    if (canUseFirestore(currentUserProfile.uid)) {
      const q = query(
        collection(db, messagesPath),
        where('participantIds', 'array-contains', currentUserProfile.uid)
      );

      let initialSnapshot = true;
      const knownIds = new Set<string>();

      unsub = onSnapshot(
        q,
        (snap) => {
          const list: ChatMessage[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ChatMessage, 'id'>),
          }));
          if (!initialSnapshot) {
            const hasNewIncoming = list.some(
              (m) =>
                m.recipientId === currentUserProfile.uid &&
                !m.read &&
                !knownIds.has(m.id)
            );
            if (hasNewIncoming) {
              playChatNotificationSound();
            }
          }
          initialSnapshot = false;
          list.forEach((m) => {
            knownIds.add(m.id);
            upsertLocalChatMessage(m);
          });
          const merged = getLocalChatMessages(activeChatId, currentUserProfile.uid);
          setMessages(merged);

          // Auto-mark incoming unread messages as read when viewing this chat
          const unreadIncoming = merged.filter(
            (m) => m.recipientId === currentUserProfile.uid && !m.read
          );
          if (unreadIncoming.length > 0) {
            for (const m of unreadIncoming) {
              upsertLocalChatMessage({
                ...m,
                read: true,
                readAt: Timestamp.now(),
              });
            }
            const batch = writeBatch(db);
            for (const m of unreadIncoming) {
              batch.update(doc(db, 'chats', activeChatId, 'messages', m.id), {
                read: true,
                readAt: serverTimestamp(),
              });
            }
            batch.update(doc(db, 'chats', activeChatId), {
              lastMessageRead: true,
              lastMessageReadAt: serverTimestamp(),
            });
            batch.commit().catch(() => {
              for (const m of unreadIncoming) {
                updateDoc(doc(db, 'chats', activeChatId, 'messages', m.id), {
                  read: true,
                  readAt: serverTimestamp(),
                }).catch(() => {});
              }
            });
            if (activePeer && onMarkChatThreadRead) {
              onMarkChatThreadRead(activeChatId, activePeer.uid).catch(() => {});
            }
          }

          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 80);
        },
        (err) => {
          handleFirestoreError(err, OperationType.LIST, messagesPath);
          setMessages(getLocalChatMessages(activeChatId, currentUserProfile.uid));
        }
      );
    }

    return () => {
      window.removeEventListener(DB_UPDATE_EVENT, handleLocalUpdate);
      unsub();
    };
  }, [activeChatId, currentUserProfile.uid, activePeer, onMarkChatThreadRead]);

  const handleTriggerFileSelect = (type: AttachmentType) => {
    setActiveUploadType(type);
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
      const processed = await processUploadedFile(file, activeUploadType);
      setAttachment(processed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not attach file.');
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePeer || !activeChatId) return;
    if (isOneOfficialAccount(activePeer.uid || activePeer.nickname, activePeer.badge)) {
      return;
    }

    const trimmed = messageText.trim();
    if (!trimmed && !attachment) {
      return;
    }

    setIsSending(true);
    setError(null);

    const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const notifId = `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const chatRef = doc(db, 'chats', activeChatId);
    const msgRef = doc(db, 'chats', activeChatId, 'messages', msgId);
    const notifRef = doc(db, 'notifications', notifId);

    const sortedUids = [currentUserProfile.uid, activePeer.uid].sort();
    const isMeUserA = sortedUids[0] === currentUserProfile.uid;

    const summaryPreview = trimmed
      ? trimmed.slice(0, 180)
      : `Sent ${attachment?.attachmentName || 'a file'}`;

    const existingThread = threads.find((t) => t.id === activeChatId);

    const localThreadObj: ChatThread = {
      id: activeChatId,
      participantIds: sortedUids,
      userAId: isMeUserA ? currentUserProfile.uid : activePeer.uid,
      userANickname: (isMeUserA ? currentUserProfile.nickname : activePeer.nickname).slice(0, 64),
      userAPhotoURL: (
        isMeUserA ? currentUserProfile.photoURL || '' : activePeer.photoURL || ''
      ).slice(0, 350000),
      userABadge: isMeUserA ? currentUserBadge : resolveUserBadge(activePeer.badge),
      userBId: isMeUserA ? activePeer.uid : currentUserProfile.uid,
      userBNickname: (isMeUserA ? activePeer.nickname : currentUserProfile.nickname).slice(0, 64),
      userBPhotoURL: (
        isMeUserA ? activePeer.photoURL || '' : currentUserProfile.photoURL || ''
      ).slice(0, 350000),
      userBBadge: isMeUserA ? resolveUserBadge(activePeer.badge) : currentUserBadge,
      lastMessage: summaryPreview.slice(0, 300),
      lastSenderId: currentUserProfile.uid,
      lastMessageRead: false,
      lastMessageReadAt: null,
      createdAt: existingThread?.createdAt || Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    const localMsgObj: ChatMessage = {
      id: msgId,
      chatId: activeChatId,
      participantIds: sortedUids,
      senderId: currentUserProfile.uid,
      recipientId: activePeer.uid,
      senderNickname: currentUserProfile.nickname.slice(0, 64),
      senderPhotoURL: (currentUserProfile.photoURL || '').slice(0, 350000),
      senderBadge: currentUserBadge,
      text: trimmed.slice(0, 3000),
      attachmentType: attachment ? attachment.attachmentType : 'none',
      attachmentName: attachment ? attachment.attachmentName.slice(0, 255) : '',
      attachmentSize: attachment ? attachment.attachmentSize : 0,
      attachmentMime: attachment ? attachment.attachmentMime.slice(0, 120) : '',
      attachmentDataUrl: attachment ? attachment.attachmentDataUrl.slice(0, 750000) : '',
      read: false,
      createdAt: Timestamp.now(),
    };

    upsertLocalChatThread(localThreadObj);
    upsertLocalChatMessage(localMsgObj);
    setMessages(getLocalChatMessages(activeChatId, currentUserProfile.uid));
    setMessageText('');
    setAttachment(null);
    setIsSending(false);

    if (activePeer.uid !== currentUserProfile.uid && activePeer.uid !== ONE_OFFICIAL_UID) {
      upsertLocalNotification({
        id: notifId,
        recipientId: activePeer.uid,
        actorId: currentUserProfile.uid,
        actorNickname: currentUserProfile.nickname.slice(0, 64),
        actorPhotoURL: (currentUserProfile.photoURL || '').slice(0, 350000),
        actorBadge: currentUserBadge,
        type: 'message',
        targetId: activeChatId,
        previewText: summaryPreview.slice(0, 240),
        read: false,
        createdAt: Timestamp.now(),
      });
    }

    if (canUseFirestore(currentUserProfile.uid)) {
      const batch = writeBatch(db);

      if (!existingThread) {
        batch.set(chatRef, {
          participantIds: sortedUids,
          userAId: isMeUserA ? currentUserProfile.uid : activePeer.uid,
          userANickname: (isMeUserA ? currentUserProfile.nickname : activePeer.nickname).slice(0, 64),
          userAPhotoURL: (
            isMeUserA ? currentUserProfile.photoURL || '' : activePeer.photoURL || ''
          ).slice(0, 350000),
          userABadge: isMeUserA ? currentUserBadge : resolveUserBadge(activePeer.badge),
          userBId: isMeUserA ? activePeer.uid : currentUserProfile.uid,
          userBNickname: (isMeUserA ? activePeer.nickname : currentUserProfile.nickname).slice(0, 64),
          userBPhotoURL: (
            isMeUserA ? activePeer.photoURL || '' : currentUserProfile.photoURL || ''
          ).slice(0, 350000),
          userBBadge: isMeUserA ? resolveUserBadge(activePeer.badge) : currentUserBadge,
          lastMessage: summaryPreview.slice(0, 300),
          lastSenderId: currentUserProfile.uid,
          lastMessageRead: false,
          lastMessageReadAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(chatRef, {
          userANickname: (isMeUserA ? currentUserProfile.nickname : activePeer.nickname).slice(0, 64),
          userAPhotoURL: (
            isMeUserA ? currentUserProfile.photoURL || '' : activePeer.photoURL || ''
          ).slice(0, 350000),
          userABadge: isMeUserA ? currentUserBadge : resolveUserBadge(activePeer.badge),
          userBNickname: (isMeUserA ? activePeer.nickname : currentUserProfile.nickname).slice(0, 64),
          userBPhotoURL: (
            isMeUserA ? activePeer.photoURL || '' : currentUserProfile.photoURL || ''
          ).slice(0, 350000),
          userBBadge: isMeUserA ? resolveUserBadge(activePeer.badge) : currentUserBadge,
          lastMessage: summaryPreview.slice(0, 300),
          lastSenderId: currentUserProfile.uid,
          lastMessageRead: false,
          lastMessageReadAt: null,
          updatedAt: serverTimestamp(),
        });
      }

      batch.set(msgRef, {
        chatId: activeChatId,
        participantIds: sortedUids,
        senderId: currentUserProfile.uid,
        recipientId: activePeer.uid,
        senderNickname: currentUserProfile.nickname.slice(0, 64),
        senderPhotoURL: (currentUserProfile.photoURL || '').slice(0, 350000),
        senderBadge: currentUserBadge,
        text: trimmed.slice(0, 3000),
        attachmentType: attachment ? attachment.attachmentType : 'none',
        attachmentName: attachment ? attachment.attachmentName.slice(0, 255) : '',
        attachmentSize: attachment ? attachment.attachmentSize : 0,
        attachmentMime: attachment ? attachment.attachmentMime.slice(0, 120) : '',
        attachmentDataUrl: attachment ? attachment.attachmentDataUrl.slice(0, 750000) : '',
        read: false,
        createdAt: serverTimestamp(),
      });

      batch.commit().catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `chats/${activeChatId}/messages/${msgId}`);
      });

      if (activePeer.uid !== currentUserProfile.uid && activePeer.uid !== ONE_OFFICIAL_UID) {
        setDoc(notifRef, {
          recipientId: activePeer.uid,
          actorId: currentUserProfile.uid,
          actorNickname: currentUserProfile.nickname.slice(0, 64),
          actorPhotoURL: (currentUserProfile.photoURL || '').slice(0, 350000),
          actorBadge: currentUserBadge,
          type: 'message',
          targetId: activeChatId,
          previewText: summaryPreview.slice(0, 240),
          read: false,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  };

  const handleDeleteMessage = async (msgId: string) => {
    if (!activeChatId) return;
    deleteLocalChatMessage(msgId);
    setMessages(getLocalChatMessages(activeChatId, currentUserProfile.uid));
    if (canUseFirestore(currentUserProfile.uid)) {
      deleteDoc(doc(db, 'chats', activeChatId, 'messages', msgId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, `chats/${activeChatId}/messages/${msgId}`);
      });
    }
  };

  const handleDeleteConversationForSelf = async (chatId: string) => {
    if (!chatId) return;
    const existingThread = threads.find((t) => t.id === chatId);
    deleteLocalChatThreadForUser(chatId, currentUserProfile.uid);
    if (activeChatId === chatId) {
      setMessages([]);
      onSelectPeer(null);
    }
    setConfirmDeleteChatTarget(null);

    if (canUseFirestore(currentUserProfile.uid) && existingThread) {
      const prevDeletedBy = Array.isArray(existingThread.deletedBy)
        ? existingThread.deletedBy
        : [];
      if (!prevDeletedBy.includes(currentUserProfile.uid)) {
        updateDoc(doc(db, 'chats', chatId), {
          deletedBy: [...prevDeletedBy, currentUserProfile.uid],
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
  };

  const handleReactMessage = async (msgId: string, emoji: string) => {
    if (!activeChatId) return;
    const targetMsg = messages.find((m) => m.id === msgId);
    if (!targetMsg) return;
    const currentReactions = { ...(targetMsg.reactions || {}) };
    const isRemoving = currentReactions[currentUserProfile.uid] === emoji;
    if (isRemoving) {
      delete currentReactions[currentUserProfile.uid];
    } else {
      currentReactions[currentUserProfile.uid] = emoji;
    }
    const updatedMsg: ChatMessage = {
      ...targetMsg,
      reactions: currentReactions,
    };
    upsertLocalChatMessage(updatedMsg);
    setMessages(getLocalChatMessages(activeChatId, currentUserProfile.uid));

    if (
      !isRemoving &&
      activePeer &&
      activePeer.uid !== currentUserProfile.uid &&
      activePeer.uid !== ONE_OFFICIAL_UID
    ) {
      const snippet = (targetMsg.text || targetMsg.attachmentName || 'a message').slice(0, 60);
      const reactionPreview = `Reacted ${emoji} to "${snippet}"`;
      const existingThread = threads.find((t) => t.id === activeChatId);
      const sortedUids = [currentUserProfile.uid, activePeer.uid].sort();
      const isMeUserA = sortedUids[0] === currentUserProfile.uid;

      upsertLocalChatThread({
        id: activeChatId,
        participantIds: sortedUids,
        userAId: isMeUserA ? currentUserProfile.uid : activePeer.uid,
        userANickname: (isMeUserA ? currentUserProfile.nickname : activePeer.nickname).slice(0, 64),
        userAPhotoURL: (
          isMeUserA ? currentUserProfile.photoURL || '' : activePeer.photoURL || ''
        ).slice(0, 350000),
        userABadge: isMeUserA ? currentUserBadge : resolveUserBadge(activePeer.badge),
        userBId: isMeUserA ? activePeer.uid : currentUserProfile.uid,
        userBNickname: (isMeUserA ? activePeer.nickname : currentUserProfile.nickname).slice(0, 64),
        userBPhotoURL: (
          isMeUserA ? activePeer.photoURL || '' : currentUserProfile.photoURL || ''
        ).slice(0, 350000),
        userBBadge: isMeUserA ? resolveUserBadge(activePeer.badge) : currentUserBadge,
        lastMessage: reactionPreview.slice(0, 300),
        lastSenderId: currentUserProfile.uid,
        lastMessageRead: false,
        lastMessageReadAt: null,
        createdAt: existingThread?.createdAt || Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const reactNotifId = `ntf_react_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const reactNotif: NotificationItem = {
        id: reactNotifId,
        recipientId: activePeer.uid,
        actorId: currentUserProfile.uid,
        actorNickname: currentUserProfile.nickname.slice(0, 64),
        actorPhotoURL: (currentUserProfile.photoURL || '').slice(0, 350000),
        actorBadge: currentUserBadge,
        type: 'message',
        targetId: activeChatId,
        previewText: reactionPreview.slice(0, 240),
        read: false,
        createdAt: Timestamp.now(),
      };
      upsertLocalNotification(reactNotif);

      if (canUseFirestore(currentUserProfile.uid)) {
        setDoc(doc(db, 'notifications', reactNotifId), {
          ...reactNotif,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    }

    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'chats', activeChatId, 'messages', msgId), {
        reactions: currentReactions,
      }).catch(() => {});
    }
  };

  const isPeerOneOfficial = activePeer
    ? isOneOfficialAccount(activePeer.uid || activePeer.nickname, activePeer.badge)
    : false;
  const peerPresence = activePeer
    ? presenceList.find((p) => p.uid === activePeer.uid)
    : undefined;
  const peerOnline = isPeerOneOfficial || isUserCurrentlyOnline(peerPresence);
  const sharedChatAttachments = messages.filter(
    (m) => m.attachmentType !== 'none' && m.attachmentName
  );
  const attachmentMeta = attachment ? getAttachmentMeta(attachment.attachmentType) : null;

  const totalUnreadChatNotifications = notifications.filter(
    (n) => n.type === 'message' && !n.read
  ).length;

  const decodedModalText =
    previewTarget &&
    ['pdf', 'word', 'excel', 'ppt'].includes(previewTarget.msg.attachmentType)
      ? decodeDocumentPreviewText(previewTarget.url)
      : null;

  const renderConversationPane = () => {
    if (!activePeer) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-[#7B1113]/10 text-[#7B1113] flex items-center justify-center">
            <MessageCircle className="w-6 h-6" />
          </div>
          <h3 className="font-display text-2xl text-[#7B1113]">Select a Student to Chat</h3>
          <p className="text-xs text-[#6E5D5F] max-w-xs">
            Choose a conversation on the left or click <strong>Chat</strong> on any student post or
            online user to send messages, photos, and Microsoft Office files.
          </p>
        </div>
      );
    }

    return (
      <div
        className="flex-1 flex flex-col h-full min-h-0"
        onClick={markActiveConversationRead}
      >
        {/* Conversation Header */}
        <div
          className={`px-4 py-3 border-b flex items-center justify-between gap-3 shrink-0 ${
            isMobileFullDashboard
              ? 'bg-[#7B1113] text-white border-[#D4AF37]/40'
              : 'bg-white text-[#1F1617] border-[#E8DFDC]'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
            {isMobileFullDashboard && (
              <button
                type="button"
                onClick={() => onSelectPeer(null)}
                className="p-2 -ml-1 text-[#D4AF37] hover:text-white rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer shrink-0"
                title="Back to Chats"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}

            <div className="relative shrink-0">
              <img
                src={resolvePeerAvatar(
                  activePeer.photoURL,
                  activePeer.uid,
                  activePeer.nickname,
                  activePeer.badge,
                  studentAvatarFallback
                )}
                alt={activePeer.nickname}
                referrerPolicy="no-referrer"
                className="w-10 h-10 rounded-full object-cover border-2 border-[#D4AF37]"
              />
              <span
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                  peerOnline ? 'bg-emerald-500' : 'bg-stone-300'
                }`}
              />
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-1.5 min-w-0 max-w-full overflow-hidden">
                <span
                  className={`text-sm font-semibold truncate ${
                    isMobileFullDashboard ? 'text-white' : 'text-[#1F1617]'
                  }`}
                >
                  {formatPeerDisplayName(
                    activePeer.nickname,
                    activePeer.uid,
                    activePeer.badge
                  )}
                </span>
                <span className="shrink-0">
                  <UserBadgeTag
                    badge={isPeerOneOfficial ? 'one_official' : activePeer.badge}
                    size="sm"
                  />
                </span>
              </div>
              <p
                className={`text-xs truncate ${
                  isMobileFullDashboard ? 'text-[#F7EFE0]/85' : 'text-[#6E5D5F]'
                }`}
              >
                {isPeerOneOfficial
                  ? 'Official ONE Welcome · Direct Message'
                  : `${peerOnline ? 'Online now' : 'Offline'} · Direct Chat`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowSharedFilesDrawer((prev) => !prev)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 shrink-0 min-h-[36px] cursor-pointer ${
                isMobileFullDashboard
                  ? 'bg-[#580B0C] text-[#F7EFE0] border border-[#D4AF37]/40'
                  : 'bg-[#FAF8F5] text-[#7B1113] border border-[#E8DFDC]'
              }`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
              <span>Files ({sharedChatAttachments.length})</span>
            </button>
            {activeChatId && (
              <button
                type="button"
                onClick={() =>
                  setConfirmDeleteChatTarget({
                    chatId: activeChatId,
                    peerName: formatPeerDisplayName(
                      activePeer.nickname,
                      activePeer.uid,
                      activePeer.badge
                    ),
                  })
                }
                className={`p-2 rounded-xl text-xs font-medium flex items-center justify-center shrink-0 min-h-[36px] min-w-[36px] cursor-pointer transition-colors ${
                  isMobileFullDashboard
                    ? 'bg-[#580B0C] text-rose-200 hover:text-white border border-[#D4AF37]/40'
                    : 'bg-[#FAF8F5] text-rose-700 hover:bg-rose-50 border border-[#E8DFDC]'
                }`}
                title="Delete conversation for me"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {confirmDeleteChatTarget && (
          <div className="px-4 py-2.5 bg-rose-50 border-b border-rose-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <p className="text-xs text-rose-900">
              Delete conversation with <strong>{confirmDeleteChatTarget.peerName}</strong> from your
              inbox? Their copy of the conversation will still remain intact.
            </p>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setConfirmDeleteChatTarget(null)}
                className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-xs font-medium text-[#6E5D5F] hover:text-[#1F1617] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteConversationForSelf(confirmDeleteChatTarget.chatId)}
                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
              >
                Delete for Me
              </button>
            </div>
          </div>
        )}

        {/* Optional Shared Files Sub-Bar */}
        {showSharedFilesDrawer && (
          <div className="p-3 bg-[#F7EFE0]/50 border-b border-[#E8DFDC] space-y-2 max-h-40 overflow-y-auto shrink-0">
            <div className="flex items-center justify-between text-xs font-semibold text-[#7B1113]">
              <span>Shared Photos &amp; Microsoft Files in this Chat</span>
              <button
                type="button"
                onClick={() => setShowSharedFilesDrawer(false)}
                className="text-[#6E5D5F] hover:text-[#1F1617]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {sharedChatAttachments.length === 0 ? (
              <p className="text-xs text-[#6E5D5F]">
                No photos or documents shared in this conversation yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sharedChatAttachments.map((m) => {
                  const meta = getAttachmentMeta(m.attachmentType);
                  return (
                    <div
                      key={`shared-${m.id}`}
                      className="p-2 rounded-xl bg-white border border-[#E8DFDC] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-[#1F1617] truncate">{m.attachmentName}</p>
                        <p className="text-[11px] font-mono text-[#6E5D5F]">
                          {meta.extBadge} · {formatFileSize(m.attachmentSize)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          triggerAttachmentDownload(m.attachmentDataUrl, m.attachmentName)
                        }
                        className="p-1.5 text-[#7B1113] hover:bg-[#FAF8F5] rounded-lg shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Messages Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF8F5]">
          {messages.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <p className="text-sm font-semibold text-[#1F1617]">
                Start chatting with @{activePeer.nickname}
              </p>
              <p className="text-xs text-[#6E5D5F] max-w-xs mx-auto">
                You can send messages, Photos, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), and
                PDF files below.
              </p>
            </div>
          ) : (
            (() => {
              // Find the ID of the latest outgoing message that has been read by the recipient
              const lastReadOwnMsg = [...messages]
                .reverse()
                .find((m) => m.senderId === currentUserProfile.uid && m.read);
              return messages.map((m) => (
                <ChatMessageItem
                  key={m.id}
                  msg={m}
                  isOwn={m.senderId === currentUserProfile.uid}
                  currentUserId={currentUserProfile.uid}
                  isLastReadOwnMessage={lastReadOwnMsg?.id === m.id}
                  peerNickname={activePeer.nickname}
                  peerPhotoURL={activePeer.photoURL}
                  onPreviewAttachment={(msg, url) => setPreviewTarget({ msg, url })}
                  onDeleteMessage={handleDeleteMessage}
                  onMarkMessageRead={handleMarkSingleMessageRead}
                  onReactMessage={handleReactMessage}
                />
              ));
            })()
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Composer Footer */}
        {isPeerOneOfficial ? (
          <div className="p-3.5 bg-[#FAF8F5] border-t border-[#E8DFDC] flex items-center justify-center gap-2 text-center shrink-0">
            <div className="w-6 h-6 rounded-lg bg-[#7B1113]/10 text-[#7B1113] flex items-center justify-center shrink-0">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <p className="text-xs font-medium text-[#6E5D5F]">
              Official <strong className="text-[#7B1113]">ONE</strong> Broadcast Channel · You
              cannot reply to automated ONE messages.
            </p>
          </div>
        ) : (
          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-white border-t border-[#E8DFDC] space-y-2.5 shrink-0"
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Attach file in chat"
            />

            <AnimatePresence>
              {isProcessingFile && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="p-2.5 rounded-xl bg-[#7B1113]/5 border border-[#D4AF37]/60 space-y-1.5"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#7B1113]">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="w-3.5 h-3.5 rounded-full border-2 border-[#7B1113]/25 border-t-[#7B1113]"
                    />
                    <span>Uploading attachment...</span>
                  </div>
                  <div className="w-full h-1.5 bg-[#E8DFDC] rounded-full overflow-hidden">
                    <motion.div
                      initial={{ x: '-100%' }}
                      animate={{ x: '100%' }}
                      transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                      className="w-full h-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {attachment && attachmentMeta && (
              <div className="p-2.5 rounded-xl bg-[#F7EFE0]/50 border border-[#D4AF37]/60 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#7B1113] text-[#D4AF37] flex items-center justify-center font-mono text-xs font-semibold shrink-0">
                      {attachmentMeta.extBadge}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#1F1617] truncate">
                        {attachment.attachmentName}
                      </p>
                      <p className="text-[11px] font-mono text-[#6E5D5F]">
                        {attachmentMeta.label} · {formatFileSize(attachment.attachmentSize)}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    className="p-1.5 text-[#6E5D5F] hover:text-[#7B1113] rounded-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {attachment.attachmentType === 'photo' &&
                  (attachment.previewUrl || attachment.attachmentDataUrl) && (
                    <img
                      src={attachment.previewUrl || attachment.attachmentDataUrl}
                      alt={attachment.attachmentName}
                      className="max-h-36 rounded-lg object-contain border border-[#E8DFDC] bg-white"
                    />
                  )}
                {attachment.attachmentType === 'video' &&
                  (attachment.previewUrl || attachment.attachmentDataUrl) && (
                    <video
                      src={attachment.previewUrl || attachment.attachmentDataUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="max-h-40 w-full rounded-lg bg-black object-contain"
                    />
                  )}
              </div>
            )}

            {error && (
              <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {error}
              </div>
            )}

            {/* Quick File Buttons for Photos & Microsoft Office Files */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {CHAT_UPLOAD_BUTTONS.map((btn) => {
                const IconComp = btn.icon;
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
                    onClick={() => handleTriggerFileSelect(btn.type)}
                    disabled={isProcessingFile}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 min-h-[32px] cursor-pointer ${
                      isSelected
                        ? 'bg-[#7B1113] text-white border-[#7B1113]'
                        : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC] hover:bg-[#F2ECE9]'
                    }`}
                  >
                    <IconComp
                      className={`w-3.5 h-3.5 ${
                        isSelected ? 'text-[#D4AF37]' : 'text-[#7B1113]'
                      }`}
                    />
                    <span>{btn.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                maxLength={3000}
                placeholder={`Message ${formatPeerDisplayName(
                  activePeer.nickname,
                  activePeer.uid,
                  activePeer.badge
                )}...`}
                className="flex-1 px-3.5 py-2.5 text-sm bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113] min-h-[42px]"
              />
              <button
                type="submit"
                disabled={isSending || isProcessingFile || (!messageText.trim() && !attachment)}
                className="px-4 py-2.5 bg-[#7B1113] hover:bg-[#580B0C] disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors flex items-center gap-1.5 min-h-[42px] shrink-0 cursor-pointer"
              >
                <Send className="w-4 h-4 text-[#D4AF37]" />
                <span>Send</span>
              </button>
            </div>
          </form>
        )}
      </div>
    );
  };

  // =========================================================================
  // MOBILE FULL-SCREEN CHAT DASHBOARD WHEN CHATTING WITH A USER
  // =========================================================================
  if (isMobileFullDashboard && activePeer) {
    return (
      <div className="fixed inset-0 z-[60] h-[100dvh] max-h-[100dvh] bg-[#FAF8F5] flex flex-col overflow-hidden">
        {renderConversationPane()}

        {/* File Preview Modal inside Mobile Chat Dashboard */}
        {previewTarget && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white border border-[#E8DFDC] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-[#E8DFDC] flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-[#1F1617] truncate">
                  {previewTarget.msg.attachmentName}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      triggerAttachmentDownload(
                        previewTarget.url,
                        previewTarget.msg.attachmentName
                      )
                    }
                    className="px-3 py-1.5 bg-[#7B1113] text-white text-xs font-medium rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Download</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewTarget(null)}
                    className="p-1.5 text-[#6E5D5F] hover:text-[#1F1617] cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="p-4 overflow-y-auto flex-1 bg-[#FAF8F5]">
                {previewTarget.msg.attachmentType === 'photo' ? (
                  <img
                    src={previewTarget.url || campusStudyFallback}
                    alt={previewTarget.msg.attachmentName}
                    referrerPolicy="no-referrer"
                    className="w-full h-auto max-h-[65vh] object-contain mx-auto rounded-lg"
                  />
                ) : previewTarget.msg.attachmentType === 'video' ? (
                  <video
                    src={previewTarget.url}
                    controls
                    autoPlay
                    playsInline
                    className="w-full max-h-[65vh] object-contain mx-auto rounded-lg bg-black"
                  />
                ) : decodedModalText ? (
                  <pre className="text-xs font-mono text-[#1F1617] whitespace-pre-wrap bg-white p-4 rounded-xl border border-[#E8DFDC] leading-relaxed">
                    {decodedModalText}
                  </pre>
                ) : (
                  <div className="py-10 text-center space-y-2">
                    <p className="text-sm font-semibold text-[#1F1617]">
                      {previewTarget.msg.attachmentName}
                    </p>
                    <p className="text-xs text-[#6E5D5F]">
                      Click Download above to open this Microsoft Office / PDF file.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // DESKTOP & MOBILE INBOX THREAD LIST + CONVERSATION VIEW
  // =========================================================================
  const otherUsers = presenceList.filter((p) => p.uid !== currentUserProfile.uid);
  const onlinePeers = otherUsers.filter((p) => isUserCurrentlyOnline(p));
  const offlinePeers = otherUsers.filter((p) => !isUserCurrentlyOnline(p));

  const isThreadUnreadForMe = (t: ChatThread): boolean => {
    return (
      Boolean(t.lastSenderId) &&
      t.lastSenderId !== currentUserProfile.uid &&
      t.lastMessageRead === false
    );
  };

  const unreadThreadsCount = threads.filter((t) => isThreadUnreadForMe(t)).length;

  const filteredInboxThreads = threads.filter((t) => {
    const isUserA = t.userAId === currentUserProfile.uid;
    const peerNick = isUserA ? t.userBNickname : t.userANickname;
    if (inboxFilter === 'unread' && !isThreadUnreadForMe(t)) {
      return false;
    }
    if (inboxSearch.trim()) {
      const q = inboxSearch.trim().toLowerCase();
      const matchNick = peerNick.toLowerCase().includes(q);
      const matchMsg = (t.lastMessage || '').toLowerCase().includes(q);
      if (!matchNick && !matchMsg) return false;
    }
    return true;
  });

  const renderQuickPeerRow = (u: UserPresence, online: boolean) => (
    <div
      key={u.uid}
      onClick={() =>
        onSelectPeer({
          uid: u.uid,
          nickname: u.nickname,
          photoURL: u.photoURL,
          badge: u.badge,
        })
      }
      className="h-[54px] px-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] flex items-center justify-between gap-2 text-left cursor-pointer overflow-hidden"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
        <div className="relative shrink-0">
          <img
            src={u.photoURL || studentAvatarFallback}
            alt={u.nickname}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-full object-cover border border-[#D4AF37]"
          />
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
              online ? 'bg-emerald-500' : 'bg-stone-400'
            }`}
          />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-1 min-w-0">
            <p className="text-xs font-semibold text-[#1F1617] truncate">
              @{u.nickname}
            </p>
            <UserBadgeTag badge={u.badge} size="sm" />
          </div>
          <p className="text-[11px] text-[#6E5D5F] truncate mt-0.5">
            {online ? 'Online now' : 'Offline'}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectPeer({
            uid: u.uid,
            nickname: u.nickname,
            photoURL: u.photoURL,
            badge: u.badge,
          });
        }}
        className="w-8 h-8 rounded-lg bg-[#7B1113] hover:bg-[#580B0C] text-[#D4AF37] flex items-center justify-center shrink-0 cursor-pointer"
        title={`Message @${u.nickname}`}
        aria-label={`Message @${u.nickname}`}
      >
        <MessageCircle className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div
      className={
        isDesktopFullDashboard
          ? 'fixed inset-0 z-50 bg-[#FAF8F5] flex flex-col overflow-hidden'
          : 'bg-white border border-[#E8DFDC] rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 md:min-h-[600px] pb-16 md:pb-0'
      }
    >
      {/* Dedicated Top Bar when in Fullscreen Desktop Inbox Dashboard mode */}
      {isDesktopFullDashboard && (
        <header className="h-14 px-4 sm:px-6 bg-[#7B1113] text-white border-b border-[#D4AF37]/40 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {onCloseFullDashboard && (
              <button
                type="button"
                onClick={onCloseFullDashboard}
                className="px-3 py-1.5 rounded-xl bg-[#580B0C] hover:bg-[#420708] text-[#F7EFE0] hover:text-white border border-[#D4AF37]/40 text-xs font-medium flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                title="Back to Student Wall"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Back to Wall</span>
              </button>
            )}

            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-[#580B0C] border border-[#D4AF37] text-[#D4AF37] flex items-center justify-center shrink-0">
                <Inbox className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display text-xl text-white tracking-tight truncate">
                    ONE Inbox Dashboard
                  </span>
                  {unreadThreadsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-[#D4AF37] text-[#7B1113] text-[10px] font-mono font-bold shrink-0">
                      {unreadThreadsCount} unread
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#580B0C] border border-[#D4AF37]/30 text-xs font-mono text-[#F7EFE0]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{onlinePeers.length + 1} online</span>
            </div>

            {(totalUnreadChatNotifications > 0 || unreadThreadsCount > 0) && onMarkAllRead && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="px-3 py-1.5 bg-[#580B0C] hover:bg-[#420708] text-[#F7EFE0] hover:text-white border border-[#D4AF37]/40 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Mark all inbox messages as read"
              >
                <CheckCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span className="hidden sm:inline">Mark all read</span>
              </button>
            )}

            {onMinimizeToPopup && (
              <button
                type="button"
                onClick={onMinimizeToPopup}
                className="px-3 py-1.5 bg-[#580B0C] hover:bg-[#420708] text-[#F7EFE0] hover:text-white border border-[#D4AF37]/40 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Switch to floating Messenger Popup"
              >
                <Minimize2 className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>Popup Mode</span>
              </button>
            )}

            {onCloseFullDashboard && (
              <button
                type="button"
                onClick={onCloseFullDashboard}
                className="p-1.5 rounded-xl bg-[#580B0C] hover:bg-[#420708] text-[#F7EFE0] hover:text-white border border-[#D4AF37]/30 cursor-pointer"
                title="Close Fullscreen Inbox"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>
      )}

      {/* Main Inbox Grid Container */}
      <div
        className={
          isDesktopFullDashboard
            ? 'flex-1 grid grid-cols-1 md:grid-cols-12 min-h-0 overflow-hidden bg-white'
            : 'contents'
        }
      >
        {/* Left Column: Inbox Conversations & Search/Filters */}
        <div
          className={`${
            isDesktopFullDashboard ? 'md:col-span-4 lg:col-span-3' : 'md:col-span-5'
          } border-b md:border-b-0 md:border-r border-[#E8DFDC] flex flex-col h-full min-h-0 overflow-hidden bg-white`}
        >
          <div className="p-4 border-b border-[#F2ECE9] space-y-3 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#7B1113] text-[#D4AF37] flex items-center justify-center shrink-0">
                  <Inbox className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-2xl text-[#7B1113] leading-none">
                      Conversations
                    </h2>
                    {unreadThreadsCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-[#7B1113] text-[#D4AF37] text-[11px] font-mono font-bold">
                        {unreadThreadsCount} new
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6E5D5F] mt-0.5">
                    Direct student messages &amp; read receipts
                  </p>
                </div>
              </div>

              {!isDesktopFullDashboard &&
                (totalUnreadChatNotifications > 0 || unreadThreadsCount > 0) &&
                onMarkAllRead && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="px-2.5 py-1 bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] rounded-lg text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                    title="Mark all inbox alerts as read"
                  >
                    <CheckCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Mark all read</span>
                  </button>
                )}
            </div>

            {/* Inbox Search & All/Unread Filter Tabs */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#6E5D5F] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  placeholder="Search inbox by @nickname or message..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113] min-h-[34px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setInboxFilter('all')}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    inboxFilter === 'all'
                      ? 'bg-[#7B1113] text-white'
                      : 'bg-[#FAF8F5] text-[#6E5D5F] hover:text-[#1F1617] border border-[#E8DFDC]'
                  }`}
                >
                  <span>All Messages</span>
                  <span
                    className={`font-mono text-[10px] ${
                      inboxFilter === 'all' ? 'text-[#D4AF37]' : 'text-[#6E5D5F]'
                    }`}
                  >
                    ({threads.length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setInboxFilter('unread')}
                  className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                    inboxFilter === 'unread'
                      ? 'bg-[#7B1113] text-white'
                      : 'bg-[#FAF8F5] text-[#6E5D5F] hover:text-[#1F1617] border border-[#E8DFDC]'
                  }`}
                >
                  <span>Unread</span>
                  <span
                    className={`font-mono text-[10px] ${
                      inboxFilter === 'unread' ? 'text-[#D4AF37]' : 'text-[#7B1113] font-bold'
                    }`}
                  >
                    ({unreadThreadsCount})
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-[#F2ECE9]">
            {confirmDeleteChatTarget && !activePeer && (
              <div className="p-3 bg-rose-50 border-b border-rose-200 space-y-2">
                <p className="text-xs text-rose-900">
                  Delete conversation with <strong>{confirmDeleteChatTarget.peerName}</strong> from
                  your inbox? Their copy will remain intact.
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteChatTarget(null)}
                    className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-xs font-medium text-[#6E5D5F] hover:text-[#1F1617] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConversationForSelf(confirmDeleteChatTarget.chatId)}
                    className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Delete for Me
                  </button>
                </div>
              </div>
            )}
            {threads.length === 0 ? (
              <div className="p-4 space-y-4">
                <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] text-xs text-[#6E5D5F]">
                  Your inbox is empty. Click the chat icon on any student to start a conversation.
                </div>
                {!isDesktopFullDashboard && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#7B1113]">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          <span>Online MSUans ({onlinePeers.length})</span>
                        </span>
                      </div>
                      {onlinePeers.length === 0 ? (
                        <p className="text-xs text-[#6E5D5F] py-1">
                          No other MSUans online right now.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-[294px] overflow-y-auto pr-1">
                          {onlinePeers.map((u) => renderQuickPeerRow(u, true))}
                        </div>
                      )}
                    </div>

                    <div className="space-y-2 pt-3 border-t border-[#F2ECE9]">
                      <div className="flex items-center justify-between text-xs font-semibold text-[#1F1617]">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-stone-400" />
                          <span>Offline Users ({offlinePeers.length})</span>
                        </span>
                      </div>
                      {offlinePeers.length === 0 ? (
                        <p className="text-xs text-[#6E5D5F] py-1">No offline users right now.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-[294px] overflow-y-auto pr-1">
                          {offlinePeers.map((u) => renderQuickPeerRow(u, false))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : filteredInboxThreads.length === 0 ? (
              <div className="p-6 text-center space-y-2">
                <p className="text-xs font-semibold text-[#1F1617]">
                  {inboxFilter === 'unread'
                    ? 'No unread messages in your Inbox'
                    : 'No matching conversations found'}
                </p>
                {inboxFilter === 'unread' && (
                  <button
                    type="button"
                    onClick={() => setInboxFilter('all')}
                    className="px-3 py-1.5 bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] rounded-lg text-xs font-medium cursor-pointer"
                  >
                    Show all messages
                  </button>
                )}
              </div>
            ) : (
              filteredInboxThreads.map((t) => {
                const isUserA = t.userAId === currentUserProfile.uid;
                const peerUid = isUserA ? t.userBId : t.userAId;
                const peerNick = isUserA ? t.userBNickname : t.userANickname;
                const peerPhoto = isUserA ? t.userBPhotoURL : t.userAPhotoURL;
                const peerBadge = isUserA ? t.userBBadge : t.userABadge;
                const isThreadOneOfficial = isOneOfficialAccount(peerUid || peerNick, peerBadge);
                const isSelected = activePeer?.uid === peerUid;
                const peerPres = presenceList.find((p) => p.uid === peerUid);
                const isOnline = isThreadOneOfficial || isUserCurrentlyOnline(peerPres);
                const isUnread = isThreadUnreadForMe(t);
                const resolvedThreadPhoto = resolvePeerAvatar(
                  peerPhoto,
                  peerUid,
                  peerNick,
                  peerBadge,
                  studentAvatarFallback
                );
                const resolvedThreadBadge = isThreadOneOfficial ? 'one_official' : peerBadge;

                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      onSelectPeer({
                        uid: peerUid,
                        nickname: peerNick,
                        photoURL: resolvedThreadPhoto,
                        badge: resolvedThreadBadge,
                      });
                      if (onMarkChatThreadRead) {
                        onMarkChatThreadRead(t.id, peerUid);
                      }
                    }}
                    className={`group w-full p-3.5 text-left transition-colors flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-[#F7EFE0]/70'
                        : isUnread
                        ? 'bg-[#7B1113]/[0.04] hover:bg-[#7B1113]/[0.08]'
                        : 'hover:bg-[#FAF8F5]'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <img
                        src={resolvedThreadPhoto}
                        alt={peerNick}
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]"
                      />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          isOnline ? 'bg-emerald-500' : 'bg-stone-300'
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="flex items-center justify-between gap-1.5 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                          <span
                            className={`text-xs truncate ${
                              isUnread ? 'font-bold text-[#7B1113]' : 'font-semibold text-[#1F1617]'
                            }`}
                          >
                            {formatPeerDisplayName(peerNick, peerUid, peerBadge)}
                          </span>
                          <span className="shrink-0">
                            <UserBadgeTag badge={resolvedThreadBadge} size="sm" />
                          </span>
                          {isUnread && (
                            <span className="px-1.5 py-0.5 rounded-full bg-[#7B1113] text-[#D4AF37] text-[9px] font-mono font-bold shrink-0">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] font-mono text-[#6E5D5F]">
                            {formatRelativeTime(t.updatedAt)}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteChatTarget({
                                chatId: t.id,
                                peerName: formatPeerDisplayName(peerNick, peerUid, peerBadge),
                              });
                            }}
                            className="p-1 rounded-md text-[#9E8E90] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Delete conversation for me"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0 overflow-hidden">
                        <p
                          className={`text-xs truncate flex-1 min-w-0 ${
                            isUnread ? 'font-semibold text-[#1F1617]' : 'text-[#6E5D5F]'
                          }`}
                        >
                          {t.lastSenderId === currentUserProfile.uid
                            ? `You: ${t.lastMessage}`
                            : t.lastMessage}
                        </p>
                        {t.lastSenderId === currentUserProfile.uid && (
                          <span className="shrink-0 flex items-center gap-0.5 text-[10px] font-mono">
                            {t.lastMessageRead ||
                            (isSelected &&
                              messages.length > 0 &&
                              messages[messages.length - 1]?.senderId === currentUserProfile.uid &&
                              messages[messages.length - 1]?.read) ? (
                              <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                                <CheckCheck className="w-3.5 h-3.5" />
                                <span>Read</span>
                              </span>
                            ) : (
                              <span className="text-[#9E8E90] flex items-center gap-0.5">
                                <Check className="w-3 h-3" />
                                <span>Sent</span>
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Center Column: Active Chat Thread (Full-height on desktop Fullscreen Inbox) */}
        <div
          className={`hidden md:flex ${
            isDesktopFullDashboard
              ? 'md:col-span-8 lg:col-span-6 h-full border-r border-[#E8DFDC]'
              : 'md:col-span-7 h-[600px]'
          } flex-col min-h-0 overflow-hidden bg-white`}
        >
          {renderConversationPane()}
        </div>

        {/* Right Column (Fullscreen Desktop Dashboard): Live MSUans Directory & Shared Chat Files */}
        {isDesktopFullDashboard && (
          <div className="hidden lg:flex lg:col-span-3 flex-col h-full min-h-0 overflow-y-auto bg-white divide-y divide-[#F2ECE9]">
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#7B1113] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Online MSUans ({onlinePeers.length})</span>
                </span>
                <span className="text-[11px] font-mono text-[#6E5D5F]">Click to chat</span>
              </div>
              {onlinePeers.length === 0 ? (
                <p className="text-xs text-[#6E5D5F] py-1">No other MSUans online right now.</p>
              ) : (
                <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                  {onlinePeers.map((u) => renderQuickPeerRow(u, true))}
                </div>
              )}
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#1F1617] flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-stone-400" />
                  <span>Offline Users ({offlinePeers.length})</span>
                </span>
              </div>
              {offlinePeers.length === 0 ? (
                <p className="text-xs text-[#6E5D5F] py-1">No offline users right now.</p>
              ) : (
                <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                  {offlinePeers.map((u) => renderQuickPeerRow(u, false))}
                </div>
              )}
            </div>

            {activePeer && (
              <div className="p-4 space-y-3 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#7B1113] flex items-center gap-1.5">
                    <FolderOpen className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Shared Files ({sharedChatAttachments.length})</span>
                  </span>
                </div>
                {sharedChatAttachments.length === 0 ? (
                  <p className="text-xs text-[#6E5D5F]">
                    No photos or documents shared with @{activePeer.nickname} yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sharedChatAttachments.map((m) => {
                      const meta = getAttachmentMeta(m.attachmentType);
                      return (
                        <div
                          key={`side-shared-${m.id}`}
                          className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-[#1F1617] truncate">
                              {m.attachmentName}
                            </p>
                            <p className="text-[11px] font-mono text-[#6E5D5F]">
                              {meta.extBadge} · {formatFileSize(m.attachmentSize)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              triggerAttachmentDownload(m.attachmentDataUrl, m.attachmentName)
                            }
                            className="p-1.5 text-[#7B1113] hover:bg-white rounded-lg shrink-0 cursor-pointer"
                            title="Download file"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* File Preview Modal */}
      {previewTarget && (
        <div
          onClick={() => setPreviewTarget(null)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`bg-white border border-[#E8DFDC] rounded-2xl w-full flex flex-col overflow-hidden shadow-2xl ${
              previewTarget.msg.attachmentType === 'pdf'
                ? 'max-w-4xl max-h-[90vh]'
                : 'max-w-2xl max-h-[85vh]'
            }`}
          >
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#E8DFDC] flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-[#1F1617] truncate">
                {previewTarget.msg.attachmentName}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    triggerAttachmentDownload(
                      previewTarget.url,
                      previewTarget.msg.attachmentName
                    )
                  }
                  className="px-3 py-1.5 bg-[#7B1113] text-white text-xs font-medium rounded-lg flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTarget(null)}
                  className="p-1.5 text-[#6E5D5F] hover:text-[#1F1617] cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-[#FAF8F5]">
              {previewTarget.msg.attachmentType === 'photo' ? (
                <img
                  src={previewTarget.url || campusStudyFallback}
                  alt={previewTarget.msg.attachmentName}
                  referrerPolicy="no-referrer"
                  className="w-full h-auto max-h-[65vh] object-contain mx-auto rounded-lg"
                />
              ) : previewTarget.msg.attachmentType === 'video' ? (
                <video
                  src={previewTarget.url}
                  controls
                  autoPlay
                  playsInline
                  className="w-full max-h-[65vh] object-contain mx-auto rounded-lg bg-black"
                />
              ) : previewTarget.msg.attachmentType === 'pdf' ? (
                <PdfReviewerViewer
                  rawUrl={previewTarget.msg.attachmentDataUrl}
                  resolvedUrl={previewTarget.url}
                  fileName={previewTarget.msg.attachmentName}
                  fileSize={previewTarget.msg.attachmentSize}
                  onDownload={() =>
                    triggerAttachmentDownload(
                      previewTarget.url || previewTarget.msg.attachmentDataUrl,
                      previewTarget.msg.attachmentName
                    )
                  }
                />
              ) : decodedModalText ? (
                <pre className="text-xs font-mono text-[#1F1617] whitespace-pre-wrap bg-white p-4 rounded-xl border border-[#E8DFDC] leading-relaxed">
                  {decodedModalText}
                </pre>
              ) : (
                <div className="py-10 text-center space-y-2">
                  <p className="text-sm font-semibold text-[#1F1617]">
                    {previewTarget.msg.attachmentName}
                  </p>
                  <p className="text-xs text-[#6E5D5F]">
                    Click Download above to open this Microsoft Office file.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
