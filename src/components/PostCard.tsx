import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Heart,
  MessageSquare,
  MessageCircle,
  Download,
  Eye,
  EyeOff,
  Trash2,
  FileText,
  FileSpreadsheet,
  Presentation,
  File as FileIcon,
  Film,
  X,
  Send,
  Edit3,
  Check,
  Reply,
  Pin,
  Lock,
  Flag,
  ImageOff,
  MoreVertical,
  BookOpen,
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
  where,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  canUseFirestore,
  db,
  handleFirestoreError,
  isUserCurrentlyOnline,
  OperationType,
  resolveUserBadge,
} from '../firebase';
import { ChatPeerTarget, Comment, Post, UserPresence, UserPublicProfile } from '../types';
import {
  decodeDocumentPreviewText,
  formatFileSize,
  getAttachmentMeta,
  ResolvedPdfDocument,
  resolveMediaAttachmentUrl,
  resolvePdfDocumentData,
  triggerAttachmentDownload,
} from '../utils/fileHelpers';
import { UserBadgeTag } from './UserBadgeTag';
import { PdfReviewerViewer } from './PdfReviewerViewer';
import {
  DB_UPDATE_EVENT,
  deleteLocalComment,
  getLocalComments,
  getLocalPresence,
  getLocalUsers,
  saveLocalCommentsForPost,
  toggleLocalCommentLike,
  updateLocalPostFields,
  upsertLocalComment,
  upsertLocalNotification,
  upsertLocalReport,
} from '../utils/databaseRestore';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';
import campusStudyFallback from '../assets/images/campus_study_notes_1790401783483.jpg';

interface PostCardProps {
  post: Post;
  currentUserProfile: UserPublicProfile;
  presenceList?: UserPresence[];
  usersList?: UserPublicProfile[];
  hasReacted: boolean;
  onToggleReaction: (post: Post) => Promise<void>;
  onDeletePost: (postId: string) => Promise<void>;
  onStartChat?: (peer: ChatPeerTarget) => void;
}

