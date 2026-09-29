import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Download,
  File as FileIcon,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Inbox,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  Presentation,
  Search,
  Send,
  Trash2,
  Lock,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
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
  triggerAttachmentDownload,
} from '../utils/fileHelpers';
import { ChatMessageItem } from './ChatDashboard';
import { formatRelativeTime } from './PostCard';
import { UserBadgeTag } from './UserBadgeTag';
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

interface DesktopMessengerPopupProps {
  currentUserProfile: UserPublicProfile;
  threads: ChatThread[];
  presenceList: UserPresence[];
  notifications: NotificationItem[];
  isOpen: boolean;
  isMinimized: boolean;
  activePeer: ChatPeerTarget | null;
  onSelectPeer: (peer: ChatPeerTarget | null) => void;
  onSetOpen: (open: boolean) => void;
  onSetMinimized: (minimized: boolean) => void;
  onExpandToFullInbox: () => void;
  onMarkChatThreadRead?: (chatId: string, peerUid: string) => Promise<void>;
}

const POPUP_UPLOAD_BUTTONS: {
  type: AttachmentType;
  label: string;
  icon: React.FC<{ className?: string }>;
}[] = [
  { type: 'photo', label: 'Photo', icon: ImageIcon },
  { type: 'video', label: 'Video', icon: Video },
  { type: 'pdf', label: 'Upload Files', icon: Upload },
];

