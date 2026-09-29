import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Lightbulb,
  ThumbsUp,
  Plus,
  X,
  Filter,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  Send,
  MessageSquareReply,
  ShieldCheck,
  Edit3,
} from 'lucide-react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
  getDoc,
  deleteField,
} from 'firebase/firestore';
import {
  canUseFirestore,
  db,
  getAuthenticatedUserEmail,
  handleFirestoreError,
  isDeveloperEmail,
  ONE_LOGO_DATA_URL,
  ONE_OFFICIAL_UID,
  OperationType,
  resolveUserBadge,
} from '../firebase';
import {
  SUGGESTION_CATEGORIES,
  Suggestion,
  SuggestionCategory,
  SuggestionStatus,
  UserPublicProfile,
} from '../types';
import { UserBadgeTag } from './UserBadgeTag';
import { formatRelativeTime } from './PostCard';
import {
  DB_UPDATE_EVENT,
  deleteLocalSuggestion,
  getLocalSuggestions,
  saveLocalSuggestions,
  updateLocalSuggestionFields,
  upsertLocalNotification,
  upsertLocalSuggestion,
} from '../utils/databaseRestore';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';

interface SuggestionBoxViewProps {
  currentUserProfile: UserPublicProfile;
  isAdmin?: boolean;
  onBackToWall?: () => void;
}