export function formatRelativeTime(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Just now';
  const date = ts.toDate();
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  currentUserProfile,
  presenceList,
  hasReacted,
  onToggleReaction,
  onDeletePost,
  onStartChat,
}) => {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>(() => getLocalComments(post.id));
  const [commentText, setCommentText] = useState('');
  const [commentAnonymous, setCommentAnonymous] = useState(currentUserProfile.defaultAnonymous);
  const [commentAnonNotice, setCommentAnonNotice] = useState<'on' | 'off' | null>(null);
  const [postAnonNotice, setPostAnonNotice] = useState<'on' | 'off' | null>(null);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{
    commentId: string;
    nickname: string;
    authorId: string;
    isAnonymous: boolean;
  } | null>(null);
  const [inlineReplyText, setInlineReplyText] = useState('');

  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string>(post.attachmentDataUrl);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [authorAvatarFailed, setAuthorAvatarFailed] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [pdfDocSummary, setPdfDocSummary] = useState<ResolvedPdfDocument | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(post.title);
  const [editContent, setEditContent] = useState(post.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [showReportBox, setShowReportBox] = useState(false);
  const [reportReason, setReportReason] = useState('Harassment / Bullying');
  const [reportDetails, setReportDetails] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccessMsg, setReportSuccessMsg] = useState<string | null>(null);
  const [showKebabMenu, setShowKebabMenu] = useState(false);
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const kebabMenuRef = useRef<HTMLDivElement | null>(null);

  const [pendingConfirmAction, setPendingConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'primary';
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isConfirmExecuting, setIsConfirmExecuting] = useState(false);

  const isAuthor = post.authorId === currentUserProfile.uid;
  const attachmentMeta = getAttachmentMeta(post.attachmentType);
  const currentUserBadge = resolveUserBadge(currentUserProfile.badge);
  const isDeveloper =
    currentUserBadge === 'developer' ||
    currentUserBadge === 'moderator' ||
    currentUserProfile.role === 'developer' ||
    currentUserProfile.role === 'moderator' ||
    Boolean(currentUserProfile.permissions?.canDeletePosts);

  useEffect(() => {
    if (!showKebabMenu) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (kebabMenuRef.current && !kebabMenuRef.current.contains(event.target as Node)) {
        setShowKebabMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowKebabMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showKebabMenu]);

  useEffect(() => {
    let active = true;
    setPhotoFailed(false);
    if (!post.attachmentDataUrl || post.attachmentType === 'none') {
      setResolvedMediaUrl('');
      return () => {
        active = false;
      };
    }
    resolveMediaAttachmentUrl(
      post.attachmentDataUrl,
      post.attachmentType,
      post.attachmentMime
    ).then((url) => {
      if (active) {
        setResolvedMediaUrl(url || post.attachmentDataUrl);
      }
      if (post.attachmentType === 'pdf') {
        resolvePdfDocumentData(post.attachmentDataUrl, url || post.attachmentDataUrl).then(
          (pdfInfo) => {
            if (active) {
              setPdfDocSummary(pdfInfo);
            }
          }
        );
      } else if (active) {
        setPdfDocSummary(null);
      }
    });
    return () => {
      active = false;
    };
  }, [post.attachmentDataUrl, post.attachmentType, post.attachmentMime]);

  useEffect(() => {
    setComments(getLocalComments(post.id));

    const handleLocalUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ collection?: string }>).detail;
      const col = detail?.collection || 'all';
      if (col === 'all' || col === 'comments' || col === 'posts' || col === 'users') {
        setComments(getLocalComments(post.id));
      }
    };
    window.addEventListener(DB_UPDATE_EVENT, handleLocalUpdate);

    if (!showComments) {
      return () => {
        window.removeEventListener(DB_UPDATE_EVENT, handleLocalUpdate);
      };
    }

    const commentsPath = `posts/${post.id}/comments`;
    let unsubscribe = () => {};
    if (canUseFirestore()) {
      const q = query(
        collection(db, commentsPath),
        where('visibility', '==', 'edu_verified')
      );

      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const list: Comment[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Comment, 'id'>),
          }));
          if (list.length > 0) {
            saveLocalCommentsForPost(post.id, list);
          }
          setComments(getLocalComments(post.id));
        },
        (err) => {
          setComments(getLocalComments(post.id));
          handleFirestoreError(err, OperationType.LIST, commentsPath);
        }
      );
    }

    return () => {
      unsubscribe();
      window.removeEventListener(DB_UPDATE_EVENT, handleLocalUpdate);
    };
  }, [showComments, post.id]);

  const handleToggleCommentAnon = () => {
    const next = !commentAnonymous;
    setCommentAnonymous(next);
    setCommentAnonNotice(next ? 'on' : 'off');
    window.setTimeout(() => {
      setCommentAnonNotice(null);
    }, 2000);
  };

  const submitCommentOrReply = async (
    rawText: string,
    targetReply: {
      commentId: string;
      nickname: string;
      authorId: string;
      isAnonymous: boolean;
    } | null,
    isFromInlineBox: boolean
  ) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    setIsSubmittingComment(true);
    const commentId = `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const commentRef = doc(db, 'posts', post.id, 'comments', commentId);
    const postRef = doc(db, 'posts', post.id);

    try {
      const safeNick = (currentUserProfile.nickname || 'Student').slice(0, 64);
      const safeDisplayName = (
        currentUserProfile.googleDisplayName ||
        currentUserProfile.nickname ||
        'Student'
      ).slice(0, 64);
      const safePhoto = (currentUserProfile.photoURL || '').slice(0, 350000);
      const commentPayload: Record<string, unknown> = {
        postId: post.id,
        authorId: currentUserProfile.uid,
        authorNickname: commentAnonymous ? 'Anonymous Student' : safeNick,
        authorDisplayName: commentAnonymous ? 'Anonymous Student' : safeDisplayName,
        authorPhotoURL: commentAnonymous ? '' : safePhoto,
        authorBadge: commentAnonymous ? 'verified' : currentUserBadge,
        isAnonymous: commentAnonymous,
        content: trimmed.slice(0, 1500),
        visibility: 'edu_verified',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      if (targetReply) {
        commentPayload.replyToCommentId = targetReply.commentId.slice(0, 128);
        commentPayload.replyToNickname = (
          targetReply.isAnonymous ? 'Anonymous Student' : targetReply.nickname || 'Student'
        ).slice(0, 64);
      }

      const nowTs = Timestamp.now();
      const localCommentObj: Comment = {
        id: commentId,
        postId: post.id,
        authorId: currentUserProfile.uid,
        authorNickname: commentAnonymous ? 'Anonymous Student' : safeNick,
        authorDisplayName: commentAnonymous ? 'Anonymous Student' : safeDisplayName,
        authorPhotoURL: commentAnonymous ? '' : safePhoto,
        authorBadge: commentAnonymous ? 'verified' : currentUserBadge,
        isAnonymous: commentAnonymous,
        content: trimmed.slice(0, 1500),
        replyToCommentId: targetReply ? targetReply.commentId.slice(0, 128) : undefined,
        replyToNickname: targetReply
          ? (targetReply.isAnonymous ? 'Anonymous Student' : targetReply.nickname || 'Student').slice(
              0,
              64
            )
          : undefined,
        visibility: 'edu_verified',
        createdAt: nowTs,
        updatedAt: nowTs,
      };

      upsertLocalComment(localCommentObj);
      const updatedLocalComments = getLocalComments(post.id);
      const nextCount = Math.max(post.commentsCount || 0, updatedLocalComments.length);
      updateLocalPostFields(post.id, { commentsCount: nextCount });
      setComments(updatedLocalComments);

      if (isFromInlineBox) {
        setInlineReplyText('');
        setReplyingTo(null);
      } else {
        setCommentText('');
        if (targetReply) {
          setReplyingTo(null);
        }
      }
      setIsSubmittingComment(false);

      // Fire-and-forget notifications so they never slow down consecutive replies
      if (targetReply && targetReply.authorId !== currentUserProfile.uid) {
        const notifReplyId = `notif_rpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const replyNotifPayload = {
          id: notifReplyId,
          recipientId: targetReply.authorId,
          actorId: currentUserProfile.uid,
          actorNickname: commentAnonymous ? 'Anonymous Student' : safeNick,
          actorPhotoURL: commentAnonymous ? '' : safePhoto,
          actorBadge: commentAnonymous ? 'verified' : currentUserBadge,
          type: 'comment' as const,
          targetId: post.id,
          previewText: `Replied to your comment: ${trimmed.slice(0, 110)}`,
          read: false,
          createdAt: Timestamp.now(),
        };
        upsertLocalNotification(replyNotifPayload);
        if (canUseFirestore(currentUserProfile.uid)) {
          setDoc(doc(db, 'notifications', notifReplyId), {
            ...replyNotifPayload,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      }

      if (
        post.authorId !== currentUserProfile.uid &&
        (!targetReply || targetReply.authorId !== post.authorId)
      ) {
        const notifId = `notif_cmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const cmtNotifPayload = {
          id: notifId,
          recipientId: post.authorId,
          actorId: currentUserProfile.uid,
          actorNickname: commentAnonymous ? 'Anonymous Student' : safeNick,
          actorPhotoURL: commentAnonymous ? '' : safePhoto,
          actorBadge: commentAnonymous ? 'verified' : currentUserBadge,
          type: 'comment' as const,
          targetId: post.id,
          previewText: trimmed.slice(0, 140),
          read: false,
          createdAt: Timestamp.now(),
        };
        upsertLocalNotification(cmtNotifPayload);
        if (canUseFirestore(currentUserProfile.uid)) {
          setDoc(doc(db, 'notifications', notifId), {
            ...cmtNotifPayload,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      }

      if (canUseFirestore(currentUserProfile.uid)) {
        setDoc(commentRef, commentPayload).catch((err) => {
          handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/comments/${commentId}`);
        });
        updateDoc(postRef, {
          commentsCount: nextCount,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    } catch (err) {
      setIsSubmittingComment(false);
      handleFirestoreError(err, OperationType.WRITE, `posts/${post.id}/comments/${commentId}`);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitCommentOrReply(commentText, replyingTo, false);
  };

  const handleAddInlineReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyingTo) return;
    await submitCommentOrReply(inlineReplyText, replyingTo, true);
  };

  const handleDeleteComment = async (commentId: string) => {
    deleteLocalComment(commentId, post.id);
    const remaining = getLocalComments(post.id);
    setComments(remaining);
    if (canUseFirestore(currentUserProfile.uid)) {
      const commentRef = doc(db, 'posts', post.id, 'comments', commentId);
      const postRef = doc(db, 'posts', post.id);
      deleteDoc(commentRef).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, `posts/${post.id}/comments/${commentId}`);
      });
      updateDoc(postRef, {
        commentsCount: remaining.length,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  };

  const handleToggleCommentLike = async (cmt: Comment) => {
    const updated = toggleLocalCommentLike(cmt.id, currentUserProfile.uid);
    setComments(getLocalComments(post.id));
    if (updated && canUseFirestore(currentUserProfile.uid)) {
      const commentRef = doc(db, 'posts', post.id, 'comments', cmt.id);
      updateDoc(commentRef, {
        likesCount: updated.likesCount || 0,
        likedBy: updated.likedBy || [],
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  };

  const handleSaveEdit = async () => {
    const trimmedContent = editContent.trim();
    if (!trimmedContent) return;
    setIsSavingEdit(true);
    updateLocalPostFields(post.id, {
      title: editTitle.trim().slice(0, 160),
      content: trimmedContent.slice(0, 5000),
    });
    setIsEditing(false);
    setIsSavingEdit(false);
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'posts', post.id), {
        title: editTitle.trim().slice(0, 160),
        content: trimmedContent.slice(0, 5000),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      });
    }
  };

  const handleTogglePostAnonymity = async () => {
    if (!isAuthor) return;
    const nextAnon = !post.isAnonymous;
    setPostAnonNotice(nextAnon ? 'on' : 'off');
    window.setTimeout(() => {
      setPostAnonNotice(null);
    }, 2200);
    updateLocalPostFields(post.id, {
      isAnonymous: nextAnon,
      authorNickname: nextAnon ? 'Anonymous Student' : currentUserProfile.nickname,
      authorDisplayName: nextAnon
        ? 'Anonymous Student'
        : currentUserProfile.googleDisplayName || currentUserProfile.nickname,
      authorPhotoURL: nextAnon ? '' : currentUserProfile.photoURL,
      authorBadge: nextAnon ? 'verified' : currentUserBadge,
    });
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'posts', post.id), {
        isAnonymous: nextAnon,
        authorNickname: nextAnon ? 'Anonymous Student' : currentUserProfile.nickname,
        authorDisplayName: nextAnon
          ? 'Anonymous Student'
          : currentUserProfile.googleDisplayName || currentUserProfile.nickname,
        authorPhotoURL: nextAnon ? '' : currentUserProfile.photoURL,
        authorBadge: nextAnon ? 'verified' : currentUserBadge,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      });
    }
  };

  const renderDocumentIcon = () => {
    switch (post.attachmentType) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-[#7B1113] shrink-0" />;
      case 'word':
        return <FileIcon className="w-5 h-5 text-[#7B1113] shrink-0" />;
      case 'excel':
        return <FileSpreadsheet className="w-5 h-5 text-[#7B1113] shrink-0" />;
      case 'ppt':
        return <Presentation className="w-5 h-5 text-[#7B1113] shrink-0" />;
      case 'video':
        return <Film className="w-5 h-5 text-[#7B1113] shrink-0" />;
      default:
        return <FileText className="w-5 h-5 text-[#7B1113] shrink-0" />;
    }
  };

  const decodedPreview =
    showPreviewModal && ['pdf', 'word', 'excel', 'ppt'].includes(post.attachmentType)
      ? decodeDocumentPreviewText(resolvedMediaUrl)
      : null;

  const latestUsers = getLocalUsers();
  const effectivePresenceList = presenceList && presenceList.length > 0 ? presenceList : getLocalPresence();

  const resolvedAuthorProfile = !post.isAnonymous
    ? isAuthor
      ? currentUserProfile
      : latestUsers.find((u) => u.uid === post.authorId)
    : undefined;

  const authorPresence = !post.isAnonymous
    ? effectivePresenceList.find((p) => p.uid === post.authorId)
    : undefined;

  const isAuthorOnline = !post.isAnonymous && (isAuthor || isUserCurrentlyOnline(authorPresence));

  const effectiveAuthorNickname = post.isAnonymous
    ? 'Anonymous Student'
    : resolvedAuthorProfile?.nickname || authorPresence?.nickname || post.authorNickname;

  const effectiveAuthorPhotoURL = post.isAnonymous
    ? ''
    : resolvedAuthorProfile?.photoURL || authorPresence?.photoURL || post.authorPhotoURL;

  useEffect(() => {
    setAuthorAvatarFailed(false);
  }, [effectiveAuthorPhotoURL]);

  const displayedPostBadge = post.isAnonymous
    ? 'verified'
    : resolvedAuthorProfile?.badge
    ? resolveUserBadge(resolvedAuthorProfile.badge)
    : post.authorBadge || (isAuthor ? currentUserBadge : 'verified');

  const displayCategory =
    (post.category as string) === 'Prof & Subjects' ? 'Subjects' : post.category;

  const handleDeveloperTogglePin = async () => {
    updateLocalPostFields(post.id, { isPinned: !post.isPinned });
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'posts', post.id), {
        isPinned: !post.isPinned,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      });
    }
  };

  const handleDeveloperToggleHide = async () => {
    updateLocalPostFields(post.id, { isHidden: !post.isHidden });
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'posts', post.id), {
        isHidden: !post.isHidden,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      });
    }
  };

  const handleDeveloperToggleLockComments = async () => {
    updateLocalPostFields(post.id, { commentsLocked: !post.commentsLocked });
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'posts', post.id), {
        commentsLocked: !post.commentsLocked,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      });
    }
  };

  const handleDeveloperRemoveAttachment = async () => {
    updateLocalPostFields(post.id, {
      attachmentType: 'none',
      attachmentName: '',
      attachmentSize: 0,
      attachmentMime: '',
      attachmentDataUrl: '',
    });
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'posts', post.id), {
        attachmentType: 'none',
        attachmentName: '',
        attachmentSize: 0,
        attachmentMime: '',
        attachmentDataUrl: '',
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `posts/${post.id}`);
      });
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingReport) return;
    setIsSubmittingReport(true);
    const reportId = `rep_${post.id}_${currentUserProfile.uid}_${Date.now()}`;
    upsertLocalReport({
      id: reportId,
      targetType: 'post',
      targetId: post.id,
      targetAuthorId: post.authorId,
      targetAuthorNickname: post.isAnonymous ? 'Anonymous Student' : post.authorNickname,
      targetPreview: (post.title ? `${post.title} — ` : '') + post.content.slice(0, 220),
      reporterId: currentUserProfile.uid,
      reporterNickname: currentUserProfile.nickname,
      reason: reportReason,
      details: reportDetails.trim().slice(0, 500),
      status: 'pending',
      visibility: 'edu_verified',
      createdAt: null,
      updatedAt: null,
    });
    updateLocalPostFields(post.id, { reportsCount: (post.reportsCount || 0) + 1 });
    setReportDetails('');
    setShowReportBox(false);
    setIsSubmittingReport(false);
    setReportSuccessMsg('Report submitted to ONE Moderators for review.');
    window.setTimeout(() => setReportSuccessMsg(null), 3500);
    if (canUseFirestore(currentUserProfile.uid)) {
      const batch = writeBatch(db);
      batch.set(doc(db, 'reports', reportId), {
        targetType: 'post',
        targetId: post.id,
        targetAuthorId: post.authorId,
        targetAuthorNickname: post.isAnonymous ? 'Anonymous Student' : post.authorNickname,
        targetPreview: (post.title ? `${post.title} — ` : '') + post.content.slice(0, 220),
        reporterId: currentUserProfile.uid,
        reporterNickname: currentUserProfile.nickname,
        reason: reportReason,
        details: reportDetails.trim().slice(0, 500),
        status: 'pending',
        visibility: 'edu_verified',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, 'posts', post.id), {
        reportsCount: (post.reportsCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
      batch.commit().catch((err: unknown) => {
        handleFirestoreError(err, OperationType.WRITE, `reports/${reportId}`);
      });
    }
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 ${
        post.isPinned
          ? 'border-[#D4AF37] ring-1 ring-[#D4AF37]/40'
          : post.isHidden
          ? 'border-amber-400/70 opacity-80'
          : 'border-[#E8DFDC]'
      }`}
    >
      {/* Status Banners: Pinned / Hidden / Locked Comments */}
      {(post.isPinned || post.isHidden || post.commentsLocked) && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold pb-1 border-b border-[#F2ECE9]">
          {post.isPinned && (
            <span className="inline-flex items-center gap-1 text-[#7B1113]">
              <Pin className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Pinned Important Post</span>
            </span>
          )}
          {post.isHidden && (
            <span className="inline-flex items-center gap-1 text-amber-700">
              <EyeOff className="w-3.5 h-3.5" />
              <span>Hidden from Public Feed</span>
            </span>
          )}
          {post.commentsLocked && (
            <span className="inline-flex items-center gap-1 text-[#6E5D5F]">
              <Lock className="w-3.5 h-3.5 text-[#7B1113]" />
              <span>Comments Locked</span>
            </span>
          )}
        </div>
      )}
      {/* Animated Post Anonymity Transition Banner */}
      <AnimatePresence>
        {postAnonNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 ${
              postAnonNotice === 'on'
                ? 'bg-[#7B1113] text-white'
                : 'bg-[#FAF8F5] text-[#1F1617] border border-[#E8DFDC]'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>
              {postAnonNotice === 'on'
                ? 'Anonymous Mode is now ON for this post.'
                : `Anonymous Mode OFF — Showing @${currentUserProfile.nickname}.`}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Author Header — ONLY Nickname & Badge (Never Email) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {post.isAnonymous ? (
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="w-9 h-9 rounded-full bg-[#7B1113] text-[#D4AF37] flex items-center justify-center shrink-0 border border-[#D4AF37]"
            >
              <EyeOff className="w-4 h-4" />
            </motion.div>
          ) : (
            <div className="relative shrink-0">
              <img
                src={
                  effectiveAuthorPhotoURL && !authorAvatarFailed
                    ? effectiveAuthorPhotoURL
                    : studentAvatarFallback
                }
                alt={effectiveAuthorNickname}
                referrerPolicy="no-referrer"
                onError={() => setAuthorAvatarFailed(true)}
                className="w-9 h-9 rounded-full object-cover border border-[#D4AF37] shrink-0"
              />
              <span
                title={isAuthorOnline ? 'Active now' : 'Offline'}
                className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                  isAuthorOnline ? 'bg-emerald-500' : 'bg-stone-300'
                }`}
              />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-sm min-w-0 max-w-full leading-tight">
              <span className="font-semibold text-[#1F1617] truncate">
                {post.isAnonymous ? 'Anonymous Student' : `@${effectiveAuthorNickname}`}
              </span>
              <UserBadgeTag
                badge={displayedPostBadge}
                isAnonymous={post.isAnonymous}
                size="sm"
              />
            </div>

            <div className="flex items-center gap-1 text-xs text-[#6E5D5F] min-w-0 mt-0.5 leading-tight">
              <span className="truncate">{displayCategory}</span>
              <span aria-hidden="true" className="shrink-0">·</span>
              <span className="font-mono tabular-nums shrink-0">{formatRelativeTime(post.createdAt)}</span>
            </div>
          </div>
        </div>

        <div ref={kebabMenuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setShowKebabMenu((prev) => !prev)}
            className={`w-8 h-8 rounded-lg transition-colors flex items-center justify-center shrink-0 cursor-pointer ${
              showKebabMenu
                ? 'bg-[#7B1113] text-[#D4AF37]'
                : 'text-[#6E5D5F] hover:text-[#7B1113] hover:bg-[#FAF8F5]'
            }`}
            title="Post options"
            aria-label="Post options"
            aria-expanded={showKebabMenu}
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          <AnimatePresence>
            {showKebabMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ duration: 0.14 }}
                className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-[#E8DFDC] rounded-xl shadow-lg py-1.5 z-30 overflow-hidden"
              >
                {/* Direct Message if post is not by current user and not anonymous */}
                {!isAuthor && !post.isAnonymous && onStartChat && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowKebabMenu(false);
                      onStartChat({
                        uid: post.authorId,
                        nickname: effectiveAuthorNickname,
                        photoURL: effectiveAuthorPhotoURL || '',
                        badge: displayedPostBadge,
                      });
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#1F1617] hover:bg-[#FAF8F5] hover:text-[#7B1113] transition-colors flex items-center gap-2.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 text-[#7B1113] shrink-0" />
                    <span className="truncate">Message @{effectiveAuthorNickname}</span>
                  </button>
                )}

                {/* Author Controls */}
                {isAuthor && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setShowKebabMenu(false);
                        handleTogglePostAnonymity();
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#1F1617] hover:bg-[#FAF8F5] hover:text-[#7B1113] transition-colors flex items-center gap-2.5 cursor-pointer"
                    >
                      {post.isAnonymous ? (
                        <Eye className="w-4 h-4 text-[#7B1113] shrink-0" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-[#7B1113] shrink-0" />
                      )}
                      <span>
                        {post.isAnonymous ? 'Show My Nickname' : 'Make Post Anonymous'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowKebabMenu(false);
                        setIsEditing((prev) => !prev);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#1F1617] hover:bg-[#FAF8F5] hover:text-[#7B1113] transition-colors flex items-center gap-2.5 cursor-pointer"
                    >
                      <Edit3 className="w-4 h-4 text-[#6E5D5F] shrink-0" />
                      <span>{isEditing ? 'Cancel Editing' : 'Edit Post'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowKebabMenu(false);
                        setPendingConfirmAction({
                          title: 'Are you sure?',
                          message:
                            'Are you sure you want to permanently delete this post? This action cannot be undone.',
                          confirmLabel: 'Yes, Delete Post',
                          variant: 'danger',
                          onConfirm: () => onDeletePost(post.id),
                        });
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors flex items-center gap-2.5 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-rose-700 shrink-0" />
                      <span>Delete Post</span>
                    </button>
                  </>
                )}

                {/* Developer / Admin Controls */}
                {isDeveloper && (
                  <>
                    {(isAuthor || (!post.isAnonymous && onStartChat)) && (
                      <div className="my-1 border-t border-[#F2ECE9]" />
                    )}
                    <div className="px-3.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#6E5D5F]">
                      Admin Controls
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowKebabMenu(false);
                        setPendingConfirmAction({
                          title: 'Are you sure?',
                          message: post.isPinned
                            ? 'Are you sure you want to unpin this post from the top of the feed?'
                            : 'Are you sure you want to pin this post to the top of the feed?',
                          confirmLabel: post.isPinned ? 'Yes, Unpin Post' : 'Yes, Pin Post',
                          variant: 'primary',
                          onConfirm: handleDeveloperTogglePin,
                        });
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#1F1617] hover:bg-[#FAF8F5] hover:text-[#7B1113] transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Pin
                          className={`w-4 h-4 shrink-0 ${
                            post.isPinned ? 'text-[#D4AF37] fill-[#D4AF37]' : 'text-[#7B1113]'
                          }`}
                        />
                        <span className="truncate">
                          {post.isPinned ? 'Unpin Post' : 'Pin Important Post'}
                        </span>
                      </span>
                      {post.isPinned && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#7B1113] text-[#D4AF37] shrink-0">
                          Pinned
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowKebabMenu(false);
                        setPendingConfirmAction({
                          title: 'Are you sure?',
                          message: post.isHidden
                            ? 'Are you sure you want to unhide this post and restore it to the public feed?'
                            : 'Are you sure you want to hide this post from the public feed?',
                          confirmLabel: post.isHidden ? 'Yes, Unhide Post' : 'Yes, Hide Post',
                          variant: 'primary',
                          onConfirm: handleDeveloperToggleHide,
                        });
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#1F1617] hover:bg-[#FAF8F5] hover:text-[#7B1113] transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <EyeOff
                          className={`w-4 h-4 shrink-0 ${
                            post.isHidden ? 'text-amber-600' : 'text-[#6E5D5F]'
                          }`}
                        />
                        <span className="truncate">
                          {post.isHidden ? 'Unhide Post' : 'Hide Post from Feed'}
                        </span>
                      </span>
                      {post.isHidden && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-600 text-white shrink-0">
                          Hidden
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setShowKebabMenu(false);
                        setPendingConfirmAction({
                          title: 'Are you sure?',
                          message: post.commentsLocked
                            ? 'Are you sure you want to unlock comments on this post?'
                            : 'Are you sure you want to lock comments on this post?',
                          confirmLabel: post.commentsLocked
                            ? 'Yes, Unlock Comments'
                            : 'Yes, Lock Comments',
                          variant: 'primary',
                          onConfirm: handleDeveloperToggleLockComments,
                        });
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#1F1617] hover:bg-[#FAF8F5] hover:text-[#7B1113] transition-colors flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <Lock
                          className={`w-4 h-4 shrink-0 ${
                            post.commentsLocked ? 'text-[#7B1113]' : 'text-[#6E5D5F]'
                          }`}
                        />
                        <span className="truncate">
                          {post.commentsLocked ? 'Unlock Comments' : 'Lock Comments'}
                        </span>
                      </span>
                      {post.commentsLocked && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#7B1113] text-[#D4AF37] shrink-0">
                          Locked
                        </span>
                      )}
                    </button>

                    {post.attachmentType !== 'none' && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowKebabMenu(false);
                          setPendingConfirmAction({
                            title: 'Are you sure?',
                            message:
                              'Are you sure you want to remove the photo/attachment from this post? This action cannot be undone.',
                            confirmLabel: 'Yes, Remove Attachment',
                            variant: 'danger',
                            onConfirm: handleDeveloperRemoveAttachment,
                          });
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors flex items-center gap-2.5 cursor-pointer"
                      >
                        <ImageOff className="w-4 h-4 text-rose-700 shrink-0" />
                        <span>Remove Attachment</span>
                      </button>
                    )}

                    {!isAuthor && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowKebabMenu(false);
                          setPendingConfirmAction({
                            title: 'Are you sure?',
                            message:
                              'Are you sure you want to permanently delete this post as an Admin? This action cannot be undone.',
                            confirmLabel: 'Yes, Delete Post',
                            variant: 'danger',
                            onConfirm: () => onDeletePost(post.id),
                          });
                        }}
                        className="w-full px-3.5 py-2 text-left text-xs font-medium text-rose-700 hover:bg-rose-50 transition-colors flex items-center gap-2.5 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 text-rose-700 shrink-0" />
                        <span>Delete Post (Admin)</span>
                      </button>
                    )}
                  </>
                )}

                {/* Report Post option for non-authors */}
                {!isAuthor && (
                  <>
                    {(isDeveloper || (!post.isAnonymous && onStartChat)) && (
                      <div className="my-1 border-t border-[#F2ECE9]" />
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowKebabMenu(false);
                        setShowReportBox((prev) => !prev);
                      }}
                      className="w-full px-3.5 py-2 text-left text-xs font-medium text-[#6E5D5F] hover:bg-rose-50 hover:text-rose-700 transition-colors flex items-center gap-2.5 cursor-pointer"
                    >
                      <Flag className="w-4 h-4 shrink-0" />
                      <span>Report Post</span>
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Post Content */}
      {isEditing ? (
        <div className="space-y-2.5 pt-1">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            maxLength={160}
            placeholder="Title (optional)"
            className="w-full px-3 py-2 text-sm font-medium border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
          />
          <textarea
            value={editContent}
            onChange={(e) => {
              setEditContent(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.max(150, e.target.scrollHeight)}px`;
            }}
            rows={5}
            maxLength={5000}
            className="w-full min-h-[150px] px-3 py-2.5 text-sm border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113] resize-y leading-relaxed"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 text-xs font-medium text-[#6E5D5F] hover:bg-[#FAF8F5] rounded-lg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSavingEdit}
              className="px-3.5 py-1.5 text-xs font-medium bg-[#7B1113] text-white rounded-lg flex items-center gap-1"
            >
              <Check className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{isSavingEdit ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2 min-w-0">
          {post.title && (
            <h3 className="font-display text-lg sm:text-xl font-bold text-[#1F1617] leading-snug tracking-tight break-words [word-break:break-word]">
              {post.title}
            </h3>
          )}
          {(() => {
            const rawContent = post.content || '';
            const lines = rawContent.split('\n');
            const isLongPost = rawContent.length > 260 || lines.length > 5;
            if (!isLongPost) {
              return (
                <p className="text-[15px] sm:text-base text-[#1F1617] leading-[1.68] whitespace-pre-line break-words [word-break:break-word]">
                  {rawContent}
                </p>
              );
            }
            const truncatedText =
              lines.length > 5
                ? lines.slice(0, 5).join('\n').slice(0, 260).trimEnd()
                : rawContent.slice(0, 260).trimEnd();
            return (
              <div className="text-[15px] sm:text-base text-[#1F1617] leading-[1.68] whitespace-pre-line break-words [word-break:break-word]">
                <span>{isContentExpanded ? rawContent : `${truncatedText}... `}</span>
                <button
                  type="button"
                  onClick={() => setIsContentExpanded((prev) => !prev)}
                  className="font-semibold text-[#7B1113] hover:underline cursor-pointer inline ml-0.5"
                >
                  {isContentExpanded ? 'See less' : 'See more'}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* File / Media Attachment */}
      {post.attachmentType !== 'none' && post.attachmentName && (
        <div className="pt-1">
          {post.attachmentType === 'photo' && (
            <div className="rounded-xl overflow-hidden border border-[#E8DFDC] bg-[#FAF8F5]">
              <img
                src={!photoFailed && resolvedMediaUrl ? resolvedMediaUrl : campusStudyFallback}
                alt="Post photo"
                referrerPolicy="no-referrer"
                onError={() => setPhotoFailed(true)}
                onClick={() => setShowPreviewModal(true)}
                className="w-full max-h-[380px] object-cover cursor-zoom-in"
              />
            </div>
          )}

          {post.attachmentType === 'video' && (
            <div className="rounded-xl overflow-hidden border border-[#E8DFDC] bg-neutral-950">
              {resolvedMediaUrl && !resolvedMediaUrl.startsWith('firestore-chunked://') && !resolvedMediaUrl.startsWith('idb://') ? (
                <video
                  src={resolvedMediaUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[420px] bg-black object-contain"
                />
              ) : (
                <div className="p-6 text-center text-neutral-300 space-y-1.5">
                  <Film className="w-7 h-7 mx-auto text-[#D4AF37] animate-pulse" />
                  <p className="text-xs text-neutral-400">Loading video clip...</p>
                </div>
              )}
            </div>
          )}

          {['pdf', 'word', 'excel', 'ppt'].includes(post.attachmentType) && (
            <div className="p-3 sm:p-3.5 rounded-xl border border-[#E8DFDC] bg-[#FAF8F5] space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-white border border-[#E8DFDC] flex items-center justify-center shrink-0">
                    {renderDocumentIcon()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#1F1617] truncate">
                      {post.attachmentName}
                    </p>
                    <p className="text-xs text-[#6E5D5F] font-mono tabular-nums">
                      {attachmentMeta.extBadge} · {formatFileSize(post.attachmentSize)}
                      {post.attachmentType === 'pdf' && pdfDocSummary
                        ? ` · ${pdfDocSummary.totalPages} ${
                            pdfDocSummary.totalPages === 1 ? 'page' : 'pages'
                          }`
                        : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="px-3 py-1.5 bg-white hover:bg-[#F2ECE9] text-[#7B1113] border border-[#7B1113]/30 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 min-h-[36px] cursor-pointer"
                  >
                    {post.attachmentType === 'pdf' ? (
                      <>
                        <BookOpen className="w-3.5 h-3.5 text-[#7B1113]" />
                        <span>Preview Reviewer</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      triggerAttachmentDownload(
                        resolvedMediaUrl || post.attachmentDataUrl,
                        post.attachmentName
                      )
                    }
                    className="px-3 py-1.5 bg-[#7B1113] hover:bg-[#580B0C] text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[36px] cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Download</span>
                  </button>
                </div>
              </div>

              {/* Inline clickable PDF study reviewer preview card right on the feed post */}
              {post.attachmentType === 'pdf' &&
                pdfDocSummary &&
                pdfDocSummary.pages.length > 0 && (
                  <div
                    onClick={() => setShowPreviewModal(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setShowPreviewModal(true);
                      }
                    }}
                    className="bg-white border border-[#E8DFDC] hover:border-[#7B1113]/40 rounded-lg p-3 transition-colors cursor-pointer group space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#6E5D5F]">
                      <span className="font-semibold text-[#7B1113]">
                        PDF STUDY REVIEWER PREVIEW · PAGE 1 OF {pdfDocSummary.totalPages}
                      </span>
                      <span className="text-[#7B1113] font-sans font-medium group-hover:underline">
                        Open Reader →
                      </span>
                    </div>
                    <div className="space-y-1 text-xs text-[#1F1617] line-clamp-3">
                      {pdfDocSummary.pages[0].slice(0, 4).map((line, idx) => (
                        <p
                          key={idx}
                          className={
                            idx === 0
                              ? 'font-semibold text-[#1F1617] truncate'
                              : 'text-[#6E5D5F] truncate'
                          }
                        >
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* Bottom Actions */}
      <div className="pt-2.5 border-t border-[#F2ECE9] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6E5D5F]">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => onToggleReaction(post)}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 min-h-[36px] cursor-pointer border ${
              hasReacted
                ? 'bg-rose-600 text-white border-rose-700 shadow-xs hover:bg-rose-700'
                : 'bg-white hover:bg-rose-50 text-[#6E5D5F] hover:text-rose-600 border-transparent'
            }`}
          >
            <Heart
              className={`w-4 h-4 transition-transform ${
                hasReacted ? 'fill-white text-white scale-110' : ''
              }`}
            />
            <span>{hasReacted ? 'Liked' : 'Like'}</span>
            <span className="font-mono tabular-nums">({post.likesCount || 0})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowComments((prev) => !prev)}
            aria-expanded={showComments}
            className={`px-2.5 sm:px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1.5 min-h-[36px] cursor-pointer border ${
              showComments
                ? 'bg-[#7B1113]/10 text-[#7B1113] border-[#7B1113]/25 font-semibold'
                : 'hover:bg-[#FAF8F5] text-[#6E5D5F] border-transparent'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Comments</span>
            <span className="font-mono tabular-nums">({comments.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowReportBox((prev) => !prev)}
          className="px-2.5 py-1.5 rounded-lg font-medium hover:bg-[#FAF8F5] text-[#6E5D5F] hover:text-rose-700 transition-colors flex items-center gap-1 min-h-[36px] cursor-pointer"
          title="Report post to moderators"
        >
          <Flag className="w-3.5 h-3.5" />
          <span>Report</span>
        </button>
      </div>

      {reportSuccessMsg && (
        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
          {reportSuccessMsg}
        </div>
      )}

      {showReportBox && (
        <form
          onSubmit={handleSubmitReport}
          className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-2.5"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#7B1113] flex items-center gap-1.5">
              <Flag className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>Report Post to ONE Moderators</span>
            </span>
            <button
              type="button"
              onClick={() => setShowReportBox(false)}
              className="text-[#6E5D5F] hover:text-[#1F1617]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
            >
              <option value="Harassment / Bullying">Harassment / Bullying</option>
              <option value="Inappropriate Photo / Media">Inappropriate Photo / Media</option>
              <option value="Spam / Misleading">Spam / Misleading</option>
              <option value="Doxxing / Private Info">Doxxing / Private Info</option>
              <option value="Academic Dishonesty">Academic Dishonesty</option>
              <option value="Other Rule Violation">Other Rule Violation</option>
            </select>
            <input
              type="text"
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Optional details for moderators..."
              className="px-3 py-1.5 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowReportBox(false)}
              className="px-3 py-1.5 text-xs font-medium text-[#6E5D5F] hover:bg-white rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingReport}
              className="px-3.5 py-1.5 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold rounded-lg cursor-pointer"
            >
              {isSubmittingReport ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      )}

      {/* Comments Section */}
      {showComments && (
        <div className="pt-3 border-t border-[#F2ECE9] space-y-3">
          {comments.length === 0 ? (
            <p className="text-xs text-[#6E5D5F] py-1">No comments yet. Start the conversation below!</p>
          ) : (
            <div className="space-y-2.5">
              {(() => {
                const byId = new Map<string, Comment>();
                comments.forEach((c) => byId.set(c.id, c));

                // Find root comment ID for any nested reply chain (with cycle protection)
                const getRootId = (c: Comment): string => {
                  let curr: Comment | undefined = c;
                  const visited = new Set<string>();
                  while (
                    curr?.replyToCommentId &&
                    byId.has(curr.replyToCommentId) &&
                    !visited.has(curr.id)
                  ) {
                    visited.add(curr.id);
                    curr = byId.get(curr.replyToCommentId);
                  }
                  return curr ? curr.id : c.id;
                };

                const rootComments = comments.filter(
                  (c) => !c.replyToCommentId || !byId.has(c.replyToCommentId)
                );
                const repliesByRoot = new Map<string, Comment[]>();
                comments.forEach((c) => {
                  if (c.replyToCommentId && byId.has(c.replyToCommentId)) {
                    const rootId = getRootId(c);
                    const arr = repliesByRoot.get(rootId) || [];
                    arr.push(c);
                    repliesByRoot.set(rootId, arr);
                  }
                });

                const renderCommentCard = (cmt: Comment, isReplyItem: boolean) => {
                  const isCmtAuthor = cmt.authorId === currentUserProfile.uid;
                  const cmtAuthorProfile = !cmt.isAnonymous
                    ? isCmtAuthor
                      ? currentUserProfile
                      : latestUsers.find((u) => u.uid === cmt.authorId)
                    : undefined;
                  const cmtPresence = !cmt.isAnonymous
                    ? effectivePresenceList.find((p) => p.uid === cmt.authorId)
                    : undefined;
                  const isCmtAuthorOnline =
                    !cmt.isAnonymous && (isCmtAuthor || isUserCurrentlyOnline(cmtPresence));
                  const effectiveCmtNickname = cmt.isAnonymous
                    ? 'Anonymous Student'
                    : cmtAuthorProfile?.nickname || cmtPresence?.nickname || cmt.authorNickname;
                  const effectiveCmtPhotoURL = cmt.isAnonymous
                    ? ''
                    : cmtAuthorProfile?.photoURL || cmtPresence?.photoURL || cmt.authorPhotoURL;
                  const cmtBadge = cmt.isAnonymous
                    ? 'verified'
                    : cmtAuthorProfile?.badge
                    ? resolveUserBadge(cmtAuthorProfile.badge)
                    : cmt.authorBadge || (isCmtAuthor ? currentUserBadge : 'verified');
                  const isReplyingHere = replyingTo?.commentId === cmt.id;

                  return (
                    <div key={cmt.id} className="space-y-2">
                      <div
                        className={`p-3 rounded-xl border transition-colors space-y-2 ${
                          isReplyingHere
                            ? 'bg-[#FFFDF9] border-[#7B1113]/40'
                            : isReplyItem
                            ? 'bg-white border-[#E8DFDC]'
                            : 'bg-[#FAF8F5] border-[#E8DFDC]'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          {cmt.isAnonymous ? (
                            <div className="w-6 h-6 rounded-full bg-[#7B1113] text-[#D4AF37] flex items-center justify-center shrink-0 mt-0.5">
                              <EyeOff className="w-3 h-3" />
                            </div>
                          ) : (
                            <div className="relative shrink-0 mt-0.5">
                              <img
                                src={effectiveCmtPhotoURL || studentAvatarFallback}
                                alt={effectiveCmtNickname}
                                referrerPolicy="no-referrer"
                                className="w-6 h-6 rounded-full object-cover border border-[#D4AF37] shrink-0"
                              />
                              <span
                                title={isCmtAuthorOnline ? 'Active now' : 'Offline'}
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white ${
                                  isCmtAuthorOnline ? 'bg-emerald-500' : 'bg-stone-300'
                                }`}
                              />
                            </div>
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center justify-between gap-2 min-w-0">
                              <div className="flex items-center gap-1 text-xs min-w-0 flex-1">
                                <span className="font-semibold text-[#1F1617] truncate">
                                  {cmt.isAnonymous ? 'Anonymous Student' : `@${effectiveCmtNickname}`}
                                </span>
                                <UserBadgeTag
                                  badge={cmtBadge}
                                  isAnonymous={cmt.isAnonymous}
                                  size="sm"
                                />
                                <span className="text-[#D4AF37] shrink-0" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-[#6E5D5F] font-mono tabular-nums shrink-0">
                                  {formatRelativeTime(cmt.createdAt)}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {(() => {
                                  const likedByList = Array.isArray(cmt.likedBy) ? cmt.likedBy : [];
                                  const hasLikedCmt = likedByList.includes(currentUserProfile.uid);
                                  const cmtLikesCount = Math.max(
                                    cmt.likesCount || 0,
                                    likedByList.length
                                  );
                                  return (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCommentLike(cmt)}
                                      className={`px-2 py-0.5 text-[11px] font-medium rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                                        hasLikedCmt
                                          ? 'bg-[#7B1113]/10 text-[#7B1113]'
                                          : 'text-[#6E5D5F] hover:text-[#7B1113] hover:bg-[#7B1113]/5'
                                      }`}
                                      title={hasLikedCmt ? 'Unlike comment' : 'Like comment'}
                                    >
                                      <Heart
                                        className={`w-3 h-3 ${
                                          hasLikedCmt ? 'fill-[#7B1113] text-[#7B1113]' : ''
                                        }`}
                                      />
                                      {cmtLikesCount > 0 && (
                                        <span className="font-mono tabular-nums">{cmtLikesCount}</span>
                                      )}
                                    </button>
                                  );
                                })()}

                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isReplyingHere) {
                                      setReplyingTo(null);
                                    } else {
                                      setReplyingTo({
                                        commentId: cmt.id,
                                        nickname: cmt.isAnonymous ? 'Anonymous Student' : effectiveCmtNickname,
                                        authorId: cmt.authorId,
                                        isAnonymous: cmt.isAnonymous,
                                      });
                                    }
                                  }}
                                  className={`px-2 py-0.5 text-[11px] font-medium rounded-md flex items-center gap-1 transition-colors cursor-pointer ${
                                    isReplyingHere
                                      ? 'bg-[#7B1113] text-white'
                                      : 'text-[#7B1113] hover:bg-[#7B1113]/10'
                                  }`}
                                  title={`Reply to @${effectiveCmtNickname}`}
                                >
                                  <Reply className="w-3 h-3" />
                                  <span>{isReplyingHere ? 'Replying' : 'Reply'}</span>
                                </button>

                                {cmt.authorId !== currentUserProfile.uid &&
                                  !cmt.isAnonymous &&
                                  onStartChat && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onStartChat({
                                          uid: cmt.authorId,
                                          nickname: effectiveCmtNickname,
                                          photoURL: effectiveCmtPhotoURL || '',
                                          badge: cmtBadge,
                                        })
                                      }
                                      className="w-6 h-6 text-[#7B1113] hover:bg-[#7B1113] hover:text-[#D4AF37] bg-white border border-[#E8DFDC] rounded-md flex items-center justify-center cursor-pointer transition-colors shrink-0"
                                      title={`Message @${effectiveCmtNickname}`}
                                      aria-label={`Message @${effectiveCmtNickname}`}
                                    >
                                      <MessageCircle className="w-3 h-3" />
                                    </button>
                                  )}

                                {(cmt.authorId === currentUserProfile.uid || isDeveloper) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPendingConfirmAction({
                                        title: 'Are you sure?',
                                        message:
                                          'Are you sure you want to delete this comment? This action cannot be undone.',
                                        confirmLabel: 'Yes, Delete Comment',
                                        variant: 'danger',
                                        onConfirm: () => handleDeleteComment(cmt.id),
                                      })
                                    }
                                    className="w-6 h-6 text-[#6E5D5F] hover:text-rose-700 hover:bg-rose-50 rounded-md flex items-center justify-center cursor-pointer transition-colors shrink-0"
                                    title="Delete comment"
                                    aria-label="Delete comment"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {cmt.replyToNickname && (
                              <div className="text-[11px] text-[#7B1113] font-medium flex flex-wrap items-center gap-1">
                                <Reply className="w-3 h-3 text-[#D4AF37] rotate-180 shrink-0" />
                                <span className="break-words [overflow-wrap:anywhere]">
                                  Replying to @{cmt.replyToNickname}
                                </span>
                              </div>
                            )}

                            <p className="text-sm text-[#1F1617] leading-relaxed whitespace-pre-line break-words [overflow-wrap:anywhere]">
                              {cmt.content}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Inline Unlimited Reply Box directly under the active comment */}
                      {isReplyingHere && (
                        <form
                          onSubmit={handleAddInlineReply}
                          className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#7B1113]/30 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 text-[11px] text-[#7B1113]">
                            <span className="font-medium break-words min-w-0 flex-1">
                              Replying to <strong>@{replyingTo.nickname}</strong> · Unlimited replies
                            </span>
                            <button
                              type="button"
                              onClick={() => setReplyingTo(null)}
                              className="text-[#6E5D5F] hover:text-[#1F1617] p-0.5 shrink-0 cursor-pointer"
                              title="Close inline reply"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="space-y-2">
                            <textarea
                              value={inlineReplyText}
                              onChange={(e) => {
                                setInlineReplyText(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${Math.max(58, e.target.scrollHeight)}px`;
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  if (inlineReplyText.trim() && !isSubmittingComment && replyingTo) {
                                    submitCommentOrReply(inlineReplyText, replyingTo, true);
                                  }
                                }
                              }}
                              rows={2}
                              maxLength={1500}
                              placeholder={`Write a reply to @${replyingTo.nickname}... (Press Enter to send)`}
                              className="w-full min-h-[58px] px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-lg focus:outline-none focus:border-[#7B1113] resize-y leading-relaxed"
                              autoFocus
                              required
                            />
                            <div className="flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={handleToggleCommentAnon}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border shrink-0 flex items-center gap-1 min-h-[32px] cursor-pointer ${
                                  commentAnonymous
                                    ? 'bg-[#7B1113] text-white border-[#7B1113]'
                                    : 'bg-white text-[#1F1617] border-[#E8DFDC]'
                                }`}
                              >
                                {commentAnonymous ? (
                                  <EyeOff className="w-3 h-3 text-[#D4AF37]" />
                                ) : (
                                  <Eye className="w-3 h-3" />
                                )}
                                <span>{commentAnonymous ? 'Anonymous: ON' : 'Public'}</span>
                              </button>
                              <button
                                type="submit"
                                disabled={isSubmittingComment}
                                className="px-3 py-1.5 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-medium rounded-lg flex items-center gap-1 min-h-[32px] shrink-0 cursor-pointer"
                              >
                                <Send className="w-3 h-3 text-[#D4AF37]" />
                                <span>Reply</span>
                              </button>
                            </div>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                };

                return rootComments.map((rootCmt) => {
                  const threadReplies = repliesByRoot.get(rootCmt.id) || [];
                  return (
                    <div key={rootCmt.id} className="space-y-2">
                      {renderCommentCard(rootCmt, false)}
                      {threadReplies.length > 0 && (
                        <div className="ml-3 sm:ml-6 pl-2.5 sm:pl-3.5 border-l-2 border-[#D4AF37]/50 space-y-2">
                          {threadReplies.map((replyCmt) => renderCommentCard(replyCmt, true))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {/* Animated Comment Anonymous Notice */}
          <AnimatePresence>
            {commentAnonNotice && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-medium flex items-center gap-1.5 ${
                  commentAnonNotice === 'on'
                    ? 'bg-[#7B1113] text-white'
                    : 'bg-[#FAF8F5] text-[#1F1617] border border-[#E8DFDC]'
                }`}
              >
                <EyeOff className="w-3 h-3 text-[#D4AF37]" />
                <span>
                  {commentAnonNotice === 'on'
                    ? 'Anonymous comment mode is ON'
                    : `Commenting as @${currentUserProfile.nickname}`}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Active Replying-To Banner */}
          {replyingTo && (
            <div className="px-3 py-1.5 rounded-xl bg-[#7B1113]/10 border border-[#7B1113]/25 flex items-center justify-between gap-2 text-xs text-[#7B1113]">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <Reply className="w-3.5 h-3.5 shrink-0 text-[#7B1113]" />
                <span className="break-words">
                  Replying to <strong>@{replyingTo.nickname}</strong> (unlimited replies enabled)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="p-1 hover:bg-[#7B1113]/20 rounded-full shrink-0 cursor-pointer text-[#7B1113]"
                title="Switch to top-level comment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {post.commentsLocked && !isDeveloper ? (
            <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] text-xs text-[#6E5D5F] flex items-center gap-2">
              <Lock className="w-4 h-4 text-[#7B1113] shrink-0" />
              <span>Comments on this post have been locked by a moderator.</span>
            </div>
          ) : (
            <form onSubmit={handleAddComment} className="space-y-2 pt-1">
              <textarea
                value={commentText}
                onChange={(e) => {
                  setCommentText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.max(58, e.target.scrollHeight)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (commentText.trim() && !isSubmittingComment) {
                      submitCommentOrReply(commentText, replyingTo, false);
                    }
                  }
                }}
                rows={2}
                maxLength={1500}
                placeholder={
                  replyingTo
                    ? `Reply to @${replyingTo.nickname}... (Press Enter to send)`
                    : commentAnonymous
                    ? 'Comment anonymously... (Press Enter to send)'
                    : `Comment as @${currentUserProfile.nickname}... (Press Enter to send)`
                }
                className="w-full min-h-[58px] px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113] resize-y leading-relaxed"
                required
              />
              <div className="flex items-center justify-between gap-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  type="button"
                  onClick={handleToggleCommentAnon}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border shrink-0 flex items-center gap-1 min-h-[36px] transition-colors cursor-pointer ${
                    commentAnonymous
                      ? 'bg-[#7B1113] text-white border-[#7B1113]'
                      : 'bg-white text-[#1F1617] border-[#E8DFDC]'
                  }`}
                  title="Toggle anonymous comment"
                >
                  {commentAnonymous ? (
                    <EyeOff className="w-3.5 h-3.5 text-[#D4AF37]" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" />
                  )}
                  <span>{commentAnonymous ? 'Anonymous: ON' : 'Public'}</span>
                </motion.button>
                <button
                  type="submit"
                  disabled={isSubmittingComment}
                  className="px-3.5 py-1.5 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1 min-h-[36px] shrink-0 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Send</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Confirmation Modal ("Are you sure?") */}
      <AnimatePresence>
        {pendingConfirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              className="bg-white border border-[#E8DFDC] rounded-2xl max-w-sm w-full overflow-hidden shadow-xl"
            >
              <div className="h-1.5 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />
              <div className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="font-display text-xl text-[#1F1617]">
                    {pendingConfirmAction.title}
                  </h4>
                  <button
                    type="button"
                    disabled={isConfirmExecuting}
                    onClick={() => setPendingConfirmAction(null)}
                    className="p-1 text-[#6E5D5F] hover:text-[#1F1617] rounded-lg cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-[#6E5D5F] leading-relaxed">
                  {pendingConfirmAction.message}
                </p>
                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isConfirmExecuting}
                    onClick={() => setPendingConfirmAction(null)}
                    className="px-3.5 py-2 text-xs font-semibold text-[#6E5D5F] hover:text-[#1F1617] bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isConfirmExecuting}
                    onClick={async () => {
                      setIsConfirmExecuting(true);
                      try {
                        await pendingConfirmAction.onConfirm();
                      } finally {
                        setIsConfirmExecuting(false);
                        setPendingConfirmAction(null);
                      }
                    }}
                    className={`px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors cursor-pointer ${
                      pendingConfirmAction.variant === 'danger'
                        ? 'bg-rose-700 hover:bg-rose-800'
                        : 'bg-[#7B1113] hover:bg-[#580B0C]'
                    }`}
                  >
                    {isConfirmExecuting ? 'Processing...' : pendingConfirmAction.confirmLabel}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* File & PDF Study Reviewer Preview Modal */}
      {showPreviewModal && (
        <div
          onClick={() => setShowPreviewModal(false)}
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`bg-white border border-[#E8DFDC] rounded-2xl w-full flex flex-col overflow-hidden shadow-2xl ${
              post.attachmentType === 'pdf'
                ? 'max-w-4xl max-h-[90vh]'
                : 'max-w-2xl max-h-[85vh]'
            }`}
          >
            <div className="px-4 sm:px-5 py-3.5 border-b border-[#E8DFDC] flex items-center justify-between gap-3 bg-white shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-[#FAF8F5] border border-[#E8DFDC] flex items-center justify-center shrink-0">
                  {renderDocumentIcon()}
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-[#1F1617] truncate">
                    {post.attachmentType === 'photo' ? 'Photo' : post.attachmentName}
                  </h4>
                  <p className="text-xs text-[#6E5D5F] font-mono tabular-nums truncate">
                    {attachmentMeta.label} · {formatFileSize(post.attachmentSize)}
                    {post.attachmentType === 'pdf' && pdfDocSummary
                      ? ` · ${pdfDocSummary.totalPages} ${
                          pdfDocSummary.totalPages === 1 ? 'page' : 'pages'
                        } · Read before downloading`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    triggerAttachmentDownload(
                      resolvedMediaUrl || post.attachmentDataUrl,
                      post.attachmentName
                    )
                  }
                  className="px-3 py-1.5 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-medium rounded-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="p-1.5 text-[#6E5D5F] hover:text-[#1F1617] rounded-lg cursor-pointer"
                  aria-label="Close preview modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 overflow-y-auto flex-1 bg-[#FAF8F5]">
              {post.attachmentType === 'photo' ? (
                <img
                  src={!photoFailed && resolvedMediaUrl ? resolvedMediaUrl : campusStudyFallback}
                  alt={post.attachmentName}
                  referrerPolicy="no-referrer"
                  className="w-full h-auto max-h-[65vh] object-contain mx-auto rounded-lg"
                />
              ) : post.attachmentType === 'video' && resolvedMediaUrl ? (
                <video
                  src={resolvedMediaUrl}
                  controls
                  autoPlay
                  playsInline
                  className="w-full max-h-[65vh] bg-black object-contain mx-auto rounded-lg"
                />
              ) : post.attachmentType === 'pdf' ? (
                <PdfReviewerViewer
                  rawUrl={post.attachmentDataUrl}
                  resolvedUrl={resolvedMediaUrl}
                  fileName={post.attachmentName}
                  fileSize={post.attachmentSize}
                  onDownload={() =>
                    triggerAttachmentDownload(
                      resolvedMediaUrl || post.attachmentDataUrl,
                      post.attachmentName
                    )
                  }
                />
              ) : decodedPreview ? (
                <pre className="text-xs font-mono text-[#1F1617] whitespace-pre-wrap bg-white p-4 rounded-xl border border-[#E8DFDC] leading-relaxed">
                  {decodedPreview}
                </pre>
              ) : (
                <div className="py-12 text-center space-y-2">
                  <div className="w-12 h-12 rounded-xl bg-white border border-[#E8DFDC] flex items-center justify-center mx-auto">
                    {renderDocumentIcon()}
                  </div>
                  <p className="text-sm font-semibold text-[#1F1617]">{post.attachmentName}</p>
                  <p className="text-xs text-[#6E5D5F]">
                    Click Download above to save and open this file.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.article>
  );
};