export const DesktopMessengerPopup: React.FC<DesktopMessengerPopupProps> = ({
  currentUserProfile,
  threads,
  presenceList,
  notifications,
  isOpen,
  isMinimized,
  activePeer,
  onSelectPeer,
  onSetOpen,
  onSetMinimized,
  onExpandToFullInbox,
  onMarkChatThreadRead,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [attachment, setAttachment] = useState<ProcessedAttachment | null>(null);
  const [activeUploadType, setActiveUploadType] = useState<AttachmentType>('none');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread'>('all');
  const [inboxSearch, setInboxSearch] = useState('');
  const [previewTarget, setPreviewTarget] = useState<{
    msg: ChatMessage;
    url: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [confirmDeleteChatTarget, setConfirmDeleteChatTarget] = useState<{
    chatId: string;
    peerName: string;
  } | null>(null);

  const currentUserBadge = resolveUserBadge(currentUserProfile.badge);
  const activeChatId = activePeer
    ? buildChatId(currentUserProfile.uid, activePeer.uid)
    : null;

  const isThreadUnreadForMe = (t: ChatThread): boolean => {
    return (
      Boolean(t.lastSenderId) &&
      t.lastSenderId !== currentUserProfile.uid &&
      t.lastMessageRead === false
    );
  };

  const unreadThreadsCount = threads.filter((t) => isThreadUnreadForMe(t)).length;

  useEffect(() => {
    if (!isOpen || isMinimized) return;
    threads.forEach((t) => {
      const isUserA = t.userAId === currentUserProfile.uid;
      const peerUid = isUserA ? t.userBId : t.userAId;
      if (
        (peerUid === ONE_OFFICIAL_UID || t.id.startsWith('chat_one_welcome_')) &&
        !t.lastMessageRead
      ) {
        markLocalChatThreadRead(t.id, currentUserProfile.uid);
        if (onMarkChatThreadRead) {
          onMarkChatThreadRead(t.id, peerUid).catch(() => {});
        }
      }
    });
  }, [isOpen, isMinimized, threads, currentUserProfile.uid, onMarkChatThreadRead]);

  useEffect(() => {
    if (!activeChatId || !isOpen) {
      setMessages([]);
      return;
    }

    const initialLocal = getLocalChatMessages(activeChatId, currentUserProfile.uid);
    setMessages(initialLocal);
    if (!isMinimized && activePeer) {
      markLocalChatThreadRead(activeChatId, currentUserProfile.uid);
      if (onMarkChatThreadRead) {
        onMarkChatThreadRead(activeChatId, activePeer.uid).catch(() => {});
      }
    }

    const handleLocalUpdate = (ev: Event) => {
      const customEv = ev as CustomEvent<{ collection?: string }>;
      const col = customEv.detail?.collection;
      if (!col || col === 'all' || col === 'messages') {
        const latest = getLocalChatMessages(activeChatId, currentUserProfile.uid);
        setMessages(latest);
        if (
          !isMinimized &&
          activePeer &&
          latest.some((m) => m.recipientId === currentUserProfile.uid && !m.read)
        ) {
          markLocalChatThreadRead(activeChatId, currentUserProfile.uid);
          if (onMarkChatThreadRead) {
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

          // Auto-mark incoming unread messages as read when popup is open and not minimized
          if (!isMinimized && activePeer) {
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
                updateDoc(doc(db, 'chats', activeChatId), {
                  lastMessageRead: true,
                  lastMessageReadAt: serverTimestamp(),
                }).catch(() => {});
              });

              if (onMarkChatThreadRead) {
                onMarkChatThreadRead(activeChatId, activePeer.uid).catch(() => {});
              }
            } else {
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
                updateDoc(doc(db, 'chats', activeChatId), {
                  lastMessageRead: true,
                  lastMessageReadAt: serverTimestamp(),
                }).catch(() => {});
              }
            }
          }
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
  }, [
    activeChatId,
    isOpen,
    isMinimized,
    activePeer?.uid,
    currentUserProfile.uid,
    threads,
    onMarkChatThreadRead,
  ]);

  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, activeChatId, isOpen, isMinimized]);

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
    if (activePeer && onMarkChatThreadRead) {
      onMarkChatThreadRead(activeChatId, activePeer.uid).catch(() => {});
    }
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'chats', activeChatId, 'messages', msgId), {
        read: true,
        readAt: serverTimestamp(),
      }).catch(() => {});
    }
  };

  const handleTriggerFileSelect = (targetType: AttachmentType) => {
    setActiveUploadType(targetType);
    setError(null);
    if (fileInputRef.current) {
      if (targetType === 'pdf') {
        fileInputRef.current.accept =
          '.pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';
      } else {
        const meta = getAttachmentMeta(targetType);
        fileInputRef.current.accept = meta.acceptAttr;
      }
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setIsProcessingFile(true);
    try {
      const processed = await processUploadedFile(file, activeUploadType);
      setAttachment(processed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process file.');
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
    if (!trimmed && !attachment) return;

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
      userANickname: (isMeUserA ? currentUserProfile.nickname : activePeer.nickname).slice(
        0,
        64
      ),
      userAPhotoURL: (
        isMeUserA ? currentUserProfile.photoURL || '' : activePeer.photoURL || ''
      ).slice(0, 350000),
      userABadge: isMeUserA ? currentUserBadge : resolveUserBadge(activePeer.badge),
      userBId: isMeUserA ? activePeer.uid : currentUserProfile.uid,
      userBNickname: (isMeUserA ? activePeer.nickname : currentUserProfile.nickname).slice(
        0,
        64
      ),
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
    setActiveUploadType('none');
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
          userANickname: (isMeUserA ? currentUserProfile.nickname : activePeer.nickname).slice(
            0,
            64
          ),
          userAPhotoURL: (
            isMeUserA ? currentUserProfile.photoURL || '' : activePeer.photoURL || ''
          ).slice(0, 350000),
          userABadge: isMeUserA ? currentUserBadge : resolveUserBadge(activePeer.badge),
          userBId: isMeUserA ? activePeer.uid : currentUserProfile.uid,
          userBNickname: (isMeUserA ? activePeer.nickname : currentUserProfile.nickname).slice(
            0,
            64
          ),
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
          userANickname: (isMeUserA ? currentUserProfile.nickname : activePeer.nickname).slice(
            0,
            64
          ),
          userAPhotoURL: (
            isMeUserA ? currentUserProfile.photoURL || '' : activePeer.photoURL || ''
          ).slice(0, 350000),
          userABadge: isMeUserA ? currentUserBadge : resolveUserBadge(activePeer.badge),
          userBNickname: (isMeUserA ? activePeer.nickname : currentUserProfile.nickname).slice(
            0,
            64
          ),
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
        handleFirestoreError(err, OperationType.WRITE, `chats/${activeChatId}`);
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

  const isActivePeerOneOfficial = activePeer
    ? isOneOfficialAccount(activePeer.uid || activePeer.nickname, activePeer.badge)
    : false;
  const activePeerPresence = activePeer
    ? presenceList.find((p) => p.uid === activePeer.uid)
    : undefined;
  const isActivePeerOnline =
    isActivePeerOneOfficial || isUserCurrentlyOnline(activePeerPresence);

  const filteredPopupThreads = threads.filter((t) => {
    const isUserA = t.userAId === currentUserProfile.uid;
    const peerNick = isUserA ? t.userBNickname : t.userANickname;
    if (inboxFilter === 'unread' && !isThreadUnreadForMe(t)) return false;
    if (inboxSearch.trim()) {
      const q = inboxSearch.trim().toLowerCase();
      return (
        peerNick.toLowerCase().includes(q) ||
        (t.lastMessage || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  const onlineSuggestions = presenceList
    .filter((p) => p.uid !== currentUserProfile.uid && isUserCurrentlyOnline(p))
    .slice(0, 5);

  const decodedModalText = previewTarget
    ? decodeDocumentPreviewText(previewTarget.url)
    : null;

  // =========================================================================
  // 1. CLOSED OR MINIMIZED STATE -> Bottom-Right Messenger Dock Bar
  // =========================================================================
  if (!isOpen || isMinimized) {
    return (
      <div className="fixed bottom-0 right-6 z-40 flex items-end gap-2.5">
        {isOpen && isMinimized && activePeer && (
          <div className="w-64 bg-[#7B1113] text-white rounded-t-2xl border-x border-t border-[#D4AF37]/50 shadow-xl flex items-center justify-between px-3.5 py-2.5">
            <button
              type="button"
              onClick={() => onSetMinimized(false)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
            >
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
                  className="w-7 h-7 rounded-full object-cover border border-[#D4AF37]"
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#7B1113] ${
                    isActivePeerOnline ? 'bg-emerald-400' : 'bg-stone-400'
                  }`}
                />
              </div>
              <div className="flex items-center gap-1 min-w-0">
                <span className="text-xs font-semibold truncate">
                  {formatPeerDisplayName(
                    activePeer.nickname,
                    activePeer.uid,
                    activePeer.badge
                  )}
                </span>
                <UserBadgeTag
                  badge={isActivePeerOneOfficial ? 'one_official' : activePeer.badge}
                  size="sm"
                />
              </div>
            </button>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => onSetMinimized(false)}
                className="p-1 text-[#F7EFE0]/80 hover:text-white cursor-pointer"
                title="Restore chat window"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onSetOpen(false);
                  onSetMinimized(false);
                }}
                className="p-1 text-[#F7EFE0]/80 hover:text-white cursor-pointer"
                title="Close chat"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            onSetOpen(true);
            onSetMinimized(false);
          }}
          className="mb-3 w-12 h-12 rounded-full bg-[#7B1113] hover:bg-[#580B0C] text-[#D4AF37] border-2 border-[#D4AF37] shadow-xl flex items-center justify-center cursor-pointer transition-transform hover:scale-105 relative"
          title="Open Messages"
          aria-label="Open Messages"
        >
          <MessageCircle className="w-5 h-5 text-[#D4AF37]" />
          {unreadThreadsCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D4AF37] text-[#7B1113] text-[10px] font-mono font-bold flex items-center justify-center border border-[#7B1113]">
              {unreadThreadsCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  // =========================================================================
  // 2. EXPANDED MESSENGER POPUP WINDOW AT BOTTOM-RIGHT
  // =========================================================================
  return (
    <>
      <div className="fixed bottom-0 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-[385px] max-w-[385px] h-[min(510px,calc(100dvh-5rem))] bg-white rounded-t-2xl border-x border-t-2 border-[#D4AF37] shadow-2xl flex flex-col overflow-hidden">
        {activePeer ? (
          /* ================= ACTIVE 1-ON-1 CHAT VIEW ================= */
          <>
            {/* Popup Top Header */}
            <div className="px-3.5 py-2.5 bg-[#7B1113] text-white border-b border-[#D4AF37]/40 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => onSelectPeer(null)}
                  className="p-1.5 rounded-lg bg-[#580B0C] text-[#D4AF37] hover:text-white border border-[#D4AF37]/30 shrink-0 cursor-pointer"
                  title="Back to Inbox list"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>

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
                    className="w-8 h-8 rounded-full object-cover border border-[#D4AF37]"
                  />
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#7B1113] ${
                      isActivePeerOnline ? 'bg-emerald-400' : 'bg-stone-400'
                    }`}
                  />
                </div>

                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="flex items-center gap-1 min-w-0 overflow-hidden">
                    <span className="text-xs font-bold text-white truncate">
                      {formatPeerDisplayName(
                        activePeer.nickname,
                        activePeer.uid,
                        activePeer.badge
                      )}
                    </span>
                    <span className="shrink-0">
                      <UserBadgeTag
                        badge={isActivePeerOneOfficial ? 'one_official' : activePeer.badge}
                        size="sm"
                      />
                    </span>
                  </div>
                  <p className="text-[10px] text-[#F7EFE0]/80 truncate">
                    {isActivePeerOneOfficial
                      ? 'Official ONE Welcome'
                      : isActivePeerOnline
                      ? 'Active now'
                      : 'Offline'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
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
                    className="p-1.5 rounded-lg text-rose-200 hover:text-white hover:bg-[#580B0C] cursor-pointer"
                    title="Delete conversation for me"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onExpandToFullInbox}
                  className="px-2 py-1 rounded-lg bg-[#580B0C] hover:bg-[#420708] text-[#D4AF37] border border-[#D4AF37]/40 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                  title="Open Fullscreen Inbox Dashboard"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Full Inbox</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetMinimized(true)}
                  className="p-1.5 rounded-lg text-[#F7EFE0]/80 hover:text-white hover:bg-[#580B0C] cursor-pointer"
                  title="Minimize window"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onSetOpen(false)}
                  className="p-1.5 rounded-lg text-[#F7EFE0]/80 hover:text-white hover:bg-[#580B0C] cursor-pointer"
                  title="Close window"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {confirmDeleteChatTarget && (
              <div className="px-3 py-2 bg-rose-50 border-b border-rose-200 space-y-1.5 shrink-0">
                <p className="text-[11px] text-rose-900">
                  Delete conversation with <strong>{confirmDeleteChatTarget.peerName}</strong> for
                  you? Their copy will remain intact.
                </p>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteChatTarget(null)}
                    className="px-2 py-0.5 rounded bg-white border border-rose-200 text-[11px] font-medium text-[#6E5D5F] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteConversationForSelf(confirmDeleteChatTarget.chatId)}
                    className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                  >
                    Delete for Me
                  </button>
                </div>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-[#FAF8F5]">
              {messages.length === 0 ? (
                <div className="py-12 text-center space-y-1.5">
                  <p className="text-xs font-semibold text-[#1F1617]">
                    Say hello to @{activePeer.nickname}
                  </p>
                  <p className="text-[11px] text-[#6E5D5F] max-w-[220px] mx-auto">
                    Messages update live with instant read receipts.
                  </p>
                </div>
              ) : (
                (() => {
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

            {/* Popup Composer Footer */}
            {isActivePeerOneOfficial ? (
              <div className="p-3 bg-[#FAF8F5] border-t border-[#E8DFDC] flex items-center justify-center gap-2 text-center shrink-0">
                <div className="w-5 h-5 rounded-md bg-[#7B1113]/10 text-[#7B1113] flex items-center justify-center shrink-0">
                  <Lock className="w-3 h-3" />
                </div>
                <p className="text-[11px] font-medium text-[#6E5D5F]">
                  Official <strong className="text-[#7B1113]">ONE</strong> Broadcast · Replies are
                  disabled.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSendMessage}
                className="p-2.5 bg-white border-t border-[#E8DFDC] space-y-2 shrink-0"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileChange}
                  className="hidden"
                  aria-label="Attach file in popup chat"
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
                        <Upload className="w-3.5 h-3.5 text-[#D4AF37]" />
                        <span>Uploading {activeUploadType !== 'none' ? activeUploadType.toUpperCase() : 'attachment'}...</span>
                      </div>
                      <div className="w-full h-1 bg-[#E8DFDC] rounded-full overflow-hidden">
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

                {attachment && (
                  <div className="p-2 rounded-xl bg-[#F7EFE0]/60 border border-[#D4AF37]/60 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold text-[#1F1617] truncate">
                          {attachment.attachmentName}
                        </p>
                        <p className="text-[10px] font-mono text-[#6E5D5F]">
                          {formatFileSize(attachment.attachmentSize)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachment(null)}
                        className="p-1 text-[#6E5D5F] hover:text-[#7B1113]"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {attachment.attachmentType === 'photo' &&
                      (attachment.previewUrl || attachment.attachmentDataUrl) && (
                        <img
                          src={attachment.previewUrl || attachment.attachmentDataUrl}
                          alt={attachment.attachmentName}
                          className="max-h-24 rounded-lg object-contain border border-[#E8DFDC] bg-white"
                        />
                      )}
                    {attachment.attachmentType === 'video' &&
                      (attachment.previewUrl || attachment.attachmentDataUrl) && (
                        <video
                          src={attachment.previewUrl || attachment.attachmentDataUrl}
                          controls
                          playsInline
                          preload="metadata"
                          className="max-h-28 w-full rounded-lg bg-black object-contain"
                        />
                      )}
                  </div>
                )}

                {error && (
                  <div className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[11px] text-rose-700">
                    {error}
                  </div>
                )}

                <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  {POPUP_UPLOAD_BUTTONS.map((btn) => {
                    const IconComp = btn.icon;
                    const isSelected =
                      btn.type === 'pdf'
                        ? Boolean(
                            attachment &&
                              ['pdf', 'word', 'excel', 'ppt'].includes(attachment.attachmentType)
                          )
                        : activeUploadType === btn.type && Boolean(attachment);
                    return (
                      <button
                        key={btn.type}
                        type="button"
                        onClick={() => handleTriggerFileSelect(btn.type)}
                        disabled={isProcessingFile}
                        className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected
                            ? 'bg-[#7B1113] text-white border-[#7B1113]'
                            : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC] hover:bg-[#F2ECE9]'
                        }`}
                      >
                        <IconComp
                          className={`w-3 h-3 ${
                            isSelected ? 'text-[#D4AF37]' : 'text-[#7B1113]'
                          }`}
                        />
                        <span>{btn.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5">
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
                    className="flex-1 px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113] min-h-[36px]"
                  />
                  <button
                    type="submit"
                    disabled={isSending || isProcessingFile || (!messageText.trim() && !attachment)}
                    className="px-3 py-2 bg-[#7B1113] hover:bg-[#580B0C] disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center min-h-[36px] shrink-0 cursor-pointer"
                    title="Send message"
                  >
                    <Send className="w-3.5 h-3.5 text-[#D4AF37]" />
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          /* ================= COMPACT MESSENGER INBOX LIST VIEW ================= */
          <>
            <div className="px-3.5 py-2.5 bg-[#7B1113] text-white border-b border-[#D4AF37]/40 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-[#D4AF37]" />
                <span className="font-display text-lg text-white">Messenger Inbox</span>
                {unreadThreadsCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#D4AF37] text-[#7B1113] text-[10px] font-mono font-bold">
                    {unreadThreadsCount} new
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onExpandToFullInbox}
                  className="px-2 py-1 rounded-lg bg-[#580B0C] hover:bg-[#420708] text-[#D4AF37] border border-[#D4AF37]/40 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                  title="Open Fullscreen Inbox Dashboard"
                >
                  <Maximize2 className="w-3 h-3" />
                  <span>Full Inbox</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSetMinimized(true)}
                  className="p-1.5 rounded-lg text-[#F7EFE0]/80 hover:text-white hover:bg-[#580B0C] cursor-pointer"
                  title="Minimize Inbox"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onSetOpen(false)}
                  className="p-1.5 rounded-lg text-[#F7EFE0]/80 hover:text-white hover:bg-[#580B0C] cursor-pointer"
                  title="Close Inbox"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search & All/Unread Tabs */}
            <div className="p-2.5 bg-white border-b border-[#F2ECE9] space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#6E5D5F] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inboxSearch}
                  onChange={(e) => setInboxSearch(e.target.value)}
                  placeholder="Search @nickname or messages..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113]"
                />
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setInboxFilter('all')}
                  className={`py-1 px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    inboxFilter === 'all'
                      ? 'bg-[#7B1113] text-white'
                      : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
                  }`}
                >
                  All ({threads.length})
                </button>
                <button
                  type="button"
                  onClick={() => setInboxFilter('unread')}
                  className={`py-1 px-2 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                    inboxFilter === 'unread'
                      ? 'bg-[#7B1113] text-white'
                      : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
                  }`}
                >
                  Unread ({unreadThreadsCount})
                </button>
              </div>
            </div>

            {/* Threads List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#F2ECE9] bg-[#FAF8F5]/50">
              {confirmDeleteChatTarget && (
                <div className="p-2.5 bg-rose-50 border-b border-rose-200 space-y-1.5">
                  <p className="text-[11px] text-rose-900">
                    Delete conversation with <strong>{confirmDeleteChatTarget.peerName}</strong> for
                    you? Their copy will remain intact.
                  </p>
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteChatTarget(null)}
                      className="px-2 py-0.5 rounded bg-white border border-rose-200 text-[11px] font-medium text-[#6E5D5F] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleDeleteConversationForSelf(confirmDeleteChatTarget.chatId)
                      }
                      className="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                    >
                      Delete for Me
                    </button>
                  </div>
                </div>
              )}
              {filteredPopupThreads.length === 0 ? (
                <div className="p-4 space-y-3">
                  <p className="text-xs text-[#6E5D5F] text-center py-2">
                    {inboxFilter === 'unread'
                      ? 'No unread messages right now.'
                      : 'No messages yet. Start chatting with an online MSUan below:'}
                  </p>
                  {onlineSuggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-[#7B1113]">
                        Online MSUans ({onlineSuggestions.length})
                      </p>
                      {onlineSuggestions.map((u) => (
                        <button
                          key={u.uid}
                          type="button"
                          onClick={() =>
                            onSelectPeer({
                              uid: u.uid,
                              nickname: u.nickname,
                              photoURL: u.photoURL,
                              badge: u.badge,
                            })
                          }
                          className="w-full p-2 rounded-xl bg-white hover:bg-[#F7EFE0]/60 border border-[#E8DFDC] flex items-center justify-between gap-2 text-left cursor-pointer"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={u.photoURL || studentAvatarFallback}
                              alt={u.nickname}
                              referrerPolicy="no-referrer"
                              className="w-7 h-7 rounded-full object-cover border border-[#D4AF37]"
                            />
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-xs font-semibold text-[#1F1617] truncate">
                                @{u.nickname}
                              </span>
                              <UserBadgeTag badge={u.badge} size="sm" />
                            </div>
                          </div>
                          <MessageCircle className="w-3.5 h-3.5 text-[#7B1113] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                filteredPopupThreads.map((t) => {
                  const isUserA = t.userAId === currentUserProfile.uid;
                  const peerUid = isUserA ? t.userBId : t.userAId;
                  const peerNick = isUserA ? t.userBNickname : t.userANickname;
                  const peerPhoto = isUserA ? t.userBPhotoURL : t.userAPhotoURL;
                  const peerBadge = isUserA ? t.userBBadge : t.userABadge;
                  const isThreadOneOfficial = isOneOfficialAccount(
                    peerUid || peerNick,
                    peerBadge
                  );
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
                      className={`group w-full p-3 text-left transition-colors flex items-center gap-2.5 cursor-pointer ${
                        isUnread
                          ? 'bg-[#7B1113]/[0.05] hover:bg-[#7B1113]/[0.09]'
                          : 'bg-white hover:bg-[#FAF8F5]'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <img
                          src={resolvedThreadPhoto}
                          alt={peerNick}
                          referrerPolicy="no-referrer"
                          className="w-9 h-9 rounded-full object-cover border border-[#D4AF37]"
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                            isOnline ? 'bg-emerald-500' : 'bg-stone-300'
                          }`}
                        />
                      </div>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <div className="flex items-center justify-between gap-1.5 min-w-0">
                          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-hidden">
                            <span
                              className={`text-xs truncate ${
                                isUnread
                                  ? 'font-bold text-[#7B1113]'
                                  : 'font-semibold text-[#1F1617]'
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
                              className="p-1 rounded text-[#9E8E90] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Delete conversation for me"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-1.5 mt-0.5 min-w-0 overflow-hidden">
                          <p
                            className={`text-[11px] truncate flex-1 min-w-0 ${
                              isUnread ? 'font-semibold text-[#1F1617]' : 'text-[#6E5D5F]'
                            }`}
                          >
                            {t.lastSenderId === currentUserProfile.uid
                              ? `You: ${t.lastMessage}`
                              : t.lastMessage}
                          </p>
                          {t.lastSenderId === currentUserProfile.uid && (
                            <span className="shrink-0 text-[10px] font-mono">
                              {t.lastMessageRead ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Check className="w-3 h-3 text-[#9E8E90]" />
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

            <div className="p-2 bg-white border-t border-[#E8DFDC] text-center shrink-0">
              <button
                type="button"
                onClick={onExpandToFullInbox}
                className="text-xs font-semibold text-[#7B1113] hover:underline cursor-pointer"
              >
                See All in Full Inbox
              </button>
            </div>
          </>
        )}
      </div>

      {/* File Preview Modal */}
      {previewTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8DFDC] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#E8DFDC] flex items-center justify-between gap-3">
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
            <div className="p-5 overflow-y-auto flex-1 bg-[#FAF8F5]">
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
    </>
  );
};
