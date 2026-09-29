import React, { useEffect, useMemo, useState } from 'react';
import {
  Users,
  FileText,
  ShieldAlert,
  Globe,
  BarChart3,
  Database,
  Search,
  Trash2,
  EyeOff,
  Eye,
  Pin,
  Lock,
  Unlock,
  ImageOff,
  AlertTriangle,
  CheckCircle2,
  Ban,
  Clock,
  UserCheck,
  Shield,
  Code2,
  Plus,
  Save,
  RefreshCw,
  Megaphone,
  Wrench,
  Palette,
  ToggleLeft,
  ToggleRight,
  Flag,
  MessageSquare,
  Heart,
  Image as ImageIcon,
  KeyRound,
  ArrowLeft,
  Mail,
  X,
  Headphones,
  Send,
} from 'lucide-react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
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
  handleFirestoreError,
  isTulipsEmail,
  isUserCurrentlyOnline,
  normalizeNicknameId,
  ONE_LOGO_DATA_URL,
  ONE_OFFICIAL_UID,
  OperationType,
  repairAndRestoreOriginalUsers,
  SUPPORT_OFFICIAL_BADGE,
  SUPPORT_OFFICIAL_NAME,
  SUPPORT_OFFICIAL_UID,
} from '../firebase';
import {
  ChatMessage,
  ChatThread,
  Comment,
  ContentReport,
  DEFAULT_PLATFORM_SETTINGS,
  ModerationRule,
  MSU_CAMPUSES,
  NotificationItem,
  PlatformSettings,
  Post,
  Reaction,
  Suggestion,
  SuggestionStatus,
  SupportTicket,
  SupportTicketReply,
  SupportTicketStatus,
  UserAccountStatus,
  UserBadge,
  UserPermissions,
  UserPresence,
  UserPrivateInfo,
  UserPublicProfile,
} from '../types';
import { UserBadgeTag } from './UserBadgeTag';
import { formatFileSize } from '../utils/fileHelpers';
import {
  DB_UPDATE_EVENT,
  deleteLocalComment,
  deleteLocalModerationRule,
  deleteLocalPost,
  deleteLocalReport,
  deleteLocalSupportTicket,
  deleteLocalUser,
  getDeletedPostIds,
  getLocalComments,
  getLocalChatMessages,
  getLocalModerationRules,
  getLocalPrivateEmails,
  getLocalReactions,
  getLocalReports,
  getLocalSuggestions,
  getLocalSupportTickets,
  getLocalUsers,
  restoreFullDatabase,
  saveLocalPlatformSettings,
  saveLocalSuggestions,
  saveLocalUsers,
  updateLocalPostFields,
  updateLocalSuggestionFields,
  updateLocalSupportTicketFields,
  upsertLocalChatMessage,
  upsertLocalChatThread,
  upsertLocalModerationRule,
  upsertLocalNotification,
  upsertLocalReport,
  upsertLocalSupportTicket,
  upsertLocalUser,
} from '../utils/databaseRestore';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';
import campusStudyFallback from '../assets/images/campus_study_notes_1790401783483.jpg';

export type AdminSectionTab =
  | 'users'
  | 'posts'
  | 'moderation'
  | 'support'
  | 'website'
  | 'analytics'
  | 'database';

export type DatabaseEntitySubTab =
  | 'users'
  | 'posts'
  | 'comments'
  | 'likes'
  | 'reports'
  | 'images'
  | 'roles'
  | 'permissions';

interface DeveloperAdminDashboardProps {
  currentUserProfile: UserPublicProfile;
  currentUserEmail?: string;
  posts: Post[];
  presenceList: UserPresence[];
  platformSettings: PlatformSettings;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onBackToWall: () => void;
}

const DEFAULT_PERMISSIONS: UserPermissions = {
  canPost: true,
  canComment: true,
  canUploadFiles: true,
  canChat: true,
  canReport: true,
  isVerifiedStudent: true,
};