export const SuggestionBoxView: React.FC<SuggestionBoxViewProps> = ({
  currentUserProfile,
  isAdmin: isAdminProp,
  onBackToWall,
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>(() => getLocalSuggestions());
  const [isLoading, setIsLoading] = useState(false);
  const [userUpvotes, setUserUpvotes] = useState<Record<string, boolean>>({});

  const [selectedCategory, setSelectedCategory] = useState<SuggestionCategory | 'All'>('All');
  const [selectedStatus, setSelectedStatus] = useState<SuggestionStatus | 'All'>('All');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Admin Reply State
  const [replyingSuggestionId, setReplyingSuggestionId] = useState<string | null>(null);
  const [adminReplyDraft, setAdminReplyDraft] = useState('');
  const [adminStatusDraft, setAdminStatusDraft] = useState<SuggestionStatus>('under_review');
  const [isSavingAdminReply, setIsSavingAdminReply] = useState(false);
  const [adminStatusToast, setAdminStatusToast] = useState<string | null>(null);

  // Form State
  const [formCategory, setFormCategory] = useState<SuggestionCategory>('Feature Request');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formAnonymous, setFormAnonymous] = useState(currentUserProfile.defaultAnonymous);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const authEmail = getAuthenticatedUserEmail();
  const currentUserBadge = resolveUserBadge(currentUserProfile.badge, authEmail);
  const isAdmin =
    Boolean(isAdminProp) ||
    isDeveloperEmail(authEmail) ||
    currentUserBadge === 'developer' ||
    currentUserProfile.role === 'developer' ||
    currentUserBadge === 'moderator' ||
    currentUserProfile.role === 'moderator';

  // Subscribe to Suggestions
  useEffect(() => {
    setSuggestions(getLocalSuggestions());

    const handleLocalUpdate = () => {
      setSuggestions(getLocalSuggestions());
    };
    window.addEventListener(DB_UPDATE_EVENT, handleLocalUpdate);

    let unsubscribe = () => {};
    if (canUseFirestore()) {
      const q = query(
        collection(db, 'suggestions'),
        where('visibility', '==', 'edu_verified')
      );

      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const list: Suggestion[] = snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Suggestion, 'id'>),
          }));
          if (list.length > 0) {
            saveLocalSuggestions(list);
          }
          setSuggestions(getLocalSuggestions());
          setIsLoading(false);
        },
        (err) => {
          setSuggestions(getLocalSuggestions());
          handleFirestoreError(err, OperationType.LIST, 'suggestions');
          setIsLoading(false);
        }
      );
    } else {
      setIsLoading(false);
    }

    return () => {
      unsubscribe();
      window.removeEventListener(DB_UPDATE_EVENT, handleLocalUpdate);
    };
  }, []);

  const checkedUpvoteIdsRef = useRef<Set<string>>(new Set());

  // Check Upvotes for current user (only for suggestions with upvotesCount > 0 not yet checked)
  useEffect(() => {
    if (!currentUserProfile?.uid || suggestions.length === 0 || !canUseFirestore(currentUserProfile.uid)) return;
    let active = true;

    const checkUpvotes = async () => {
      const candidates = suggestions
        .slice(0, 30)
        .filter(
          (s) => (s.upvotesCount || 0) > 0 && !checkedUpvoteIdsRef.current.has(s.id)
        );
      if (candidates.length === 0) return;

      const upvotesMap: Record<string, boolean> = {};
      for (const s of candidates) {
        checkedUpvoteIdsRef.current.add(s.id);
        try {
          const upSnap = await getDoc(
            doc(db, 'suggestions', s.id, 'upvotes', currentUserProfile.uid)
          );
          if (upSnap.exists()) {
            upvotesMap[s.id] = true;
          }
        } catch {
          // Ignore individual upvote check errors
        }
      }
      if (active && Object.keys(upvotesMap).length > 0) {
        setUserUpvotes((prev) => ({ ...prev, ...upvotesMap }));
      }
    };

    checkUpvotes();
    return () => {
      active = false;
    };
  }, [currentUserProfile?.uid, suggestions.length]);

  const showToast = (msg: string) => {
    setAdminStatusToast(msg);
    window.setTimeout(() => {
      setAdminStatusToast(null);
    }, 3000);
  };

  const handleToggleUpvote = async (s: Suggestion) => {
    const currentlyUpvoted = !!userUpvotes[s.id];
    const upvoteRef = doc(db, 'suggestions', s.id, 'upvotes', currentUserProfile.uid);
    const suggestionRef = doc(db, 'suggestions', s.id);
    const nextUpvotes = Math.max(0, s.upvotesCount + (currentlyUpvoted ? -1 : 1));

    // Optimistic UI & local DB update
    setUserUpvotes((prev) => ({ ...prev, [s.id]: !currentlyUpvoted }));
    updateLocalSuggestionFields(s.id, { upvotesCount: nextUpvotes });
    setSuggestions(getLocalSuggestions());

    if (canUseFirestore(currentUserProfile.uid)) {
      const batch = writeBatch(db);
      if (currentlyUpvoted) {
        batch.delete(upvoteRef);
        batch.update(suggestionRef, {
          upvotesCount: nextUpvotes,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(upvoteRef, {
          userId: currentUserProfile.uid,
          createdAt: serverTimestamp(),
        });
        batch.update(suggestionRef, {
          upvotesCount: nextUpvotes,
          updatedAt: serverTimestamp(),
        });
      }
      batch.commit().catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `suggestions/${s.id}`);
      });
    }
  };

  const handleCreateSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = formTitle.trim();
    const trimmedContent = formContent.trim();
    if (!trimmedTitle || !trimmedContent) return;

    setIsSubmitting(true);
    const suggestionId = `sug_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const suggestionRef = doc(db, 'suggestions', suggestionId);

    const newSug: Suggestion = {
      id: suggestionId,
      authorId: currentUserProfile.uid,
      authorNickname: formAnonymous ? 'Anonymous Student' : currentUserProfile.nickname,
      authorPhotoURL: formAnonymous ? '' : currentUserProfile.photoURL,
      authorBadge: formAnonymous ? 'verified' : currentUserBadge,
      isAnonymous: formAnonymous,
      category: formCategory,
      title: trimmedTitle.slice(0, 140),
      content: trimmedContent.slice(0, 3000),
      upvotesCount: 0,
      status: 'under_review',
      visibility: 'edu_verified',
      createdAt: null,
      updatedAt: null,
    };

    upsertLocalSuggestion(newSug);
    setSuggestions(getLocalSuggestions());
    setIsSubmitting(false);

    setSubmitSuccess(true);
    setTimeout(() => {
      setSubmitSuccess(false);
      setShowSubmitModal(false);
      setFormTitle('');
      setFormContent('');
    }, 800);

    if (canUseFirestore(currentUserProfile.uid)) {
      setDoc(suggestionRef, {
        authorId: newSug.authorId,
        authorNickname: newSug.authorNickname,
        authorPhotoURL: newSug.authorPhotoURL,
        authorBadge: newSug.authorBadge,
        isAnonymous: newSug.isAnonymous,
        category: newSug.category,
        title: newSug.title,
        content: newSug.content,
        upvotesCount: 0,
        status: 'under_review' as SuggestionStatus,
        visibility: 'edu_verified',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.WRITE, `suggestions/${suggestionId}`);
      });
    }
  };

  const handleDeleteSuggestion = async (suggestionId: string) => {
    deleteLocalSuggestion(suggestionId);
    setSuggestions(getLocalSuggestions());
    setConfirmDeleteId(null);
    showToast('Suggestion deleted.');
    if (canUseFirestore(currentUserProfile.uid)) {
      deleteDoc(doc(db, 'suggestions', suggestionId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, `suggestions/${suggestionId}`);
      });
    }
  };

  const handleOpenAdminReply = (sug: Suggestion) => {
    if (replyingSuggestionId === sug.id) {
      setReplyingSuggestionId(null);
      return;
    }
    setReplyingSuggestionId(sug.id);
    setAdminReplyDraft(sug.adminReply || '');
    setAdminStatusDraft(sug.status || 'under_review');
  };

  const handleQuickStatusChange = async (sug: Suggestion, nextStatus: SuggestionStatus) => {
    if (!isAdmin || sug.status === nextStatus) return;
    updateLocalSuggestionFields(sug.id, { status: nextStatus });
    setSuggestions(getLocalSuggestions());
    showToast(`Suggestion status updated to "${getStatusBadge(nextStatus).label}".`);
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'suggestions', sug.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `suggestions/${sug.id}`);
      });
    }
  };

  const handleSaveAdminReply = async (e: React.FormEvent, sug: Suggestion) => {
    e.preventDefault();
    if (!isAdmin) return;

    const trimmedReply = adminReplyDraft.trim();
    setIsSavingAdminReply(true);
    const adminNick = 'Official Admin';

    if (trimmedReply) {
      updateLocalSuggestionFields(sug.id, {
        status: adminStatusDraft,
        adminReply: trimmedReply.slice(0, 2000),
        adminReplyBy: adminNick,
        adminReplyBadge: 'developer',
        adminRepliedAt: Timestamp.now(),
      });
      if (sug.authorId && sug.authorId !== currentUserProfile.uid) {
        const notifId = `notif_sug_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const sugNotifPayload = {
          id: notifId,
          recipientId: sug.authorId,
          actorId: ONE_OFFICIAL_UID,
          actorNickname: 'Official Admin',
          actorPhotoURL: ONE_LOGO_DATA_URL,
          actorBadge: 'developer' as const,
          type: 'comment' as const,
          targetId: sug.id,
          previewText: `Official Admin Response to your suggestion "${sug.title.slice(0, 40)}": ${trimmedReply.slice(0, 120)}`,
          read: false,
          createdAt: Timestamp.now(),
        };
        upsertLocalNotification(sugNotifPayload);
        if (canUseFirestore(currentUserProfile.uid)) {
          setDoc(doc(db, 'notifications', notifId), {
            ...sugNotifPayload,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      }
      showToast('Official admin reply published to Suggestion Box.');
    } else {
      updateLocalSuggestionFields(sug.id, {
        status: adminStatusDraft,
        adminReply: undefined,
        adminReplyBy: undefined,
        adminReplyBadge: undefined,
      });
      showToast('Suggestion status updated and admin reply cleared.');
    }
    setSuggestions(getLocalSuggestions());
    setReplyingSuggestionId(null);
    setIsSavingAdminReply(false);

    if (canUseFirestore(currentUserProfile.uid)) {
      const suggestionRef = doc(db, 'suggestions', sug.id);
      if (trimmedReply) {
        updateDoc(suggestionRef, {
          status: adminStatusDraft,
          adminReply: trimmedReply.slice(0, 2000),
          adminReplyBy: adminNick,
          adminReplyBadge: currentUserBadge,
          adminRepliedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `suggestions/${sug.id}`);
        });
      } else {
        updateDoc(suggestionRef, {
          status: adminStatusDraft,
          adminReply: deleteField(),
          adminReplyBy: deleteField(),
          adminReplyBadge: deleteField(),
          adminRepliedAt: deleteField(),
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `suggestions/${sug.id}`);
        });
      }
    }
  };

  const handleRemoveAdminReply = async (sug: Suggestion) => {
    if (!isAdmin) return;
    setIsSavingAdminReply(true);
    updateLocalSuggestionFields(sug.id, {
      adminReply: undefined,
      adminReplyBy: undefined,
      adminReplyBadge: undefined,
      adminRepliedAt: null,
    });
    setSuggestions(getLocalSuggestions());
    setAdminReplyDraft('');
    setReplyingSuggestionId(null);
    setIsSavingAdminReply(false);
    showToast('Admin reply removed.');
    if (canUseFirestore(currentUserProfile.uid)) {
      updateDoc(doc(db, 'suggestions', sug.id), {
        adminReply: deleteField(),
        adminReplyBy: deleteField(),
        adminReplyBadge: deleteField(),
        adminRepliedAt: deleteField(),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `suggestions/${sug.id}`);
      });
    }
  };

  const filteredSuggestions = suggestions.filter((s) => {
    if (selectedCategory !== 'All' && s.category !== selectedCategory) return false;
    if (selectedStatus !== 'All' && s.status !== selectedStatus) return false;
    return true;
  });

  const getStatusBadge = (status: SuggestionStatus) => {
    switch (status) {
      case 'planned':
        return {
          label: 'Planned',
          bg: 'bg-purple-100 text-purple-900 border-purple-300',
        };
      case 'in_progress':
        return {
          label: 'In Progress',
          bg: 'bg-blue-100 text-blue-900 border-blue-300',
        };
      case 'completed':
        return {
          label: 'Completed',
          bg: 'bg-emerald-100 text-emerald-900 border-emerald-300',
        };
      case 'under_review':
      default:
        return {
          label: 'Under Review',
          bg: 'bg-amber-100 text-amber-900 border-amber-300',
        };
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-6 max-w-4xl mx-auto pb-10 dashboard-enter-anim"
    >
      {/* Header Banner */}
      <div className="bg-white border border-[#E8DFDC] rounded-3xl p-6 sm:p-8 space-y-4 shadow-xs">
        {onBackToWall && (
          <div className="pb-1">
            <button
              type="button"
              onClick={onBackToWall}
              className="px-3 py-1.5 bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] rounded-xl text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>← Back to Campus Wall</span>
            </button>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#7B1113] text-[#D4AF37] border-2 border-[#D4AF37] flex items-center justify-center shrink-0 shadow-xs">
              <Lightbulb className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#7B1113]">
                  Student Suggestion Box
                </h1>
                {isAdmin && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-[#7B1113]/10 text-[#7B1113] text-xs font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Admin Reply Mode Active</span>
                  </span>
                )}
              </div>
              <p className="text-sm text-[#6E5D5F] mt-0.5 leading-relaxed">
                Have an idea, campus suggestion, or feature request? Submit it here, upvote student
                ideas, and read official responses from the ONE Admin team.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2.5 bg-[#7B1113] hover:bg-[#580B0C] text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 shrink-0 cursor-pointer shadow-xs min-h-[44px]"
          >
            <Plus className="w-4 h-4 text-[#D4AF37]" />
            <span>Drop a Suggestion</span>
          </button>
        </div>

        {/* Filters */}
        <div className="pt-3 border-t border-[#F2ECE9] space-y-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-xs font-semibold text-[#6E5D5F] flex items-center gap-1 mr-1 shrink-0">
              <Filter className="w-3.5 h-3.5" />
              Category:
            </span>
            {(['All', ...SUGGESTION_CATEGORIES] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer min-h-[36px] ${
                  selectedCategory === cat
                    ? 'bg-[#7B1113] text-white'
                    : 'bg-[#FAF8F5] text-[#6E5D5F] hover:text-[#1F1617] border border-[#E8DFDC]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-xs font-semibold text-[#6E5D5F] mr-1 shrink-0">Status:</span>
            {[
              { id: 'All', label: 'All Statuses' },
              { id: 'under_review', label: 'Under Review' },
              { id: 'planned', label: 'Planned' },
              { id: 'in_progress', label: 'In Progress' },
              { id: 'completed', label: 'Completed' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStatus(st.id as SuggestionStatus | 'All')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer min-h-[32px] ${
                  selectedStatus === st.id
                    ? 'bg-[#1F1617] text-white'
                    : 'bg-white text-[#6E5D5F] hover:text-[#1F1617] border border-[#E8DFDC]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Admin Action Toast */}
      <AnimatePresence>
        {adminStatusToast && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 font-semibold flex items-center justify-between gap-2 shadow-xs"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{adminStatusToast}</span>
            </div>
            <button
              type="button"
              onClick={() => setAdminStatusToast(null)}
              className="text-xs text-emerald-700 hover:underline cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Suggestions Feed */}
      {isLoading ? (
        <div className="space-y-3.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-36 rounded-2xl bg-white border border-[#E8DFDC] p-5 animate-pulse"
            />
          ))}
        </div>
      ) : filteredSuggestions.length === 0 ? (
        <div className="bg-white border border-[#E8DFDC] rounded-3xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center justify-center mx-auto text-[#6E5D5F]">
            <Lightbulb className="w-6 h-6" />
          </div>
          <h3 className="font-display text-xl font-bold text-[#1F1617]">No suggestions yet</h3>
          <p className="text-sm text-[#6E5D5F] max-w-md mx-auto leading-relaxed">
            Be the first student to suggest a new feature, app improvement, or campus initiative!
          </p>
          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2.5 bg-[#7B1113] text-white text-sm font-semibold rounded-xl hover:bg-[#580B0C] transition-colors cursor-pointer"
          >
            Submit First Suggestion
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSuggestions.map((sug) => {
            const hasUpvoted = !!userUpvotes[sug.id];
            const isAuthor = sug.authorId === currentUserProfile.uid;
            const statusMeta = getStatusBadge(sug.status);
            const isReplyingThis = replyingSuggestionId === sug.id;

            return (
              <motion.div
                key={sug.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-3.5 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {sug.isAnonymous ? (
                      <div className="w-9 h-9 rounded-full bg-[#7B1113] text-[#D4AF37] flex items-center justify-center shrink-0 border border-[#D4AF37]">
                        <EyeOff className="w-4 h-4" />
                      </div>
                    ) : (
                      <img
                        src={sug.authorPhotoURL || studentAvatarFallback}
                        alt={sug.authorNickname}
                        referrerPolicy="no-referrer"
                        className="w-9 h-9 rounded-full object-cover border border-[#D4AF37] shrink-0"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-sm min-w-0">
                        <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
                          <span className="font-bold text-[#1F1617] truncate">
                            {sug.isAnonymous ? 'Anonymous Student' : `@${sug.authorNickname}`}
                          </span>
                          {!sug.isAnonymous && (
                            <UserBadgeTag badge={sug.authorBadge || 'verified'} size="sm" />
                          )}
                        </span>
                        <span className="text-[#D4AF37] shrink-0">·</span>
                        <span className="text-[#6E5D5F] font-medium text-xs truncate">
                          {sug.category}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {isAdmin ? (
                      <select
                        value={sug.status}
                        onChange={(e) =>
                          handleQuickStatusChange(sug, e.target.value as SuggestionStatus)
                        }
                        aria-label="Update suggestion status"
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer focus:outline-none ${statusMeta.bg}`}
                      >
                        <option value="under_review">Status: Under Review</option>
                        <option value="planned">Status: Planned</option>
                        <option value="in_progress">Status: In Progress</option>
                        <option value="completed">Status: Completed</option>
                      </select>
                    ) : (
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${statusMeta.bg}`}
                      >
                        {statusMeta.label}
                      </span>
                    )}

                    {(isAuthor || isAdmin) &&
                      (confirmDeleteId === sug.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteSuggestion(sug.id)}
                            className="px-2.5 py-1 bg-rose-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 bg-[#FAF8F5] text-[#6E5D5F] text-xs font-medium rounded-lg border border-[#E8DFDC] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(sug.id)}
                          className="p-1.5 text-[#6E5D5F] hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete suggestion"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      ))}
                  </div>
                </div>

                {/* Suggestion Title & Body — Clear, high-contrast typography */}
                <div className="space-y-1.5">
                  <h3 className="font-display text-lg sm:text-xl font-bold text-[#1F1617] leading-snug break-words">
                    {sug.title}
                  </h3>
                  <p className="text-[15px] text-[#1F1617] leading-relaxed whitespace-pre-line break-words">
                    {sug.content}
                  </p>
                </div>

                {/* Official Admin / Developer Reply Callout */}
                {sug.adminReply && (
                  <div className="p-4 rounded-2xl bg-[#FAF8F5] border-l-4 border-l-[#7B1113] border border-[#E8DFDC] space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="inline-flex items-center gap-1 font-bold text-[#7B1113]">
                          <ShieldCheck className="w-4 h-4 text-[#D4AF37] shrink-0" />
                          <span>Official Admin Response</span>
                        </span>
                      </div>
                      {sug.adminRepliedAt && (
                        <span className="text-xs font-mono text-[#6E5D5F]">
                          {formatRelativeTime(sug.adminRepliedAt)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm sm:text-[15px] text-[#1F1617] leading-relaxed whitespace-pre-line break-words">
                      {sug.adminReply}
                    </p>
                  </div>
                )}

                {/* Bottom Action Row */}
                <div className="pt-2.5 border-t border-[#F2ECE9] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6E5D5F]">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleUpvote(sug)}
                      className={`px-3.5 py-1.5 rounded-xl font-semibold transition-colors flex items-center gap-1.5 cursor-pointer min-h-[38px] ${
                        hasUpvoted
                          ? 'bg-[#7B1113] text-white shadow-xs'
                          : 'bg-[#FAF8F5] hover:bg-[#E8DFDC] text-[#1F1617] border border-[#E8DFDC]'
                      }`}
                    >
                      <ThumbsUp
                        className={`w-4 h-4 ${hasUpvoted ? 'fill-white' : 'text-[#7B1113]'}`}
                      />
                      <span>Upvote</span>
                      <span className="font-mono tabular-nums">({sug.upvotesCount || 0})</span>
                    </button>

                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleOpenAdminReply(sug)}
                        className={`px-3.5 py-1.5 rounded-xl font-semibold transition-colors flex items-center gap-1.5 cursor-pointer min-h-[38px] ${
                          isReplyingThis
                            ? 'bg-[#1F1617] text-white'
                            : 'bg-[#F7EFE0]/70 hover:bg-[#F7EFE0] text-[#7B1113] border border-[#D4AF37]/50'
                        }`}
                      >
                        {sug.adminReply ? (
                          <>
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>{isReplyingThis ? 'Close Reply Editor' : 'Edit Admin Reply'}</span>
                          </>
                        ) : (
                          <>
                            <MessageSquareReply className="w-4 h-4" />
                            <span>{isReplyingThis ? 'Cancel Reply' : 'Reply as Admin'}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  <span className="text-xs font-mono text-[#6E5D5F]">
                    {sug.createdAt?.toDate ? sug.createdAt.toDate().toLocaleDateString() : 'Recent'}
                  </span>
                </div>

                {/* Inline Admin Reply Composer */}
                <AnimatePresence>
                  {isAdmin && isReplyingThis && (
                    <motion.form
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={(e) => handleSaveAdminReply(e, sug)}
                      className="pt-2 overflow-hidden"
                    >
                      <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#7B1113]/30 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#7B1113] flex items-center gap-1.5">
                            <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
                            <span>
                              Official Admin Reply to{' '}
                              {sug.isAnonymous ? 'Anonymous Student' : `@${sug.authorNickname}`}
                            </span>
                          </span>

                          <div className="flex items-center gap-2">
                            <label className="text-xs font-semibold text-[#6E5D5F]">
                              Update Status:
                            </label>
                            <select
                              value={adminStatusDraft}
                              onChange={(e) =>
                                setAdminStatusDraft(e.target.value as SuggestionStatus)
                              }
                              className="px-2.5 py-1 text-xs font-semibold bg-white border border-[#E8DFDC] rounded-lg focus:outline-none focus:border-[#7B1113]"
                            >
                              <option value="under_review">Under Review</option>
                              <option value="planned">Planned</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                        </div>

                        <textarea
                          value={adminReplyDraft}
                          onChange={(e) => setAdminReplyDraft(e.target.value)}
                          placeholder="Write an official admin response, status update, or implementation note for students..."
                          rows={3}
                          maxLength={2000}
                          className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113] leading-relaxed"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            {sug.adminReply && (
                              <button
                                type="button"
                                onClick={() => handleRemoveAdminReply(sug)}
                                disabled={isSavingAdminReply}
                                className="px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                Remove Reply
                              </button>
                            )}
                          </div>

                          <div className="flex items-center gap-2 ml-auto">
                            <button
                              type="button"
                              onClick={() => setReplyingSuggestionId(null)}
                              className="px-3.5 py-1.5 text-xs font-semibold text-[#6E5D5F] hover:bg-white rounded-xl border border-transparent hover:border-[#E8DFDC] cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="submit"
                              disabled={isSavingAdminReply || !adminReplyDraft.trim()}
                              className="px-4 py-2 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5 text-[#D4AF37]" />
                              <span>
                                {isSavingAdminReply ? 'Publishing...' : 'Publish Admin Reply'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </motion.form>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Suggestion Submission Modal */}
      <AnimatePresence>
        {showSubmitModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 14 }}
              className="w-full max-w-lg bg-white border border-[#E8DFDC] rounded-3xl p-6 sm:p-7 space-y-4 shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#7B1113]/10 text-[#7B1113] flex items-center justify-center">
                    <Lightbulb className="w-5 h-5" />
                  </div>
                  <h2 className="font-display text-xl font-bold text-[#7B1113]">
                    Drop a Suggestion
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="p-1.5 text-[#6E5D5F] hover:text-[#1F1617] rounded-lg cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {submitSuccess ? (
                <div className="py-8 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h3 className="font-display text-lg font-bold text-[#1F1617]">
                    Thank you! Suggestion Submitted
                  </h3>
                  <p className="text-sm text-[#6E5D5F]">
                    Your idea has been added to the MSU Suggestion Box for peer upvotes.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleCreateSuggestion} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#1F1617] mb-1.5">
                      Category
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as SuggestionCategory)}
                      className="w-full px-3.5 py-2.5 text-sm border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113] bg-white min-h-[42px]"
                    >
                      {SUGGESTION_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1F1617] mb-1.5">
                      Title
                    </label>
                    <input
                      type="text"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="e.g. Add college reviewer tags, Dark mode theme, etc."
                      maxLength={140}
                      required
                      className="w-full px-3.5 py-2.5 text-sm border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113] min-h-[42px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#1F1617] mb-1.5">
                      Details &amp; Explanation
                    </label>
                    <textarea
                      value={formContent}
                      onChange={(e) => setFormContent(e.target.value)}
                      placeholder="Describe what would make ONE or MSU campus life better..."
                      rows={4}
                      maxLength={3000}
                      required
                      className="w-full px-3.5 py-2.5 text-sm border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113] leading-relaxed"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={() => setFormAnonymous((prev) => !prev)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1.5 cursor-pointer min-h-[38px] ${
                        formAnonymous
                          ? 'bg-[#7B1113] text-white border-[#7B1113]'
                          : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC]'
                      }`}
                    >
                      {formAnonymous ? (
                        <EyeOff className="w-3.5 h-3.5 text-[#D4AF37]" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {formAnonymous
                          ? 'Posting as Anonymous'
                          : `Posting as @${currentUserProfile.nickname}`}
                      </span>
                    </button>

                    <button
                      type="submit"
                      disabled={isSubmitting || !formTitle.trim() || !formContent.trim()}
                      className="px-5 py-2.5 bg-[#7B1113] hover:bg-[#580B0C] text-white text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs min-h-[42px] disabled:opacity-50"
                    >
                      <Send className="w-4 h-4 text-[#D4AF37]" />
                      <span>{isSubmitting ? 'Submitting...' : 'Submit Idea'}</span>
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