function formatExactDate(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts || typeof ts.toDate !== 'function') return 'Recently';
  const d = ts.toDate();
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DeveloperAdminDashboard: React.FC<DeveloperAdminDashboardProps> = ({
  currentUserProfile,
  currentUserEmail,
  posts,
  presenceList,
  platformSettings,
  isDarkMode,
  onToggleDarkMode,
  onBackToWall,
}) => {
  const [activeTab, setActiveTab] = useState<AdminSectionTab>('users');
  const [dbSubTab, setDbSubTab] = useState<DatabaseEntitySubTab>('users');

  // 1. Users State
  const [usersList, setUsersList] = useState<UserPublicProfile[]>(() => getLocalUsers());
  const [userEmailsMap, setUserEmailsMap] = useState<Record<string, string>>(() =>
    getLocalPrivateEmails()
  );
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<
    'all' | 'verified' | 'moderator' | 'developer' | 'suspended' | 'banned'
  >('all');
  const [visibleUsersLimit, setVisibleUsersLimit] = useState(60);

  // 2. Posts State
  const [postSearch, setPostSearch] = useState('');
  const [postFilter, setPostFilter] = useState<
    'all' | 'pinned' | 'hidden' | 'locked' | 'media' | 'reported'
  >('all');

  // 3. Moderation State (Reports, Rules, Warnings/Suspensions/Bans)
  const [reports, setReports] = useState<ContentReport[]>(() => getLocalReports());
  const [reportFilter, setReportFilter] = useState<
    'all' | 'pending' | 'reviewed' | 'resolved' | 'dismissed'
  >('all');
  const [moderationRules, setModerationRules] = useState<ModerationRule[]>(() =>
    getLocalModerationRules()
  );
  const [newRuleTitle, setNewRuleTitle] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('Harassment & Conduct');
  const [newRuleSeverity, setNewRuleSeverity] = useState<'warn' | 'hide' | 'block'>('warn');
  const [newRuleKeywords, setNewRuleKeywords] = useState('');
  const [newRuleDesc, setNewRuleDesc] = useState('');

  const [modTargetUid, setModTargetUid] = useState('');
  const [modActionType, setModActionType] = useState<'warn' | 'suspend' | 'ban'>('warn');
  const [modSuspendDays, setModSuspendDays] = useState('7');
  const [modReason, setModReason] = useState('');
  const [modStatusBanner, setModStatusBanner] = useState<string | null>(null);

  // 4. Website Controls Form State
  const [siteForm, setSiteForm] = useState<PlatformSettings>(platformSettings);
  const [isSavingSite, setIsSavingSite] = useState(false);
  const [siteSaveBanner, setSiteSaveBanner] = useState<string | null>(null);

  // 5 & 6. Database Subcollections State (Comments, Reactions, Suggestions, Support Tickets)
  const [allComments, setAllComments] = useState<Comment[]>(() => getLocalComments());
  const [allReactions, setAllReactions] = useState<(Reaction & { id: string })[]>(() =>
    getLocalReactions()
  );
  const [allSuggestions, setAllSuggestions] = useState<Suggestion[]>(() => getLocalSuggestions());
  const [suggestionReplyDrafts, setSuggestionReplyDrafts] = useState<Record<string, string>>({});
  const [savingSuggestionId, setSavingSuggestionId] = useState<string | null>(null);
  const [isLoadingDbExtras, setIsLoadingDbExtras] = useState(false);
  const [dbSearch, setDbSearch] = useState('');

  // Contact Support Tickets State
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() =>
    getLocalSupportTickets()
  );
  const [supportFilter, setSupportFilter] = useState<'all' | 'open' | 'replied' | 'resolved'>('all');
  const [supportSearch, setSupportSearch] = useState('');
  const [supportReplyDrafts, setSupportReplyDrafts] = useState<Record<string, string>>({});
  const [sendingSupportReplyId, setSendingSupportReplyId] = useState<string | null>(null);
  const [, setChatSyncTick] = useState(0);

  // Confirmation modal ("Are you sure?") state for all admin actions
  const [pendingAdminConfirm, setPendingAdminConfirm] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant: 'danger' | 'primary';
    onConfirm: () => Promise<void> | void;
  } | null>(null);
  const [isExecutingConfirm, setIsExecutingConfirm] = useState(false);

  const requestAdminConfirm = (config: {
    message: string;
    confirmLabel: string;
    variant?: 'danger' | 'primary';
    onConfirm: () => Promise<void> | void;
  }) => {
    setPendingAdminConfirm({
      title: 'Are you sure?',
      message: config.message,
      confirmLabel: config.confirmLabel,
      variant: config.variant || 'primary',
      onConfirm: config.onConfirm,
    });
  };

  useEffect(() => {
    setSiteForm(platformSettings);
  }, [platformSettings]);

  // Subscribe to all registered users in /users + local restored database
  useEffect(() => {
    setUsersList(getLocalUsers());
    setUserEmailsMap((prev) => ({ ...getLocalPrivateEmails(), ...prev }));

    const handleLocalSync = () => {
      setUsersList(getLocalUsers());
      setUserEmailsMap((prev) => ({ ...getLocalPrivateEmails(), ...prev }));
      setReports(getLocalReports());
      setModerationRules(getLocalModerationRules());
      setAllComments(getLocalComments());
      setAllReactions(getLocalReactions());
      setAllSuggestions(getLocalSuggestions());
      setSupportTickets(getLocalSupportTickets());
      setChatSyncTick((prev) => prev + 1);
    };
    window.addEventListener(DB_UPDATE_EVENT, handleLocalSync);

    let unsub = () => {};
    if (canUseFirestore()) {
      unsub = onSnapshot(
        collection(db, 'users'),
        (snap) => {
          const list: UserPublicProfile[] = snap.docs.map((d) => ({
            ...(d.data() as UserPublicProfile),
            uid: d.id,
          }));
          if (list.length > 0) {
            saveLocalUsers(list);
          }
          const merged = getLocalUsers();
          merged.sort((a, b) => {
            const tA = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
            const tB = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
            return tB - tA;
          });
          setUsersList(merged);
        },
        (err) => {
          setUsersList(getLocalUsers());
          handleFirestoreError(err, OperationType.LIST, 'users');
        }
      );
    }
    return () => {
      unsub();
      window.removeEventListener(DB_UPDATE_EVENT, handleLocalSync);
    };
  }, []);

  // Subscribe to private user records in /users_private for developer email visibility
  useEffect(() => {
    if (!canUseFirestore()) return;
    const unsub = onSnapshot(
      collection(db, 'users_private'),
      (snap) => {
        const nextMap: Record<string, string> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as Partial<UserPrivateInfo>;
          if (data?.email) {
            nextMap[d.id] = data.email;
          }
        });
        setUserEmailsMap((prev) => ({ ...prev, ...nextMap }));
      },
      () => {
        // Fallback per-user getDoc handled below if collection list is restricted
      }
    );
    return () => unsub();
  }, []);

  // Ensure each user's private email doc is fetched if not already in userEmailsMap
  useEffect(() => {
    if (usersList.length === 0) return;
    let active = true;
    const localEmails = getLocalPrivateEmails();
    const missingUsers = usersList
      .filter((u) => !userEmailsMap[u.uid] && !localEmails[u.uid])
      .slice(0, 5);

    if (Object.keys(localEmails).some((k) => !userEmailsMap[k])) {
      setUserEmailsMap((prev) => ({ ...localEmails, ...prev }));
    }

    if (!canUseFirestore()) return;

    const fetchMissingEmails = async () => {
      const updates: Record<string, string> = {};
      if (missingUsers.length > 0) {
        await Promise.all(
          missingUsers.map(async (u) => {
            try {
              const pSnap = await getDoc(doc(db, 'users_private', u.uid));
              if (pSnap.exists()) {
                const pData = pSnap.data() as Partial<UserPrivateInfo>;
                if (pData?.email) {
                  updates[u.uid] = pData.email;
                }
              }
            } catch {
              // Ignore individual read error
            }
          })
        );
      }
      if (active && Object.keys(updates).length > 0) {
        setUserEmailsMap((prev) => ({ ...prev, ...updates }));
      }
    };
    fetchMissingEmails();
    return () => {
      active = false;
    };
  }, [usersList.length]);

  // Subscribe to all reports in /reports + Supabase state
  useEffect(() => {
    setReports(getLocalReports());
    if (!canUseFirestore()) return;
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ContentReport[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ContentReport, 'id'>),
        }));
        list.forEach((r) => upsertLocalReport(r));
        setReports(getLocalReports());
      },
      (err) => {
        setReports(getLocalReports());
        handleFirestoreError(err, OperationType.LIST, 'reports');
      }
    );
    return () => unsub();
  }, []);

  // Subscribe to all moderation rules in /moderation_rules + Supabase state
  useEffect(() => {
    setModerationRules(getLocalModerationRules());
    if (!canUseFirestore()) return;
    const q = query(collection(db, 'moderation_rules'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ModerationRule[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ModerationRule, 'id'>),
        }));
        list.forEach((r) => upsertLocalModerationRule(r));
        setModerationRules(getLocalModerationRules());
      },
      (err) => {
        setModerationRules(getLocalModerationRules());
        handleFirestoreError(err, OperationType.LIST, 'moderation_rules');
      }
    );
    return () => unsub();
  }, []);

  // Subscribe to suggestions for Analytics
  useEffect(() => {
    if (!canUseFirestore()) return;
    const q = query(
      collection(db, 'suggestions'),
      where('visibility', '==', 'edu_verified')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const remote = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Suggestion, 'id'>),
        }));
        if (remote.length > 0) {
          saveLocalSuggestions(remote);
        }
        setAllSuggestions(getLocalSuggestions());
      },
      () => {
        setAllSuggestions(getLocalSuggestions());
      }
    );
    return () => unsub();
  }, []);

  // Load Comments & Reactions across posts when Analytics or Database tab is opened
  const loadCommentsAndReactions = async () => {
    setIsLoadingDbExtras(true);
    setAllComments(getLocalComments());
    setAllReactions(getLocalReactions());
    if (!canUseFirestore()) {
      setIsLoadingDbExtras(false);
      return;
    }
    try {
      const loadedComments: Comment[] = [...getLocalComments()];
      const loadedReactions: (Reaction & { id: string })[] = [...getLocalReactions()];
      const seenCommentIds = new Set(loadedComments.map((c) => c.id));
      const seenReactionIds = new Set(loadedReactions.map((r) => `${r.postId}_${r.userId}`));

      await Promise.all(
        posts.slice(0, 12).map(async (p) => {
          try {
            const cSnap = await getDocs(collection(db, 'posts', p.id, 'comments'));
            cSnap.docs.forEach((d) => {
              if (!seenCommentIds.has(d.id)) {
                seenCommentIds.add(d.id);
                loadedComments.push({
                  id: d.id,
                  ...(d.data() as Omit<Comment, 'id'>),
                });
              }
            });
          } catch {
            // continue
          }
          try {
            const rSnap = await getDocs(collection(db, 'posts', p.id, 'reactions'));
            rSnap.docs.forEach((d) => {
              const rData = d.data() as Reaction;
              const rKey = `${rData.postId || p.id}_${rData.userId || d.id}`;
              if (!seenReactionIds.has(rKey)) {
                seenReactionIds.add(rKey);
                loadedReactions.push({
                  id: d.id,
                  ...rData,
                });
              }
            });
          } catch {
            // continue
          }
        })
      );

      setAllComments(loadedComments);
      setAllReactions(loadedReactions);
    } finally {
      setIsLoadingDbExtras(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'database' || activeTab === 'analytics') {
      loadCommentsAndReactions();
    }
  }, [activeTab, posts.length]);

  const showTempBanner = (msg: string) => {
    setModStatusBanner(msg);
    window.setTimeout(() => setModStatusBanner(null), 3500);
  };

  const handleAdminReplyToSuggestion = async (
    sug: Suggestion,
    nextStatus?: SuggestionStatus
  ) => {
    const replyText =
      suggestionReplyDrafts[sug.id] !== undefined
        ? suggestionReplyDrafts[sug.id].trim()
        : (sug.adminReply || '').trim();
    const statusToSave = nextStatus || sug.status || 'under_review';
    setSavingSuggestionId(sug.id);
    try {
      const adminNick = 'Official Admin';
      const localUpdates: Partial<Suggestion> = {
        status: statusToSave,
      };
      const updatePayload: Record<string, unknown> = {
        status: statusToSave,
        updatedAt: serverTimestamp(),
      };
      if (replyText) {
        localUpdates.adminReply = replyText.slice(0, 2000);
        localUpdates.adminReplyBy = adminNick;
        localUpdates.adminReplyBadge = 'developer';
        updatePayload.adminReply = replyText.slice(0, 2000);
        updatePayload.adminReplyBy = adminNick;
        updatePayload.adminReplyBadge = 'developer';
        updatePayload.adminRepliedAt = serverTimestamp();
      }
      updateLocalSuggestionFields(sug.id, localUpdates);
      setAllSuggestions(getLocalSuggestions());

      if (replyText && sug.authorId && sug.authorId !== currentUserProfile.uid) {
        const notifId = `notif_sug_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const sugNotifPayload = {
          id: notifId,
          recipientId: sug.authorId,
          actorId: ONE_OFFICIAL_UID,
          actorNickname: adminNick,
          actorPhotoURL: ONE_LOGO_DATA_URL,
          actorBadge: 'developer' as const,
          type: 'comment' as const,
          targetId: sug.id,
          previewText: `Official Admin Response to your suggestion "${sug.title.slice(0, 40)}": ${replyText.slice(0, 120)}`,
          read: false,
          createdAt: Timestamp.now(),
        };
        upsertLocalNotification(sugNotifPayload);
        if (canUseFirestore()) {
          setDoc(doc(db, 'notifications', notifId), {
            ...sugNotifPayload,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      }

      if (canUseFirestore()) {
        updateDoc(doc(db, 'suggestions', sug.id), updatePayload).catch(() => {});
      }

      showTempBanner(
        replyText
          ? `Published official admin reply to "${sug.title}".`
          : `Updated suggestion status for "${sug.title}".`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `suggestions/${sug.id}`);
    } finally {
      setSavingSuggestionId(null);
    }
  };

  // =========================================================================
  // 1. USER MANAGEMENT ACTIONS (WITH "ARE YOU SURE?" CONFIRMATION)
  // =========================================================================
  const handleChangeUserRole = (user: UserPublicProfile, nextBadge: UserBadge) => {
    if ((user.badge || 'verified') === nextBadge) return;
    requestAdminConfirm({
      message: `Are you sure you want to change @${user.nickname}'s role/badge to ${nextBadge.toUpperCase()}?`,
      confirmLabel: `Yes, Set to ${nextBadge.toUpperCase()}`,
      variant: 'primary',
      onConfirm: async () => {
        const nextRole =
          nextBadge === 'developer'
            ? 'developer'
            : nextBadge === 'moderator'
            ? 'moderator'
            : 'student';
        const updatedUser: UserPublicProfile = {
          ...user,
          badge: nextBadge,
          role: nextRole,
        };
        upsertLocalUser(updatedUser, getUserEmail(user));
        setUsersList(getLocalUsers());
        if (canUseFirestore()) {
          updateDoc(doc(db, 'users', user.uid), {
            badge: nextBadge,
            role: nextRole,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
          updateDoc(doc(db, 'presence', user.uid), {
            badge: nextBadge,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        showTempBanner(`Updated @${user.nickname} role to ${nextBadge.toUpperCase()}.`);
      },
    });
  };

  const handleToggleVerifyStudent = (user: UserPublicProfile) => {
    const currentlyVerified = user.isVerifiedStudent !== false;
    requestAdminConfirm({
      message: currentlyVerified
        ? `Are you sure you want to unverify student account @${user.nickname}?`
        : `Are you sure you want to verify student account @${user.nickname}?`,
      confirmLabel: currentlyVerified ? 'Yes, Unverify' : 'Yes, Verify',
      variant: currentlyVerified ? 'danger' : 'primary',
      onConfirm: async () => {
        const updatedUser: UserPublicProfile = {
          ...user,
          isVerifiedStudent: !currentlyVerified,
          permissions: {
            ...(user.permissions || DEFAULT_PERMISSIONS),
            isVerifiedStudent: !currentlyVerified,
          },
        };
        upsertLocalUser(updatedUser, getUserEmail(user));
        setUsersList(getLocalUsers());
        if (canUseFirestore()) {
          updateDoc(doc(db, 'users', user.uid), {
            isVerifiedStudent: !currentlyVerified,
            permissions: updatedUser.permissions,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        showTempBanner(
          !currentlyVerified
            ? `Verified student account @${user.nickname}.`
            : `Unverified student account @${user.nickname}.`
        );
      },
    });
  };

  const performSetUserAccountStatus = async (
    user: UserPublicProfile,
    status: UserAccountStatus,
    days?: number,
    reason?: string
  ) => {
    const suspendedUntil =
      status === 'suspended' && days
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : '';
    const updatedUser: UserPublicProfile = {
      ...user,
      accountStatus: status,
      suspendedUntil,
      banReason: reason || '',
    };
    upsertLocalUser(updatedUser, getUserEmail(user));
    setUsersList(getLocalUsers());
    if (canUseFirestore()) {
      updateDoc(doc(db, 'users', user.uid), {
        accountStatus: status,
        suspendedUntil,
        banReason: reason || '',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
    showTempBanner(
      status === 'active'
        ? `Restored @${user.nickname} account to ACTIVE.`
        : `Set @${user.nickname} account status to ${status.toUpperCase()}.`
    );
  };

  const handleSetUserAccountStatus = (
    user: UserPublicProfile,
    status: UserAccountStatus,
    days?: number,
    reason?: string
  ) => {
    requestAdminConfirm({
      message:
        status === 'active'
          ? `Are you sure you want to restore @${user.nickname}'s account to ACTIVE?`
          : `Are you sure you want to set @${user.nickname}'s account status to ${status.toUpperCase()}?`,
      confirmLabel:
        status === 'active'
          ? 'Yes, Restore Account'
          : `Yes, ${status === 'banned' ? 'Ban' : 'Suspend'} User`,
      variant: status === 'active' ? 'primary' : 'danger',
      onConfirm: () => performSetUserAccountStatus(user, status, days, reason),
    });
  };

  const handleToggleUserPermission = (
    user: UserPublicProfile,
    permKey: keyof UserPermissions
  ) => {
    const currentPerms = user.permissions || DEFAULT_PERMISSIONS;
    const nextValue = !currentPerms[permKey];
    requestAdminConfirm({
      message: `Are you sure you want to turn ${nextValue ? 'ON' : 'OFF'} the "${permKey}" permission for @${user.nickname}?`,
      confirmLabel: `Yes, Turn ${nextValue ? 'ON' : 'OFF'}`,
      variant: nextValue ? 'primary' : 'danger',
      onConfirm: async () => {
        const nextPerms: UserPermissions = {
          ...currentPerms,
          [permKey]: nextValue,
        };
        const updatedUser: UserPublicProfile = {
          ...user,
          permissions: nextPerms,
        };
        upsertLocalUser(updatedUser, getUserEmail(user));
        setUsersList(getLocalUsers());
        if (canUseFirestore()) {
          updateDoc(doc(db, 'users', user.uid), {
            permissions: nextPerms,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        showTempBanner(`Updated ${permKey} permission for @${user.nickname}.`);
      },
    });
  };

  const handleDeleteUserAccount = (user: UserPublicProfile) => {
    requestAdminConfirm({
      message: `Are you sure you want to permanently delete @${user.nickname}'s user account from the database? This action cannot be undone.`,
      confirmLabel: 'Yes, Delete Account',
      variant: 'danger',
      onConfirm: async () => {
        deleteLocalUser(user.uid);
        setUsersList(getLocalUsers());
        if (canUseFirestore()) {
          const batch = writeBatch(db);
          batch.delete(doc(db, 'users', user.uid));
          batch.delete(doc(db, 'users_private', user.uid));
          batch.delete(doc(db, 'presence', user.uid));
          const normNick = normalizeNicknameId(user.nickname);
          if (normNick) {
            batch.delete(doc(db, 'nicknames', normNick));
          }
          batch.commit().catch(() => {});
        }
        showTempBanner(`Deleted account @${user.nickname} from database.`);
      },
    });
  };

  // =========================================================================
  // 2. POST MANAGEMENT ACTIONS (WITH "ARE YOU SURE?" CONFIRMATION)
  // =========================================================================
  const handleTogglePostPin = (post: Post) => {
    requestAdminConfirm({
      message: post.isPinned
        ? `Are you sure you want to unpin @${post.authorNickname}'s post from the top of the feed?`
        : `Are you sure you want to pin @${post.authorNickname}'s post to the top of the feed?`,
      confirmLabel: post.isPinned ? 'Yes, Unpin Post' : 'Yes, Pin Post',
      variant: 'primary',
      onConfirm: async () => {
        updateLocalPostFields(post.id, { isPinned: !post.isPinned });
        if (canUseFirestore()) {
          updateDoc(doc(db, 'posts', post.id), {
            isPinned: !post.isPinned,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        showTempBanner(!post.isPinned ? 'Pinned post to top of feed.' : 'Unpinned post.');
      },
    });
  };

  const handleTogglePostHide = (post: Post) => {
    requestAdminConfirm({
      message: post.isHidden
        ? `Are you sure you want to unhide @${post.authorNickname}'s post and restore it to the public feed?`
        : `Are you sure you want to hide @${post.authorNickname}'s post from the public feed?`,
      confirmLabel: post.isHidden ? 'Yes, Unhide Post' : 'Yes, Hide Post',
      variant: 'primary',
      onConfirm: async () => {
        updateLocalPostFields(post.id, { isHidden: !post.isHidden });
        if (canUseFirestore()) {
          updateDoc(doc(db, 'posts', post.id), {
            isHidden: !post.isHidden,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        showTempBanner(!post.isHidden ? 'Hidden post from public feed.' : 'Unhidden post.');
      },
    });
  };

  const handleTogglePostLockComments = (post: Post) => {
    requestAdminConfirm({
      message: post.commentsLocked
        ? `Are you sure you want to unlock comments on @${post.authorNickname}'s post?`
        : `Are you sure you want to lock comments on @${post.authorNickname}'s post?`,
      confirmLabel: post.commentsLocked ? 'Yes, Unlock Comments' : 'Yes, Lock Comments',
      variant: 'primary',
      onConfirm: async () => {
        updateLocalPostFields(post.id, { commentsLocked: !post.commentsLocked });
        if (canUseFirestore()) {
          updateDoc(doc(db, 'posts', post.id), {
            commentsLocked: !post.commentsLocked,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        showTempBanner(
          !post.commentsLocked ? 'Locked comments on post.' : 'Unlocked comments on post.'
        );
      },
    });
  };

  const handleRemovePostMedia = (post: Post) => {
    requestAdminConfirm({
      message: `Are you sure you want to remove the photo/media attachment from @${post.authorNickname}'s post? This action cannot be undone.`,
      confirmLabel: 'Yes, Remove Attachment',
      variant: 'danger',
      onConfirm: async () => {
        updateLocalPostFields(post.id, {
          attachmentType: 'none',
          attachmentName: '',
          attachmentSize: 0,
          attachmentMime: '',
          attachmentDataUrl: '',
        });
        if (canUseFirestore()) {
          updateDoc(doc(db, 'posts', post.id), {
            attachmentType: 'none',
            attachmentName: '',
            attachmentSize: 0,
            attachmentMime: '',
            attachmentDataUrl: '',
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        showTempBanner('Removed photo/media attachment from post.');
      },
    });
  };

  const handleDeletePostAdmin = (postId: string) => {
    requestAdminConfirm({
      message:
        'Are you sure you want to permanently delete this post? This action cannot be undone.',
      confirmLabel: 'Yes, Delete Post',
      variant: 'danger',
      onConfirm: async () => {
        deleteLocalPost(postId);
        if (canUseFirestore()) {
          deleteDoc(doc(db, 'posts', postId)).catch(() => {});
          setDoc(
            doc(db, 'platform_settings', 'global'),
            {
              deletedPostIds: getDeletedPostIds(),
              visibility: 'edu_verified',
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ).catch(() => {});
        }
        showTempBanner('Deleted post permanently across all users.');
      },
    });
  };

  // =========================================================================
  // 3. MODERATION ACTIONS (REPORTS, WARNINGS, SUSPENSIONS, BANS, RULES)
  // =========================================================================
  const handleUpdateReportStatus = (
    report: ContentReport,
    status: 'reviewed' | 'resolved' | 'dismissed',
    alsoHidePost = false,
    alsoDeletePost = false
  ) => {
    requestAdminConfirm({
      message: `Are you sure you want to mark this report as ${status.toUpperCase()}${
        alsoDeletePost
          ? ' and permanently delete the reported post'
          : alsoHidePost
          ? ' and hide the reported post from the feed'
          : ''
      }?`,
      confirmLabel: `Yes, Mark ${status.toUpperCase()}`,
      variant: alsoDeletePost ? 'danger' : 'primary',
      onConfirm: async () => {
        upsertLocalReport({
          ...report,
          status,
          reviewedBy: currentUserProfile.nickname,
          updatedAt: Timestamp.now(),
        });
        setReports(getLocalReports());
        if (alsoDeletePost && report.targetType === 'post') {
          deleteLocalPost(report.targetId);
        } else if (alsoHidePost && report.targetType === 'post') {
          updateLocalPostFields(report.targetId, { isHidden: true });
        }
        if (canUseFirestore()) {
          updateDoc(doc(db, 'reports', report.id), {
            status,
            reviewedBy: currentUserProfile.nickname,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
          if (alsoDeletePost && report.targetType === 'post') {
            deleteDoc(doc(db, 'posts', report.targetId)).catch(() => {});
            setDoc(
              doc(db, 'platform_settings', 'global'),
              {
                deletedPostIds: getDeletedPostIds(),
                visibility: 'edu_verified',
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => {});
          } else if (alsoHidePost && report.targetType === 'post') {
            updateDoc(doc(db, 'posts', report.targetId), {
              isHidden: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
        }
        showTempBanner(`Report marked as ${status.toUpperCase()}.`);
      },
    });
  };

  const handleDeleteReport = (reportId: string) => {
    requestAdminConfirm({
      message:
        'Are you sure you want to permanently delete this report record from the database?',
      confirmLabel: 'Yes, Delete Report',
      variant: 'danger',
      onConfirm: async () => {
        deleteLocalReport(reportId);
        setReports(getLocalReports());
        if (canUseFirestore()) {
          deleteDoc(doc(db, 'reports', reportId)).catch(() => {});
        }
        showTempBanner('Deleted report record.');
      },
    });
  };

  const handleExecuteModerationAction = (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = usersList.find(
      (u) =>
        u.uid === modTargetUid ||
        u.nickname.toLowerCase() === modTargetUid.replace('@', '').trim().toLowerCase()
    );
    if (!targetUser) {
      showTempBanner('Please select a valid user from the dropdown.');
      return;
    }

    const cleanReason = modReason.trim() || 'Violation of ONE Community Rules';

    requestAdminConfirm({
      message:
        modActionType === 'warn'
          ? `Are you sure you want to issue an Official Warning to @${targetUser.nickname}?`
          : modActionType === 'suspend'
          ? `Are you sure you want to suspend @${targetUser.nickname} for ${
              Math.max(1, parseInt(modSuspendDays, 10) || 7)
            } day(s)?`
          : `Are you sure you want to permanently BAN @${targetUser.nickname}?`,
      confirmLabel:
        modActionType === 'warn'
          ? 'Yes, Issue Warning'
          : modActionType === 'suspend'
          ? 'Yes, Suspend User'
          : 'Yes, Ban User',
      variant: modActionType === 'warn' ? 'primary' : 'danger',
      onConfirm: async () => {
        try {
          if (modActionType === 'warn') {
            const nextWarnings = (targetUser.warningCount || 0) + 1;
            upsertLocalUser(
              {
                ...targetUser,
                warningCount: nextWarnings,
              },
              getUserEmail(targetUser)
            );
            setUsersList(getLocalUsers());
            const notifId = `warn_${targetUser.uid}_${Date.now()}`;
            const warnNotifPayload = {
              id: notifId,
              recipientId: targetUser.uid,
              actorId: currentUserProfile.uid,
              actorNickname: currentUserProfile.nickname,
              actorPhotoURL: currentUserProfile.photoURL || '',
              actorBadge: 'developer' as const,
              type: 'comment' as const,
              targetId: targetUser.uid,
              previewText: `OFFICIAL MODERATOR WARNING (#${nextWarnings}): ${cleanReason}`,
              read: false,
              createdAt: Timestamp.now(),
            };
            upsertLocalNotification(warnNotifPayload);
            if (canUseFirestore()) {
              updateDoc(doc(db, 'users', targetUser.uid), {
                warningCount: nextWarnings,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
              setDoc(doc(db, 'notifications', notifId), {
                ...warnNotifPayload,
                createdAt: serverTimestamp(),
              }).catch(() => {});
            }
            showTempBanner(
              `Issued Official Warning #${nextWarnings} to @${targetUser.nickname}.`
            );
          } else if (modActionType === 'suspend') {
            const days = Math.max(1, parseInt(modSuspendDays, 10) || 7);
            await performSetUserAccountStatus(targetUser, 'suspended', days, cleanReason);
          } else if (modActionType === 'ban') {
            await performSetUserAccountStatus(targetUser, 'banned', undefined, cleanReason);
          }
          setModReason('');
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${targetUser.uid}`);
        }
      },
    });
  };

  const handleCreateModerationRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleTitle.trim()) return;
    requestAdminConfirm({
      message: `Are you sure you want to create and activate the moderation rule "${newRuleTitle.trim()}"?`,
      confirmLabel: 'Yes, Create Rule',
      variant: 'primary',
      onConfirm: async () => {
        const ruleId = `rule_${Date.now()}`;
        const localRule: ModerationRule = {
          id: ruleId,
          title: newRuleTitle.trim().slice(0, 140),
          description:
            newRuleDesc.trim().slice(0, 1000) || 'Automated community moderation rule.',
          category: newRuleCategory,
          severity: newRuleSeverity,
          keywords: newRuleKeywords.trim().slice(0, 1000),
          isActive: true,
          createdBy: currentUserProfile.nickname,
          visibility: 'edu_verified',
          createdAt: currentUserProfile.createdAt,
          updatedAt: currentUserProfile.updatedAt,
        };
        upsertLocalModerationRule(localRule);
        setModerationRules(getLocalModerationRules());
        setNewRuleTitle('');
        setNewRuleKeywords('');
        setNewRuleDesc('');
        if (canUseFirestore()) {
          setDoc(doc(db, 'moderation_rules', ruleId), {
            title: localRule.title,
            description: localRule.description,
            category: localRule.category,
            severity: localRule.severity,
            keywords: localRule.keywords,
            isActive: true,
            createdBy: currentUserProfile.nickname,
            visibility: 'edu_verified',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        showTempBanner('Created new moderation rule.');
      },
    });
  };

  const handleToggleModerationRule = (rule: ModerationRule) => {
    requestAdminConfirm({
      message: `Are you sure you want to ${
        rule.isActive ? 'disable' : 'enable'
      } the moderation rule "${rule.title}"?`,
      confirmLabel: rule.isActive ? 'Yes, Disable Rule' : 'Yes, Enable Rule',
      variant: 'primary',
      onConfirm: async () => {
        upsertLocalModerationRule({ ...rule, isActive: !rule.isActive });
        setModerationRules(getLocalModerationRules());
        if (canUseFirestore()) {
          updateDoc(doc(db, 'moderation_rules', rule.id), {
            isActive: !rule.isActive,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      },
    });
  };

  const handleDeleteModerationRule = (ruleId: string) => {
    requestAdminConfirm({
      message:
        'Are you sure you want to permanently delete this moderation rule? This action cannot be undone.',
      confirmLabel: 'Yes, Delete Rule',
      variant: 'danger',
      onConfirm: async () => {
        deleteLocalModerationRule(ruleId);
        setModerationRules(getLocalModerationRules());
        if (canUseFirestore()) {
          deleteDoc(doc(db, 'moderation_rules', ruleId)).catch(() => {});
        }
        showTempBanner('Deleted moderation rule.');
      },
    });
  };

  // =========================================================================
  // 4. WEBSITE CONTROLS ACTIONS (WITH "ARE YOU SURE?" CONFIRMATION)
  // =========================================================================
  const performSavePlatformSettings = async (overrideSettings?: PlatformSettings) => {
    setIsSavingSite(true);
    setSiteSaveBanner(null);
    const payload = overrideSettings || siteForm;
    saveLocalPlatformSettings({
      ...payload,
      updatedBy: currentUserProfile.nickname,
    });
    if (canUseFirestore()) {
      setDoc(
        doc(db, 'platform_settings', 'global'),
        {
          ...payload,
          updatedBy: currentUserProfile.nickname,
          visibility: 'edu_verified',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {});
    }
    setSiteSaveBanner('Website controls & global settings saved and published live.');
    window.setTimeout(() => setSiteSaveBanner(null), 3500);
    setIsSavingSite(false);
  };

  const handleSavePlatformSettings = (
    e?: React.FormEvent,
    overrideSettings?: PlatformSettings
  ) => {
    if (e) e.preventDefault();
    requestAdminConfirm({
      message:
        'Are you sure you want to save and publish these live website controls and settings?',
      confirmLabel: 'Yes, Save & Publish',
      variant: 'primary',
      onConfirm: () => performSavePlatformSettings(overrideSettings),
    });
  };

  const handleQuickToggleSiteFeature = (key: keyof PlatformSettings) => {
    const nextValue = !siteForm[key];
    requestAdminConfirm({
      message: `Are you sure you want to toggle "${key}" ${nextValue ? 'ON' : 'OFF'} for the live website?`,
      confirmLabel: `Yes, Turn ${nextValue ? 'ON' : 'OFF'}`,
      variant: 'primary',
      onConfirm: async () => {
        const nextSettings: PlatformSettings = {
          ...siteForm,
          [key]: nextValue,
        };
        setSiteForm(nextSettings);
        await performSavePlatformSettings(nextSettings);
      },
    });
  };

  // =========================================================================
  // FILTERED LISTS & ANALYTICS COMPUTATIONS
  // =========================================================================
  const [isRepairingUsers, setIsRepairingUsers] = useState(false);

  const handleManualRepairOriginalUsers = async () => {
    setIsRepairingUsers(true);
    try {
      const fullRes = await restoreFullDatabase();
      const res = await repairAndRestoreOriginalUsers();
      setUsersList(getLocalUsers());
      setAllComments(getLocalComments());
      setAllReactions(getLocalReactions());
      setAllSuggestions(getLocalSuggestions());
      setModerationRules(getLocalModerationRules());
      showTempBanner(
        `Database & Original Users Restored! (${fullRes.usersRestored} users, ${fullRes.postsRestored} posts, ${fullRes.commentsRestored} comments synced; ${res.restoredCount + res.repairedCount} cloud records verified).`
      );
    } finally {
      setIsRepairingUsers(false);
    }
  };

  const mergedUsers = useMemo(() => {
    const map = new Map<string, UserPublicProfile>();
    usersList.forEach((u) => {
      if (u.uid && u.uid !== ONE_OFFICIAL_UID) {
        map.set(u.uid, u);
      }
    });
    // Ensure any user in presenceList or posts who hasn't been synced into usersList yet is also visible
    presenceList.forEach((p) => {
      if (p.uid && p.uid !== ONE_OFFICIAL_UID && !map.has(p.uid)) {
        map.set(p.uid, {
          uid: p.uid,
          nickname: p.nickname,
          nicknameUpdatedAt: new Date().toISOString(),
          googleDisplayName: p.nickname,
          photoURL: p.photoURL,
          emailDomain: 's.msumain.edu.ph',
          campus: p.campus || MSU_CAMPUSES[0],
          bio: '',
          defaultAnonymous: false,
          badge: p.badge,
          accountStatus: 'active',
          isVerifiedStudent: true,
          createdAt: p.updatedAt,
          updatedAt: p.updatedAt,
        });
      }
    });
    posts.forEach((post) => {
      if (
        post.authorId &&
        post.authorId !== ONE_OFFICIAL_UID &&
        !map.has(post.authorId) &&
        !post.isAnonymous &&
        post.authorNickname &&
        post.authorNickname !== 'Anonymous Student'
      ) {
        map.set(post.authorId, {
          uid: post.authorId,
          nickname: post.authorNickname,
          nicknameUpdatedAt: new Date().toISOString(),
          googleDisplayName: post.authorDisplayName || post.authorNickname,
          photoURL: post.authorPhotoURL || '',
          emailDomain: post.authorDomain || 's.msumain.edu.ph',
          campus: MSU_CAMPUSES[0],
          bio: '',
          defaultAnonymous: false,
          badge: post.authorBadge || 'verified',
          accountStatus: 'active',
          isVerifiedStudent: true,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
        });
      }
    });
    return Array.from(map.values());
  }, [usersList, presenceList, posts]);

  const getUserEmail = (u: UserPublicProfile): string => {
    if (userEmailsMap[u.uid]) {
      return userEmailsMap[u.uid];
    }
    if (u.uid === currentUserProfile.uid && currentUserEmail) {
      return currentUserEmail;
    }
    const maybeDirectEmail = (u as unknown as { email?: string }).email;
    if (maybeDirectEmail && maybeDirectEmail.includes('@')) {
      return maybeDirectEmail;
    }
    if (u.badge === 'developer') {
      if (u.emailDomain === 'gmail.com') return 'xandercamarin@gmail.com';
      if (u.emailDomain === 's.msumain.edu.ph') return 'camarin.xn839@s.msumain.edu.ph';
    }
    if (u.badge === 'tulips') {
      return 'delacernaahrene122008@gmail.com';
    }
    const domain = (u.emailDomain || 's.msumain.edu.ph').replace(/^@/, '');
    const cleanHandle = (u.nickname || 'student')
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    return `${cleanHandle}@${domain}`;
  };

  const filteredUsers = useMemo(() => {
    return mergedUsers.filter((u) => {
      const status = u.accountStatus || 'active';
      const badge = u.badge || 'verified';
      if (userFilter === 'verified' && badge !== 'verified' && badge !== 'tulips') return false;
      if (userFilter === 'moderator' && badge !== 'moderator') return false;
      if (userFilter === 'developer' && badge !== 'developer') return false;
      if (userFilter === 'suspended' && status !== 'suspended') return false;
      if (userFilter === 'banned' && status !== 'banned') return false;

      if (userSearch.trim()) {
        const q = userSearch.trim().toLowerCase();
        const resolvedEmail = getUserEmail(u).toLowerCase();
        return (
          u.nickname.toLowerCase().includes(q) ||
          (u.googleDisplayName || '').toLowerCase().includes(q) ||
          resolvedEmail.includes(q) ||
          (u.campus || '').toLowerCase().includes(q) ||
          (u.referralSource || '').toLowerCase().includes(q) ||
          (u.emailDomain || '').toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [mergedUsers, userFilter, userSearch, userEmailsMap, currentUserEmail]);

  const filteredAdminPosts = useMemo(() => {
    return posts.filter((p) => {
      if (postFilter === 'pinned' && !p.isPinned) return false;
      if (postFilter === 'hidden' && !p.isHidden) return false;
      if (postFilter === 'locked' && !p.commentsLocked) return false;
      if (postFilter === 'media' && p.attachmentType === 'none') return false;
      if (
        postFilter === 'reported' &&
        !(p.reportsCount && p.reportsCount > 0) &&
        !reports.some((r) => r.targetId === p.id)
      ) {
        return false;
      }

      if (postSearch.trim()) {
        const q = postSearch.trim().toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.content.toLowerCase().includes(q) ||
          p.authorNickname.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          (p.attachmentName || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [posts, postFilter, postSearch, reports]);

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (reportFilter !== 'all' && r.status !== reportFilter) return false;
      return true;
    });
  }, [reports, reportFilter]);

  const filteredSupportTickets = useMemo(() => {
    return supportTickets.filter((t) => {
      if (supportFilter !== 'all' && t.status !== supportFilter) return false;
      if (supportSearch.trim()) {
        const q = supportSearch.trim().toLowerCase();
        return (
          t.subject.toLowerCase().includes(q) ||
          t.message.toLowerCase().includes(q) ||
          t.userNickname.toLowerCase().includes(q) ||
          (t.userEmail || '').toLowerCase().includes(q) ||
          (t.category || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [supportTickets, supportFilter, supportSearch]);

  const handleAdminReplyToSupportTicket = async (ticket: SupportTicket) => {
    const rawDraft = (supportReplyDrafts[ticket.id] || '').trim();
    if (!rawDraft) return;

    setSendingSupportReplyId(ticket.id);
    try {
      const supportUid = SUPPORT_OFFICIAL_UID;
      const supportNick = SUPPORT_OFFICIAL_NAME;
      const supportPhoto = ONE_LOGO_DATA_URL;
      const supportBadge: UserBadge = SUPPORT_OFFICIAL_BADGE;
      const chatId = ticket.chatId || buildChatId(supportUid, ticket.userId);
      const sortedUids = [supportUid, ticket.userId].sort();
      const isSupportUserA = sortedUids[0] === supportUid;
      const nowTs = Timestamp.now();

      const msgId = `msg_sup_adm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const formattedChatText = `🛟 Contact Support (Re: "${ticket.subject}"):\n\n${rawDraft.slice(
        0,
        2400
      )}`;
      const previewSnippet = `🛟 Contact Support: ${rawDraft.slice(0, 220)}`;

      const threadPayload: ChatThread = {
        id: chatId,
        participantIds: sortedUids,
        userAId: isSupportUserA ? supportUid : ticket.userId,
        userANickname: isSupportUserA ? supportNick : ticket.userNickname || 'Student',
        userAPhotoURL: isSupportUserA ? supportPhoto : ticket.userPhotoURL || '',
        userABadge: isSupportUserA ? supportBadge : ticket.userBadge || 'verified',
        userBId: isSupportUserA ? ticket.userId : supportUid,
        userBNickname: isSupportUserA ? ticket.userNickname || 'Student' : supportNick,
        userBPhotoURL: isSupportUserA ? ticket.userPhotoURL || '' : supportPhoto,
        userBBadge: isSupportUserA ? ticket.userBadge || 'verified' : supportBadge,
        lastMessage: previewSnippet,
        lastSenderId: supportUid,
        lastMessageRead: false,
        lastMessageReadAt: null,
        createdAt: ticket.createdAt || nowTs,
        updatedAt: nowTs,
      };

      const messagePayload: ChatMessage = {
        id: msgId,
        chatId,
        participantIds: sortedUids,
        senderId: supportUid,
        recipientId: ticket.userId,
        senderNickname: supportNick,
        senderPhotoURL: supportPhoto,
        senderBadge: supportBadge,
        text: formattedChatText,
        attachmentType: 'none',
        attachmentName: '',
        attachmentSize: 0,
        attachmentMime: '',
        attachmentDataUrl: '',
        read: false,
        createdAt: nowTs,
      };

      const notifId = `notif_sup_reply_${ticket.id}_${Date.now()}`.slice(0, 120);
      const notifPayload: NotificationItem = {
        id: notifId,
        recipientId: ticket.userId,
        actorId: supportUid,
        actorNickname: supportNick,
        actorPhotoURL: supportPhoto,
        actorBadge: supportBadge,
        type: 'message',
        targetId: chatId,
        previewText: previewSnippet,
        read: false,
        createdAt: nowTs,
      };

      upsertLocalChatThread(threadPayload);
      upsertLocalChatMessage(messagePayload);
      upsertLocalNotification(notifPayload);

      const existingReplies = Array.isArray(ticket.replies) ? ticket.replies : [];
      const newReplyItem: SupportTicketReply = {
        id: msgId,
        senderId: supportUid,
        senderNickname: supportNick,
        senderPhotoURL: supportPhoto,
        senderBadge: supportBadge,
        isAdmin: true,
        text: rawDraft.slice(0, 2400),
        createdAt: nowTs,
      };

      const updatedTicket: SupportTicket = {
        ...ticket,
        chatId,
        adminId: supportUid,
        adminNickname: supportNick,
        status: 'replied',
        lastReplyText: rawDraft.slice(0, 2400),
        lastReplyBy: supportNick,
        replies: [...existingReplies, newReplyItem],
        updatedAt: nowTs,
      };

      upsertLocalSupportTicket(updatedTicket);
      setSupportTickets(getLocalSupportTickets());
      setSupportReplyDrafts((prev) => ({ ...prev, [ticket.id]: '' }));

      if (canUseFirestore()) {
        setDoc(
          doc(db, 'chats', chatId),
          {
            ...threadPayload,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});
        setDoc(doc(db, 'chats', chatId, 'messages', msgId), {
          ...messagePayload,
          createdAt: serverTimestamp(),
        }).catch(() => {});
        setDoc(doc(db, 'notifications', notifId), {
          ...notifPayload,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      showTempBanner(
        `Sent support reply to @${ticket.userNickname}'s Messenger & updated ticket!`
      );
    } finally {
      setSendingSupportReplyId(null);
    }
  };

  const handleUpdateSupportTicketStatus = (
    ticket: SupportTicket,
    nextStatus: SupportTicketStatus
  ) => {
    updateLocalSupportTicketFields(ticket.id, { status: nextStatus });
    setSupportTickets(getLocalSupportTickets());
    showTempBanner(`Marked support ticket "${ticket.subject}" as ${nextStatus.toUpperCase()}.`);
  };

  const handleDeleteSupportTicket = (ticketId: string) => {
    requestAdminConfirm({
      message: 'Are you sure you want to delete this support ticket from the Admin Dashboard?',
      confirmLabel: 'Yes, Delete Ticket',
      variant: 'danger',
      onConfirm: () => {
        deleteLocalSupportTicket(ticketId);
        setSupportTickets(getLocalSupportTickets());
        showTempBanner('Deleted support ticket.');
      },
    });
  };

  // Analytics Metrics
  const analyticsStats = useMemo(() => {
    const totalUsers = mergedUsers.length;
    const onlineNow = presenceList.filter((p) => isUserCurrentlyOnline(p)).length;
    const activeLast24h = presenceList.filter(
      (p) => typeof p.lastSeenMs === 'number' && Date.now() - p.lastSeenMs < 24 * 60 * 60 * 1000
    ).length;

    const totalPosts = posts.length;
    const totalCommentsCount = posts.reduce((acc, p) => acc + (p.commentsCount || 0), 0);
    const totalLikesCount = posts.reduce((acc, p) => acc + (p.likesCount || 0), 0);
    const mediaPostsCount = posts.filter((p) => p.attachmentType !== 'none').length;
    const anonymousPostsCount = posts.filter((p) => p.isAnonymous).length;

    // Daily activity (last 7 days)
    const daysLabels: { label: string; posts: number; users: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const dayEnd = dayStart + 86400000;

      const dayPosts = posts.filter((p) => {
        const ms = p.createdAt && typeof p.createdAt.toMillis === 'function' ? p.createdAt.toMillis() : 0;
        return ms >= dayStart && ms < dayEnd;
      }).length;

      const dayUsers = mergedUsers.filter((u) => {
        const ms = u.createdAt && typeof u.createdAt.toMillis === 'function' ? u.createdAt.toMillis() : 0;
        return ms >= dayStart && ms < dayEnd;
      }).length;

      daysLabels.push({ label: dayStr, posts: dayPosts, users: dayUsers });
    }

    // Campus registration breakdown
    const campusCounts: Record<string, number> = {};
    const referralCounts: Record<string, number> = {};
    mergedUsers.forEach((u) => {
      const c = u.campus || 'MSU Main Campus - Marawi';
      campusCounts[c] = (campusCounts[c] || 0) + 1;
      const refSource = (u.referralSource || '').trim() || 'Direct / Unspecified';
      referralCounts[refSource] = (referralCounts[refSource] || 0) + 1;
    });

    return {
      totalUsers,
      onlineNow,
      activeLast24h: Math.max(onlineNow, activeLast24h),
      totalPosts,
      totalCommentsCount,
      totalLikesCount,
      mediaPostsCount,
      anonymousPostsCount,
      daysLabels,
      campusCounts,
      referralCounts,
    };
  }, [mergedUsers, presenceList, posts]);

  return (
    <div className="space-y-5 pb-14 dashboard-enter-anim">
      {/* Top Admin Command Header */}
      <div className="bg-white border border-[#E8DFDC] rounded-2xl overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />
        <div className="p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[#7B1113] text-[#D4AF37] border-2 border-[#D4AF37] flex items-center justify-center shrink-0">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl sm:text-3xl text-[#7B1113] leading-none">
                  Developer &amp; Admin Controls
                </h1>
                <UserBadgeTag badge="developer" size="md" />
              </div>
              <p className="text-xs text-[#6E5D5F] mt-1">
                Full platform control over Users, Posts, Moderation, Website Settings, Analytics
                &amp; Firebase Database.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onBackToWall}
            className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Student Wall</span>
          </button>
        </div>

        {/* 6-Section Navigation Tabs */}
        <div className="px-4 sm:px-6 pb-4 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-t border-[#F2ECE9] pt-3">
          {(
            [
              { id: 'users', label: `1. User Management (${mergedUsers.length})`, icon: Users },
              { id: 'posts', label: `2. Post Management (${posts.length})`, icon: FileText },
              {
                id: 'moderation',
                label: `3. Moderation (${reports.filter((r) => r.status === 'pending').length})`,
                icon: ShieldAlert,
              },
              {
                id: 'support',
                label: `4. Contact Support (${supportTickets.filter((t) => t.status === 'open').length})`,
                icon: Headphones,
              },
              { id: 'website', label: '5. Website Controls', icon: Globe },
              { id: 'analytics', label: '6. Analytics', icon: BarChart3 },
              { id: 'database', label: '7. Database Controls', icon: Database },
            ] as const
          ).map((tab) => {
            const IconComp = tab.icon;
            const isCurrent = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer min-h-[38px] ${
                  isCurrent
                    ? 'bg-[#7B1113] text-white'
                    : 'bg-[#FAF8F5] text-[#6E5D5F] hover:text-[#1F1617] hover:bg-[#F2ECE9] border border-[#E8DFDC]'
                }`}
              >
                <IconComp
                  className={`w-3.5 h-3.5 shrink-0 ${
                    isCurrent ? 'text-[#D4AF37]' : 'text-[#7B1113]'
                  }`}
                />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Status Toast Banner */}
      {modStatusBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{modStatusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setModStatusBanner(null)}
            className="text-emerald-700 hover:underline text-[11px]"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ===================================================================
          TAB 1: USER MANAGEMENT
          =================================================================== */}
      {activeTab === 'users' && (
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-[#7B1113]">1. User Management</h2>
              <p className="text-xs text-[#6E5D5F]">
                View registered users, search accounts, verify students, change roles, suspend or
                delete accounts, and inspect creation dates.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleManualRepairOriginalUsers}
                disabled={isRepairingUsers}
                className="px-3 py-1.5 rounded-xl bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-[#D4AF37] ${isRepairingUsers ? 'animate-spin' : ''}`}
                />
                <span>{isRepairingUsers ? 'Syncing Users...' : 'Restore & Sync Original Users'}</span>
              </button>
              <div className="text-xs font-mono text-[#6E5D5F]">
                Showing {filteredUsers.length} of {mergedUsers.length} registered users
              </div>
            </div>
          </div>

          {/* Search & Role/Status Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#6E5D5F] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users by @nickname, name, email, campus, or UID..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113]"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: 'All Users' },
                  { id: 'verified', label: 'Verified' },
                  { id: 'moderator', label: 'Moderators' },
                  { id: 'developer', label: 'Developers' },
                  { id: 'suspended', label: 'Suspended' },
                  { id: 'banned', label: 'Banned' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setUserFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                    userFilter === f.id
                      ? 'bg-[#7B1113] text-white'
                      : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Registered Users List */}
          <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6E5D5F]">
                No matching user accounts found.
              </div>
            ) : (
              filteredUsers.slice(0, visibleUsersLimit).map((u) => {
                const pres = presenceList.find((p) => p.uid === u.uid);
                const online = isUserCurrentlyOnline(pres);
                const status = u.accountStatus || 'active';
                const userEmail = getUserEmail(u);
                const badge = isTulipsEmail(userEmail) ? 'tulips' : u.badge || 'verified';
                const isVerified =
                  u.isVerifiedStudent !== false || badge === 'tulips' || isTulipsEmail(userEmail);

                return (
                  <div
                    key={u.uid}
                    className="p-4 bg-white hover:bg-[#FAF8F5]/60 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <img
                          src={u.photoURL || studentAvatarFallback}
                          alt={u.nickname}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-full object-cover border-2 border-[#D4AF37]"
                        />
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            online ? 'bg-emerald-500' : 'bg-stone-300'
                          }`}
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                            <span className="text-sm font-bold text-[#1F1617] truncate">@{u.nickname}</span>
                            <UserBadgeTag badge={badge} size="sm" />
                          </span>
                          <span className="text-xs text-[#6E5D5F] truncate">({u.googleDisplayName})</span>
                          {status !== 'active' && (
                            <span
                              className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md ${
                                status === 'banned'
                                  ? 'bg-rose-700 text-white'
                                  : 'bg-amber-600 text-white'
                              }`}
                            >
                              {status}
                            </span>
                          )}
                          {!isVerified && (
                            <span className="text-[10px] font-mono text-rose-700">
                              · Unverified
                            </span>
                          )}
                        </div>

                        {/* User Email & Referral Source ("Where did you find this app?") Display */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#FAF8F5] border border-[#E8DFDC] text-xs font-mono text-[#7B1113]">
                            <Mail className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
                            <span className="break-all">{userEmail}</span>
                          </span>
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#F7EFE0]/70 border border-[#D4AF37]/60 text-xs font-medium text-[#7B1113]"
                            title="Response to: Hi MSUan before you proceed where did you find this app ?"
                          >
                            <Megaphone className="w-3 h-3 text-[#7B1113] shrink-0" />
                            <span>
                              Found via:{' '}
                              <strong>{u.referralSource || 'Direct / Campus Invite'}</strong>
                            </span>
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-[#6E5D5F]">
                          <span>{u.campus}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-[11px]">
                            Created: {formatExactDate(u.createdAt)}
                          </span>
                          {u.warningCount ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="text-amber-700 font-semibold">
                                Warnings: {u.warningCount}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Controls: Role, Verify, Suspend/Restore, Delete */}
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <select
                        value={badge}
                        onChange={(e) =>
                          handleChangeUserRole(u, e.target.value as UserBadge)
                        }
                        aria-label={`Change role for @${u.nickname}`}
                        className="px-2.5 py-1.5 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl font-medium text-[#1F1617] focus:outline-none focus:border-[#7B1113]"
                      >
                        <option value="verified">Role: Verified Student</option>
                        <option value="tulips">Role: Verified (Tulips)</option>
                        <option value="moderator">Role: Moderator</option>
                        <option value="developer">Role: Developer</option>
                      </select>

                      <button
                        type="button"
                        onClick={() => handleToggleVerifyStudent(u)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1 cursor-pointer ${
                          isVerified
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-[#FAF8F5] text-[#6E5D5F] border-[#E8DFDC]'
                        }`}
                        title="Toggle student verification status"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>{isVerified ? 'Verified' : 'Verify'}</span>
                      </button>

                      {status === 'active' ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleSetUserAccountStatus(
                              u,
                              'suspended',
                              7,
                              'Suspended by Developer Admin'
                            )
                          }
                          className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1 cursor-pointer"
                          title="Suspend account for 7 days"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Suspend</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSetUserAccountStatus(u, 'active')}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-emerald-600 text-white flex items-center gap-1 cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Restore Active</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeleteUserAccount(u)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1 cursor-pointer"
                        title="Permanently delete user record"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {filteredUsers.length > visibleUsersLimit && (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVisibleUsersLimit((prev) => prev + 60)}
                className="px-4 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] text-xs font-semibold cursor-pointer"
              >
                Show 60 More Users ({Math.min(visibleUsersLimit, filteredUsers.length)} of{' '}
                {filteredUsers.length} shown)
              </button>
              <button
                type="button"
                onClick={() => setVisibleUsersLimit(filteredUsers.length)}
                className="px-4 py-2 rounded-xl bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold cursor-pointer"
              >
                Show All {filteredUsers.length} Users
              </button>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================
          TAB 2: POST MANAGEMENT
          =================================================================== */}
      {activeTab === 'posts' && (
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-[#7B1113]">2. Post Management</h2>
              <p className="text-xs text-[#6E5D5F]">
                View all posts, pin important posts, hide/unhide posts, lock comments, remove
                inappropriate photos, or delete posts.
              </p>
            </div>
            <div className="text-xs font-mono text-[#6E5D5F]">
              Showing {filteredAdminPosts.length} of {posts.length} posts
            </div>
          </div>

          {/* Search & Post Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#6E5D5F] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={postSearch}
                onChange={(e) => setPostSearch(e.target.value)}
                placeholder="Search posts by title, content, @nickname, or filename..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113]"
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              {(
                [
                  { id: 'all', label: `All (${posts.length})` },
                  { id: 'pinned', label: `Pinned (${posts.filter((p) => p.isPinned).length})` },
                  { id: 'hidden', label: `Hidden (${posts.filter((p) => p.isHidden).length})` },
                  {
                    id: 'locked',
                    label: `Locked (${posts.filter((p) => p.commentsLocked).length})`,
                  },
                  {
                    id: 'media',
                    label: `With Media (${posts.filter((p) => p.attachmentType !== 'none').length})`,
                  },
                  {
                    id: 'reported',
                    label: `Reported (${
                      posts.filter(
                        (p) =>
                          (p.reportsCount && p.reportsCount > 0) ||
                          reports.some((r) => r.targetId === p.id)
                      ).length
                    })`,
                  },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPostFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                    postFilter === f.id
                      ? 'bg-[#7B1113] text-white'
                      : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
            {filteredAdminPosts.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#6E5D5F]">
                No posts match this filter.
              </div>
            ) : (
              filteredAdminPosts.map((p) => (
                <div
                  key={p.id}
                  className="p-4 bg-white hover:bg-[#FAF8F5]/60 transition-colors space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="font-bold text-[#1F1617]">
                          {p.isAnonymous
                            ? `Anonymous (@${p.authorNickname})`
                            : `@${p.authorNickname}`}
                        </span>
                        <UserBadgeTag badge={p.authorBadge} size="sm" />
                        <span aria-hidden="true">·</span>
                        <span className="text-[#6E5D5F]">{p.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[#6E5D5F]">
                          {formatExactDate(p.createdAt)}
                        </span>
                        {p.isPinned && (
                          <span className="text-[#7B1113] font-semibold">· Pinned</span>
                        )}
                        {p.isHidden && (
                          <span className="text-amber-700 font-semibold">· Hidden</span>
                        )}
                        {p.commentsLocked && (
                          <span className="text-stone-600 font-semibold">· Comments Locked</span>
                        )}
                        {(p.reportsCount || 0) > 0 && (
                          <span className="text-rose-700 font-bold">
                            · {p.reportsCount} Report(s)
                          </span>
                        )}
                      </div>

                      {p.title && (
                        <h3 className="text-sm font-semibold text-[#1F1617]">{p.title}</h3>
                      )}
                      <p className="text-xs text-[#1F1617] line-clamp-3 whitespace-pre-line">
                        {p.content}
                      </p>

                      {p.attachmentType !== 'none' && (
                        <div className="pt-1 flex items-center gap-2 text-xs text-[#7B1113] font-mono">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>
                            Attachment: {p.attachmentName} ({p.attachmentType.toUpperCase()} ·{' '}
                            {formatFileSize(p.attachmentSize)})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Post Admin Controls */}
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTogglePostPin(p)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1 cursor-pointer ${
                          p.isPinned
                            ? 'bg-[#7B1113] text-[#D4AF37] border-[#7B1113]'
                            : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC]'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                        <span>{p.isPinned ? 'Unpin' : 'Pin'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTogglePostHide(p)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1 cursor-pointer ${
                          p.isHidden
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC]'
                        }`}
                      >
                        {p.isHidden ? (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Unhide</span>
                          </>
                        ) : (
                          <>
                            <EyeOff className="w-3.5 h-3.5" />
                            <span>Hide</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleTogglePostLockComments(p)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1 cursor-pointer ${
                          p.commentsLocked
                            ? 'bg-[#7B1113] text-white border-[#7B1113]'
                            : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC]'
                        }`}
                      >
                        {p.commentsLocked ? (
                          <>
                            <Unlock className="w-3.5 h-3.5" />
                            <span>Unlock Comments</span>
                          </>
                        ) : (
                          <>
                            <Lock className="w-3.5 h-3.5" />
                            <span>Lock Comments</span>
                          </>
                        )}
                      </button>

                      {p.attachmentType !== 'none' && (
                        <button
                          type="button"
                          onClick={() => handleRemovePostMedia(p)}
                          className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1 cursor-pointer"
                          title="Remove inappropriate photo or attachment"
                        >
                          <ImageOff className="w-3.5 h-3.5" />
                          <span>Remove Photo/File</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleDeletePostAdmin(p.id)}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ===================================================================
          TAB 3: MODERATION (REPORTS, WARN/SUSPEND/BAN, MODERATION RULES)
          =================================================================== */}
      {activeTab === 'moderation' && (
        <div className="space-y-5">
          {/* 3A. Reported Content Queue */}
          <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-[#7B1113]">
                  Reported Content &amp; Review Queue
                </h2>
                <p className="text-xs text-[#6E5D5F]">
                  Review student reports, hide or delete reported content, or dismiss resolved
                  reports.
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                {(['all', 'pending', 'reviewed', 'resolved', 'dismissed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setReportFilter(st)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                      reportFilter === st
                        ? 'bg-[#7B1113] text-white'
                        : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {filteredReports.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] text-center text-xs text-[#6E5D5F]">
                No reports in this queue right now. Students can click &ldquo;Report&rdquo; on any
                post to submit a report for review.
              </div>
            ) : (
              <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
                {filteredReports.map((rep) => (
                  <div key={rep.id} className="p-4 space-y-2.5 bg-white">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-rose-700 flex items-center gap-1">
                          <Flag className="w-3.5 h-3.5" />
                          <span>{rep.reason}</span>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-[#6E5D5F]">
                          Reported by <strong>@{rep.reporterNickname}</strong> against{' '}
                          <strong>@{rep.targetAuthorNickname}</strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px] text-[#6E5D5F]">
                          {formatExactDate(rep.createdAt)}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] uppercase font-semibold text-[#7B1113]">
                        Status: {rep.status}
                      </span>
                    </div>

                    <p className="text-xs text-[#1F1617] bg-[#FAF8F5] p-3 rounded-xl border border-[#E8DFDC]">
                      &ldquo;{rep.targetPreview}&rdquo;
                      {rep.details ? ` — Note: ${rep.details}` : ''}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateReportStatus(rep, 'reviewed')}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#1F1617] border border-[#E8DFDC] cursor-pointer"
                      >
                        Mark Reviewed
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateReportStatus(rep, 'resolved', true, false)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-600 text-white cursor-pointer"
                      >
                        Resolve &amp; Hide Post
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateReportStatus(rep, 'resolved', false, true)}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-700 text-white cursor-pointer"
                      >
                        Resolve &amp; Delete Post
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateReportStatus(rep, 'dismissed')}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#6E5D5F] hover:bg-[#FAF8F5] cursor-pointer"
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(rep.id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-700 hover:bg-rose-50 ml-auto cursor-pointer"
                      >
                        Delete Report
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3B. Warn, Temporarily Suspend, or Permanently Ban Users */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="font-display text-2xl text-[#7B1113]">
                  Warn, Suspend, or Ban User
                </h3>
                <p className="text-xs text-[#6E5D5F]">
                  Issue official warnings, temporary suspensions, or permanent bans.
                </p>
              </div>

              <form onSubmit={handleExecuteModerationAction} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F1617] mb-1">
                    Select Student Account
                  </label>
                  <select
                    value={modTargetUid}
                    onChange={(e) => setModTargetUid(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                    required
                  >
                    <option value="">-- Choose a registered user --</option>
                    {mergedUsers.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        @{u.nickname} ({getUserEmail(u)}) — Status: {u.accountStatus || 'active'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#1F1617] mb-1">
                      Moderation Action
                    </label>
                    <select
                      value={modActionType}
                      onChange={(e) =>
                        setModActionType(e.target.value as 'warn' | 'suspend' | 'ban')
                      }
                      className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                    >
                      <option value="warn">Warn User (Send Official Warning)</option>
                      <option value="suspend">Temporarily Suspend User</option>
                      <option value="ban">Permanently Ban User</option>
                    </select>
                  </div>

                  {modActionType === 'suspend' && (
                    <div>
                      <label className="block text-xs font-medium text-[#1F1617] mb-1">
                        Suspension Duration
                      </label>
                      <select
                        value={modSuspendDays}
                        onChange={(e) => setModSuspendDays(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                      >
                        <option value="1">24 Hours (1 Day)</option>
                        <option value="3">3 Days</option>
                        <option value="7">7 Days (1 Week)</option>
                        <option value="14">14 Days (2 Weeks)</option>
                        <option value="30">30 Days (1 Month)</option>
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#1F1617] mb-1">
                    Reason / Official Notice Message
                  </label>
                  <input
                    type="text"
                    value={modReason}
                    onChange={(e) => setModReason(e.target.value)}
                    placeholder="e.g., Violation of Rule #5 (Zero Harassment & No Doxxing)"
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                    required
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShieldAlert className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {modActionType === 'warn'
                      ? 'Send Official Warning'
                      : modActionType === 'suspend'
                      ? `Suspend Account for ${modSuspendDays} Day(s)`
                      : 'Permanently Ban Account'}
                  </span>
                </button>
              </form>
            </section>

            {/* 3C. Create & Manage Moderation Rules */}
            <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="font-display text-2xl text-[#7B1113]">
                  Create Moderation Rules
                </h3>
                <p className="text-xs text-[#6E5D5F]">
                  Define platform moderation rules and auto-flagged keywords.
                </p>
              </div>

              <form onSubmit={handleCreateModerationRule} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={newRuleTitle}
                    onChange={(e) => setNewRuleTitle(e.target.value)}
                    placeholder="Rule Title (e.g., No Doxxing / Phone Numbers)"
                    className="px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                    required
                  />
                  <select
                    value={newRuleSeverity}
                    onChange={(e) =>
                      setNewRuleSeverity(e.target.value as 'warn' | 'hide' | 'block')
                    }
                    className="px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                  >
                    <option value="warn">Action: Warn Student</option>
                    <option value="hide">Action: Auto-Hide Content</option>
                    <option value="block">Action: Block Submission</option>
                  </select>
                </div>

                <input
                  type="text"
                  value={newRuleKeywords}
                  onChange={(e) => setNewRuleKeywords(e.target.value)}
                  placeholder="Flagged keywords (comma-separated, optional)..."
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                />

                <input
                  type="text"
                  value={newRuleDesc}
                  onChange={(e) => setNewRuleDesc(e.target.value)}
                  placeholder="Short rule description for students & moderators..."
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                />

                <button
                  type="submit"
                  className="w-full py-2.5 px-4 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-[#D4AF37]" />
                  <span>Add Moderation Rule</span>
                </button>
              </form>

              {moderationRules.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-[#F2ECE9] max-h-56 overflow-y-auto">
                  {moderationRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-[#1F1617] truncate">
                          {rule.title}{' '}
                          <span className="font-mono text-[10px] uppercase text-[#7B1113]">
                            [{rule.severity}]
                          </span>
                        </p>
                        <p className="text-[11px] text-[#6E5D5F] truncate">{rule.description}</p>
                        {rule.keywords && (
                          <p className="text-[10px] font-mono text-[#6E5D5F] truncate">
                            Keywords: {rule.keywords}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleModerationRule(rule)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                            rule.isActive
                              ? 'bg-emerald-600 text-white'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {rule.isActive ? 'Active' : 'Paused'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteModerationRule(rule.id)}
                          className="p-1 text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* 3D. Campus Suggestion Box — Admin Replies & Status Management */}
          <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-2xl text-[#7B1113]">
                  Campus Suggestion Box — Admin Replies ({allSuggestions.length})
                </h3>
                <p className="text-xs text-[#6E5D5F]">
                  Read student suggestions, update implementation statuses, and publish official
                  Admin responses directly to the Suggestion Box.
                </p>
              </div>
            </div>

            {allSuggestions.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] text-center text-xs text-[#6E5D5F]">
                No student suggestions submitted yet.
              </div>
            ) : (
              <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
                {allSuggestions.map((sug) => {
                  const draftVal =
                    suggestionReplyDrafts[sug.id] !== undefined
                      ? suggestionReplyDrafts[sug.id]
                      : sug.adminReply || '';
                  const isSavingThis = savingSuggestionId === sug.id;

                  return (
                    <div key={sug.id} className="p-4 sm:p-5 bg-white space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-bold text-[#1F1617]">
                              {sug.isAnonymous
                                ? `Anonymous (@${sug.authorNickname})`
                                : `@${sug.authorNickname}`}
                            </span>
                            <span className="text-[#D4AF37]">·</span>
                            <span className="text-[#6E5D5F] font-medium">{sug.category}</span>
                            <span className="text-[#D4AF37]">·</span>
                            <span className="font-mono text-[#6E5D5F]">
                              Upvotes: {sug.upvotesCount || 0}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-[#1F1617]">{sug.title}</h4>
                          <p className="text-sm text-[#1F1617] leading-relaxed whitespace-pre-line">
                            {sug.content}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={sug.status}
                            onChange={(e) =>
                              handleAdminReplyToSuggestion(
                                sug,
                                e.target.value as SuggestionStatus
                              )
                            }
                            className="px-3 py-1.5 text-xs font-semibold bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113] cursor-pointer"
                          >
                            <option value="under_review">Status: Under Review</option>
                            <option value="planned">Status: Planned</option>
                            <option value="in_progress">Status: In Progress</option>
                            <option value="completed">Status: Completed</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={draftVal}
                          onChange={(e) =>
                            setSuggestionReplyDrafts((prev) => ({
                              ...prev,
                              [sug.id]: e.target.value,
                            }))
                          }
                          placeholder="Write official Admin reply to this suggestion..."
                          className="flex-1 px-3.5 py-2 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113]"
                        />
                        <button
                          type="button"
                          disabled={isSavingThis || !draftVal.trim()}
                          onClick={() => handleAdminReplyToSuggestion(sug)}
                          className="px-4 py-2 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold rounded-xl cursor-pointer disabled:opacity-50 shrink-0"
                        >
                          {isSavingThis
                            ? 'Publishing...'
                            : sug.adminReply
                            ? 'Update Reply'
                            : 'Reply as Admin'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================================================================
          TAB 4: CONTACT SUPPORT DESK (USER HELP TICKETS & MESSENGER SYNC)
          =================================================================== */}
      {activeTab === 'support' && (
        <div className="space-y-5">
          <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl text-[#7B1113]">
                  4. Contact Support &amp; Student Help Desk ({supportTickets.length})
                </h2>
                <p className="text-xs text-[#6E5D5F]">
                  Questions and help requests submitted by MSUans from Settings &rarr; Contact
                  Support. When you reply here, your message is delivered straight to the student&apos;s
                  Messenger — and when they reply in Messenger, their response appears right here!
                </p>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {(
                  [
                    { id: 'all', label: `All (${supportTickets.length})` },
                    {
                      id: 'open',
                      label: `Open (${supportTickets.filter((t) => t.status === 'open').length})`,
                    },
                    {
                      id: 'replied',
                      label: `Replied (${
                        supportTickets.filter((t) => t.status === 'replied').length
                      })`,
                    },
                    {
                      id: 'resolved',
                      label: `Resolved (${
                        supportTickets.filter((t) => t.status === 'resolved').length
                      })`,
                    },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSupportFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer ${
                      supportFilter === f.id
                        ? 'bg-[#7B1113] text-white'
                        : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-[#6E5D5F] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={supportSearch}
                onChange={(e) => setSupportSearch(e.target.value)}
                placeholder="Search support tickets by @nickname, email, subject, category, or message..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113]"
              />
            </div>

            {filteredSupportTickets.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#FAF8F5] border border-[#E8DFDC] text-center space-y-2">
                <Headphones className="w-7 h-7 text-[#7B1113] mx-auto opacity-75" />
                <p className="text-sm font-semibold text-[#1F1617]">
                  No support tickets in this view
                </p>
                <p className="text-xs text-[#6E5D5F] max-w-md mx-auto">
                  When students submit a question or help request in <strong>Settings &rarr; Contact Support</strong>, it will appear here so you can reply directly to their Messenger.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredSupportTickets.map((t) => {
                  const chatId = t.chatId || buildChatId(SUPPORT_OFFICIAL_UID, t.userId);
                  const liveChatMsgs = getLocalChatMessages(chatId);
                  const ticketReplies = Array.isArray(t.replies) ? t.replies : [];
                  const combinedRepliesMap = new Map<string, SupportTicketReply>();

                  ticketReplies.forEach((r) => {
                    if (r?.id) combinedRepliesMap.set(r.id, r);
                  });

                  const ticketCreatedMs =
                    t.createdAt && typeof t.createdAt.toMillis === 'function'
                      ? t.createdAt.toMillis()
                      : 0;

                  liveChatMsgs.forEach((m) => {
                    if (!m?.id || combinedRepliesMap.has(m.id)) return;
                    const msgMs =
                      m.createdAt && typeof m.createdAt.toMillis === 'function'
                        ? m.createdAt.toMillis()
                        : 0;
                    if (msgMs >= ticketCreatedMs - 5000) {
                      combinedRepliesMap.set(m.id, {
                        id: m.id,
                        senderId: m.senderId,
                        senderNickname: m.senderNickname,
                        senderPhotoURL: m.senderPhotoURL || '',
                        senderBadge: m.senderBadge || 'verified',
                        isAdmin: m.senderId !== t.userId,
                        text: m.text,
                        createdAt: m.createdAt,
                      });
                    }
                  });

                  const mergedConversation = Array.from(combinedRepliesMap.values()).sort(
                    (a, b) => {
                      const aMs =
                        a.createdAt && typeof a.createdAt.toMillis === 'function'
                          ? a.createdAt.toMillis()
                          : 0;
                      const bMs =
                        b.createdAt && typeof b.createdAt.toMillis === 'function'
                          ? b.createdAt.toMillis()
                          : 0;
                      return aMs - bMs;
                    }
                  );

                  const isSending = sendingSupportReplyId === t.id;
                  const draft = supportReplyDrafts[t.id] || '';

                  return (
                    <div
                      key={t.id}
                      className="p-4 sm:p-5 rounded-2xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-3.5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <img
                            src={t.userPhotoURL || studentAvatarFallback}
                            alt={t.userNickname}
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover border-2 border-[#D4AF37] shrink-0"
                          />
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <span className="font-bold text-[#1F1617]">@{t.userNickname}</span>
                              <UserBadgeTag badge={t.userBadge || 'verified'} size="sm" />
                              <span className="text-[#6E5D5F]">({t.userDisplayName})</span>
                              <span className="px-2 py-0.5 rounded-md bg-[#7B1113]/10 text-[#7B1113] font-mono text-[10px] font-semibold">
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

                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6E5D5F] font-mono">
                              <span>{t.userEmail}</span>
                              <span>·</span>
                              <span>{t.userCampus}</span>
                              <span>·</span>
                              <span>{formatExactDate(t.createdAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <select
                            value={t.status}
                            onChange={(e) =>
                              handleUpdateSupportTicketStatus(
                                t,
                                e.target.value as SupportTicketStatus
                              )
                            }
                            className="px-2.5 py-1.5 text-xs font-semibold bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113] cursor-pointer"
                          >
                            <option value="open">Status: Open</option>
                            <option value="replied">Status: Replied</option>
                            <option value="resolved">Status: Resolved</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => handleDeleteSupportTicket(t.id)}
                            className="p-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                            title="Delete support ticket"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="bg-white p-3.5 rounded-xl border border-[#E8DFDC] space-y-1">
                        <h4 className="text-sm font-bold text-[#7B1113]">{t.subject}</h4>
                        <p className="text-xs text-[#1F1617] whitespace-pre-wrap leading-relaxed">
                          {t.message}
                        </p>
                      </div>

                      {mergedConversation.length > 0 && (
                        <div className="space-y-2 pl-3 border-l-2 border-[#D4AF37]">
                          <p className="text-[11px] font-mono font-semibold text-[#7B1113] uppercase tracking-wider">
                            Messenger &amp; Support Conversation History ({mergedConversation.length})
                          </p>
                          {mergedConversation.map((reply) => (
                            <div
                              key={reply.id}
                              className={`p-3 rounded-xl text-xs space-y-1 ${
                                reply.isAdmin
                                  ? 'bg-[#F7EFE0]/70 border border-[#D4AF37]/50 text-[#1F1617]'
                                  : 'bg-white border border-[#E8DFDC] text-[#1F1617]'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-[#7B1113]">
                                    {reply.isAdmin
                                      ? 'Contact Support (Sent to Messenger)'
                                      : `Student Reply from @${reply.senderNickname}`}
                                  </span>
                                  <UserBadgeTag badge={reply.senderBadge} size="sm" />
                                </div>
                                <span className="text-[10px] font-mono text-[#6E5D5F]">
                                  {formatExactDate(reply.createdAt)}
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap leading-relaxed">{reply.text}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                        <input
                          type="text"
                          value={draft}
                          onChange={(e) =>
                            setSupportReplyDrafts((prev) => ({
                              ...prev,
                              [t.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              void handleAdminReplyToSupportTicket(t);
                            }
                          }}
                          placeholder={`Reply to @${t.userNickname} (delivers directly to their Messenger)...`}
                          className="flex-1 px-3.5 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                        />
                        <button
                          type="button"
                          disabled={isSending || !draft.trim()}
                          onClick={() => void handleAdminReplyToSupportTicket(t)}
                          className="px-4 py-2 bg-[#7B1113] hover:bg-[#580B0C] disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Send className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>
                            {isSending ? 'Sending...' : 'Reply & Send to Messenger'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ===================================================================
          TAB 4: WEBSITE CONTROLS
          =================================================================== */}
      {activeTab === 'website' && (
        <div className="space-y-5">
          {siteSaveBanner && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-semibold">
              {siteSaveBanner}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* 4A. Turn Features On / Off & Maintenance Mode */}
            <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h2 className="font-display text-2xl text-[#7B1113]">
                  Feature Toggles &amp; Maintenance Mode
                </h2>
                <p className="text-xs text-[#6E5D5F]">
                  Turn platform features on or off in real time or enable Maintenance Mode.
                </p>
              </div>

              <div className="space-y-2.5">
                {(
                  [
                    {
                      key: 'allowNewPosts',
                      label: 'Allow Creating New Posts',
                      desc: 'Enable or pause new post submissions on the Student Wall',
                    },
                    {
                      key: 'allowComments',
                      label: 'Allow Student Comments & Replies',
                      desc: 'Enable or pause commenting across all posts',
                    },
                    {
                      key: 'allowFileUploads',
                      label: 'Allow Photo, Video & Microsoft Office File Uploads',
                      desc: 'Enable or pause media and document attachments',
                    },
                    {
                      key: 'allowDirectChat',
                      label: 'Allow Direct Chat & Messenger Inbox',
                      desc: 'Enable or pause 1-on-1 student messaging',
                    },
                    {
                      key: 'allowAnonymousMode',
                      label: 'Allow Anonymous Mode',
                      desc: 'Allow students to hide their nickname on posts and comments',
                    },
                    {
                      key: 'allowSuggestionBox',
                      label: 'Enable Campus Suggestion Box',
                      desc: 'Allow students to submit and upvote feature ideas',
                    },
                    {
                      key: 'maintenanceMode',
                      label: 'Enable Maintenance Mode',
                      desc: 'Show a Maintenance screen to non-admin users while updating the site',
                    },
                    {
                      key: 'inDevelopmentMode',
                      label: 'Display "In Development" Holding Screen',
                      desc: 'Display only the "In Development" screen to all visitors and students',
                    },
                  ] as const
                ).map((item) => {
                  const enabled = Boolean(siteForm[item.key]);
                  return (
                    <div
                      key={item.key}
                      className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-xs font-semibold text-[#1F1617]">{item.label}</p>
                        <p className="text-[11px] text-[#6E5D5F]">{item.desc}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQuickToggleSiteFeature(item.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer ${
                          enabled
                            ? item.key === 'maintenanceMode'
                              ? 'bg-rose-700 text-white'
                              : 'bg-[#7B1113] text-white'
                            : 'bg-white text-[#6E5D5F] border border-[#E8DFDC]'
                        }`}
                      >
                        {enabled ? (
                          <ToggleRight className="w-4 h-4 text-[#D4AF37]" />
                        ) : (
                          <ToggleLeft className="w-4 h-4" />
                        )}
                        <span>{enabled ? 'ON' : 'OFF'}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 4B. Website Name, Logo, Colors/Theme, Announcements & System Notices */}
            <form
              onSubmit={(e) => handleSavePlatformSettings(e)}
              className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4"
            >
              <div>
                <h2 className="font-display text-2xl text-[#7B1113]">
                  Branding, Theme, Announcements &amp; Notices
                </h2>
                <p className="text-xs text-[#6E5D5F]">
                  Customize website name, logo emblem, colors/theme, announcements, and system
                  notices.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1F1617] mb-1">
                    Website Name
                  </label>
                  <input
                    type="text"
                    value={siteForm.siteName}
                    onChange={(e) => setSiteForm({ ...siteForm, siteName: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1F1617] mb-1">
                    Logo Badge Text (e.g. ONE)
                  </label>
                  <input
                    type="text"
                    value={siteForm.logoText}
                    onChange={(e) => setSiteForm({ ...siteForm, logoText: e.target.value })}
                    maxLength={8}
                    className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl font-display"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1F1617] mb-1">
                  Custom Logo Image URL (optional — leave blank for emblem text)
                </label>
                <input
                  type="text"
                  value={siteForm.logoImageUrl}
                  onChange={(e) => setSiteForm({ ...siteForm, logoImageUrl: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 text-xs bg-white border border-[#E8DFDC] rounded-xl"
                />
              </div>

              {/* Colors & Theme Controls */}
              <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#7B1113] flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Colors &amp; Theme Presets</span>
                  </span>
                  <button
                    type="button"
                    onClick={onToggleDarkMode}
                    className="px-2.5 py-1 rounded-lg bg-[#7B1113] text-white text-[11px] font-medium cursor-pointer"
                  >
                    {isDarkMode ? 'Dark Mode: ON' : 'Dark Mode: OFF'}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { name: 'MSU Maroon', primary: '#7B1113', accent: '#D4AF37' },
                    { name: 'Emerald Gold', primary: '#114B3E', accent: '#D4AF37' },
                    { name: 'Royal Navy', primary: '#162B4D', accent: '#E5B842' },
                    { name: 'Dark Espresso', primary: '#3B1416', accent: '#D4AF37' },
                  ].map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      onClick={() =>
                        setSiteForm({
                          ...siteForm,
                          primaryColor: preset.primary,
                          accentColor: preset.accent,
                        })
                      }
                      className="p-2 rounded-lg bg-white border border-[#E8DFDC] text-left flex items-center gap-2 cursor-pointer"
                    >
                      <span
                        className="w-4 h-4 rounded-full shrink-0 border"
                        style={{ backgroundColor: preset.primary, borderColor: preset.accent }}
                      />
                      <span className="text-[11px] font-medium truncate">{preset.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Edit Announcements */}
              <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#7B1113] flex items-center gap-1.5">
                    <Megaphone className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Campus Announcement Banner</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={siteForm.announcementActive}
                    onChange={(e) =>
                      setSiteForm({ ...siteForm, announcementActive: e.target.checked })
                    }
                  />
                </div>
                <input
                  type="text"
                  value={siteForm.announcementTitle}
                  onChange={(e) =>
                    setSiteForm({ ...siteForm, announcementTitle: e.target.value })
                  }
                  placeholder="Announcement Headline..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-[#E8DFDC] rounded-xl"
                />
                <input
                  type="text"
                  value={siteForm.announcementText}
                  onChange={(e) =>
                    setSiteForm({ ...siteForm, announcementText: e.target.value })
                  }
                  placeholder="Announcement details shown at top of the Student Wall..."
                  className="w-full px-3 py-1.5 text-xs bg-white border border-[#E8DFDC] rounded-xl"
                />
              </div>

              {/* System Notices */}
              <div className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#7B1113] flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Global System Notice Bar</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={siteForm.systemNoticeActive}
                    onChange={(e) =>
                      setSiteForm({ ...siteForm, systemNoticeActive: e.target.checked })
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <select
                    value={siteForm.systemNoticeType}
                    onChange={(e) =>
                      setSiteForm({
                        ...siteForm,
                        systemNoticeType: e.target.value as 'info' | 'warning' | 'urgent',
                      })
                    }
                    className="px-3 py-1.5 text-xs bg-white border border-[#E8DFDC] rounded-xl"
                  >
                    <option value="info">Type: Info</option>
                    <option value="warning">Type: Warning</option>
                    <option value="urgent">Type: Urgent</option>
                  </select>
                  <input
                    type="text"
                    value={siteForm.systemNoticeText}
                    onChange={(e) =>
                      setSiteForm({ ...siteForm, systemNoticeText: e.target.value })
                    }
                    placeholder="System notice message across top of site..."
                    className="sm:col-span-2 px-3 py-1.5 text-xs bg-white border border-[#E8DFDC] rounded-xl"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingSite}
                className="w-full py-2.5 px-4 bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Save className="w-4 h-4 text-[#D4AF37]" />
                <span>{isSavingSite ? 'Saving...' : 'Save Website Controls'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          TAB 5: ANALYTICS
          =================================================================== */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          {/* Top KPI Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 space-y-1">
              <span className="text-xs text-[#6E5D5F]">Total Registered Users</span>
              <p className="font-display text-3xl text-[#7B1113] font-mono tabular-nums">
                {analyticsStats.totalUsers}
              </p>
              <p className="text-[11px] text-emerald-700 font-medium">
                {analyticsStats.onlineNow} online right now
              </p>
            </div>

            <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 space-y-1">
              <span className="text-xs text-[#6E5D5F]">Active Users (24h)</span>
              <p className="font-display text-3xl text-[#7B1113] font-mono tabular-nums">
                {analyticsStats.activeLast24h}
              </p>
              <p className="text-[11px] text-[#6E5D5F]">Verified MSUan sessions</p>
            </div>

            <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 space-y-1">
              <span className="text-xs text-[#6E5D5F]">Total Posts</span>
              <p className="font-display text-3xl text-[#7B1113] font-mono tabular-nums">
                {analyticsStats.totalPosts}
              </p>
              <p className="text-[11px] text-[#6E5D5F]">
                {analyticsStats.mediaPostsCount} with files/photos
              </p>
            </div>

            <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 space-y-1">
              <span className="text-xs text-[#6E5D5F]">Total Comments &amp; Likes</span>
              <p className="font-display text-3xl text-[#7B1113] font-mono tabular-nums">
                {analyticsStats.totalCommentsCount + analyticsStats.totalLikesCount}
              </p>
              <p className="text-[11px] text-[#6E5D5F]">
                {analyticsStats.totalCommentsCount} comments · {analyticsStats.totalLikesCount} likes
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Daily Activity Breakdown */}
            <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="font-display text-2xl text-[#7B1113]">
                  Daily Activity &amp; Registrations (Last 7 Days)
                </h3>
                <p className="text-xs text-[#6E5D5F]">
                  New posts and student registrations per day.
                </p>
              </div>

              <div className="space-y-2.5">
                {analyticsStats.daysLabels.map((d) => {
                  const maxVal = Math.max(
                    1,
                    ...analyticsStats.daysLabels.map((x) => x.posts + x.users)
                  );
                  const pct = Math.min(100, Math.round(((d.posts + d.users) / maxVal) * 100));
                  return (
                    <div key={d.label} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-[#1F1617]">{d.label}</span>
                        <span className="font-mono text-[#6E5D5F]">
                          {d.posts} posts · {d.users} new users
                        </span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-[#FAF8F5] border border-[#E8DFDC] overflow-hidden">
                        <div
                          className="h-full bg-[#7B1113] rounded-full transition-all"
                          style={{ width: `${Math.max(6, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Most-Used Features & Campus Registration Statistics */}
            <section className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
              <div>
                <h3 className="font-display text-2xl text-[#7B1113]">
                  Most-Used Features &amp; Campus Registrations
                </h3>
                <p className="text-xs text-[#6E5D5F]">
                  Feature engagement and student registration statistics by MSU campus.
                </p>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    name: 'Student Wall Posts',
                    count: analyticsStats.totalPosts,
                  },
                  {
                    name: 'Comments & Thread Replies',
                    count: analyticsStats.totalCommentsCount,
                  },
                  {
                    name: 'Post Likes / Reactions',
                    count: analyticsStats.totalLikesCount,
                  },
                  {
                    name: 'Photo, Video & Office File Uploads',
                    count: analyticsStats.mediaPostsCount,
                  },
                  {
                    name: 'Anonymous Mode Posts',
                    count: analyticsStats.anonymousPostsCount,
                  },
                  {
                    name: 'Suggestion Box Submissions',
                    count: allSuggestions.length,
                  },
                ].map((feat) => (
                  <div
                    key={feat.name}
                    className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-[#1F1617]">{feat.name}</span>
                    <span className="font-mono font-bold text-[#7B1113]">{feat.count}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-[#F2ECE9] space-y-2">
                <p className="text-xs font-semibold text-[#7B1113]">
                  Registration Statistics by MSU Campus
                </p>
                {Object.entries(analyticsStats.campusCounts).map(([campusName, count]) => (
                  <div
                    key={campusName}
                    className="flex items-center justify-between text-xs text-[#6E5D5F]"
                  >
                    <span className="truncate">{campusName}</span>
                    <span className="font-mono font-semibold text-[#1F1617]">
                      {count} user(s)
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-[#F2ECE9] space-y-2">
                <p className="text-xs font-semibold text-[#7B1113]">
                  &ldquo;Hi MSUan before you proceed where did you find this app ?&rdquo; Responses
                </p>
                {Object.entries(analyticsStats.referralCounts).map(([sourceName, count]) => (
                  <div
                    key={sourceName}
                    className="flex items-center justify-between text-xs text-[#6E5D5F] bg-[#FAF8F5] border border-[#E8DFDC] rounded-lg px-2.5 py-1.5"
                  >
                    <span className="truncate font-medium text-[#1F1617]">{sourceName}</span>
                    <span className="font-mono font-bold text-[#7B1113]">
                      {count} MSUan(s)
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ===================================================================
          TAB 6: DATABASE CONTROLS (FIREBASE FIRESTORE & SUPABASE MANAGER)
          =================================================================== */}
      {activeTab === 'database' && (
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl text-[#7B1113]">
                6. Database Controls (Firebase / Supabase)
              </h2>
              <p className="text-xs text-[#6E5D5F]">
                Inspect and manage Users, Posts, Comments, Likes, Reports, Uploaded Images, Roles,
                and Permissions directly.
              </p>
            </div>
            <button
              type="button"
              onClick={loadCommentsAndReactions}
              disabled={isLoadingDbExtras}
              className="px-3 py-1.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDbExtras ? 'animate-spin' : ''}`} />
              <span>Refresh Collections</span>
            </button>
          </div>

          {/* 8 Database Entity Sub-Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            {(
              [
                { id: 'users', label: `Users (${mergedUsers.length})`, icon: Users },
                { id: 'posts', label: `Posts (${posts.length})`, icon: FileText },
                { id: 'comments', label: `Comments (${allComments.length})`, icon: MessageSquare },
                { id: 'likes', label: `Likes (${allReactions.length})`, icon: Heart },
                { id: 'reports', label: `Reports (${reports.length})`, icon: Flag },
                {
                  id: 'images',
                  label: `Uploaded Images (${
                    posts.filter((p) => p.attachmentType !== 'none').length
                  })`,
                  icon: ImageIcon,
                },
                { id: 'roles', label: 'Roles', icon: Shield },
                { id: 'permissions', label: 'Permissions', icon: KeyRound },
              ] as const
            ).map((sub) => {
              const IconComp = sub.icon;
              const isCurr = dbSubTab === sub.id;
              return (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setDbSubTab(sub.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                    isCurr
                      ? 'bg-[#7B1113] text-white'
                      : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
                  }`}
                >
                  <IconComp
                    className={`w-3.5 h-3.5 ${isCurr ? 'text-[#D4AF37]' : 'text-[#7B1113]'}`}
                  />
                  <span>{sub.label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-[#6E5D5F] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={dbSearch}
              onChange={(e) => setDbSearch(e.target.value)}
              placeholder={`Filter ${dbSubTab} records by ID, @nickname, or content...`}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl focus:outline-none focus:bg-white focus:border-[#7B1113]"
            />
          </div>

          {/* DB View: USERS */}
          {dbSubTab === 'users' && (
            <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
              {mergedUsers
                .filter(
                  (u) =>
                    !dbSearch.trim() ||
                    u.nickname.toLowerCase().includes(dbSearch.toLowerCase()) ||
                    getUserEmail(u).toLowerCase().includes(dbSearch.toLowerCase()) ||
                    u.uid.toLowerCase().includes(dbSearch.toLowerCase())
                )
                .map((u) => (
                  <div
                    key={u.uid}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5">
                      <span className="font-mono text-[11px] text-[#7B1113]">/users/{u.uid}</span>
                      <p className="font-semibold text-[#1F1617]">
                        @{u.nickname} · {u.googleDisplayName} ·{' '}
                        <span className="font-mono text-[#7B1113]">{getUserEmail(u)}</span> ·{' '}
                        {u.campus}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteUserAccount(u)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-medium cursor-pointer"
                    >
                      Delete Document
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* DB View: POSTS */}
          {dbSubTab === 'posts' && (
            <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
              {posts
                .filter(
                  (p) =>
                    !dbSearch.trim() ||
                    p.content.toLowerCase().includes(dbSearch.toLowerCase()) ||
                    p.id.toLowerCase().includes(dbSearch.toLowerCase())
                )
                .map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-mono text-[11px] text-[#7B1113]">/posts/{p.id}</span>
                      <p className="font-semibold text-[#1F1617] truncate">
                        @{p.authorNickname}: {p.title || p.content}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeletePostAdmin(p.id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-medium cursor-pointer shrink-0"
                    >
                      Delete Post
                    </button>
                  </div>
                ))}
            </div>
          )}

          {/* DB View: COMMENTS */}
          {dbSubTab === 'comments' && (
            <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
              {allComments.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#6E5D5F]">
                  No comment documents found.
                </div>
              ) : (
                allComments
                  .filter(
                    (c) =>
                      !dbSearch.trim() ||
                      c.content.toLowerCase().includes(dbSearch.toLowerCase()) ||
                      c.authorNickname.toLowerCase().includes(dbSearch.toLowerCase())
                  )
                  .map((c) => (
                    <div
                      key={c.id}
                      className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-[11px] text-[#7B1113]">
                          /posts/{c.postId}/comments/{c.id}
                        </span>
                        <p className="font-semibold text-[#1F1617]">
                          @{c.authorNickname}: {c.content}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          requestAdminConfirm({
                            message: `Are you sure you want to permanently delete @${c.authorNickname}'s comment? This action cannot be undone.`,
                            confirmLabel: 'Yes, Delete Comment',
                            variant: 'danger',
                            onConfirm: async () => {
                              deleteLocalComment(c.id, c.postId);
                              setAllComments((prev) => prev.filter((item) => item.id !== c.id));
                              try {
                                await deleteDoc(
                                  doc(db, 'posts', c.postId, 'comments', c.id)
                                ).catch(() => {});
                              } catch {
                                // Handled via local/server database
                              }
                              showTempBanner('Deleted comment document.');
                            },
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-medium cursor-pointer shrink-0"
                      >
                        Delete Comment
                      </button>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* DB View: LIKES / REACTIONS */}
          {dbSubTab === 'likes' && (
            <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
              {allReactions.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#6E5D5F]">
                  No like/reaction records found.
                </div>
              ) : (
                allReactions.map((r) => (
                  <div
                    key={`${r.postId}_${r.userId}`}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono text-[11px] text-[#7B1113]">
                        /posts/{r.postId}/reactions/{r.userId}
                      </span>
                      <p className="text-[#1F1617]">
                        User UID: <span className="font-mono">{r.userId}</span> · Reaction:{' '}
                        <strong>{r.type}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        requestAdminConfirm({
                          message:
                            'Are you sure you want to remove this reaction/like document from the database?',
                          confirmLabel: 'Yes, Remove Like',
                          variant: 'danger',
                          onConfirm: async () => {
                            try {
                              await deleteDoc(doc(db, 'posts', r.postId, 'reactions', r.userId));
                              setAllReactions((prev) =>
                                prev.filter(
                                  (item) => !(item.postId === r.postId && item.userId === r.userId)
                                )
                              );
                              showTempBanner('Deleted reaction document.');
                            } catch (err) {
                              handleFirestoreError(
                                err,
                                OperationType.DELETE,
                                `posts/${r.postId}/reactions/${r.userId}`
                              );
                            }
                          },
                        })
                      }
                      className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-medium cursor-pointer"
                    >
                      Remove Like
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* DB View: REPORTS */}
          {dbSubTab === 'reports' && (
            <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
              {reports.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#6E5D5F]">
                  No report documents in /reports.
                </div>
              ) : (
                reports.map((rep) => (
                  <div
                    key={rep.id}
                    className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-mono text-[11px] text-[#7B1113]">
                        /reports/{rep.id}
                      </span>
                      <p className="font-semibold text-[#1F1617]">
                        {rep.reason} — Target: @{rep.targetAuthorNickname} ({rep.status})
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteReport(rep.id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-medium cursor-pointer"
                    >
                      Delete Report
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {/* DB View: UPLOADED IMAGES & FILES */}
          {dbSubTab === 'images' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {posts.filter((p) => p.attachmentType !== 'none').length === 0 ? (
                <div className="col-span-full p-6 text-center text-xs text-[#6E5D5F]">
                  No uploaded images or files found in posts.
                </div>
              ) : (
                posts
                  .filter((p) => p.attachmentType !== 'none')
                  .map((p) => (
                    <div
                      key={`img-${p.id}`}
                      className="border border-[#E8DFDC] rounded-2xl overflow-hidden bg-[#FAF8F5] flex flex-col justify-between"
                    >
                      {p.attachmentType === 'photo' ? (
                        <img
                          src={
                            p.attachmentDataUrl && !p.attachmentDataUrl.startsWith('idb://')
                              ? p.attachmentDataUrl
                              : campusStudyFallback
                          }
                          alt={p.attachmentName}
                          className="w-full h-36 object-cover border-b border-[#E8DFDC]"
                        />
                      ) : (
                        <div className="h-36 flex flex-col items-center justify-center bg-white border-b border-[#E8DFDC] p-3 text-center">
                          <FileText className="w-7 h-7 text-[#7B1113]" />
                          <span className="text-xs font-mono font-bold text-[#7B1113] mt-1">
                            {p.attachmentType.toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className="p-3 space-y-2">
                        <p className="text-xs font-semibold text-[#1F1617] truncate">
                          {p.attachmentName}
                        </p>
                        <p className="text-[11px] text-[#6E5D5F] font-mono">
                          By @{p.authorNickname} · {formatFileSize(p.attachmentSize)}
                        </p>
                        <button
                          type="button"
                          onClick={() => handleRemovePostMedia(p)}
                          className="w-full py-1.5 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <ImageOff className="w-3.5 h-3.5" />
                          <span>Remove Uploaded File</span>
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          )}

          {/* DB View: ROLES */}
          {dbSubTab === 'roles' && (
            <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
              {mergedUsers.map((u) => (
                <div
                  key={`role-${u.uid}`}
                  className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#1F1617]">@{u.nickname}</span>
                    <UserBadgeTag badge={u.badge} size="sm" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['verified', 'tulips', 'moderator', 'developer'] as const).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => handleChangeUserRole(u, r)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                          (u.badge || 'verified') === r
                            ? 'bg-[#7B1113] text-white'
                            : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* DB View: PERMISSIONS */}
          {dbSubTab === 'permissions' && (
            <div className="divide-y divide-[#F2ECE9] border border-[#E8DFDC] rounded-2xl overflow-hidden">
              {mergedUsers.map((u) => {
                const perms = u.permissions || DEFAULT_PERMISSIONS;
                return (
                  <div
                    key={`perm-${u.uid}`}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#1F1617]">@{u.nickname}</span>
                      <p className="text-[11px] text-[#6E5D5F]">{u.campus}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          { key: 'canPost', label: 'Post' },
                          { key: 'canComment', label: 'Comment' },
                          { key: 'canUploadFiles', label: 'Upload Files' },
                          { key: 'canChat', label: 'Direct Chat' },
                          { key: 'isVerifiedStudent', label: 'Verified Access' },
                        ] as const
                      ).map((pItem) => {
                        const allowed = perms[pItem.key];
                        return (
                          <button
                            key={pItem.key}
                            type="button"
                            onClick={() => handleToggleUserPermission(u, pItem.key)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                              allowed
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200 line-through'
                            }`}
                          >
                            {pItem.label}: {allowed ? 'ON' : 'OFF'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Admin Action Confirmation Modal ("Are you sure?") */}
      {pendingAdminConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#E8DFDC] rounded-2xl max-w-sm w-full overflow-hidden shadow-xl">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />
            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="font-display text-xl text-[#1F1617]">
                  {pendingAdminConfirm.title}
                </h4>
                <button
                  type="button"
                  disabled={isExecutingConfirm}
                  onClick={() => setPendingAdminConfirm(null)}
                  className="p-1 text-[#6E5D5F] hover:text-[#1F1617] rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[#6E5D5F] leading-relaxed">
                {pendingAdminConfirm.message}
              </p>
              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isExecutingConfirm}
                  onClick={() => setPendingAdminConfirm(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-[#6E5D5F] hover:text-[#1F1617] bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isExecutingConfirm}
                  onClick={async () => {
                    setIsExecutingConfirm(true);
                    try {
                      await pendingAdminConfirm.onConfirm();
                    } finally {
                      setIsExecutingConfirm(false);
                      setPendingAdminConfirm(null);
                    }
                  }}
                  className={`px-4 py-2 text-xs font-semibold text-white rounded-xl transition-colors cursor-pointer ${
                    pendingAdminConfirm.variant === 'danger'
                      ? 'bg-rose-700 hover:bg-rose-800'
                      : 'bg-[#7B1113] hover:bg-[#580B0C]'
                  }`}
                >
                  {isExecutingConfirm ? 'Processing...' : pendingAdminConfirm.confirmLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
