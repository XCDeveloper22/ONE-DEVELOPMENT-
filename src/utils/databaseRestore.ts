import { Timestamp } from 'firebase/firestore';
import {
  ONE_LOGO_DATA_URL,
  ONE_OFFICIAL_BADGE,
  ONE_OFFICIAL_NAME,
  ONE_OFFICIAL_UID,
  SUPPORT_OFFICIAL_UID,
  buildChatId,
} from '../firebase';
import {
  BACKEND_API_ORIGINS,
  PUBLIC_LIVE_DB_STORAGE_URL,
  supabase,
} from '../supabaseClient';
import {
  ChatMessage,
  ChatThread,
  Comment,
  ContentReport,
  DEFAULT_PLATFORM_SETTINGS,
  MarketplaceListing,
  ModerationRule,
  NotificationItem,
  PlatformSettings,
  Post,
  Reaction,
  Suggestion,
  SupportTicket,
  SupportTicketReply,
  UserBadge,
  UserPresence,
  UserPublicProfile,
} from '../types';
import realUsersSnapshotRaw from './realUsersSnapshot.json';
import { MSU_CALCULUS_GEC_REVIEWER_PDF_DATA_URL } from './fileHelpers';

export const APP_RELEASE_VERSION = '2026.09.29.v10';
const RELEASE_VERSION_STORAGE_KEY = 'one_msu_release_version';

interface SnapshotUserItem {
  uid: string;
  nickname: string;
  nicknameUpdatedAt: string;
  googleDisplayName: string;
  photoURL: string;
  emailDomain: string;
  campus: string;
  bio: string;
  defaultAnonymous: boolean;
  referralSource?: string;
  referralSubmittedAt?: string;
  badge?: UserBadge;
  role?: 'student' | 'moderator' | 'developer';
  accountStatus?: 'active' | 'suspended' | 'banned';
  isVerifiedStudent?: boolean;
  createdAtMs: number;
  updatedAtMs: number;
}

const realUsersSnapshot = realUsersSnapshotRaw as {
  generatedAt: string;
  users: SnapshotUserItem[];
  emails: Record<string, string>;
};

const STORAGE_KEYS = {
  USERS: 'one_msu_db_v3_users',
  USERS_PRIVATE: 'one_msu_db_v3_users_private',
  PRESENCE: 'one_msu_db_v3_presence',
  POSTS: 'one_msu_db_v2_posts',
  COMMENTS: 'one_msu_db_v2_comments',
  REACTIONS: 'one_msu_db_v2_reactions',
  SUGGESTIONS: 'one_msu_db_v2_suggestions',
  UPVOTES: 'one_msu_db_v2_upvotes',
  CHATS: 'one_msu_db_v2_chats',
  MESSAGES: 'one_msu_db_v2_messages',
  NOTIFICATIONS: 'one_msu_db_v2_notifications',
  REPORTS: 'one_msu_db_v2_reports',
  MODERATION_RULES: 'one_msu_db_v2_moderation_rules',
  PLATFORM_SETTINGS: 'one_msu_db_v2_platform_settings',
  MARKETPLACE: 'one_msu_db_v2_marketplace',
  SUPPORT_TICKETS: 'one_msu_db_v2_support_tickets',
  INITIALIZED: 'one_msu_db_v3_real_users_initialized',
} as const;

const FAKE_SYNTHETIC_UIDS = new Set([
  'usr_xandercamarin_gmail_com',
  'usr_delacernaahrene122008_gmail_com',
  'usr_camarin_xn839_s_msumain_edu_ph',
  'usr_amirah_s_msumain_edu_ph',
  'usr_khalid_msuiit_edu_ph',
  'usr_ysabel_gensan_msu_edu_ph',
  'ibKOXniSPNYErJvZTJuyu3RBIqL2',
]);

const SYNTHETIC_TO_REAL_UID_MAP: Record<string, string> = {
  usr_xandercamarin_gmail_com: '538a6246-5cc8-4c63-bbda-0507196f3d5d',
  ibKOXniSPNYErJvZTJuyu3RBIqL2: '538a6246-5cc8-4c63-bbda-0507196f3d5d',
  usr_delacernaahrene122008_gmail_com: 'e61d24c6-ffc2-463c-bff9-2cd74b1edb5c',
  usr_camarin_xn839_s_msumain_edu_ph: '4ae58a7b-5104-4479-8667-ed9e465ba447',
  usr_amirah_s_msumain_edu_ph: '616a4ee1-a750-46af-86c3-23e10727f7d1',
  usr_khalid_msuiit_edu_ph: 'd89b4c02-cf71-4b46-963e-460e75c37674',
  usr_ysabel_gensan_msu_edu_ph: '062a2f0d-9673-424f-9f97-1db781d38d0e',
};

const FAKE_POST_IDS = new Set<string>([
  'post_one_latest_platform_update_v6',
  'post_one_latest_platform_update_v7',
  'post_welcome_one_msu',
  'post_tulips_campus_vibes',
  'post_study_reviewers_midterms',
  'post_anon_dorm_curfew',
  'post_1790442776915_ysqqhp',
]);

const FAKE_COMMENT_IDS = new Set<string>([
  'cmt_welcome_1',
  'cmt_welcome_2',
  'cmt_welcome_3',
  'cmt_tulips_1',
  'cmt_tulips_2',
  'cmt_study_1',
  'cmt_dorm_1',
]);

const FAKE_SUGGESTION_IDS = new Set<string>();

const FAKE_MARKETPLACE_IDS = new Set<string>([
  'mkt_casio_classwiz_calc',
  'mkt_wtb_gec_textbooks',
  'mkt_dorm_desk_lamp_fan',
  'mkt_1790539752999_j0gbh',
  'mkt_1790564988600_hbzta',
  'mkt_1790565673437_73cwv',
]);

function isDemoOrFakeMarketplaceListing(m?: Partial<MarketplaceListing> | null): boolean {
  if (!m || !m.id) return true;
  if (FAKE_MARKETPLACE_IDS.has(m.id)) return true;
  if (m.id.startsWith('demo_') || m.id.startsWith('test_')) return true;
  if (m.authorId && FAKE_SYNTHETIC_UIDS.has(m.authorId)) return true;
  return false;
}

export const DB_UPDATE_EVENT = 'one_msu_local_db_updated';

const CLIENT_INSTANCE_ID = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
let activeEventSource: EventSource | null = null;
let activeSseUid = '';
let supabaseRealtimeChannel: ReturnType<typeof supabase.channel> | null = null;
let isSupabaseChannelSubscribed = false;
const pendingRealtimeBroadcastQueue: Array<{ action: string; payload: Record<string, unknown> }> = [];

const recentPostFieldMutations = new Map<
  string,
  { fields: Partial<Post>; timestampMs: number }
>();
const recentReactionMutations = new Map<
  string,
  { postId: string; userId: string; reacted: boolean; likesCount?: number; timestampMs: number }
>();

function notifyDbUpdated(collectionName?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(DB_UPDATE_EVENT, { detail: { collection: collectionName || 'all' } })
    );
  }
}

async function applyDirectSupabaseFallbackMutation(
  action: string,
  payload: Record<string, any>
): Promise<void> {
  if (action === 'upsert_presence') return;
  try {
    if (action === 'delete_post' && payload?.postId) {
      await supabase.from('comments').delete().eq('post_id', payload.postId);
      await supabase.from('posts').delete().eq('id', payload.postId);
    } else if (action === 'delete_comment' && payload?.commentId) {
      await supabase.from('comments').delete().eq('id', payload.commentId);
    }

    const pubRes = await fetch(`${PUBLIC_LIVE_DB_STORAGE_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!pubRes.ok) return;
    const dbObj = await pubRes.json();
    if (!dbObj || typeof dbObj !== 'object') return;

    dbObj.posts = dbObj.posts || {};
    dbObj.comments = dbObj.comments || {};
    dbObj.marketplace = dbObj.marketplace || {};
    dbObj.chats = dbObj.chats || {};
    dbObj.messages = dbObj.messages || {};
    dbObj.notifications = dbObj.notifications || {};
    dbObj.deletedPostIds = Array.isArray(dbObj.deletedPostIds) ? dbObj.deletedPostIds : [];
    dbObj.deletedCommentIds = Array.isArray(dbObj.deletedCommentIds) ? dbObj.deletedCommentIds : [];
    dbObj.deletedMarketplaceIds = Array.isArray(dbObj.deletedMarketplaceIds)
      ? dbObj.deletedMarketplaceIds
      : [];

    let changed = false;
    switch (action) {
      case 'upsert_post':
        if (payload?.post?.id && !dbObj.deletedPostIds.includes(payload.post.id)) {
          dbObj.posts[payload.post.id] = payload.post;
          changed = true;
        }
        break;
      case 'update_post_fields':
        if (payload?.postId && dbObj.posts[payload.postId]) {
          dbObj.posts[payload.postId] = {
            ...dbObj.posts[payload.postId],
            ...(payload.fields || {}),
          };
          changed = true;
        }
        break;
      case 'delete_post':
        if (payload?.postId) {
          if (!dbObj.deletedPostIds.includes(payload.postId)) {
            dbObj.deletedPostIds.push(payload.postId);
          }
          delete dbObj.posts[payload.postId];
          for (const cid of Object.keys(dbObj.comments)) {
            if (dbObj.comments[cid]?.postId === payload.postId) {
              delete dbObj.comments[cid];
            }
          }
          changed = true;
        }
        break;
      case 'upsert_comment':
        if (payload?.comment?.id && !dbObj.deletedCommentIds.includes(payload.comment.id)) {
          dbObj.comments[payload.comment.id] = payload.comment;
          changed = true;
        }
        break;
      case 'delete_comment':
        if (payload?.commentId) {
          if (!dbObj.deletedCommentIds.includes(payload.commentId)) {
            dbObj.deletedCommentIds.push(payload.commentId);
          }
          delete dbObj.comments[payload.commentId];
          changed = true;
        }
        break;
      case 'upsert_marketplace_listing':
        if (
          payload?.listing?.id &&
          !dbObj.deletedMarketplaceIds.includes(payload.listing.id)
        ) {
          dbObj.marketplace[payload.listing.id] = payload.listing;
          changed = true;
        }
        break;
      case 'update_marketplace_listing_fields':
        if (payload?.listingId && dbObj.marketplace[payload.listingId]) {
          dbObj.marketplace[payload.listingId] = {
            ...dbObj.marketplace[payload.listingId],
            ...(payload.fields || {}),
          };
          changed = true;
        }
        break;
      case 'delete_marketplace_listing':
        if (payload?.listingId) {
          if (!dbObj.deletedMarketplaceIds.includes(payload.listingId)) {
            dbObj.deletedMarketplaceIds.push(payload.listingId);
          }
          delete dbObj.marketplace[payload.listingId];
          changed = true;
        }
        break;
      case 'upsert_chat_thread':
        if (payload?.thread?.id) {
          dbObj.chats[payload.thread.id] = {
            ...(dbObj.chats[payload.thread.id] || {}),
            ...payload.thread,
          };
          changed = true;
        }
        break;
      case 'upsert_chat_message':
        if (payload?.message?.id) {
          dbObj.messages[payload.message.id] = {
            ...(dbObj.messages[payload.message.id] || {}),
            ...payload.message,
          };
          changed = true;
        }
        break;
      case 'delete_chat_message':
        if (payload?.messageId && dbObj.messages[payload.messageId]) {
          delete dbObj.messages[payload.messageId];
          changed = true;
        }
        break;
      case 'delete_chat_thread_for_user':
        if (payload?.chatId && payload?.userId && dbObj.chats[payload.chatId]) {
          const prev = Array.isArray(dbObj.chats[payload.chatId].deletedBy)
            ? dbObj.chats[payload.chatId].deletedBy
            : [];
          if (!prev.includes(payload.userId)) {
            dbObj.chats[payload.chatId].deletedBy = [...prev, payload.userId];
          }
          for (const mid of Object.keys(dbObj.messages)) {
            if (dbObj.messages[mid]?.chatId === payload.chatId) {
              const delFor = Array.isArray(dbObj.messages[mid].deletedFor)
                ? dbObj.messages[mid].deletedFor
                : [];
              if (!delFor.includes(payload.userId)) {
                dbObj.messages[mid].deletedFor = [...delFor, payload.userId];
              }
            }
          }
          changed = true;
        }
        break;
      case 'mark_chat_thread_read':
        if (payload?.chatId) {
          if (dbObj.chats[payload.chatId]) {
            dbObj.chats[payload.chatId].lastMessageRead = true;
          }
          for (const mid of Object.keys(dbObj.messages)) {
            if (dbObj.messages[mid]?.chatId === payload.chatId) {
              dbObj.messages[mid].read = true;
            }
          }
          changed = true;
        }
        break;
    }

    if (changed) {
      dbObj.updatedAt = Date.now();
      const jsonBlob = new Blob([JSON.stringify(dbObj)], { type: 'application/json' });
      await supabase.storage.from('app-files').upload('one-msu-live-db.json', jsonBlob, {
        contentType: 'application/json',
        upsert: true,
      });
    }
  } catch {
    // ignore fallback error
  }
}

function pushCloudMutation(action: string, payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return;

  void (async () => {
    let authToken = '';
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      authToken = sessionData?.session?.access_token || '';
    } catch {
      // ignore
    }
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    };
    let backendHandled = false;
    for (const origin of BACKEND_API_ORIGINS) {
      try {
        const res = await fetch(`${origin}/api/db/mutate`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ action, payload }),
        });
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          backendHandled = true;
          break;
        }
      } catch {
        // Try next backend origin
      }
    }
    if (!backendHandled) {
      await applyDirectSupabaseFallbackMutation(action, payload);
    }
  })();

  if (supabaseRealtimeChannel && isSupabaseChannelSubscribed) {
    supabaseRealtimeChannel
      .send({
        type: 'broadcast',
        event: 'mutation',
        payload: {
          action,
          payload,
          senderClientId: CLIENT_INSTANCE_ID,
        },
      })
      .catch(() => {});
  } else if (action !== 'upsert_presence') {
    pendingRealtimeBroadcastQueue.push({ action, payload });
  }
}

function applyIncomingRealtimeMutation(action: string, payload: any) {
  if (typeof window === 'undefined' || !action) return;
  if (action === 'connected') return;
  if (action === 'sync_all') {
    void syncFromBackendServer();
    return;
  }

  switch (action) {
    case 'upsert_presence': {
      const p = payload?.presence;
      if (p?.uid && !FAKE_SYNTHETIC_UIDS.has(p.uid) && p.uid !== ONE_OFFICIAL_UID) {
        const raw = safeReadJson<UserPresence[]>(STORAGE_KEYS.PRESENCE, []);
        const map = new Map<string, UserPresence>();
        raw.forEach((item) => {
          if (item?.uid && !FAKE_SYNTHETIC_UIDS.has(item.uid)) map.set(item.uid, item);
        });
        const prev = map.get(p.uid);
        map.set(p.uid, {
          ...prev,
          ...p,
          lastSeenMs: p.lastSeenMs || Date.now(),
          updatedAt: hydrateTimestamp(p.updatedAt || p.updatedAtMs),
        });
        safeWriteJson(STORAGE_KEYS.PRESENCE, Array.from(map.values()));
        notifyDbUpdated('presence');
      }
      break;
    }
    case 'upsert_user': {
      const u = payload?.user;
      const email = payload?.email;
      const targetUid = u?.uid ? SYNTHETIC_TO_REAL_UID_MAP[u.uid] || u.uid : '';
      if (targetUid && !FAKE_SYNTHETIC_UIDS.has(targetUid) && targetUid !== ONE_OFFICIAL_UID) {
        const raw = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
        const map = new Map<string, UserPublicProfile>();
        raw.forEach((item) => {
          if (item?.uid && !FAKE_SYNTHETIC_UIDS.has(item.uid)) map.set(item.uid, item);
        });
        const prev = map.get(targetUid);
        const mergedUser: UserPublicProfile = {
          ...prev,
          ...u,
          uid: targetUid,
          createdAt: hydrateTimestamp(u.createdAt || u.createdAtMs || prev?.createdAt),
          updatedAt: hydrateTimestamp(u.updatedAt || u.updatedAtMs || Date.now()),
        };
        map.set(targetUid, mergedUser);
        safeWriteJson(STORAGE_KEYS.USERS, Array.from(map.values()));
        try {
          window.localStorage.setItem(`one_msu_profile_${targetUid}`, JSON.stringify(mergedUser));
        } catch {
          // ignore
        }
        if (email) {
          const priv = safeReadJson<Record<string, string>>(STORAGE_KEYS.USERS_PRIVATE, {});
          priv[targetUid] = email;
          safeWriteJson(STORAGE_KEYS.USERS_PRIVATE, priv);
        }
        notifyDbUpdated('users');
        notifyDbUpdated('posts');
      }
      break;
    }
    case 'delete_user': {
      const uid = payload?.uid;
      if (uid) {
        const users = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
        safeWriteJson(
          STORAGE_KEYS.USERS,
          users.filter((u) => u.uid !== uid)
        );
        const pres = safeReadJson<UserPresence[]>(STORAGE_KEYS.PRESENCE, []);
        safeWriteJson(
          STORAGE_KEYS.PRESENCE,
          pres.filter((p) => p.uid !== uid)
        );
        notifyDbUpdated('users');
      }
      break;
    }
    case 'upsert_post': {
      const post = payload?.post;
      const del = new Set<string>(safeReadJson<string[]>('one_msu_db_v2_deleted_posts', []));
      if (post?.id && !FAKE_POST_IDS.has(post.id) && !del.has(post.id)) {
        const posts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
        const map = new Map<string, Post>();
        posts.forEach((p) => {
          if (p?.id && !FAKE_POST_IDS.has(p.id) && !del.has(p.id)) map.set(p.id, p);
        });
        map.set(post.id, {
          ...map.get(post.id),
          ...post,
        });
        safeWriteJson(STORAGE_KEYS.POSTS, Array.from(map.values()));
        notifyDbUpdated('posts');
      }
      break;
    }
    case 'update_post_fields': {
      const { postId, fields } = payload || {};
      const del = new Set<string>(safeReadJson<string[]>('one_msu_db_v2_deleted_posts', []));
      if (postId && fields && !del.has(postId)) {
        const posts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
        const updated = posts.map((p) =>
          p.id === postId ? { ...p, ...fields, updatedAt: Timestamp.now() } : p
        );
        safeWriteJson(STORAGE_KEYS.POSTS, updated);
        notifyDbUpdated('posts');
      }
      break;
    }
    case 'delete_post': {
      const postId = payload?.postId;
      if (postId) {
        const del = new Set<string>(safeReadJson<string[]>('one_msu_db_v2_deleted_posts', []));
        del.add(postId);
        safeWriteJson('one_msu_db_v2_deleted_posts', Array.from(del));
        const posts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
        safeWriteJson(
          STORAGE_KEYS.POSTS,
          posts.filter((p) => p.id !== postId)
        );
        const legacyCached = safeReadJson<Post[]>('one_msu_cached_posts_v1', []);
        if (legacyCached.length > 0) {
          safeWriteJson(
            'one_msu_cached_posts_v1',
            legacyCached.filter((p) => p.id !== postId)
          );
        }
        const comments = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
        safeWriteJson(
          STORAGE_KEYS.COMMENTS,
          comments.filter((c) => c.postId !== postId)
        );
        const reactions = safeReadJson<(Reaction & { id: string })[]>(STORAGE_KEYS.REACTIONS, []);
        safeWriteJson(
          STORAGE_KEYS.REACTIONS,
          reactions.filter((r) => r.postId !== postId)
        );
        const notifs = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
        safeWriteJson(
          STORAGE_KEYS.NOTIFICATIONS,
          notifs.filter((n) => n.targetId !== postId)
        );
        notifyDbUpdated('posts');
        notifyDbUpdated('comments');
      }
      break;
    }
    case 'upsert_comment': {
      const comment = payload?.comment;
      const delPosts = new Set<string>(safeReadJson<string[]>('one_msu_db_v2_deleted_posts', []));
      const delComments = new Set<string>(
        safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
      );
      if (
        comment?.id &&
        !FAKE_COMMENT_IDS.has(comment.id) &&
        !delComments.has(comment.id) &&
        !delPosts.has(comment.postId)
      ) {
        const all = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
        const map = new Map<string, Comment>();
        getDefaultRestoredComments().forEach((c) => {
          if (c?.id && !delComments.has(c.id) && !delPosts.has(c.postId)) map.set(c.id, c);
        });
        all.forEach((c) => {
          if (c?.id && !delComments.has(c.id) && !delPosts.has(c.postId)) map.set(c.id, c);
        });
        map.set(comment.id, comment);
        const nextComments = Array.from(map.values());
        safeWriteJson(STORAGE_KEYS.COMMENTS, nextComments);
        if (comment.postId) {
          const postCommentsCount =
            typeof payload?.commentsCount === 'number'
              ? payload.commentsCount
              : nextComments.filter((c) => c.postId === comment.postId).length;
          const posts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
          safeWriteJson(
            STORAGE_KEYS.POSTS,
            posts.map((p) =>
              p.id === comment.postId
                ? { ...p, commentsCount: postCommentsCount, updatedAt: Timestamp.now() }
                : p
            )
          );
        }
        notifyDbUpdated('comments');
        notifyDbUpdated('posts');
      }
      break;
    }
    case 'delete_comment': {
      const commentId = payload?.commentId;
      const postId = payload?.postId;
      if (commentId) {
        const delComments = new Set<string>(
          safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
        );
        delComments.add(commentId);
        safeWriteJson('one_msu_db_v2_deleted_comments', Array.from(delComments));
        const all = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
        const nextComments = all.filter((c) => c.id !== commentId);
        safeWriteJson(STORAGE_KEYS.COMMENTS, nextComments);
        if (postId) {
          const postCommentsCount =
            typeof payload?.commentsCount === 'number'
              ? payload.commentsCount
              : nextComments.filter((c) => c.postId === postId).length;
          const posts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
          safeWriteJson(
            STORAGE_KEYS.POSTS,
            posts.map((p) =>
              p.id === postId
                ? { ...p, commentsCount: postCommentsCount, updatedAt: Timestamp.now() }
                : p
            )
          );
        }
        notifyDbUpdated('comments');
        notifyDbUpdated('posts');
      }
      break;
    }
    case 'toggle_comment_like': {
      const { commentId, userId, liked, likesCount, likedBy } = payload || {};
      if (commentId && userId) {
        const canonicalUserId = remapAuthorIdIfNeeded(userId) || userId;
        const delComments = new Set<string>(
          safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
        );
        const all = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
        const map = new Map<string, Comment>();
        getDefaultRestoredComments().forEach((c) => {
          if (c?.id && !delComments.has(c.id)) map.set(c.id, c);
        });
        all.forEach((c) => {
          if (c?.id && !delComments.has(c.id)) map.set(c.id, c);
        });
        const target = map.get(commentId);
        if (target) {
          const prevLikedBy = Array.isArray(target.likedBy) ? target.likedBy : [];
          const nextLikedBy = Array.isArray(likedBy)
            ? likedBy
            : liked
            ? Array.from(new Set([...prevLikedBy, canonicalUserId]))
            : prevLikedBy.filter((id) => id !== canonicalUserId && id !== userId);
          const nextLikesCount =
            typeof likesCount === 'number' ? likesCount : nextLikedBy.length;
          map.set(commentId, {
            ...target,
            likesCount: nextLikesCount,
            likedBy: nextLikedBy,
            updatedAt: Timestamp.now(),
          });
          safeWriteJson(STORAGE_KEYS.COMMENTS, Array.from(map.values()));
          notifyDbUpdated('comments');
        }
      }
      break;
    }
    case 'toggle_reaction': {
      const { postId, userId, currentlyReacted, likesCount } = payload || {};
      if (postId && userId) {
        const canonicalUserId = remapAuthorIdIfNeeded(userId) || userId;
        const all = safeReadJson<(Reaction & { id: string })[]>(STORAGE_KEYS.REACTIONS, []);
        const id = `${postId}_${canonicalUserId}`;
        const next = currentlyReacted
          ? all.filter(
              (r) =>
                !(
                  r.postId === postId &&
                  (r.userId === userId || r.userId === canonicalUserId)
                )
            )
          : [
              ...all.filter(
                (r) =>
                  !(
                    r.postId === postId &&
                    (r.userId === userId || r.userId === canonicalUserId)
                  )
              ),
              {
                id,
                postId,
                userId: canonicalUserId,
                type: 'damay' as const,
                createdAt: Timestamp.now(),
              },
            ];
        safeWriteJson(STORAGE_KEYS.REACTIONS, next);
        if (typeof likesCount === 'number' && likesCount >= 0) {
          const posts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
          const updatedPosts = posts.map((p) =>
            p.id === postId ? { ...p, likesCount, updatedAt: Timestamp.now() } : p
          );
          safeWriteJson(STORAGE_KEYS.POSTS, updatedPosts);
        }
        notifyDbUpdated('reactions');
        notifyDbUpdated('posts');
      }
      break;
    }
    case 'upsert_chat_thread': {
      const thread = payload?.thread;
      if (thread?.id) {
        const all = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
        const map = new Map<string, ChatThread>();
        all.forEach((t) => {
          if (t?.id) map.set(t.id, t);
        });
        map.set(thread.id, { ...map.get(thread.id), ...thread });
        safeWriteJson(STORAGE_KEYS.CHATS, Array.from(map.values()));
        notifyDbUpdated('chats');
      }
      break;
    }
    case 'delete_chat_thread_for_user': {
      const { chatId, userId } = payload || {};
      if (chatId && userId) {
        const allChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
        const updatedChats = allChats.map((t) => {
          if (t.id === chatId) {
            const prev = Array.isArray(t.deletedBy) ? t.deletedBy : [];
            return prev.includes(userId) ? t : { ...t, deletedBy: [...prev, userId] };
          }
          return t;
        });
        safeWriteJson(STORAGE_KEYS.CHATS, updatedChats);

        const allMsgs = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
        const updatedMsgs = allMsgs.map((m) => {
          if (m.chatId === chatId) {
            const prev = Array.isArray(m.deletedFor) ? m.deletedFor : [];
            return prev.includes(userId) ? m : { ...m, deletedFor: [...prev, userId] };
          }
          return m;
        });
        safeWriteJson(STORAGE_KEYS.MESSAGES, updatedMsgs);

        notifyDbUpdated('chats');
        notifyDbUpdated('messages');
      }
      break;
    }
    case 'upsert_chat_message': {
      const message = payload?.message;
      if (message?.id) {
        const all = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
        const map = new Map<string, ChatMessage>();
        all.forEach((m) => {
          if (m?.id) map.set(m.id, m);
        });
        map.set(message.id, { ...map.get(message.id), ...message });
        safeWriteJson(STORAGE_KEYS.MESSAGES, Array.from(map.values()));

        if (message.chatId) {
          const allChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
          let chatsModified = false;
          const nextChats = allChats.map((t) => {
            if (t.id === message.chatId && Array.isArray(t.deletedBy) && t.deletedBy.length > 0) {
              const filtered = t.deletedBy.filter(
                (uid) => uid !== message.senderId && uid !== message.recipientId
              );
              if (filtered.length !== t.deletedBy.length) {
                chatsModified = true;
                return { ...t, deletedBy: filtered };
              }
            }
            return t;
          });
          if (chatsModified) {
            safeWriteJson(STORAGE_KEYS.CHATS, nextChats);
          }
        }

        notifyDbUpdated('messages');
        notifyDbUpdated('chats');
      }
      break;
    }
    case 'mark_chat_thread_read': {
      const { chatId, recipientId } = payload || {};
      if (chatId && recipientId) {
        const allMsgs = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
        const updatedMsgs = allMsgs.map((m) =>
          m.chatId === chatId && m.recipientId === recipientId && !m.read
            ? { ...m, read: true, readAt: Timestamp.now() }
            : m
        );
        safeWriteJson(STORAGE_KEYS.MESSAGES, updatedMsgs);

        const allChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
        const updatedChats = allChats.map((t) =>
          t.id === chatId && t.lastSenderId !== recipientId
            ? { ...t, lastMessageRead: true, lastMessageReadAt: Timestamp.now() }
            : t
        );
        safeWriteJson(STORAGE_KEYS.CHATS, updatedChats);

        notifyDbUpdated('messages');
        notifyDbUpdated('chats');
      }
      break;
    }
    case 'delete_chat_message': {
      const messageId = payload?.messageId;
      if (messageId) {
        const all = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
        safeWriteJson(
          STORAGE_KEYS.MESSAGES,
          all.filter((m) => m.id !== messageId)
        );
        notifyDbUpdated('messages');
      }
      break;
    }
    case 'upsert_notification': {
      const notification = payload?.notification;
      if (notification?.id) {
        const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
        const map = new Map<string, NotificationItem>();
        all.forEach((n) => {
          if (n?.id) map.set(n.id, n);
        });
        map.set(notification.id, { ...map.get(notification.id), ...notification });
        safeWriteJson(STORAGE_KEYS.NOTIFICATIONS, Array.from(map.values()));
        notifyDbUpdated('notifications');
      }
      break;
    }
    case 'mark_notification_read': {
      const notificationId = payload?.notificationId;
      if (notificationId) {
        const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
        const updated = all.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
        safeWriteJson(STORAGE_KEYS.NOTIFICATIONS, updated);
        notifyDbUpdated('notifications');
      }
      break;
    }
    case 'mark_all_notifications_read': {
      const recipientId = payload?.recipientId;
      if (recipientId) {
        const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
        const updated = all.map((n) => (n.recipientId === recipientId ? { ...n, read: true } : n));
        safeWriteJson(STORAGE_KEYS.NOTIFICATIONS, updated);
        notifyDbUpdated('notifications');
      }
      break;
    }
    case 'delete_notification': {
      const notificationId = payload?.notificationId;
      if (notificationId) {
        const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
        safeWriteJson(
          STORAGE_KEYS.NOTIFICATIONS,
          all.filter((n) => n.id !== notificationId)
        );
        notifyDbUpdated('notifications');
      }
      break;
    }
    case 'clear_all_notifications': {
      const recipientId = payload?.recipientId;
      if (recipientId) {
        const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
        safeWriteJson(
          STORAGE_KEYS.NOTIFICATIONS,
          all.filter((n) => n.recipientId !== recipientId)
        );
        notifyDbUpdated('notifications');
      }
      break;
    }
    case 'upsert_marketplace_listing': {
      const listing = payload?.listing;
      const deletedSet = new Set<string>(
        safeReadJson<string[]>('one_msu_db_v2_deleted_marketplace', [])
      );
      if (listing?.id && !isDemoOrFakeMarketplaceListing(listing) && !deletedSet.has(listing.id)) {
        const all = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
        const map = new Map<string, MarketplaceListing>();
        all.forEach((m) => {
          if (m?.id && !isDemoOrFakeMarketplaceListing(m) && !deletedSet.has(m.id)) {
            map.set(m.id, m);
          }
        });
        map.set(listing.id, {
          ...map.get(listing.id),
          ...listing,
        });
        safeWriteJson(STORAGE_KEYS.MARKETPLACE, Array.from(map.values()));
        notifyDbUpdated('marketplace');
      }
      void syncFromBackendServer(true);
      break;
    }
    case 'update_marketplace_listing_fields': {
      const { listingId, fields } = payload || {};
      if (listingId && fields) {
        const all = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
        const updated = all.map((m) =>
          m.id === listingId ? { ...m, ...fields, updatedAt: Timestamp.now() } : m
        );
        safeWriteJson(STORAGE_KEYS.MARKETPLACE, updated);
        notifyDbUpdated('marketplace');
      }
      void syncFromBackendServer(true);
      break;
    }
    case 'delete_marketplace_listing': {
      const listingId = payload?.listingId;
      if (listingId) {
        const del = new Set<string>(
          safeReadJson<string[]>('one_msu_db_v2_deleted_marketplace', [])
        );
        del.add(listingId);
        safeWriteJson('one_msu_db_v2_deleted_marketplace', Array.from(del));
        const all = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
        safeWriteJson(
          STORAGE_KEYS.MARKETPLACE,
          all.filter((m) => m.id !== listingId)
        );
        notifyDbUpdated('marketplace');
      }
      void syncFromBackendServer(true);
      break;
    }
    case 'upsert_suggestion':
    case 'update_suggestion_fields':
    case 'delete_suggestion':
    case 'upsert_report':
    case 'delete_report':
    case 'upsert_moderation_rule':
    case 'delete_moderation_rule':
    case 'save_platform_settings':
    case 'upsert_support_ticket':
    case 'update_support_ticket_fields':
    case 'delete_support_ticket':
    case 'broadcast_admin_post': {
      void syncFromBackendServer(true);
      break;
    }
  }
}

function connectServerEventStream(presenceInfo?: UserPresence) {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
  const uid = presenceInfo?.uid || activeSseUid || '';
  if (activeEventSource && activeSseUid === uid && activeEventSource.readyState !== EventSource.CLOSED) {
    return;
  }
  if (activeEventSource) {
    try {
      activeEventSource.close();
    } catch {
      // ignore
    }
    activeEventSource = null;
  }
  activeSseUid = uid;
  const params = new URLSearchParams();
  if (uid) params.set('uid', uid);
  if (presenceInfo?.nickname) params.set('nickname', presenceInfo.nickname);
  if (presenceInfo?.badge) params.set('badge', presenceInfo.badge);
  if (presenceInfo?.campus) params.set('campus', presenceInfo.campus);
  const isStaticEdgeHost =
    typeof window !== 'undefined' &&
    (window.location.hostname.includes('wasmer.app') ||
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('netlify.app'));
  const sseBaseOrigin = isStaticEdgeHost ? BACKEND_API_ORIGINS[1] || '' : '';
  const url = `${sseBaseOrigin}/api/db/events${params.toString() ? `?${params.toString()}` : ''}`;

  try {
    const es = new EventSource(url);
    activeEventSource = es;
    es.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed?.action) {
          applyIncomingRealtimeMutation(parsed.action, parsed.payload);
        }
      } catch {
        // ignore parse error
      }
    };
    es.onerror = () => {
      try {
        es.close();
      } catch {
        // ignore
      }
      if (activeEventSource === es) {
        activeEventSource = null;
        window.setTimeout(() => {
          connectServerEventStream(presenceInfo);
        }, 3000);
      }
    };
  } catch {
    // ignore SSE init error
  }
}

function connectSupabaseRealtimeChannel() {
  if (typeof window === 'undefined' || supabaseRealtimeChannel) return;
  try {
    const channel = supabase.channel('one_msu_live_realtime_v3', {
      config: {
        broadcast: { self: false },
      },
    });

    channel
      .on('broadcast', { event: 'mutation' }, ({ payload }) => {
        if (!payload || payload.senderClientId === CLIENT_INSTANCE_ID) return;
        applyIncomingRealtimeMutation(payload.action, payload.payload);
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        () => {
          void syncFromBackendServer();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'comments' },
        () => {
          void syncFromBackendServer();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'post_reactions' },
        () => {
          void syncFromBackendServer();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => {
          void syncFromBackendServer();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void syncFromBackendServer();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_messages' },
        () => {
          void syncFromBackendServer();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'suggestions' },
        () => {
          void syncFromBackendServer();
        }
      )
      .on('presence', { event: 'sync' }, () => {
        try {
          const state = channel.presenceState();
          const raw = safeReadJson<UserPresence[]>(STORAGE_KEYS.PRESENCE, []);
          const map = new Map<string, UserPresence>();
          raw.forEach((p) => {
            if (p?.uid && !FAKE_SYNTHETIC_UIDS.has(p.uid)) map.set(p.uid, p);
          });
          let changed = false;
          Object.values(state).forEach((presences: any) => {
            if (Array.isArray(presences)) {
              presences.forEach((p: any) => {
                if (p?.uid && !FAKE_SYNTHETIC_UIDS.has(p.uid) && p.uid !== ONE_OFFICIAL_UID) {
                  changed = true;
                  const prev = map.get(p.uid);
                  map.set(p.uid, {
                    ...prev,
                    uid: p.uid,
                    nickname: p.nickname || prev?.nickname || 'student',
                    photoURL: p.photoURL || prev?.photoURL || '',
                    badge: p.badge || prev?.badge || 'verified',
                    campus: p.campus || prev?.campus || 'MSU Main Campus - Marawi',
                    isOnline: true,
                    lastSeenMs: Date.now(),
                    visibility: 'edu_verified',
                    updatedAt: Timestamp.now(),
                  });
                }
              });
            }
          });
          if (changed) {
            safeWriteJson(STORAGE_KEYS.PRESENCE, Array.from(map.values()));
            notifyDbUpdated('presence');
          }
        } catch {
          // ignore
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          isSupabaseChannelSubscribed = true;
          while (pendingRealtimeBroadcastQueue.length > 0) {
            const item = pendingRealtimeBroadcastQueue.shift();
            if (item) {
              channel
                .send({
                  type: 'broadcast',
                  event: 'mutation',
                  payload: {
                    action: item.action,
                    payload: item.payload,
                    senderClientId: CLIENT_INSTANCE_ID,
                  },
                })
                .catch(() => {});
            }
          }
        }
      });

    supabaseRealtimeChannel = channel;
  } catch {
    // ignore channel error
  }
}

/**
 * Rehydrates serialized timestamp objects so `.toDate()`, `.toMillis()`, and `.seconds`
 * always work identically to Firestore `Timestamp` instances.
 */
export function hydrateTimestamp(val: unknown): Timestamp | null {
  if (!val) return null;
  if (val instanceof Timestamp) return val;
  if (typeof val === 'object' && val !== null) {
    const obj = val as {
      seconds?: number;
      nanoseconds?: number;
      _seconds?: number;
      _nanoseconds?: number;
      toDate?: () => Date;
    };
    if (typeof obj.seconds === 'number') {
      return new Timestamp(obj.seconds, typeof obj.nanoseconds === 'number' ? obj.nanoseconds : 0);
    }
    if (typeof obj._seconds === 'number') {
      return new Timestamp(
        obj._seconds,
        typeof obj._nanoseconds === 'number' ? obj._nanoseconds : 0
      );
    }
    if (typeof obj.toDate === 'function') {
      return Timestamp.fromDate(obj.toDate());
    }
  }
  if (typeof val === 'number' && val > 0) {
    return Timestamp.fromMillis(val);
  }
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) {
      return Timestamp.fromMillis(parsed);
    }
  }
  return Timestamp.now();
}

function makeTimestampMinutesAgo(minsAgo: number): Timestamp {
  return Timestamp.fromMillis(Date.now() - minsAgo * 60 * 1000);
}

const memoryStorageCache = new Map<string, unknown>();
const pendingStorageTimers = new Map<string, number>();

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  if (memoryStorageCache.has(key)) {
    return memoryStorageCache.get(key) as T;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    memoryStorageCache.set(key, parsed);
    return parsed;
  } catch {
    return fallback;
  }
}

function safeWriteJson<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  memoryStorageCache.set(key, value);
  const existingTimer = pendingStorageTimers.get(key);
  if (existingTimer !== undefined) {
    window.clearTimeout(existingTimer);
  }
  const timerId = window.setTimeout(() => {
    pendingStorageTimers.delete(key);
    try {
      window.localStorage.setItem(key, JSON.stringify(memoryStorageCache.get(key)));
    } catch {
      // Ignore storage quota errors
    }
  }, 600);
  pendingStorageTimers.set(key, timerId);
}

// ============================================================================
// REAL MSUan USERS SNAPSHOT FROM SUPABASE AUTH (529+ VERIFIED USERS)
// ============================================================================

let cachedDefaultRealUsers: UserPublicProfile[] | null = null;

export function getDefaultRestoredUsers(): UserPublicProfile[] {
  if (cachedDefaultRealUsers) return cachedDefaultRealUsers;
  const list: UserPublicProfile[] = (realUsersSnapshot.users || []).map((u) => ({
    uid: u.uid,
    nickname: u.nickname,
    nicknameUpdatedAt: u.nicknameUpdatedAt,
    googleDisplayName: u.googleDisplayName,
    photoURL: u.photoURL || '',
    emailDomain: u.emailDomain,
    campus: u.campus,
    bio: u.bio || '',
    defaultAnonymous: Boolean(u.defaultAnonymous),
    referralSource: u.referralSource || '',
    referralSubmittedAt: u.referralSubmittedAt || '',
    badge: (u.badge || 'verified') as UserBadge,
    role: u.role || (u.badge === 'developer' ? 'developer' : 'student'),
    accountStatus: u.accountStatus || 'active',
    isVerifiedStudent: u.isVerifiedStudent !== false,
    permissions: {
      canPost: true,
      canComment: true,
      canUploadFiles: true,
      canChat: true,
      canReport: true,
      isVerifiedStudent: u.isVerifiedStudent !== false,
    },
    createdAt: Timestamp.fromMillis(u.createdAtMs || Date.now() - 86400000),
    updatedAt: Timestamp.fromMillis(u.updatedAtMs || Date.now() - 3600000),
  }));
  cachedDefaultRealUsers = list;
  return list;
}

export function getDefaultRestoredPrivateEmails(): Record<string, string> {
  return {
    ...(realUsersSnapshot.emails || {}),
  };
}

const SAMPLE_PDF_DATA_URL = MSU_CALCULUS_GEC_REVIEWER_PDF_DATA_URL;

export function getDefaultRestoredPosts(): Post[] {
  return [
    {
      id: 'post_1790444154969_6u1vuv',
      authorId: '8b41df04-007d-475f-aa60-d72a400ebdee',
      authorNickname: 'clarkandrey.lantaya',
      authorDisplayName: 'Clark Andrey Lantaya',
      authorPhotoURL: '',
      authorDomain: 'msugensan.edu.ph',
      authorBadge: 'verified',
      isAnonymous: false,
      category: 'Campus Life',
      title: 'Looking for study buddy / coffee buddy around campus',
      content:
        'Sino gising pa at nagrereview ngayon? Looking for kasama mag-aral sa library or coffee shop near campus! Drop a comment or message me 👋 #CampusLife #StudyBuddy #MSUan',
      attachmentType: 'none',
      attachmentName: '',
      attachmentSize: 0,
      attachmentMime: '',
      attachmentDataUrl: '',
      likesCount: 11,
      commentsCount: 2,
      isPinned: false,
      isHidden: false,
      commentsLocked: false,
      reportsCount: 0,
      visibility: 'edu_verified',
      createdAt: Timestamp.fromMillis(1790444154969),
      updatedAt: Timestamp.fromMillis(1790444550042),
    },
    {
      id: 'post_1790441863513_2tbg97',
      authorId: '3a334642-01da-48a1-a537-0ae12b38f50d',
      authorNickname: 'ericamae.lapinig',
      authorDisplayName: 'ERICA MAE LAPINIG',
      authorPhotoURL: '',
      authorDomain: 'msugensan.edu.ph',
      authorBadge: 'verified',
      isAnonymous: false,
      category: 'Campus Life',
      title: 'Direct Chat & File Upload Feature Check',
      content:
        'Working na ba yung direct chat at pag-upload ng PDF reviewers dito sa wall? Testing from MSU GenSan! #MSUan #ONE',
      attachmentType: 'none',
      attachmentName: '',
      attachmentSize: 0,
      attachmentMime: '',
      attachmentDataUrl: '',
      likesCount: 8,
      commentsCount: 1,
      isPinned: false,
      isHidden: false,
      commentsLocked: false,
      reportsCount: 0,
      visibility: 'edu_verified',
      createdAt: Timestamp.fromMillis(1790441863513),
      updatedAt: Timestamp.fromMillis(1790442397555),
    },
  ];
}

export function getDefaultRestoredComments(): Comment[] {
  return [
    {
      id: 'cmt_1790444228750_nyued',
      postId: 'post_1790444154969_6u1vuv',
      authorId: '8b41df04-007d-475f-aa60-d72a400ebdee',
      authorNickname: 'clarkandrey.lantaya',
      authorDisplayName: 'Clark Andrey Lantaya',
      authorPhotoURL: '',
      authorBadge: 'verified',
      isAnonymous: false,
      content: 'Tara G! Nasa campus library lang kami nagrereview.',
      visibility: 'edu_verified',
      createdAt: Timestamp.fromMillis(1790444228750),
      updatedAt: Timestamp.fromMillis(1790444228750),
    },
    {
      id: 'cmt_1790444550042_ur0dn',
      postId: 'post_1790444154969_6u1vuv',
      authorId: '538a6246-5cc8-4c63-bbda-0507196f3d5d',
      authorNickname: 'xander',
      authorDisplayName: 'Xander James',
      authorPhotoURL:
        'https://lh3.googleusercontent.com/a/ACg8ocKfYn80pv4QKkGlvB5GrgaSnfrb_aG89nAHDUhUOxbiEuRa7tiM=s96-c',
      authorBadge: 'developer',
      isAnonymous: false,
      content: 'baka maging dating site to ah HAHAHA',
      replyToCommentId: 'cmt_1790444228750_nyued',
      replyToNickname: 'clarkandrey.lantaya',
      visibility: 'edu_verified',
      createdAt: Timestamp.fromMillis(1790444550042),
      updatedAt: Timestamp.fromMillis(1790444550042),
    },
    {
      id: 'cmt_1790442397555_r7nsu',
      postId: 'post_1790441863513_2tbg97',
      authorId: '538a6246-5cc8-4c63-bbda-0507196f3d5d',
      authorNickname: 'xander',
      authorDisplayName: 'Xander James',
      authorPhotoURL:
        'https://lh3.googleusercontent.com/a/ACg8ocKfYn80pv4QKkGlvB5GrgaSnfrb_aG89nAHDUhUOxbiEuRa7tiM=s96-c',
      authorBadge: 'developer',
      isAnonymous: false,
      content: 'currently working po',
      visibility: 'edu_verified',
      createdAt: Timestamp.fromMillis(1790442397555),
      updatedAt: Timestamp.fromMillis(1790442397555),
    },
  ];
}

export function getDefaultRestoredSuggestions(): Suggestion[] {
  return [
    {
      id: 'sug_college_channels',
      authorId: '616a4ee1-a750-46af-86c3-23e10727f7d1',
      authorNickname: 'athena.bangcola',
      authorPhotoURL:
        'https://lh3.googleusercontent.com/a/ACg8ocIx-prxeuJVQsz0f68IFQ8H8ttBLGfuPaBc3jxu0aQZ3zDx3wA=s96-c',
      authorBadge: 'verified',
      isAnonymous: false,
      category: 'Feature Request',
      title: 'Add Scholarship & Stipend Updates filter tag',
      content:
        'Would be super helpful to have a quick tag for scholarship announcements and stipend release updates across MSU campuses.',
      status: 'planned',
      upvotesCount: 18,
      adminReply: 'Great idea! Added Scholarship & Stipend to Trending Topics semantic detection.',
      adminReplyBy: 'xander',
      adminReplyBadge: 'developer',
      adminRepliedAt: makeTimestampMinutesAgo(180),
      visibility: 'edu_verified',
      createdAt: makeTimestampMinutesAgo(480),
      updatedAt: makeTimestampMinutesAgo(180),
    },
    {
      id: 'sug_dark_mode_sync',
      authorId: 'd89b4c02-cf71-4b46-963e-460e75c37674',
      authorNickname: 'johnlloyd.molina',
      authorPhotoURL:
        'https://lh3.googleusercontent.com/a/ACg8ocJ2brVcT--2YQAztI-O7RwQqlexXDTDpvuk2HuDqactt2_gwM8=s96-c',
      authorBadge: 'verified',
      isAnonymous: false,
      category: 'App Improvement',
      title: 'Preview PDF reviewers directly inside the feed modal',
      content:
        'Allow students to read uploaded PDF study reviewers right inside the post card modal before downloading.',
      status: 'completed',
      upvotesCount: 22,
      adminReply: 'Completed! Built-in PDF & Document Viewer Modal is live on all post attachments.',
      adminReplyBy: 'xander',
      adminReplyBadge: 'developer',
      adminRepliedAt: makeTimestampMinutesAgo(240),
      visibility: 'edu_verified',
      createdAt: makeTimestampMinutesAgo(600),
      updatedAt: makeTimestampMinutesAgo(240),
    },
  ];
}

export function getDefaultRestoredModerationRules(): ModerationRule[] {
  return [
    {
      id: 'rule_zero_doxxing',
      title: 'No Doxxing or Sharing Private Contact Info',
      description:
        'Protects student privacy by prohibiting non-consensual posting of private phone numbers, room numbers, or personal emails.',
      category: 'Harassment & Conduct',
      severity: 'block',
      keywords: 'doxx, leak number, private address',
      isActive: true,
      createdBy: 'xander',
      visibility: 'edu_verified',
      createdAt: makeTimestampMinutesAgo(2000),
      updatedAt: makeTimestampMinutesAgo(2000),
    },
    {
      id: 'rule_respectful_discourse',
      title: 'Respectful MSUan Community Discourse',
      description:
        'Healthy academic rants are welcome, but targeted bullying or hate speech against fellow students is moderated.',
      category: 'Harassment & Conduct',
      severity: 'warn',
      keywords: 'hate speech, bully',
      isActive: true,
      createdBy: 'xander',
      visibility: 'edu_verified',
      createdAt: makeTimestampMinutesAgo(1800),
      updatedAt: makeTimestampMinutesAgo(1800),
    },
  ];
}

export function getDefaultRestoredMarketplaceListings(): MarketplaceListing[] {
  return [];
}

// ============================================================================
// LOCAL & CLOUD PERSISTENT DATABASE ACCESSORS & MUTATORS
// ============================================================================

let isDbInitializedInMemory = false;
let isPollingStarted = false;

const REAL_UID_BY_NICKNAME = new Map<string, string>();
(realUsersSnapshot.users || []).forEach((u) => {
  if (u?.uid && u?.nickname) {
    REAL_UID_BY_NICKNAME.set(u.nickname.trim().toLowerCase(), u.uid);
  }
});

function remapAuthorIdIfNeeded(uid: string, authorNickname?: string): string {
  if (!uid) return uid;
  if (SYNTHETIC_TO_REAL_UID_MAP[uid]) {
    return SYNTHETIC_TO_REAL_UID_MAP[uid];
  }
  if (authorNickname && authorNickname !== 'Anonymous Student') {
    const byNick = REAL_UID_BY_NICKNAME.get(authorNickname.trim().toLowerCase());
    if (byNick) return byNick;
  }
  return uid;
}

export function ensureLocalDatabaseInitialized(): void {
  if (typeof window === 'undefined') return;
  if (!isDbInitializedInMemory) {
    isDbInitializedInMemory = true;

    // Clean up legacy fake keys from localStorage
    FAKE_SYNTHETIC_UIDS.forEach((fakeUid) => {
      try {
        window.localStorage.removeItem(`one_msu_profile_${fakeUid}`);
      } catch {
        // ignore
      }
    });

    try {
      const savedRel = window.localStorage.getItem(RELEASE_VERSION_STORAGE_KEY);
      if (savedRel !== APP_RELEASE_VERSION) {
        window.localStorage.removeItem('one_msu_cached_posts_v1');
        window.localStorage.removeItem(STORAGE_KEYS.POSTS);
        window.localStorage.removeItem(STORAGE_KEYS.COMMENTS);
        window.localStorage.removeItem(STORAGE_KEYS.MARKETPLACE);
        memoryStorageCache.delete('one_msu_cached_posts_v1');
        memoryStorageCache.delete(STORAGE_KEYS.POSTS);
        memoryStorageCache.delete(STORAGE_KEYS.COMMENTS);
        memoryStorageCache.delete(STORAGE_KEYS.MARKETPLACE);
      }
    } catch {
      // ignore
    }

    const defaults = getDefaultRestoredUsers();
    const existingV3Users = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
    const legacyV2Users = safeReadJson<UserPublicProfile[]>('one_msu_db_v2_users', []);

    const usersMap = new Map<string, UserPublicProfile>();
    defaults.forEach((u) => usersMap.set(u.uid, u));

    // Migrate any real (non-fake) user edits from v2 or v3
    [...legacyV2Users, ...existingV3Users].forEach((u) => {
      if (!u?.uid) return;
      if (FAKE_SYNTHETIC_UIDS.has(u.uid)) {
        const realUid = SYNTHETIC_TO_REAL_UID_MAP[u.uid];
        if (realUid && usersMap.has(realUid)) {
          const base = usersMap.get(realUid)!;
          usersMap.set(realUid, {
            ...base,
            referralSource: u.referralSource || base.referralSource,
            referralSubmittedAt: u.referralSubmittedAt || base.referralSubmittedAt,
          });
        }
        return;
      }
      if (u.uid === ONE_OFFICIAL_UID) return;
      const base = usersMap.get(u.uid);
      const isCamarinStudent =
        u.uid === '4ae58a7b-5104-4479-8667-ed9e465ba447' ||
        u.nickname === 'camarin.xn839';
      const isXanderDev = u.uid === '538a6246-5cc8-4c63-bbda-0507196f3d5d';
      const resolvedNick =
        u.nickname && u.nickname !== 'student'
          ? u.nickname
          : base?.nickname && base.nickname !== 'student'
          ? base.nickname
          : isCamarinStudent
          ? 'camarin.xn839'
          : isXanderDev
          ? 'xander'
          : u.nickname || 'student';
      usersMap.set(u.uid, {
        ...base,
        ...u,
        nickname: resolvedNick,
        badge: isCamarinStudent
          ? 'verified'
          : isXanderDev
          ? 'developer'
          : u.badge || base?.badge || 'verified',
        role: isCamarinStudent
          ? 'student'
          : isXanderDev
          ? 'developer'
          : u.role || base?.role || 'student',
        photoURL: u.photoURL || base?.photoURL || '',
        googleDisplayName:
          u.googleDisplayName && u.googleDisplayName !== 'student'
            ? u.googleDisplayName
            : base?.googleDisplayName ||
              (isCamarinStudent
                ? 'Xander James Camarin'
                : isXanderDev
                ? 'Xander James'
                : resolvedNick),
        campus: u.campus || base?.campus || 'MSU Main Campus - Marawi',
      });
    });

    const activeUsersList = Array.from(usersMap.values());
    safeWriteJson(STORAGE_KEYS.USERS, activeUsersList);

    const existingPriv = safeReadJson<Record<string, string>>(STORAGE_KEYS.USERS_PRIVATE, {});
    const mergedPriv: Record<string, string> = {
      ...getDefaultRestoredPrivateEmails(),
    };
    Object.entries(existingPriv).forEach(([uid, email]) => {
      if (!FAKE_SYNTHETIC_UIDS.has(uid) && email) {
        mergedPriv[uid] = email;
      }
    });
    safeWriteJson(STORAGE_KEYS.USERS_PRIVATE, mergedPriv);

    // Restore default + existing posts without dropping user content
    const deletedPostIds = new Set<string>(
      safeReadJson<string[]>('one_msu_db_v2_deleted_posts', [])
    );
    FAKE_POST_IDS.forEach((id) => deletedPostIds.add(id));
    safeWriteJson('one_msu_db_v2_deleted_posts', Array.from(deletedPostIds));

    const existingPosts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
    const mergedPostsMap = new Map<string, Post>();

    getDefaultRestoredPosts().forEach((p) => {
      if (!deletedPostIds.has(p.id) && !FAKE_POST_IDS.has(p.id)) {
        mergedPostsMap.set(p.id, p);
      }
    });

    existingPosts.forEach((p) => {
      if (!p?.id || FAKE_POST_IDS.has(p.id) || deletedPostIds.has(p.id)) return;
      const realAuthorId = remapAuthorIdIfNeeded(p.authorId, p.authorNickname);
      const realUser = usersMap.get(realAuthorId);
      mergedPostsMap.set(p.id, {
        ...p,
        authorId: realAuthorId,
        authorNickname: p.isAnonymous
          ? 'Anonymous Student'
          : realUser?.nickname || p.authorNickname,
        authorDisplayName: p.isAnonymous
          ? 'Anonymous Student'
          : realUser?.googleDisplayName || p.authorDisplayName,
        authorPhotoURL: p.isAnonymous ? '' : realUser?.photoURL || p.authorPhotoURL || '',
      });
    });
    safeWriteJson(STORAGE_KEYS.POSTS, Array.from(mergedPostsMap.values()));

    // Restore default + existing comments
    const deletedCommentIds = new Set<string>(
      safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
    );
    FAKE_COMMENT_IDS.forEach((id) => deletedCommentIds.add(id));
    safeWriteJson('one_msu_db_v2_deleted_comments', Array.from(deletedCommentIds));
    const existingComments = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
    const commentsMap = new Map<string, Comment>();
    getDefaultRestoredComments().forEach((c) => {
      if (!deletedPostIds.has(c.postId) && !deletedCommentIds.has(c.id)) {
        commentsMap.set(c.id, c);
      }
    });
    existingComments.forEach((c) => {
      if (
        !c?.id ||
        FAKE_COMMENT_IDS.has(c.id) ||
        deletedPostIds.has(c.postId) ||
        deletedCommentIds.has(c.id)
      ) {
        return;
      }
      const realAuthorId = remapAuthorIdIfNeeded(c.authorId, c.authorNickname);
      commentsMap.set(c.id, { ...c, authorId: realAuthorId });
    });
    safeWriteJson(STORAGE_KEYS.COMMENTS, Array.from(commentsMap.values()));

    // Restore default + existing suggestions
    const existingSuggestions = safeReadJson<Suggestion[]>(STORAGE_KEYS.SUGGESTIONS, []);
    const suggestionsMap = new Map<string, Suggestion>();
    getDefaultRestoredSuggestions().forEach((s) => suggestionsMap.set(s.id, s));
    existingSuggestions.forEach((s) => {
      if (!s?.id || FAKE_SUGGESTION_IDS.has(s.id)) return;
      suggestionsMap.set(s.id, {
        ...s,
        authorId: remapAuthorIdIfNeeded(s.authorId, s.authorNickname),
      });
    });
    safeWriteJson(STORAGE_KEYS.SUGGESTIONS, Array.from(suggestionsMap.values()));

    // Moderation rules
    const existingRules = safeReadJson<ModerationRule[]>(STORAGE_KEYS.MODERATION_RULES, []);
    const rulesMap = new Map<string, ModerationRule>();
    getDefaultRestoredModerationRules().forEach((r) => rulesMap.set(r.id, r));
    existingRules.forEach((r) => {
      if (r?.id) rulesMap.set(r.id, r);
    });
    safeWriteJson(STORAGE_KEYS.MODERATION_RULES, Array.from(rulesMap.values()));

    // Marketplace listings
    const deletedMktIds = new Set<string>(
      safeReadJson<string[]>('one_msu_db_v2_deleted_marketplace', [])
    );
    FAKE_MARKETPLACE_IDS.forEach((id) => deletedMktIds.add(id));
    safeWriteJson('one_msu_db_v2_deleted_marketplace', Array.from(deletedMktIds));
    const existingMkt = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
    const mktMap = new Map<string, MarketplaceListing>();
    existingMkt.forEach((m) => {
      if (isDemoOrFakeMarketplaceListing(m) || deletedMktIds.has(m.id)) return;
      mktMap.set(m.id, {
        ...m,
        authorId: remapAuthorIdIfNeeded(m.authorId, m.authorNickname),
      });
    });
    safeWriteJson(STORAGE_KEYS.MARKETPLACE, Array.from(mktMap.values()));

    // Build real presence records from real users' last sign-in timestamps
    const existingPresence = safeReadJson<UserPresence[]>(STORAGE_KEYS.PRESENCE, []);
    const presenceMap = new Map<string, UserPresence>();
    existingPresence.forEach((p) => {
      if (p?.uid && p.uid !== ONE_OFFICIAL_UID && !FAKE_SYNTHETIC_UIDS.has(p.uid)) {
        presenceMap.set(p.uid, p);
      }
    });

    const snapshotUpdatedMap = new Map<string, number>();
    (realUsersSnapshot.users || []).forEach((su) => {
      snapshotUpdatedMap.set(su.uid, su.updatedAtMs || su.createdAtMs || 0);
    });

    activeUsersList.forEach((u) => {
      if (!u.uid || u.uid === ONE_OFFICIAL_UID || FAKE_SYNTHETIC_UIDS.has(u.uid)) return;
      const prev = presenceMap.get(u.uid);
      const snapLastSeen = snapshotUpdatedMap.get(u.uid) || 0;
      const lastSeenMs = Math.max(prev?.lastSeenMs || 0, snapLastSeen);
      const isOnline =
        Boolean(prev?.isOnline && Date.now() - (prev?.lastSeenMs || 0) < 120000) ||
        Date.now() - lastSeenMs < 15 * 60 * 1000;
      presenceMap.set(u.uid, {
        uid: u.uid,
        nickname: u.nickname,
        photoURL: u.photoURL || prev?.photoURL || '',
        badge: u.badge || prev?.badge || 'verified',
        campus: u.campus || prev?.campus || 'MSU Main Campus - Marawi',
        isOnline,
        lastSeenMs,
        visibility: 'edu_verified',
        updatedAt: hydrateTimestamp(u.updatedAt) || Timestamp.now(),
      });
    });
    safeWriteJson(STORAGE_KEYS.PRESENCE, Array.from(presenceMap.values()));
    safeWriteJson(STORAGE_KEYS.INITIALIZED, true);
    try {
      window.localStorage.setItem(RELEASE_VERSION_STORAGE_KEY, APP_RELEASE_VERSION);
    } catch {
      // ignore
    }
  }

  if (!isPollingStarted) {
    isPollingStarted = true;
    connectServerEventStream();
    connectSupabaseRealtimeChannel();
    void syncFromBackendServer(true);
    window.setInterval(() => {
      void syncFromBackendServer(false);
    }, 12000);
    window.addEventListener('focus', () => {
      void syncFromBackendServer(false);
    });
    window.addEventListener('online', () => {
      void syncFromBackendServer(true);
    });
    window.addEventListener('pageshow', () => {
      void syncFromBackendServer(false);
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          void syncFromBackendServer(false);
        }
      });
    }
  }
}

let isSyncingFromBackend = false;
let lastBackendSyncMs = 0;
const pushedMissingIds = new Set<string>();

function toRecordArray<T>(val: unknown): T[] {
  if (!val) return [];
  if (Array.isArray(val)) return val as T[];
  if (typeof val === 'object') return Object.values(val as Record<string, T>);
  return [];
}

async function fetchLatestCloudStatePayload(): Promise<any | null> {
  for (const origin of BACKEND_API_ORIGINS) {
    try {
      const res = await fetch(`${origin}/api/db/state`, { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        return await res.json();
      }
    } catch {
      // Try next origin
    }
  }

  try {
    const pubRes = await fetch(`${PUBLIC_LIVE_DB_STORAGE_URL}?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (pubRes.ok) {
      return await pubRes.json();
    }
  } catch {
    // Fallback failed
  }

  return null;
}

export async function syncFromBackendServer(force = false): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (isSyncingFromBackend) return false;
  if (!force && Date.now() - lastBackendSyncMs < 2000) return false;
  isSyncingFromBackend = true;
  lastBackendSyncMs = Date.now();
  try {
    const data = await fetchLatestCloudStatePayload();
    if (!data || typeof data !== 'object') return false;

    const incomingUsers = toRecordArray<any>(data.users);
    if (incomingUsers.length > 0) {
      const localUsers = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
      const map = new Map<string, UserPublicProfile>();
      getDefaultRestoredUsers().forEach((u) => {
        if (u?.uid && !FAKE_SYNTHETIC_UIDS.has(u.uid)) map.set(u.uid, u);
      });
      localUsers.forEach((u) => {
        if (u?.uid && !FAKE_SYNTHETIC_UIDS.has(u.uid) && u.uid !== ONE_OFFICIAL_UID) {
          map.set(u.uid, u);
        }
      });
      incomingUsers.forEach((u: any) => {
        if (!u?.uid || FAKE_SYNTHETIC_UIDS.has(u.uid) || u.uid === ONE_OFFICIAL_UID) return;
        const prev = map.get(u.uid);
        const prevUpdatedMs =
          (prev as any)?.updatedAtMs || hydrateTimestamp(prev?.updatedAt)?.toMillis() || 0;
        const incomingUpdatedMs =
          Number(u.updatedAtMs || 0) || hydrateTimestamp(u.updatedAt)?.toMillis() || 0;
        const isLocalNewer = prev && prevUpdatedMs > incomingUpdatedMs + 1000;

        const isCamarinStudent =
          u.uid === '4ae58a7b-5104-4479-8667-ed9e465ba447' ||
          u.nickname === 'camarin.xn839';
        const isXanderDev = u.uid === '538a6246-5cc8-4c63-bbda-0507196f3d5d';

        const source = isLocalNewer ? { ...u, ...prev } : { ...prev, ...u };
        const resolvedNick =
          source.nickname && source.nickname !== 'student'
            ? source.nickname
            : prev?.nickname && prev.nickname !== 'student'
            ? prev.nickname
            : isCamarinStudent
            ? 'camarin.xn839'
            : isXanderDev
            ? 'xander'
            : source.nickname || 'student';

        const mergedUser: UserPublicProfile = {
          ...source,
          uid: u.uid,
          nickname: resolvedNick,
          googleDisplayName:
            source.googleDisplayName && source.googleDisplayName !== 'student'
              ? source.googleDisplayName
              : isCamarinStudent
              ? 'Xander James Camarin'
              : isXanderDev
              ? 'Xander James'
              : resolvedNick,
          photoURL: source.photoURL || prev?.photoURL || '',
          badge: isCamarinStudent
            ? 'verified'
            : isXanderDev
            ? 'developer'
            : source.badge || prev?.badge || 'verified',
          role: isCamarinStudent
            ? 'student'
            : isXanderDev
            ? 'developer'
            : source.role || prev?.role || 'student',
          createdAt: u.createdAtMs
            ? Timestamp.fromMillis(u.createdAtMs)
            : hydrateTimestamp(source.createdAt || prev?.createdAt),
          updatedAt: Timestamp.fromMillis(Math.max(prevUpdatedMs, incomingUpdatedMs, 1)),
        };
        map.set(u.uid, mergedUser);

        if (isLocalNewer && !pushedMissingIds.has(`usr_sync_${u.uid}_${prevUpdatedMs}`)) {
          pushedMissingIds.add(`usr_sync_${u.uid}_${prevUpdatedMs}`);
          const privMap = safeReadJson<Record<string, string>>(STORAGE_KEYS.USERS_PRIVATE, {});
          pushCloudMutation('upsert_user', {
            user: mergedUser,
            email: privMap[u.uid] || data.usersPrivate?.[u.uid],
          });
        } else if (!isLocalNewer) {
          try {
            if (window.localStorage.getItem(`one_msu_profile_${u.uid}`)) {
              window.localStorage.setItem(
                `one_msu_profile_${u.uid}`,
                JSON.stringify(mergedUser)
              );
            }
          } catch {
            // ignore
          }
        }
      });
      safeWriteJson(STORAGE_KEYS.USERS, Array.from(map.values()));
    }

    if (data.usersPrivate && typeof data.usersPrivate === 'object') {
      const priv = safeReadJson<Record<string, string>>(STORAGE_KEYS.USERS_PRIVATE, {});
      safeWriteJson(STORAGE_KEYS.USERS_PRIVATE, {
        ...getDefaultRestoredPrivateEmails(),
        ...priv,
        ...data.usersPrivate,
      });
    }

    const incomingPresence = toRecordArray<any>(data.presence);
    if (incomingPresence.length > 0) {
      const localPres = safeReadJson<UserPresence[]>(STORAGE_KEYS.PRESENCE, []);
      const pMap = new Map<string, UserPresence>();
      localPres.forEach((p) => {
        if (p?.uid && !FAKE_SYNTHETIC_UIDS.has(p.uid) && p.uid !== ONE_OFFICIAL_UID) {
          pMap.set(p.uid, p);
        }
      });
      incomingPresence.forEach((p: any) => {
        if (!p?.uid || FAKE_SYNTHETIC_UIDS.has(p.uid) || p.uid === ONE_OFFICIAL_UID) return;
        const prev = pMap.get(p.uid);
        const cloudLastSeen = typeof p.lastSeenMs === 'number' ? p.lastSeenMs : 0;
        const localLastSeen = prev?.lastSeenMs || 0;
        const bestLastSeen = Math.max(cloudLastSeen, localLastSeen);
        pMap.set(p.uid, {
          ...prev,
          ...p,
          lastSeenMs: bestLastSeen,
          isOnline:
            Boolean(p.isOnline && Date.now() - cloudLastSeen < 120000) ||
            Boolean(prev?.isOnline && Date.now() - localLastSeen < 120000),
          updatedAt: p.updatedAtMs
            ? Timestamp.fromMillis(p.updatedAtMs)
            : hydrateTimestamp(p.updatedAt || prev?.updatedAt),
        });
      });
      safeWriteJson(STORAGE_KEYS.PRESENCE, Array.from(pMap.values()));
    }

    if (Array.isArray(data.deletedPostIds)) {
      const localDel = new Set<string>(
        safeReadJson<string[]>('one_msu_db_v2_deleted_posts', [])
      );
      data.deletedPostIds.forEach((id: string) => localDel.add(id));
      FAKE_POST_IDS.forEach((id: string) => localDel.add(id));
      safeWriteJson('one_msu_db_v2_deleted_posts', Array.from(localDel));
    }

    if (Array.isArray(data.deletedCommentIds)) {
      const localDelComments = new Set<string>(
        safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
      );
      data.deletedCommentIds.forEach((id: string) => localDelComments.add(id));
      FAKE_COMMENT_IDS.forEach((id: string) => localDelComments.add(id));
      safeWriteJson('one_msu_db_v2_deleted_comments', Array.from(localDelComments));
    }

    const deletedSet = new Set<string>(
      safeReadJson<string[]>('one_msu_db_v2_deleted_posts', [])
    );
    FAKE_POST_IDS.forEach((id) => deletedSet.add(id));
    const deletedCommentSet = new Set<string>(
      safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
    );
    FAKE_COMMENT_IDS.forEach((id) => deletedCommentSet.add(id));

    if (data.posts) {
      const incomingPosts = toRecordArray<Post>(data.posts);
      const localPosts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
      const serverPostIds = new Set<string>(incomingPosts.map((p: Post) => p?.id).filter(Boolean));
      const postMap = new Map<string, Post>();
      getDefaultRestoredPosts().forEach((p) => {
        if (p?.id && !deletedSet.has(p.id) && !FAKE_POST_IDS.has(p.id)) {
          postMap.set(p.id, p);
        }
      });
      localPosts.forEach((p) => {
        if (p?.id && !FAKE_POST_IDS.has(p.id) && !deletedSet.has(p.id)) {
          const realAuthorId = remapAuthorIdIfNeeded(p.authorId, p.authorNickname);
          const hydratedPost = { ...p, authorId: realAuthorId };
          const postCreatedMs = hydrateTimestamp(p.createdAt)?.toMillis() || 0;
          const isVeryRecentLocalPost = Date.now() - postCreatedMs < 60000;
          if (serverPostIds.has(p.id) || isVeryRecentLocalPost) {
            postMap.set(p.id, hydratedPost);
          }
          if (
            !serverPostIds.has(p.id) &&
            isVeryRecentLocalPost &&
            !pushedMissingIds.has(`post_${p.id}`)
          ) {
            pushedMissingIds.add(`post_${p.id}`);
            pushCloudMutation('upsert_post', { post: hydratedPost });
          }
        }
      });
      incomingPosts.forEach((p: Post) => {
        if (p?.id && !FAKE_POST_IDS.has(p.id) && !deletedSet.has(p.id)) {
          const realAuthorId = remapAuthorIdIfNeeded(p.authorId, p.authorNickname);
          const prevLocal = postMap.get(p.id);
          const recentMut = recentPostFieldMutations.get(p.id);
          const isRecentMutActive =
            recentMut && Date.now() - recentMut.timestampMs < 120000;
          const prevUpdatedMs =
            (prevLocal as any)?.updatedAtMs ||
            hydrateTimestamp(prevLocal?.updatedAt)?.toMillis() ||
            0;
          const incomingUpdatedMs =
            (p as any)?.updatedAtMs || hydrateTimestamp(p.updatedAt)?.toMillis() || 0;
          const isLocalNewer = prevLocal && prevUpdatedMs > incomingUpdatedMs + 1000;

          postMap.set(p.id, {
            ...prevLocal,
            ...p,
            ...(isLocalNewer && prevLocal
              ? {
                  likesCount: prevLocal.likesCount,
                  commentsCount: prevLocal.commentsCount,
                  updatedAt: prevLocal.updatedAt,
                }
              : {}),
            ...(isRecentMutActive ? recentMut.fields : {}),
            authorId: realAuthorId,
          });
        }
      });
      safeWriteJson(STORAGE_KEYS.POSTS, Array.from(postMap.values()));
    }

    if (data.comments) {
      const incomingComments = toRecordArray<Comment>(data.comments);
      const localComments = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
      const serverCommentIds = new Set<string>(
        incomingComments.map((c: Comment) => c?.id).filter(Boolean)
      );
      const validPostIds = new Set<string>(
        safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []).map((p) => p?.id).filter(Boolean)
      );
      const cMap = new Map<string, Comment>();
      getDefaultRestoredComments().forEach((c) => {
        if (
          c?.id &&
          !FAKE_COMMENT_IDS.has(c.id) &&
          !deletedSet.has(c.postId) &&
          !deletedCommentSet.has(c.id) &&
          validPostIds.has(c.postId)
        ) {
          cMap.set(c.id, c);
        }
      });
      localComments.forEach((c) => {
        if (
          c?.id &&
          !FAKE_COMMENT_IDS.has(c.id) &&
          !deletedSet.has(c.postId) &&
          !deletedCommentSet.has(c.id) &&
          validPostIds.has(c.postId)
        ) {
          const realAuthorId = remapAuthorIdIfNeeded(c.authorId, c.authorNickname);
          const hydratedComment = { ...c, authorId: realAuthorId };
          const cmtCreatedMs = hydrateTimestamp(c.createdAt)?.toMillis() || 0;
          const isVeryRecentLocalComment = Date.now() - cmtCreatedMs < 60000;
          if (serverCommentIds.has(c.id) || isVeryRecentLocalComment) {
            cMap.set(c.id, hydratedComment);
          }
          if (
            !serverCommentIds.has(c.id) &&
            isVeryRecentLocalComment &&
            !pushedMissingIds.has(`cmt_${c.id}`)
          ) {
            pushedMissingIds.add(`cmt_${c.id}`);
            pushCloudMutation('upsert_comment', { comment: hydratedComment });
          }
        }
      });
      incomingComments.forEach((c: Comment) => {
        if (
          c?.id &&
          !FAKE_COMMENT_IDS.has(c.id) &&
          !deletedSet.has(c.postId) &&
          !deletedCommentSet.has(c.id)
        ) {
          const realAuthorId = remapAuthorIdIfNeeded(c.authorId, c.authorNickname);
          const prevCmt = cMap.get(c.id);
          const prevLikedBy = Array.isArray(prevCmt?.likedBy) ? prevCmt!.likedBy! : [];
          const incomingLikedBy = Array.isArray(c.likedBy) ? c.likedBy : [];
          const mergedLikedBy =
            incomingLikedBy.length > 0 || prevLikedBy.length === 0
              ? incomingLikedBy
              : prevLikedBy;
          const mergedLikesCount = Math.max(
            c.likesCount || 0,
            prevCmt?.likesCount || 0,
            mergedLikedBy.length
          );
          cMap.set(c.id, {
            ...prevCmt,
            ...c,
            authorId: realAuthorId,
            likedBy: mergedLikedBy,
            likesCount: mergedLikesCount,
          });
        }
      });
      safeWriteJson(STORAGE_KEYS.COMMENTS, Array.from(cMap.values()));
    }

    if (data.suggestions) {
      const incomingSuggestions = toRecordArray<Suggestion>(data.suggestions);
      const localSugs = safeReadJson<Suggestion[]>(STORAGE_KEYS.SUGGESTIONS, []);
      const serverSugIds = new Set<string>(
        incomingSuggestions.map((s: Suggestion) => s?.id).filter(Boolean)
      );
      const sMap = new Map<string, Suggestion>();
      getDefaultRestoredSuggestions().forEach((s) => {
        if (s?.id) sMap.set(s.id, s);
      });
      localSugs.forEach((s) => {
        if (s?.id && !FAKE_SUGGESTION_IDS.has(s.id)) {
          const realAuthorId = remapAuthorIdIfNeeded(s.authorId, s.authorNickname);
          const hydratedSug = { ...s, authorId: realAuthorId };
          sMap.set(s.id, hydratedSug);
          if (!serverSugIds.has(s.id) && !pushedMissingIds.has(`sug_${s.id}`)) {
            pushedMissingIds.add(`sug_${s.id}`);
            pushCloudMutation('upsert_suggestion', { suggestion: hydratedSug });
          }
        }
      });
      incomingSuggestions.forEach((s: Suggestion) => {
        if (s?.id && !FAKE_SUGGESTION_IDS.has(s.id)) sMap.set(s.id, s);
      });
      safeWriteJson(STORAGE_KEYS.SUGGESTIONS, Array.from(sMap.values()));
    }

    const readChatIds = new Set<string>(
      safeReadJson<string[]>('one_msu_read_chat_ids_v1', [])
    );

    const incomingChats = toRecordArray<ChatThread>(data.chats);
    if (incomingChats.length > 0) {
      const localChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
      const tMap = new Map<string, ChatThread>();
      localChats.forEach((t) => {
        if (t?.id) tMap.set(t.id, t);
      });
      incomingChats.forEach((t: ChatThread) => {
        if (t?.id) {
          const prev = tMap.get(t.id);
          const isWelcomeOrOne = t.id.includes(ONE_OFFICIAL_UID);
          const keepRead =
            readChatIds.has(t.id) ||
            Boolean(
              prev?.lastMessageRead &&
                (prev.lastMessage === t.lastMessage || isWelcomeOrOne)
            );
          tMap.set(t.id, {
            ...prev,
            ...t,
            lastMessageRead: keepRead ? true : Boolean(t.lastMessageRead),
          });
        }
      });
      safeWriteJson(STORAGE_KEYS.CHATS, Array.from(tMap.values()));
    }

    const incomingMessages = toRecordArray<ChatMessage>(data.messages);
    if (incomingMessages.length > 0) {
      const localMsgs = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
      const mMap = new Map<string, ChatMessage>();
      localMsgs.forEach((m) => {
        if (m?.id) mMap.set(m.id, m);
      });
      incomingMessages.forEach((m: ChatMessage) => {
        if (m?.id) {
          const prev = mMap.get(m.id);
          const keepRead =
            Boolean(prev?.read) ||
            Boolean(m.read) ||
            readChatIds.has(m.chatId) ||
            m.id.startsWith('msg_welcome_');
          mMap.set(m.id, {
            ...prev,
            ...m,
            read: keepRead,
          });
        }
      });
      safeWriteJson(STORAGE_KEYS.MESSAGES, Array.from(mMap.values()));
    }

    if (data.reactions) {
      const incomingReactions = toRecordArray<any>(data.reactions);
      const localReactions = safeReadJson<(Reaction & { id: string })[]>(STORAGE_KEYS.REACTIONS, []);
      const rMap = new Map<string, Reaction & { id: string }>();
      const serverReactionIds = new Set<string>();

      incomingReactions.forEach((r: any) => {
        if (r?.postId && r?.userId && !deletedSet.has(r.postId)) {
          const canonicalUserId = remapAuthorIdIfNeeded(r.userId) || r.userId;
          const id = `${r.postId}_${canonicalUserId}`;
          serverReactionIds.add(id);
          const recentMut = recentReactionMutations.get(id);
          if (recentMut && !recentMut.reacted) {
            // User unliked this post locally in this session; don't re-add stale reaction
            return;
          }
          rMap.set(id, {
            id,
            postId: r.postId,
            userId: canonicalUserId,
            type: 'damay',
            createdAt: hydrateTimestamp(r.createdAt || r.createdAtMs),
          });
        }
      });

      localReactions.forEach((r) => {
        if (r?.postId && r?.userId && !deletedSet.has(r.postId)) {
          const canonicalUserId = remapAuthorIdIfNeeded(r.userId) || r.userId;
          const id = `${r.postId}_${canonicalUserId}`;
          const recentMut = recentReactionMutations.get(id);
          if (recentMut) {
            if (recentMut.reacted) {
              rMap.set(id, {
                ...r,
                id,
                userId: canonicalUserId,
              });
              if (!serverReactionIds.has(id) && !pushedMissingIds.has(`rxn_${id}_${recentMut.timestampMs}`)) {
                pushedMissingIds.add(`rxn_${id}_${recentMut.timestampMs}`);
                pushCloudMutation('toggle_reaction', {
                  postId: r.postId,
                  userId: canonicalUserId,
                  currentlyReacted: false,
                  likesCount: recentMut.likesCount,
                });
              }
            } else {
              rMap.delete(id);
            }
          } else if (!serverReactionIds.has(id)) {
            // Keep local reaction and push to server if not yet synced
            rMap.set(id, {
              ...r,
              id,
              userId: canonicalUserId,
            });
            if (!pushedMissingIds.has(`rxn_init_${id}`)) {
              pushedMissingIds.add(`rxn_init_${id}`);
              pushCloudMutation('toggle_reaction', {
                postId: r.postId,
                userId: canonicalUserId,
                currentlyReacted: false,
              });
            }
          }
        }
      });

      safeWriteJson(STORAGE_KEYS.REACTIONS, Array.from(rMap.values()));
    }

    const incomingNotifications = toRecordArray<NotificationItem>(data.notifications);
    if (incomingNotifications.length > 0) {
      const localNotifs = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
      const nMap = new Map<string, NotificationItem>();
      localNotifs.forEach((n) => {
        if (n?.id) nMap.set(n.id, n);
      });
      incomingNotifications.forEach((n: NotificationItem) => {
        if (n?.id) nMap.set(n.id, n);
      });
      safeWriteJson(STORAGE_KEYS.NOTIFICATIONS, Array.from(nMap.values()));
    }

    if (data.platformSettings && typeof data.platformSettings === 'object') {
      safeWriteJson(STORAGE_KEYS.PLATFORM_SETTINGS, {
        ...DEFAULT_PLATFORM_SETTINGS,
        ...data.platformSettings,
      });
    }

    if (Array.isArray(data.deletedMarketplaceIds)) {
      const localDelMkt = new Set<string>(
        safeReadJson<string[]>('one_msu_db_v2_deleted_marketplace', [])
      );
      data.deletedMarketplaceIds.forEach((id: string) => localDelMkt.add(id));
      safeWriteJson('one_msu_db_v2_deleted_marketplace', Array.from(localDelMkt));
    }

    if (data.marketplace) {
      const incomingMarketplace = toRecordArray<MarketplaceListing>(data.marketplace);
      const deletedMktSet = new Set<string>(
        safeReadJson<string[]>('one_msu_db_v2_deleted_marketplace', [])
      );
      const localMkt = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
      const serverMktIds = new Set<string>(
        incomingMarketplace.map((m: MarketplaceListing) => m?.id).filter(Boolean)
      );
      const mktMap = new Map<string, MarketplaceListing>();
      localMkt.forEach((m) => {
        if (!isDemoOrFakeMarketplaceListing(m) && !deletedMktSet.has(m.id)) {
          const realAuthorId = remapAuthorIdIfNeeded(m.authorId, m.authorNickname);
          const hydratedMkt = { ...m, authorId: realAuthorId };
          const mktCreatedMs = hydrateTimestamp(m.createdAt)?.toMillis() || 0;
          const isVeryRecentLocalMkt = Date.now() - mktCreatedMs < 60000;
          if (serverMktIds.has(m.id) || isVeryRecentLocalMkt) {
            mktMap.set(m.id, hydratedMkt);
          }
          if (
            !serverMktIds.has(m.id) &&
            isVeryRecentLocalMkt &&
            !pushedMissingIds.has(`mkt_${m.id}`)
          ) {
            pushedMissingIds.add(`mkt_${m.id}`);
            pushCloudMutation('upsert_marketplace_listing', { listing: hydratedMkt });
          }
        }
      });
      incomingMarketplace.forEach((m: MarketplaceListing) => {
        if (!isDemoOrFakeMarketplaceListing(m) && !deletedMktSet.has(m.id)) {
          const realAuthorId = remapAuthorIdIfNeeded(m.authorId, m.authorNickname);
          mktMap.set(m.id, {
            ...m,
            authorId: realAuthorId,
            imageUrl: m.imageUrl || '',
          });
        }
      });
      safeWriteJson(STORAGE_KEYS.MARKETPLACE, Array.from(mktMap.values()));
    }

    if (data.supportTickets) {
      const incomingTickets = toRecordArray<SupportTicket>(data.supportTickets);
      const localTickets = safeReadJson<SupportTicket[]>(STORAGE_KEYS.SUPPORT_TICKETS, []);
      const serverTicketIds = new Set<string>(
        incomingTickets.map((t: SupportTicket) => t?.id).filter(Boolean)
      );
      const tMap = new Map<string, SupportTicket>();
      localTickets.forEach((t) => {
        if (t?.id) {
          tMap.set(t.id, t);
          if (!serverTicketIds.has(t.id) && !pushedMissingIds.has(`tkt_${t.id}`)) {
            pushedMissingIds.add(`tkt_${t.id}`);
            pushCloudMutation('upsert_support_ticket', { ticket: t });
          }
        }
      });
      incomingTickets.forEach((t: SupportTicket) => {
        if (t?.id) {
          tMap.set(t.id, t);
        }
      });
      safeWriteJson(STORAGE_KEYS.SUPPORT_TICKETS, Array.from(tMap.values()));
    }

    notifyDbUpdated('all');
    return true;
  } catch {
    return false;
  } finally {
    isSyncingFromBackend = false;
  }
}

export function getLocalUsers(): UserPublicProfile[] {
  ensureLocalDatabaseInitialized();
  const raw = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
  const priv = safeReadJson<Record<string, string>>(
    STORAGE_KEYS.USERS_PRIVATE,
    getDefaultRestoredPrivateEmails()
  );
  const byEmail = new Map<string, UserPublicProfile>();
  const withoutEmail: UserPublicProfile[] = [];

  for (const u of raw) {
    if (!u?.uid || FAKE_SYNTHETIC_UIDS.has(u.uid) || u.uid === ONE_OFFICIAL_UID) continue;
    const isCamarinStudent =
      u.uid === '4ae58a7b-5104-4479-8667-ed9e465ba447' ||
      u.nickname === 'camarin.xn839';
    const isXanderDev = u.uid === '538a6246-5cc8-4c63-bbda-0507196f3d5d';
    const resolvedNick =
      u.nickname && u.nickname !== 'student'
        ? u.nickname
        : isCamarinStudent
        ? 'camarin.xn839'
        : isXanderDev
        ? 'xander'
        : u.nickname || 'student';

    const hydrated: UserPublicProfile = {
      ...u,
      nickname: resolvedNick,
      googleDisplayName:
        u.googleDisplayName && u.googleDisplayName !== 'student'
          ? u.googleDisplayName
          : isCamarinStudent
          ? 'Xander James Camarin'
          : isXanderDev
          ? 'Xander James'
          : resolvedNick,
      badge: isCamarinStudent
        ? ('verified' as UserBadge)
        : isXanderDev
        ? ('developer' as UserBadge)
        : u.badge,
      role: isCamarinStudent
        ? ('student' as const)
        : isXanderDev
        ? ('developer' as const)
        : u.role,
      createdAt: hydrateTimestamp(u.createdAt),
      updatedAt: hydrateTimestamp(u.updatedAt),
    };

    const emailKey = (priv[u.uid] || '').trim().toLowerCase();
    if (emailKey) {
      const existing = byEmail.get(emailKey);
      if (!existing) {
        byEmail.set(emailKey, hydrated);
      } else {
        const existingIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(existing.uid);
        const currentIsUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(hydrated.uid);
        if (currentIsUuid && !existingIsUuid) {
          byEmail.set(emailKey, hydrated);
        } else if (currentIsUuid === existingIsUuid) {
          const eTime = existing.updatedAt?.toMillis?.() || 0;
          const cTime = hydrated.updatedAt?.toMillis?.() || 0;
          if (cTime >= eTime) {
            byEmail.set(emailKey, hydrated);
          }
        }
      }
    } else {
      withoutEmail.push(hydrated);
    }
  }

  return [...Array.from(byEmail.values()), ...withoutEmail];
}

export function saveLocalUsers(users: UserPublicProfile[]): void {
  const existing = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
  const map = new Map<string, UserPublicProfile>();
  getDefaultRestoredUsers().forEach((u) => {
    if (u?.uid && !FAKE_SYNTHETIC_UIDS.has(u.uid)) map.set(u.uid, u);
  });
  existing.forEach((u) => {
    if (u?.uid && !FAKE_SYNTHETIC_UIDS.has(u.uid) && u.uid !== ONE_OFFICIAL_UID) {
      map.set(u.uid, u);
    }
  });
  users.forEach((u) => {
    const canonicalUid = u?.uid ? SYNTHETIC_TO_REAL_UID_MAP[u.uid] || u.uid : '';
    if (canonicalUid && !FAKE_SYNTHETIC_UIDS.has(canonicalUid) && canonicalUid !== ONE_OFFICIAL_UID) {
      const prev = map.get(canonicalUid);
      const prevUpdatedMs =
        (prev as any)?.updatedAtMs || hydrateTimestamp(prev?.updatedAt)?.toMillis() || 0;
      const incomingUpdatedMs =
        (u as any)?.updatedAtMs || hydrateTimestamp(u.updatedAt)?.toMillis() || 0;
      // Never let an older Firestore user snapshot overwrite a newer local profile
      if (prev && prevUpdatedMs > incomingUpdatedMs && incomingUpdatedMs > 0) {
        return;
      }
      map.set(canonicalUid, {
        ...prev,
        ...u,
        uid: canonicalUid,
        photoURL: u.photoURL || prev?.photoURL || '',
        googleDisplayName: u.googleDisplayName || prev?.googleDisplayName || u.nickname,
      });
    }
  });
  safeWriteJson(STORAGE_KEYS.USERS, Array.from(map.values()));
  notifyDbUpdated('users');
}

export function upsertLocalUser(user: UserPublicProfile, email?: string): void {
  if (!user?.uid) return;
  const canonicalUid = SYNTHETIC_TO_REAL_UID_MAP[user.uid] || user.uid;
  if (FAKE_SYNTHETIC_UIDS.has(canonicalUid)) return;
  const existing = getLocalUsers();
  const map = new Map<string, UserPublicProfile>();
  existing.forEach((u) => map.set(u.uid, u));
  const prevUser = map.get(canonicalUid);
  const nowMs = Date.now();
  const mergedUser: UserPublicProfile & { updatedAtMs?: number } = {
    ...prevUser,
    ...user,
    uid: canonicalUid,
    photoURL: user.photoURL || prevUser?.photoURL || '',
    googleDisplayName: user.googleDisplayName || prevUser?.googleDisplayName || user.nickname,
    referralSource: user.referralSource ?? prevUser?.referralSource,
    referralSubmittedAt: user.referralSubmittedAt ?? prevUser?.referralSubmittedAt,
    createdAt: user.createdAt || prevUser?.createdAt || Timestamp.now(),
    updatedAt: Timestamp.fromMillis(nowMs),
    updatedAtMs: nowMs,
  };
  map.set(canonicalUid, mergedUser);
  safeWriteJson(STORAGE_KEYS.USERS, Array.from(map.values()));
  try {
    window.localStorage.setItem(`one_msu_profile_${canonicalUid}`, JSON.stringify(mergedUser));
  } catch {
    // ignore
  }
  if (email) {
    const priv = getLocalPrivateEmails();
    priv[canonicalUid] = email;
    safeWriteJson(STORAGE_KEYS.USERS_PRIVATE, priv);
  }
  // Also sync directly to Supabase Auth user_metadata if the current session matches
  supabase.auth
    .getSession()
    .then(({ data: { session } }) => {
      if (session?.user && session.user.id === canonicalUid) {
        supabase.auth
          .updateUser({
            data: {
              full_name: mergedUser.googleDisplayName,
              name: mergedUser.googleDisplayName,
              ...(mergedUser.photoURL && mergedUser.photoURL.length < 4096
                ? { avatar_url: mergedUser.photoURL, picture: mergedUser.photoURL }
                : {}),
              one_profile: {
                nickname: mergedUser.nickname,
                nicknameUpdatedAt: mergedUser.nicknameUpdatedAt,
                googleDisplayName: mergedUser.googleDisplayName,
                photoURL:
                  mergedUser.photoURL && mergedUser.photoURL.length < 4096
                    ? mergedUser.photoURL
                    : undefined,
                campus: mergedUser.campus,
                bio: mergedUser.bio,
                defaultAnonymous: mergedUser.defaultAnonymous,
                referralSource: mergedUser.referralSource,
                referralSubmittedAt: mergedUser.referralSubmittedAt,
                badge: mergedUser.badge,
                role: mergedUser.role,
                accountStatus: mergedUser.accountStatus,
                isVerifiedStudent: mergedUser.isVerifiedStudent,
                updatedAtMs: nowMs,
              },
            },
          })
          .catch(() => {});
      }
    })
    .catch(() => {});

  pushCloudMutation('upsert_user', { user: mergedUser, email });
  notifyDbUpdated('users');
}

export function syncUserProfileToPastContent(
  userOrUid: UserPublicProfile | string,
  nicknameArg?: string,
  displayNameArg?: string,
  photoURLArg?: string,
  badgeArg?: UserPublicProfile['badge']
): void {
  const uid = typeof userOrUid === 'string' ? userOrUid : userOrUid.uid;
  const nickname = typeof userOrUid === 'string' ? nicknameArg || '' : userOrUid.nickname;
  const displayName =
    typeof userOrUid === 'string'
      ? displayNameArg || nickname
      : userOrUid.googleDisplayName || userOrUid.nickname;
  const photoURL = typeof userOrUid === 'string' ? photoURLArg || '' : userOrUid.photoURL || '';
  const badge = typeof userOrUid === 'string' ? badgeArg : userOrUid.badge;

  const existingPosts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
  let postsChanged = false;
  const updatedPosts = existingPosts.map((p) => {
    if (p.authorId === uid && !p.isAnonymous) {
      postsChanged = true;
      const nextPost = {
        ...p,
        authorNickname: nickname,
        authorDisplayName: displayName || nickname,
        authorPhotoURL: photoURL,
        authorBadge: badge || p.authorBadge || 'verified',
        updatedAt: Timestamp.now(),
      };
      pushCloudMutation('upsert_post', { post: nextPost });
      return nextPost;
    }
    return p;
  });
  if (postsChanged) {
    safeWriteJson(STORAGE_KEYS.POSTS, updatedPosts);
    notifyDbUpdated('posts');
  }

  const existingComments = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  let commentsChanged = false;
  const updatedComments = existingComments.map((c) => {
    if (c.authorId === uid && !c.isAnonymous) {
      commentsChanged = true;
      const nextComment = {
        ...c,
        authorNickname: nickname,
        authorDisplayName: displayName || nickname,
        authorPhotoURL: photoURL,
        authorBadge: badge || c.authorBadge || 'verified',
        updatedAt: Timestamp.now(),
      };
      pushCloudMutation('upsert_comment', { comment: nextComment });
      return nextComment;
    }
    return c;
  });
  if (commentsChanged) {
    safeWriteJson(STORAGE_KEYS.COMMENTS, updatedComments);
    notifyDbUpdated('comments');
  }

  const existingSuggestions = safeReadJson<Suggestion[]>(STORAGE_KEYS.SUGGESTIONS, []);
  let sugChanged = false;
  const updatedSuggestions = existingSuggestions.map((s) => {
    if (s.authorId === uid && !s.isAnonymous) {
      sugChanged = true;
      const nextSug = {
        ...s,
        authorNickname: nickname,
        authorPhotoURL: photoURL,
        authorBadge: badge || s.authorBadge || 'verified',
        updatedAt: Timestamp.now(),
      };
      pushCloudMutation('upsert_suggestion', { suggestion: nextSug });
      return nextSug;
    }
    return s;
  });
  if (sugChanged) {
    safeWriteJson(STORAGE_KEYS.SUGGESTIONS, updatedSuggestions);
    notifyDbUpdated('suggestions');
  }

  const existingChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
  let chatsChanged = false;
  const updatedChats = existingChats.map((t) => {
    if (t.userAId === uid) {
      chatsChanged = true;
      return {
        ...t,
        userANickname: nickname,
        userAPhotoURL: photoURL,
        userABadge: badge || t.userABadge || 'verified',
      };
    }
    if (t.userBId === uid) {
      chatsChanged = true;
      return {
        ...t,
        userBNickname: nickname,
        userBPhotoURL: photoURL,
        userBBadge: badge || t.userBBadge || 'verified',
      };
    }
    return t;
  });
  if (chatsChanged) {
    safeWriteJson(STORAGE_KEYS.CHATS, updatedChats);
    notifyDbUpdated('chats');
  }

  const existingMkt = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
  let mktChanged = false;
  const updatedMkt = existingMkt.map((m) => {
    if (m.authorId === uid) {
      mktChanged = true;
      const nextMkt = {
        ...m,
        authorNickname: nickname,
        authorDisplayName: displayName || nickname,
        authorPhotoURL: photoURL,
        authorBadge: badge || m.authorBadge || 'verified',
        updatedAt: Timestamp.now(),
      };
      pushCloudMutation('upsert_marketplace_listing', { listing: nextMkt });
      return nextMkt;
    }
    return m;
  });
  if (mktChanged) {
    safeWriteJson(STORAGE_KEYS.MARKETPLACE, updatedMkt);
    notifyDbUpdated('marketplace');
  }
}

export function deleteLocalUser(uid: string): void {
  const existing = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
  safeWriteJson(
    STORAGE_KEYS.USERS,
    existing.filter((u) => u.uid !== uid)
  );
  const pres = safeReadJson<UserPresence[]>(STORAGE_KEYS.PRESENCE, []);
  safeWriteJson(
    STORAGE_KEYS.PRESENCE,
    pres.filter((p) => p.uid !== uid)
  );
  pushCloudMutation('delete_user', { uid });
  notifyDbUpdated('users');
}

export function getLocalPrivateEmails(): Record<string, string> {
  ensureLocalDatabaseInitialized();
  return safeReadJson<Record<string, string>>(
    STORAGE_KEYS.USERS_PRIVATE,
    getDefaultRestoredPrivateEmails()
  );
}

export function getLocalPresence(): UserPresence[] {
  ensureLocalDatabaseInitialized();
  const raw = safeReadJson<UserPresence[]>(STORAGE_KEYS.PRESENCE, []);
  const users = getLocalUsers();
  const snapshotUpdatedMap = new Map<string, number>();
  (realUsersSnapshot.users || []).forEach((su) => {
    snapshotUpdatedMap.set(su.uid, su.updatedAtMs || su.createdAtMs || 0);
  });

  const map = new Map<string, UserPresence>();
  users.forEach((u) => {
    if (!u.uid || u.uid === ONE_OFFICIAL_UID || FAKE_SYNTHETIC_UIDS.has(u.uid)) return;
    const snapLastSeen = snapshotUpdatedMap.get(u.uid) || 0;
    const isRecentlyActive = Date.now() - snapLastSeen < 15 * 60 * 1000;
    map.set(u.uid, {
      uid: u.uid,
      nickname: u.nickname,
      photoURL: u.photoURL || '',
      badge: u.badge || 'verified',
      campus: u.campus || 'MSU Main Campus - Marawi',
      isOnline: isRecentlyActive,
      lastSeenMs: isRecentlyActive ? Date.now() - 30000 : snapLastSeen || Date.now() - 3600000,
      visibility: 'edu_verified',
      updatedAt: u.updatedAt || Timestamp.now(),
    });
  });

  raw.forEach((p) => {
    if (!p?.uid || p.uid === ONE_OFFICIAL_UID || FAKE_SYNTHETIC_UIDS.has(p.uid)) return;
    const existing = map.get(p.uid);
    const pLastSeen = typeof p.lastSeenMs === 'number' ? p.lastSeenMs : 0;
    const eLastSeen = existing?.lastSeenMs || 0;
    const bestLastSeen = Math.max(pLastSeen, eLastSeen);
    const activeOnline =
      Boolean(p.isOnline && Date.now() - pLastSeen < 120000) || Boolean(existing?.isOnline);
    map.set(p.uid, {
      ...existing,
      ...p,
      nickname: existing?.nickname || p.nickname,
      photoURL: existing?.photoURL || p.photoURL || '',
      badge: existing?.badge || p.badge || 'verified',
      campus: existing?.campus || p.campus || 'MSU Main Campus - Marawi',
      isOnline: activeOnline,
      lastSeenMs: activeOnline ? Math.max(bestLastSeen, Date.now() - 30000) : bestLastSeen,
      updatedAt: hydrateTimestamp(p.updatedAt),
    });
  });

  return Array.from(map.values());
}

export function upsertLocalPresence(presence: UserPresence): void {
  if (!presence?.uid || FAKE_SYNTHETIC_UIDS.has(presence.uid)) return;
  const raw = safeReadJson<UserPresence[]>(STORAGE_KEYS.PRESENCE, []);
  const map = new Map<string, UserPresence>();
  raw.forEach((p) => {
    if (p?.uid && !FAKE_SYNTHETIC_UIDS.has(p.uid)) map.set(p.uid, p);
  });
  map.set(presence.uid, presence);
  safeWriteJson(STORAGE_KEYS.PRESENCE, Array.from(map.values()));
  if (presence.isOnline) {
    connectServerEventStream(presence);
    if (supabaseRealtimeChannel && isSupabaseChannelSubscribed) {
      supabaseRealtimeChannel
        .track({
          uid: presence.uid,
          nickname: presence.nickname,
          photoURL: (presence.photoURL || '').slice(0, 512),
          badge: presence.badge,
          campus: presence.campus,
          online_at: Date.now(),
        })
        .catch(() => {});
    }
  }
  pushCloudMutation('upsert_presence', { presence });
  notifyDbUpdated('presence');
}

export function getLocalPosts(): Post[] {
  ensureLocalDatabaseInitialized();
  const deletedSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_posts', [])
  );
  const deletedCommentSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
  );
  const raw = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
  const combinedMap = new Map<string, Post>();
  getDefaultRestoredPosts().forEach((p) => {
    if (p?.id && !deletedSet.has(p.id)) combinedMap.set(p.id, p);
  });
  raw.forEach((p) => {
    if (p?.id && !FAKE_POST_IDS.has(p.id) && !deletedSet.has(p.id)) {
      combinedMap.set(p.id, {
        ...combinedMap.get(p.id),
        ...p,
      });
    }
  });

  // Compute exact comment counts per post from all active comments
  const allCommentsMap = new Map<string, Comment>();
  getDefaultRestoredComments().forEach((c) => {
    if (c?.id && !deletedSet.has(c.postId) && !deletedCommentSet.has(c.id)) {
      allCommentsMap.set(c.id, c);
    }
  });
  safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []).forEach((c) => {
    if (
      c?.id &&
      !FAKE_COMMENT_IDS.has(c.id) &&
      !deletedSet.has(c.postId) &&
      !deletedCommentSet.has(c.id)
    ) {
      allCommentsMap.set(c.id, c);
    }
  });
  const commentCountsByPost = new Map<string, number>();
  allCommentsMap.forEach((c) => {
    if (c.postId) {
      commentCountsByPost.set(c.postId, (commentCountsByPost.get(c.postId) || 0) + 1);
    }
  });

  // Compute active reaction counts per post
  const reactionCountsByPost = new Map<string, number>();
  safeReadJson<(Reaction & { id: string })[]>(STORAGE_KEYS.REACTIONS, []).forEach((r) => {
    if (r?.postId && r?.userId && !deletedSet.has(r.postId)) {
      reactionCountsByPost.set(r.postId, (reactionCountsByPost.get(r.postId) || 0) + 1);
    }
  });

  const users = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
  const userMap = new Map<string, UserPublicProfile>();
  users.forEach((u) => {
    if (u?.uid) userMap.set(u.uid, u);
  });
  const hydrated = Array.from(combinedMap.values()).map((p) => {
    const recentMut = recentPostFieldMutations.get(p.id);
    const mergedPost =
      recentMut && Date.now() - recentMut.timestampMs < 120000
        ? { ...p, ...recentMut.fields }
        : p;
    const realAuthorId = remapAuthorIdIfNeeded(mergedPost.authorId, mergedPost.authorNickname);
    const latestAuthor =
      !mergedPost.isAnonymous && realAuthorId ? userMap.get(realAuthorId) : undefined;
    const normalizedCategory =
      (mergedPost.category as string) === 'Prof & Subjects' ? 'Subjects' : mergedPost.category;
    const upgradedAttachmentDataUrl =
      mergedPost.id === 'post_study_reviewers_midterms' &&
      (!mergedPost.attachmentDataUrl || mergedPost.attachmentDataUrl.length < 1500)
        ? SAMPLE_PDF_DATA_URL
        : mergedPost.attachmentDataUrl;
    const actualCommentsCount = commentCountsByPost.get(mergedPost.id) || 0;
    const actualReactionsCount = reactionCountsByPost.get(mergedPost.id) || 0;
    const effectiveLikesCount = Math.max(mergedPost.likesCount || 0, actualReactionsCount);
    const effectiveCommentsCount = Math.max(actualCommentsCount, mergedPost.commentsCount || 0);
    return {
      ...mergedPost,
      authorId: realAuthorId,
      category: normalizedCategory,
      attachmentDataUrl: upgradedAttachmentDataUrl,
      likesCount: effectiveLikesCount,
      commentsCount: allCommentsMap.size > 0 ? actualCommentsCount : effectiveCommentsCount,
      authorNickname: latestAuthor?.nickname || mergedPost.authorNickname,
      authorDisplayName:
        latestAuthor?.nickname ||
        latestAuthor?.googleDisplayName ||
        mergedPost.authorDisplayName,
      authorPhotoURL:
        latestAuthor?.photoURL !== undefined && latestAuthor.photoURL !== ''
          ? latestAuthor.photoURL
          : mergedPost.authorPhotoURL,
      authorBadge: latestAuthor?.badge || mergedPost.authorBadge,
      createdAt: hydrateTimestamp(mergedPost.createdAt),
      updatedAt: hydrateTimestamp(mergedPost.updatedAt),
    };
  });
  hydrated.sort((a, b) => {
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });
  return hydrated;
}

export function saveLocalPosts(posts: Post[]): void {
  ensureLocalDatabaseInitialized();
  const deletedSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_posts', [])
  );
  const existing = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
  const map = new Map<string, Post>();
  existing.forEach((p) => {
    if (p?.id && !FAKE_POST_IDS.has(p.id) && !deletedSet.has(p.id)) {
      map.set(p.id, p);
    }
  });
  posts.forEach((p) => {
    if (p?.id && !FAKE_POST_IDS.has(p.id) && !deletedSet.has(p.id)) {
      const realAuthorId = remapAuthorIdIfNeeded(p.authorId, p.authorNickname);
      const prev = map.get(p.id);
      const recentMut = recentPostFieldMutations.get(p.id);
      const isRecentMutActive = recentMut && Date.now() - recentMut.timestampMs < 120000;
      const prevUpdatedMs =
        (prev as any)?.updatedAtMs || hydrateTimestamp(prev?.updatedAt)?.toMillis() || 0;
      const incomingUpdatedMs =
        (p as any)?.updatedAtMs || hydrateTimestamp(p.updatedAt)?.toMillis() || 0;
      const isLocalNewer = prev && prevUpdatedMs > incomingUpdatedMs + 1000;
      const nextPost = {
        ...prev,
        ...p,
        ...(isLocalNewer && prev
          ? {
              likesCount: prev.likesCount,
              commentsCount: prev.commentsCount,
              updatedAt: prev.updatedAt,
            }
          : {}),
        ...(isRecentMutActive ? recentMut.fields : {}),
        authorId: realAuthorId,
      };
      const hadBefore = map.has(p.id);
      map.set(p.id, nextPost);
      if (!hadBefore) {
        pushCloudMutation('upsert_post', { post: nextPost });
      }
    }
  });
  safeWriteJson(STORAGE_KEYS.POSTS, Array.from(map.values()));
  notifyDbUpdated('posts');
}

export function upsertLocalPost(post: Post): void {
  ensureLocalDatabaseInitialized();
  const existing = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
  const map = new Map<string, Post>();
  existing.forEach((p) => {
    if (p?.id && !FAKE_POST_IDS.has(p.id)) map.set(p.id, p);
  });
  const nextPost = {
    ...post,
    createdAt: post.createdAt || Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  map.set(post.id, nextPost);
  safeWriteJson(STORAGE_KEYS.POSTS, Array.from(map.values()));
  pushCloudMutation('upsert_post', { post: nextPost });
  notifyDbUpdated('posts');
}

export function updateLocalPostFields(postId: string, fields: Partial<Post>): void {
  ensureLocalDatabaseInitialized();
  const prevMut = recentPostFieldMutations.get(postId);
  recentPostFieldMutations.set(postId, {
    fields: { ...(prevMut?.fields || {}), ...fields },
    timestampMs: Date.now(),
  });

  const existing = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
  const map = new Map<string, Post>();
  getDefaultRestoredPosts().forEach((p) => {
    if (p?.id) map.set(p.id, p);
  });
  existing.forEach((p) => {
    if (p?.id) map.set(p.id, { ...map.get(p.id), ...p });
  });
  const target = map.get(postId);
  if (target) {
    map.set(postId, {
      ...target,
      ...fields,
      updatedAt: Timestamp.now(),
    });
  }
  safeWriteJson(STORAGE_KEYS.POSTS, Array.from(map.values()));
  pushCloudMutation('update_post_fields', { postId, fields });
  notifyDbUpdated('posts');
}

export function getDeletedPostIds(): string[] {
  return safeReadJson<string[]>('one_msu_db_v2_deleted_posts', []);
}

export function syncDeletedPostIdsFromRemote(remoteIds: string[]): void {
  if (!Array.isArray(remoteIds) || remoteIds.length === 0) return;
  const deletedPostIds = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_posts', [])
  );
  let added = false;
  remoteIds.forEach((id) => {
    if (id && !deletedPostIds.has(id)) {
      deletedPostIds.add(id);
      added = true;
    }
  });
  if (!added) return;
  safeWriteJson('one_msu_db_v2_deleted_posts', Array.from(deletedPostIds));

  const existing = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
  safeWriteJson(
    STORAGE_KEYS.POSTS,
    existing.filter((p) => !deletedPostIds.has(p.id))
  );
  const legacyCached = safeReadJson<Post[]>('one_msu_cached_posts_v1', []);
  if (legacyCached.length > 0) {
    safeWriteJson(
      'one_msu_cached_posts_v1',
      legacyCached.filter((p) => !deletedPostIds.has(p.id))
    );
  }
  const comments = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  safeWriteJson(
    STORAGE_KEYS.COMMENTS,
    comments.filter((c) => !deletedPostIds.has(c.postId))
  );
  notifyDbUpdated('posts');
}

export function deleteLocalPost(postId: string): void {
  const deletedPostIds = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_posts', [])
  );
  deletedPostIds.add(postId);
  safeWriteJson('one_msu_db_v2_deleted_posts', Array.from(deletedPostIds));

  const existing = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
  safeWriteJson(
    STORAGE_KEYS.POSTS,
    existing.filter((p) => p.id !== postId)
  );
  const legacyCached = safeReadJson<Post[]>('one_msu_cached_posts_v1', []);
  if (legacyCached.length > 0) {
    safeWriteJson(
      'one_msu_cached_posts_v1',
      legacyCached.filter((p) => p.id !== postId)
    );
  }
  const comments = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  safeWriteJson(
    STORAGE_KEYS.COMMENTS,
    comments.filter((c) => c.postId !== postId)
  );
  const reactions = safeReadJson<(Reaction & { id: string })[]>(STORAGE_KEYS.REACTIONS, []);
  safeWriteJson(
    STORAGE_KEYS.REACTIONS,
    reactions.filter((r) => r.postId !== postId)
  );
  const notifs = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  safeWriteJson(
    STORAGE_KEYS.NOTIFICATIONS,
    notifs.filter((n) => n.targetId !== postId)
  );
  pushCloudMutation('delete_post', { postId });
  notifyDbUpdated('posts');
}

export function getLocalComments(postId?: string): Comment[] {
  ensureLocalDatabaseInitialized();
  const deletedSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_posts', [])
  );
  const deletedCommentSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
  );
  const raw = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  const combinedMap = new Map<string, Comment>();
  getDefaultRestoredComments().forEach((c) => {
    if (c?.id && !deletedSet.has(c.postId) && !deletedCommentSet.has(c.id)) {
      combinedMap.set(c.id, c);
    }
  });
  raw.forEach((c) => {
    if (
      c?.id &&
      !FAKE_COMMENT_IDS.has(c.id) &&
      !deletedSet.has(c.postId) &&
      !deletedCommentSet.has(c.id)
    ) {
      combinedMap.set(c.id, c);
    }
  });
  const users = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
  const userMap = new Map<string, UserPublicProfile>();
  users.forEach((u) => {
    if (u?.uid) userMap.set(u.uid, u);
  });
  const hydrated = Array.from(combinedMap.values()).map((c) => {
    const realAuthorId = remapAuthorIdIfNeeded(c.authorId, c.authorNickname);
    const latestAuthor = !c.isAnonymous && realAuthorId ? userMap.get(realAuthorId) : undefined;
    return {
      ...c,
      authorId: realAuthorId,
      authorNickname: c.isAnonymous
        ? 'Anonymous Student'
        : latestAuthor?.nickname || c.authorNickname,
      authorDisplayName: c.isAnonymous
        ? 'Anonymous Student'
        : latestAuthor?.nickname || latestAuthor?.googleDisplayName || c.authorDisplayName,
      authorPhotoURL: c.isAnonymous
        ? ''
        : latestAuthor?.photoURL !== undefined && latestAuthor.photoURL !== ''
        ? latestAuthor.photoURL
        : c.authorPhotoURL,
      authorBadge: latestAuthor?.badge || c.authorBadge || 'verified',
      createdAt: hydrateTimestamp(c.createdAt),
      updatedAt: hydrateTimestamp(c.updatedAt),
    };
  });
  const filtered = postId ? hydrated.filter((c) => c.postId === postId) : hydrated;
  filtered.sort((a, b) => {
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return aTime - bTime;
  });
  return filtered;
}

export function saveLocalCommentsForPost(postId: string, comments: Comment[]): void {
  ensureLocalDatabaseInitialized();
  const deletedCommentSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
  );
  const all = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  const map = new Map<string, Comment>();
  all.forEach((c) => {
    if (c?.id && !FAKE_COMMENT_IDS.has(c.id) && !deletedCommentSet.has(c.id)) map.set(c.id, c);
  });
  comments.forEach((c) => {
    if (c?.id && !FAKE_COMMENT_IDS.has(c.id) && !deletedCommentSet.has(c.id)) {
      const nextComment = {
        ...c,
        postId,
        authorId: remapAuthorIdIfNeeded(c.authorId, c.authorNickname),
      };
      const hadBefore = map.has(c.id);
      map.set(c.id, nextComment);
      if (!hadBefore) {
        pushCloudMutation('upsert_comment', { comment: nextComment });
      }
    }
  });
  safeWriteJson(STORAGE_KEYS.COMMENTS, Array.from(map.values()));
  notifyDbUpdated('comments');
  notifyDbUpdated('posts');
}

export function upsertLocalComment(comment: Comment): void {
  ensureLocalDatabaseInitialized();
  const deletedCommentSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
  );
  if (deletedCommentSet.has(comment.id)) {
    deletedCommentSet.delete(comment.id);
    safeWriteJson('one_msu_db_v2_deleted_comments', Array.from(deletedCommentSet));
  }
  const all = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  const map = new Map<string, Comment>();
  getDefaultRestoredComments().forEach((c) => {
    if (c?.id && !deletedCommentSet.has(c.id)) map.set(c.id, c);
  });
  all.forEach((c) => {
    if (c?.id && !FAKE_COMMENT_IDS.has(c.id) && !deletedCommentSet.has(c.id)) map.set(c.id, c);
  });
  const nextComment = {
    ...comment,
    authorId: remapAuthorIdIfNeeded(comment.authorId, comment.authorNickname),
    createdAt: comment.createdAt || Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  map.set(comment.id, nextComment);
  const allUpdated = Array.from(map.values());
  safeWriteJson(STORAGE_KEYS.COMMENTS, allUpdated);
  if (comment.postId) {
    const postCommentsCount = allUpdated.filter((c) => c.postId === comment.postId).length;
    updateLocalPostFields(comment.postId, { commentsCount: postCommentsCount });
  }
  pushCloudMutation('upsert_comment', { comment: nextComment });
  notifyDbUpdated('comments');
  notifyDbUpdated('posts');
}

export function deleteLocalComment(commentId: string, postId?: string): void {
  ensureLocalDatabaseInitialized();
  const deletedCommentSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
  );
  deletedCommentSet.add(commentId);
  safeWriteJson('one_msu_db_v2_deleted_comments', Array.from(deletedCommentSet));

  const all = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  const map = new Map<string, Comment>();
  getDefaultRestoredComments().forEach((c) => {
    if (c?.id && !deletedCommentSet.has(c.id)) map.set(c.id, c);
  });
  all.forEach((c) => {
    if (c?.id && !deletedCommentSet.has(c.id)) map.set(c.id, c);
  });
  map.delete(commentId);
  const next = Array.from(map.values());
  safeWriteJson(STORAGE_KEYS.COMMENTS, next);
  if (postId) {
    const postCommentsCount = next.filter((c) => c.postId === postId).length;
    updateLocalPostFields(postId, { commentsCount: postCommentsCount });
  }
  pushCloudMutation('delete_comment', { commentId, postId });
  notifyDbUpdated('comments');
  notifyDbUpdated('posts');
}

export function toggleLocalCommentLike(commentId: string, userId: string): Comment | null {
  ensureLocalDatabaseInitialized();
  if (!commentId || !userId) return null;
  const canonicalUserId = remapAuthorIdIfNeeded(userId) || userId;
  const deletedCommentSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_comments', [])
  );
  const all = safeReadJson<Comment[]>(STORAGE_KEYS.COMMENTS, []);
  const map = new Map<string, Comment>();
  getDefaultRestoredComments().forEach((c) => {
    if (c?.id && !deletedCommentSet.has(c.id)) map.set(c.id, c);
  });
  all.forEach((c) => {
    if (c?.id && !FAKE_COMMENT_IDS.has(c.id) && !deletedCommentSet.has(c.id)) map.set(c.id, c);
  });
  const target = map.get(commentId);
  if (!target) return null;

  const prevLikedBy = Array.isArray(target.likedBy) ? target.likedBy : [];
  const alreadyLiked =
    prevLikedBy.includes(canonicalUserId) || prevLikedBy.includes(userId);
  const nextLikedBy = alreadyLiked
    ? prevLikedBy.filter((id) => id !== canonicalUserId && id !== userId)
    : Array.from(new Set([...prevLikedBy, canonicalUserId]));
  const nextLikesCount = nextLikedBy.length;

  const updatedComment: Comment = {
    ...target,
    likesCount: nextLikesCount,
    likedBy: nextLikedBy,
    updatedAt: Timestamp.now(),
  };
  map.set(commentId, updatedComment);
  safeWriteJson(STORAGE_KEYS.COMMENTS, Array.from(map.values()));
  pushCloudMutation('toggle_comment_like', {
    commentId,
    postId: target.postId,
    userId: canonicalUserId,
    liked: !alreadyLiked,
    likesCount: nextLikesCount,
    likedBy: nextLikedBy,
  });
  notifyDbUpdated('comments');
  return updatedComment;
}

export function getLocalReactions(): (Reaction & { id: string })[] {
  ensureLocalDatabaseInitialized();
  const raw = safeReadJson<(Reaction & { id: string })[]>(STORAGE_KEYS.REACTIONS, []);
  return raw.map((r) => ({
    ...r,
    userId: remapAuthorIdIfNeeded(r.userId) || r.userId,
    createdAt: hydrateTimestamp(r.createdAt),
  }));
}

export function toggleLocalReaction(
  postId: string,
  userId: string,
  currentlyReacted: boolean,
  nextLikesCount?: number
): void {
  ensureLocalDatabaseInitialized();
  const canonicalUserId = remapAuthorIdIfNeeded(userId) || userId;
  const all = safeReadJson<(Reaction & { id: string })[]>(STORAGE_KEYS.REACTIONS, []);
  const id = `${postId}_${canonicalUserId}`;
  const next = currentlyReacted
    ? all.filter(
        (r) =>
          !(
            r.postId === postId &&
            (r.userId === userId || r.userId === canonicalUserId)
          )
      )
    : [
        ...all.filter(
          (r) =>
            !(
              r.postId === postId &&
              (r.userId === userId || r.userId === canonicalUserId)
            )
        ),
        {
          id,
          postId,
          userId: canonicalUserId,
          type: 'damay' as const,
          createdAt: Timestamp.now(),
        },
      ];
  safeWriteJson(STORAGE_KEYS.REACTIONS, next);
  recentReactionMutations.set(id, {
    postId,
    userId: canonicalUserId,
    reacted: !currentlyReacted,
    likesCount: nextLikesCount,
    timestampMs: Date.now(),
  });
  if (typeof nextLikesCount === 'number' && nextLikesCount >= 0) {
    const prevMut = recentPostFieldMutations.get(postId);
    recentPostFieldMutations.set(postId, {
      fields: { ...(prevMut?.fields || {}), likesCount: nextLikesCount },
      timestampMs: Date.now(),
    });
    const existingPosts = safeReadJson<Post[]>(STORAGE_KEYS.POSTS, []);
    const postMap = new Map<string, Post>();
    getDefaultRestoredPosts().forEach((p) => {
      if (p?.id) postMap.set(p.id, p);
    });
    existingPosts.forEach((p) => {
      if (p?.id) postMap.set(p.id, { ...postMap.get(p.id), ...p });
    });
    const targetPost = postMap.get(postId);
    if (targetPost) {
      postMap.set(postId, {
        ...targetPost,
        likesCount: nextLikesCount,
        updatedAt: Timestamp.now(),
      });
      safeWriteJson(STORAGE_KEYS.POSTS, Array.from(postMap.values()));
    }
  }
  pushCloudMutation('toggle_reaction', {
    postId,
    userId: canonicalUserId,
    currentlyReacted,
    likesCount: nextLikesCount,
  });
  notifyDbUpdated('reactions');
  notifyDbUpdated('posts');
}

export function getLocalSuggestions(): Suggestion[] {
  ensureLocalDatabaseInitialized();
  const raw = safeReadJson<Suggestion[]>(STORAGE_KEYS.SUGGESTIONS, []);
  const combinedMap = new Map<string, Suggestion>();
  getDefaultRestoredSuggestions().forEach((s) => {
    if (s?.id) combinedMap.set(s.id, s);
  });
  raw.forEach((s) => {
    if (s?.id && !FAKE_SUGGESTION_IDS.has(s.id)) combinedMap.set(s.id, s);
  });
  const hydrated = Array.from(combinedMap.values()).map((s) => ({
    ...s,
    authorId: remapAuthorIdIfNeeded(s.authorId, s.authorNickname),
    createdAt: hydrateTimestamp(s.createdAt),
    updatedAt: hydrateTimestamp(s.updatedAt),
    adminRepliedAt: s.adminRepliedAt ? hydrateTimestamp(s.adminRepliedAt) : null,
  }));
  hydrated.sort((a, b) => {
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });
  return hydrated;
}

export function saveLocalSuggestions(suggestions: Suggestion[]): void {
  const existing = safeReadJson<Suggestion[]>(STORAGE_KEYS.SUGGESTIONS, []);
  const map = new Map<string, Suggestion>();
  existing.forEach((s) => {
    if (s?.id && !FAKE_SUGGESTION_IDS.has(s.id)) map.set(s.id, s);
  });
  suggestions.forEach((s) => {
    if (s?.id && !FAKE_SUGGESTION_IDS.has(s.id)) map.set(s.id, s);
  });
  safeWriteJson(STORAGE_KEYS.SUGGESTIONS, Array.from(map.values()));
  notifyDbUpdated('suggestions');
}

export function upsertLocalSuggestion(suggestion: Suggestion): void {
  const existing = safeReadJson<Suggestion[]>(STORAGE_KEYS.SUGGESTIONS, []);
  const map = new Map<string, Suggestion>();
  existing.forEach((s) => {
    if (s?.id && !FAKE_SUGGESTION_IDS.has(s.id)) map.set(s.id, s);
  });
  const nextSug = {
    ...suggestion,
    createdAt: suggestion.createdAt || Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  map.set(suggestion.id, nextSug);
  safeWriteJson(STORAGE_KEYS.SUGGESTIONS, Array.from(map.values()));
  pushCloudMutation('upsert_suggestion', { suggestion: nextSug });
  notifyDbUpdated('suggestions');
}

export function updateLocalSuggestionFields(
  suggestionId: string,
  fields: Partial<Suggestion>
): void {
  const existing = safeReadJson<Suggestion[]>(STORAGE_KEYS.SUGGESTIONS, []);
  const updated = existing.map((s) =>
    s.id === suggestionId
      ? {
          ...s,
          ...fields,
          updatedAt: Timestamp.now(),
        }
      : s
  );
  safeWriteJson(STORAGE_KEYS.SUGGESTIONS, updated);
  pushCloudMutation('update_suggestion_fields', { suggestionId, fields });
  notifyDbUpdated('suggestions');
}

export function deleteLocalSuggestion(suggestionId: string): void {
  const existing = safeReadJson<Suggestion[]>(STORAGE_KEYS.SUGGESTIONS, []);
  safeWriteJson(
    STORAGE_KEYS.SUGGESTIONS,
    existing.filter((s) => s.id !== suggestionId)
  );
  pushCloudMutation('delete_suggestion', { suggestionId });
  notifyDbUpdated('suggestions');
}

export function getLocalChatThreadsForUser(userProfile: UserPublicProfile): ChatThread[] {
  ensureLocalDatabaseInitialized();
  const all = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
  const readChatIds = new Set<string>(
    safeReadJson<string[]>('one_msu_read_chat_ids_v1', [])
  );
  const welcomeChatId = buildChatId(userProfile.uid, ONE_OFFICIAL_UID);

  // Ensure every user also has the official ONE platform update thread without re-triggering unread popups
  if (userProfile.uid && userProfile.uid !== ONE_OFFICIAL_UID) {
    const sortedUids = [userProfile.uid, ONE_OFFICIAL_UID].sort();
    const isOneUserA = sortedUids[0] === ONE_OFFICIAL_UID;
    const existingOneThread = all.find((t) => t.id === welcomeChatId);
    const wasDeletedByUser =
      Array.isArray(existingOneThread?.deletedBy) &&
      existingOneThread.deletedBy.includes(userProfile.uid);

    if (!wasDeletedByUser) {
      const msgs = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
      const updateMsgId = `msg_update_v7_${userProfile.uid}`.slice(0, 120);
      const isAlreadyRead = true;
      if (!msgs.some((m) => m.id === updateMsgId)) {
        const updatePreview =
          '📢 Official ONE Update: Campus Marketplace, Persistent Dashboard Routing, Official ONE Broadcasts, Contact Support & All 11 MSU Domains are live!';
        const updateFullText =
          '📢 Official Announcement from ONE Platform\n\n📌 🚀 ONE Platform Update (Desktop & Mobile): Campus Marketplace, Persistent Routing, Official ONE Broadcasts, Contact Support & All 11 MSU Domains!\n\nEverything on ONE is now updated and live across both Desktop and Mobile for all MSUans:\n• 🎓 All 11 Official MSU Campus Domains Supported: Sign in with Google using your official MSU email (ex: @msumain.edu.ph, @s.msumain.edu.ph, @msuiit.edu.ph, @g.msuiit.edu.ph, @sulat.msuiit.edu.ph, @msugensan.edu.ph, @msutawi-tawi.edu.ph, @msunaawan.edu.ph, @msumaguindanao.edu.ph, @msusulu.edu.ph, @msubuug.edu.ph).\n• 🛍️ Campus Marketplace (/marketplace): Buy, sell, and look for textbooks, calculators, uniforms, dorm essentials, and food across all MSU campuses with direct "Message Seller" chat.\n• ⚡ Persistent Dashboard Routing on Refresh: Refreshing or sharing links like /marketplace, /messages, /notifications, /files, /my-posts, /suggestions, or /settings stays on that exact dashboard on Desktop & Mobile.\n• 📢 Official Admin Broadcasts via @ONE: Receive official announcements in Notifications and your @ONE Messenger inbox (read-only broadcast channel).\n• 🛟 Contact Support (/support): Ask anything or request help directly from Contact Support — Admin replies arrive right in your Messenger!\n• 🗑️ Per-User Chat Deletion & PDF Reviewer Preview: Delete any conversation from your own inbox view without affecting the other person, and preview PDF study reviewers right inside the feed.';

        const filteredMsgs = msgs.filter(
          (m) => m.id !== `msg_update_v6_${userProfile.uid}`.slice(0, 120)
        );
        filteredMsgs.push({
          id: updateMsgId,
          chatId: welcomeChatId,
          participantIds: sortedUids,
          senderId: ONE_OFFICIAL_UID,
          recipientId: userProfile.uid,
          senderNickname: ONE_OFFICIAL_NAME,
          senderPhotoURL: ONE_LOGO_DATA_URL,
          senderBadge: ONE_OFFICIAL_BADGE,
          text: updateFullText,
          attachmentType: 'none',
          attachmentName: '',
          attachmentSize: 0,
          attachmentMime: '',
          attachmentDataUrl: '',
          read: isAlreadyRead,
          createdAt: Timestamp.fromMillis(1790440000000),
        });
        safeWriteJson(STORAGE_KEYS.MESSAGES, filteredMsgs);

        const updatedThread: ChatThread = {
          ...(existingOneThread || {}),
          id: welcomeChatId,
          participantIds: sortedUids,
          userAId: isOneUserA ? ONE_OFFICIAL_UID : userProfile.uid,
          userANickname: isOneUserA ? ONE_OFFICIAL_NAME : userProfile.nickname,
          userAPhotoURL: isOneUserA ? ONE_LOGO_DATA_URL : userProfile.photoURL || '',
          userABadge: isOneUserA ? ONE_OFFICIAL_BADGE : userProfile.badge || 'verified',
          userBId: isOneUserA ? userProfile.uid : ONE_OFFICIAL_UID,
          userBNickname: isOneUserA ? userProfile.nickname : ONE_OFFICIAL_NAME,
          userBPhotoURL: isOneUserA ? userProfile.photoURL || '' : ONE_LOGO_DATA_URL,
          userBBadge: isOneUserA ? userProfile.badge || 'verified' : ONE_OFFICIAL_BADGE,
          lastMessage: updatePreview,
          lastSenderId: ONE_OFFICIAL_UID,
          lastMessageRead: isAlreadyRead,
          lastMessageReadAt: isAlreadyRead ? Timestamp.now() : null,
          createdAt: existingOneThread?.createdAt || Timestamp.fromMillis(1790430000000),
          updatedAt: Timestamp.fromMillis(1790440000000),
        };
        const nextThreads = all.filter((t) => t.id !== welcomeChatId);
        nextThreads.push(updatedThread);
        all.splice(0, all.length, ...nextThreads);
        safeWriteJson(STORAGE_KEYS.CHATS, all);
      }
    }
  }

  const users = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
  const userMap = new Map<string, UserPublicProfile>();
  users.forEach((u) => {
    if (u?.uid) userMap.set(u.uid, u);
  });

  const threadMap = new Map<string, ChatThread>();
  all.forEach((t) => {
    if (t?.id) {
      threadMap.set(t.id, {
        ...t,
        lastMessageRead: readChatIds.has(t.id) ? true : Boolean(t.lastMessageRead),
      });
    }
  });

  // Also ensure any thread with messages in STORAGE_KEYS.MESSAGES is represented
  const allMsgs = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
  allMsgs.forEach((m) => {
    if (!m?.chatId || !m.senderId || !m.recipientId) return;
    if (m.senderId !== userProfile.uid && m.recipientId !== userProfile.uid) return;
    if (Array.isArray(m.deletedFor) && m.deletedFor.includes(userProfile.uid)) return;
    const sorted = [m.senderId, m.recipientId].sort();
    const userAId = sorted[0];
    const userBId = sorted[1];
    const userA = userMap.get(userAId);
    const userB = userMap.get(userBId);
    const existing = threadMap.get(m.chatId);
    const msgTime = hydrateTimestamp(m.createdAt);
    const existingTime = existing ? hydrateTimestamp(existing.updatedAt) : null;
    const isNewer =
      !existingTime || (msgTime?.toMillis() || 0) >= (existingTime?.toMillis() || 0);
    const preview =
      m.text || (m.attachmentName ? `Sent ${m.attachmentName}` : 'Sent a message');

    if (!existing || isNewer) {
      const nextDeletedBy = Array.isArray(existing?.deletedBy)
        ? existing.deletedBy.filter((uid) => uid !== userProfile.uid)
        : [];
      threadMap.set(m.chatId, {
        ...existing,
        id: m.chatId,
        participantIds: sorted,
        userAId,
        userANickname:
          existing?.userANickname ||
          userA?.nickname ||
          (userAId === ONE_OFFICIAL_UID
            ? ONE_OFFICIAL_NAME
            : userAId === m.senderId
            ? m.senderNickname
            : 'Student'),
        userAPhotoURL:
          existing?.userAPhotoURL ||
          userA?.photoURL ||
          (userAId === ONE_OFFICIAL_UID
            ? ONE_LOGO_DATA_URL
            : userAId === m.senderId
            ? m.senderPhotoURL
            : ''),
        userABadge:
          existing?.userABadge ||
          userA?.badge ||
          (userAId === ONE_OFFICIAL_UID
            ? ONE_OFFICIAL_BADGE
            : userAId === m.senderId
            ? m.senderBadge
            : 'verified'),
        userBId,
        userBNickname:
          existing?.userBNickname ||
          userB?.nickname ||
          (userBId === ONE_OFFICIAL_UID
            ? ONE_OFFICIAL_NAME
            : userBId === m.senderId
            ? m.senderNickname
            : 'Student'),
        userBPhotoURL:
          existing?.userBPhotoURL ||
          userB?.photoURL ||
          (userBId === ONE_OFFICIAL_UID
            ? ONE_LOGO_DATA_URL
            : userBId === m.senderId
            ? m.senderPhotoURL
            : ''),
        userBBadge:
          existing?.userBBadge ||
          userB?.badge ||
          (userBId === ONE_OFFICIAL_UID
            ? ONE_OFFICIAL_BADGE
            : userBId === m.senderId
            ? m.senderBadge
            : 'verified'),
        lastMessage: existing?.lastMessage || preview.slice(0, 300),
        lastSenderId: m.senderId,
        lastMessageRead:
          readChatIds.has(m.chatId) ||
          Boolean(existing?.lastMessageRead) ||
          Boolean(m.read),
        lastMessageReadAt: m.readAt ? hydrateTimestamp(m.readAt) : existing?.lastMessageReadAt || null,
        deletedBy: nextDeletedBy,
        createdAt: existing?.createdAt || msgTime,
        updatedAt: msgTime,
      });
    }
  });

  return Array.from(threadMap.values())
    .filter(
      (t) =>
        Array.isArray(t.participantIds) &&
        t.participantIds.includes(userProfile.uid) &&
        !(Array.isArray(t.deletedBy) && t.deletedBy.includes(userProfile.uid))
    )
    .map((t) => ({
      ...t,
      lastMessageRead: readChatIds.has(t.id) ? true : Boolean(t.lastMessageRead),
      createdAt: hydrateTimestamp(t.createdAt),
      updatedAt: hydrateTimestamp(t.updatedAt),
      lastMessageReadAt: t.lastMessageReadAt ? hydrateTimestamp(t.lastMessageReadAt) : null,
    }))
    .sort((a, b) => {
      const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
      const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
      return bTime - aTime;
    });
}

export function upsertLocalChatThread(thread: ChatThread): void {
  const all = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
  const readChatIds = new Set<string>(
    safeReadJson<string[]>('one_msu_read_chat_ids_v1', [])
  );
  const map = new Map<string, ChatThread>();
  all.forEach((t) => map.set(t.id, t));
  const existing = map.get(thread.id);
  const preserveRead =
    readChatIds.has(thread.id) &&
    (!existing || existing.lastMessage === thread.lastMessage);
  const nextThread: ChatThread = preserveRead
    ? {
        ...thread,
        lastMessageRead: true,
        lastMessageReadAt: thread.lastMessageReadAt || existing?.lastMessageReadAt || Timestamp.now(),
      }
    : thread;
  map.set(thread.id, nextThread);
  safeWriteJson(STORAGE_KEYS.CHATS, Array.from(map.values()));
  pushCloudMutation('upsert_chat_thread', { thread: nextThread });
  notifyDbUpdated('chats');
}

export function markLocalChatThreadRead(chatId: string, recipientId: string): void {
  const readChatIds = new Set<string>(
    safeReadJson<string[]>('one_msu_read_chat_ids_v1', [])
  );
  readChatIds.add(chatId);
  safeWriteJson('one_msu_read_chat_ids_v1', Array.from(readChatIds));

  const allMsgs = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
  let msgsChanged = false;
  const updatedMsgs = allMsgs.map((m) => {
    if (m.chatId === chatId && !m.read) {
      msgsChanged = true;
      return { ...m, read: true, readAt: Timestamp.now() };
    }
    return m;
  });
  if (msgsChanged) {
    safeWriteJson(STORAGE_KEYS.MESSAGES, updatedMsgs);
  }

  const allChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
  let chatsChanged = false;
  const updatedChats = allChats.map((t) => {
    if (t.id === chatId && !t.lastMessageRead) {
      chatsChanged = true;
      return { ...t, lastMessageRead: true, lastMessageReadAt: Timestamp.now() };
    }
    return t;
  });
  if (chatsChanged) {
    safeWriteJson(STORAGE_KEYS.CHATS, updatedChats);
  }

  // Also mark any matching notifications for this chatId as read
  const allNotifs = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  let notifsChanged = false;
  const updatedNotifs = allNotifs.map((n) => {
    if (
      n.recipientId === recipientId &&
      !n.read &&
      (n.targetId === chatId || (n.type === 'message' && chatId.includes(n.actorId)))
    ) {
      notifsChanged = true;
      return { ...n, read: true };
    }
    return n;
  });
  if (notifsChanged) {
    safeWriteJson(STORAGE_KEYS.NOTIFICATIONS, updatedNotifs);
  }

  pushCloudMutation('mark_chat_thread_read', { chatId, recipientId });
  notifyDbUpdated('messages');
  notifyDbUpdated('chats');
  if (notifsChanged) {
    notifyDbUpdated('notifications');
  }
}

export function getLocalChatMessages(chatId: string, viewerUid?: string): ChatMessage[] {
  ensureLocalDatabaseInitialized();
  const all = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
  return all
    .filter(
      (m) =>
        m.chatId === chatId &&
        !(viewerUid && Array.isArray(m.deletedFor) && m.deletedFor.includes(viewerUid))
    )
    .map((m) => ({
      ...m,
      createdAt: hydrateTimestamp(m.createdAt),
      readAt: m.readAt ? hydrateTimestamp(m.readAt) : null,
    }))
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return aTime - bTime;
    });
}

export function deleteLocalChatThreadForUser(chatId: string, userId: string): void {
  if (!chatId || !userId) return;
  const allChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
  const updatedChats = allChats.map((t) => {
    if (t.id === chatId) {
      const prev = Array.isArray(t.deletedBy) ? t.deletedBy : [];
      return prev.includes(userId) ? t : { ...t, deletedBy: [...prev, userId] };
    }
    return t;
  });
  safeWriteJson(STORAGE_KEYS.CHATS, updatedChats);

  const allMsgs = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const updatedMsgs = allMsgs.map((m) => {
    if (m.chatId === chatId) {
      const prev = Array.isArray(m.deletedFor) ? m.deletedFor : [];
      return prev.includes(userId) ? m : { ...m, deletedFor: [...prev, userId] };
    }
    return m;
  });
  safeWriteJson(STORAGE_KEYS.MESSAGES, updatedMsgs);

  pushCloudMutation('delete_chat_thread_for_user', { chatId, userId });
  notifyDbUpdated('chats');
  notifyDbUpdated('messages');
}

export function upsertLocalChatMessage(msg: ChatMessage): void {
  const all = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const map = new Map<string, ChatMessage>();
  all.forEach((m) => map.set(m.id, m));
  const existingMsg = map.get(msg.id);

  const readChatIds = new Set<string>(
    safeReadJson<string[]>('one_msu_read_chat_ids_v1', [])
  );
  // Only clear readChatIds if this is a brand-new incoming message not previously stored
  if (
    !existingMsg &&
    msg.chatId &&
    msg.senderId &&
    msg.senderId !== ONE_OFFICIAL_UID &&
    !msg.read &&
    readChatIds.has(msg.chatId)
  ) {
    readChatIds.delete(msg.chatId);
    safeWriteJson('one_msu_read_chat_ids_v1', Array.from(readChatIds));
  }

  const resolvedRead =
    Boolean(existingMsg?.read) || readChatIds.has(msg.chatId) || Boolean(msg.read);
  const nextMsg: ChatMessage = {
    ...msg,
    read: resolvedRead,
  };
  map.set(msg.id, nextMsg);
  safeWriteJson(STORAGE_KEYS.MESSAGES, Array.from(map.values()));

  if (msg.chatId) {
    const allChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
    let chatsModified = false;
    const nextChats = allChats.map((t) => {
      if (t.id === msg.chatId && Array.isArray(t.deletedBy) && t.deletedBy.length > 0) {
        const filtered = t.deletedBy.filter(
          (uid) => uid !== msg.senderId && uid !== msg.recipientId
        );
        if (filtered.length !== t.deletedBy.length) {
          chatsModified = true;
          return { ...t, deletedBy: filtered };
        }
      }
      return t;
    });
    if (chatsModified) {
      safeWriteJson(STORAGE_KEYS.CHATS, nextChats);
    }
  }

  pushCloudMutation('upsert_chat_message', { message: nextMsg });
  syncUserChatReplyToSupportTickets(nextMsg);
  notifyDbUpdated('messages');
}

export function deleteLocalChatMessage(msgId: string): void {
  const all = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
  safeWriteJson(
    STORAGE_KEYS.MESSAGES,
    all.filter((m) => m.id !== msgId)
  );
  pushCloudMutation('delete_chat_message', { messageId: msgId });
  notifyDbUpdated('messages');
}

export function getLocalNotificationsForUser(uid: string): NotificationItem[] {
  ensureLocalDatabaseInitialized();
  const deletedPostSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_posts', [])
  );
  FAKE_POST_IDS.forEach((id) => deletedPostSet.add(id));
  const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  return all
    .filter(
      (n) =>
        n.recipientId === uid &&
        !(n.targetId && deletedPostSet.has(n.targetId))
    )
    .map((n) => ({
      ...n,
      createdAt: hydrateTimestamp(n.createdAt),
    }))
    .sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime;
    });
}

export function upsertLocalNotification(notif: NotificationItem): void {
  const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const map = new Map<string, NotificationItem>();
  all.forEach((n) => map.set(n.id, n));
  const existing = map.get(notif.id);
  const nextNotif: NotificationItem = existing?.read ? { ...notif, read: true } : notif;
  map.set(notif.id, nextNotif);
  safeWriteJson(STORAGE_KEYS.NOTIFICATIONS, Array.from(map.values()));
  pushCloudMutation('upsert_notification', { notification: nextNotif });
  notifyDbUpdated('notifications');
}

export function markLocalNotificationRead(notificationId: string): void {
  const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const updated = all.map((n) => (n.id === notificationId ? { ...n, read: true } : n));
  safeWriteJson(STORAGE_KEYS.NOTIFICATIONS, updated);
  pushCloudMutation('mark_notification_read', { notificationId });
  notifyDbUpdated('notifications');
}

export function markAllLocalNotificationsRead(recipientId: string): void {
  const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const updated = all.map((n) => (n.recipientId === recipientId ? { ...n, read: true } : n));
  safeWriteJson(STORAGE_KEYS.NOTIFICATIONS, updated);

  // Also mark all chat threads and messages for this user as read so no sticky unread count remains
  const allChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
  const readChatIds = new Set<string>(
    safeReadJson<string[]>('one_msu_read_chat_ids_v1', [])
  );
  const updatedChats = allChats.map((t) => {
    if (Array.isArray(t.participantIds) && t.participantIds.includes(recipientId)) {
      readChatIds.add(t.id);
      return { ...t, lastMessageRead: true, lastMessageReadAt: Timestamp.now() };
    }
    return t;
  });
  safeWriteJson('one_msu_read_chat_ids_v1', Array.from(readChatIds));
  safeWriteJson(STORAGE_KEYS.CHATS, updatedChats);

  const allMsgs = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const updatedMsgs = allMsgs.map((m) =>
    m.recipientId === recipientId || (m.chatId && readChatIds.has(m.chatId))
      ? { ...m, read: true, readAt: Timestamp.now() }
      : m
  );
  safeWriteJson(STORAGE_KEYS.MESSAGES, updatedMsgs);

  pushCloudMutation('mark_all_notifications_read', { recipientId });
  notifyDbUpdated('notifications');
  notifyDbUpdated('chats');
  notifyDbUpdated('messages');
}

export function deleteLocalNotification(notificationId: string): void {
  const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  safeWriteJson(
    STORAGE_KEYS.NOTIFICATIONS,
    all.filter((n) => n.id !== notificationId)
  );
  pushCloudMutation('delete_notification', { notificationId });
  notifyDbUpdated('notifications');
}

export function clearAllLocalNotifications(recipientId: string): void {
  const all = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  safeWriteJson(
    STORAGE_KEYS.NOTIFICATIONS,
    all.filter((n) => n.recipientId !== recipientId)
  );
  pushCloudMutation('clear_all_notifications', { recipientId });
  notifyDbUpdated('notifications');
}

export function getLocalReports(): ContentReport[] {
  ensureLocalDatabaseInitialized();
  const all = safeReadJson<ContentReport[]>(STORAGE_KEYS.REPORTS, []);
  return all.map((r) => ({
    ...r,
    createdAt: hydrateTimestamp(r.createdAt),
    updatedAt: hydrateTimestamp(r.updatedAt),
  }));
}

export function upsertLocalReport(report: ContentReport): void {
  const all = safeReadJson<ContentReport[]>(STORAGE_KEYS.REPORTS, []);
  const map = new Map<string, ContentReport>();
  all.forEach((r) => map.set(r.id, r));
  map.set(report.id, report);
  safeWriteJson(STORAGE_KEYS.REPORTS, Array.from(map.values()));
  pushCloudMutation('upsert_report', { report });
  notifyDbUpdated('reports');
}

export function deleteLocalReport(reportId: string): void {
  const all = safeReadJson<ContentReport[]>(STORAGE_KEYS.REPORTS, []);
  safeWriteJson(
    STORAGE_KEYS.REPORTS,
    all.filter((r) => r.id !== reportId)
  );
  pushCloudMutation('delete_report', { reportId });
  notifyDbUpdated('reports');
}

export function getLocalModerationRules(): ModerationRule[] {
  ensureLocalDatabaseInitialized();
  const all = safeReadJson<ModerationRule[]>(STORAGE_KEYS.MODERATION_RULES, []);
  return all.map((r) => ({
    ...r,
    createdAt: hydrateTimestamp(r.createdAt),
    updatedAt: hydrateTimestamp(r.updatedAt),
  }));
}

export function upsertLocalModerationRule(rule: ModerationRule): void {
  const all = safeReadJson<ModerationRule[]>(STORAGE_KEYS.MODERATION_RULES, []);
  const map = new Map<string, ModerationRule>();
  all.forEach((r) => map.set(r.id, r));
  map.set(rule.id, rule);
  safeWriteJson(STORAGE_KEYS.MODERATION_RULES, Array.from(map.values()));
  pushCloudMutation('upsert_moderation_rule', { rule });
  notifyDbUpdated('moderation_rules');
}

export function deleteLocalModerationRule(ruleId: string): void {
  const all = safeReadJson<ModerationRule[]>(STORAGE_KEYS.MODERATION_RULES, []);
  safeWriteJson(
    STORAGE_KEYS.MODERATION_RULES,
    all.filter((r) => r.id !== ruleId)
  );
  pushCloudMutation('delete_moderation_rule', { ruleId });
  notifyDbUpdated('moderation_rules');
}

export function getLocalPlatformSettings(): PlatformSettings {
  ensureLocalDatabaseInitialized();
  const saved = safeReadJson<Partial<PlatformSettings>>(STORAGE_KEYS.PLATFORM_SETTINGS, {});
  return {
    ...DEFAULT_PLATFORM_SETTINGS,
    ...saved,
  };
}

export function saveLocalPlatformSettings(settings: PlatformSettings): void {
  safeWriteJson(STORAGE_KEYS.PLATFORM_SETTINGS, settings);
  pushCloudMutation('save_platform_settings', { settings });
  notifyDbUpdated('platform_settings');
}

export function getLocalMarketplaceListings(): MarketplaceListing[] {
  ensureLocalDatabaseInitialized();
  const deletedSet = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_marketplace', [])
  );
  const raw = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
  const combinedMap = new Map<string, MarketplaceListing>();
  raw.forEach((m) => {
    if (!isDemoOrFakeMarketplaceListing(m) && !deletedSet.has(m.id)) {
      combinedMap.set(m.id, {
        ...m,
        imageUrl: m.imageUrl || '',
      });
    }
  });
  const users = safeReadJson<UserPublicProfile[]>(STORAGE_KEYS.USERS, []);
  const userMap = new Map<string, UserPublicProfile>();
  users.forEach((u) => {
    if (u?.uid) userMap.set(u.uid, u);
  });
  const hydrated = Array.from(combinedMap.values()).map((m) => {
    const realAuthorId = remapAuthorIdIfNeeded(m.authorId, m.authorNickname);
    const latestAuthor = realAuthorId ? userMap.get(realAuthorId) : undefined;
    return {
      ...m,
      authorId: realAuthorId,
      authorNickname: latestAuthor?.nickname || m.authorNickname,
      authorDisplayName:
        latestAuthor?.nickname || latestAuthor?.googleDisplayName || m.authorDisplayName,
      authorPhotoURL:
        latestAuthor?.photoURL !== undefined && latestAuthor.photoURL !== ''
          ? latestAuthor.photoURL
          : m.authorPhotoURL,
      authorBadge: latestAuthor?.badge || m.authorBadge || 'verified',
      createdAt: hydrateTimestamp(m.createdAt),
      updatedAt: hydrateTimestamp(m.updatedAt),
    };
  });
  hydrated.sort((a, b) => {
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return bTime - aTime;
  });
  return hydrated;
}

export function upsertLocalMarketplaceListing(listing: MarketplaceListing): void {
  const existing = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
  const map = new Map<string, MarketplaceListing>();
  existing.forEach((m) => {
    if (m?.id) map.set(m.id, m);
  });
  const nextListing: MarketplaceListing = {
    ...listing,
    createdAt: listing.createdAt || Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  map.set(listing.id, nextListing);
  safeWriteJson(STORAGE_KEYS.MARKETPLACE, Array.from(map.values()));
  pushCloudMutation('upsert_marketplace_listing', { listing: nextListing });
  notifyDbUpdated('marketplace');
}

export function updateLocalMarketplaceListingFields(
  listingId: string,
  fields: Partial<MarketplaceListing>
): void {
  if (FAKE_MARKETPLACE_IDS.has(listingId)) return;
  const existing = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
  const map = new Map<string, MarketplaceListing>();
  existing.forEach((m) => {
    if (!isDemoOrFakeMarketplaceListing(m)) map.set(m.id, m);
  });
  const target = map.get(listingId);
  if (target) {
    const updated: MarketplaceListing = {
      ...target,
      ...fields,
      updatedAt: Timestamp.now(),
    };
    map.set(listingId, updated);
    safeWriteJson(STORAGE_KEYS.MARKETPLACE, Array.from(map.values()));
    pushCloudMutation('update_marketplace_listing_fields', { listingId, fields });
    notifyDbUpdated('marketplace');
  }
}

export function deleteLocalMarketplaceListing(listingId: string): void {
  const deletedIds = new Set<string>(
    safeReadJson<string[]>('one_msu_db_v2_deleted_marketplace', [])
  );
  deletedIds.add(listingId);
  safeWriteJson('one_msu_db_v2_deleted_marketplace', Array.from(deletedIds));

  const existing = safeReadJson<MarketplaceListing[]>(STORAGE_KEYS.MARKETPLACE, []);
  safeWriteJson(
    STORAGE_KEYS.MARKETPLACE,
    existing.filter((m) => m.id !== listingId)
  );
  pushCloudMutation('delete_marketplace_listing', { listingId });
  notifyDbUpdated('marketplace');
}

export function broadcastAdminPostToAllUsers(
  post: Post,
  adminProfile: UserPublicProfile
): void {
  if (!post?.id) return;
  const users = getLocalUsers();
  const nowTs = Timestamp.now();
  const senderLabel = adminProfile?.nickname ? `@${adminProfile.nickname}` : 'Platform Admin';
  const postTitleLine = post.title ? `📌 ${post.title}\n\n` : '';
  const msgText = `📢 Official Announcement from ${senderLabel}\n\n${postTitleLine}${String(
    post.content || ''
  ).slice(0, 1800)}`;
  const previewText = `📢 Official Post from ${senderLabel}: ${
    post.title || String(post.content || '').slice(0, 120)
  }`.slice(0, 280);

  const allNotifs = safeReadJson<NotificationItem[]>(STORAGE_KEYS.NOTIFICATIONS, []);
  const notifMap = new Map<string, NotificationItem>();
  allNotifs.forEach((n) => {
    if (n?.id) notifMap.set(n.id, n);
  });

  const allChats = safeReadJson<ChatThread[]>(STORAGE_KEYS.CHATS, []);
  const chatMap = new Map<string, ChatThread>();
  allChats.forEach((t) => {
    if (t?.id) chatMap.set(t.id, t);
  });

  const allMsgs = safeReadJson<ChatMessage[]>(STORAGE_KEYS.MESSAGES, []);
  const msgMap = new Map<string, ChatMessage>();
  allMsgs.forEach((m) => {
    if (m?.id) msgMap.set(m.id, m);
  });

  users.forEach((u) => {
    if (!u?.uid || u.uid === ONE_OFFICIAL_UID || u.uid === post.authorId) return;

    const notifId = `notif_admin_post_${post.id}_${u.uid}`.slice(0, 120);
    notifMap.set(notifId, {
      id: notifId,
      recipientId: u.uid,
      actorId: ONE_OFFICIAL_UID,
      actorNickname: ONE_OFFICIAL_NAME,
      actorPhotoURL: ONE_LOGO_DATA_URL,
      actorBadge: ONE_OFFICIAL_BADGE,
      type: 'developer_post',
      targetId: post.id,
      previewText: previewText,
      read: false,
      createdAt: nowTs,
    });

    const sortedUids = [u.uid, ONE_OFFICIAL_UID].sort();
    const chatId = buildChatId(u.uid, ONE_OFFICIAL_UID);
    const isOneUserA = sortedUids[0] === ONE_OFFICIAL_UID;
    const existingThread = chatMap.get(chatId);
    const nextDeletedBy = Array.isArray(existingThread?.deletedBy)
      ? existingThread.deletedBy.filter((id) => id !== u.uid)
      : [];

    chatMap.set(chatId, {
      ...existingThread,
      id: chatId,
      participantIds: sortedUids,
      userAId: isOneUserA ? ONE_OFFICIAL_UID : u.uid,
      userANickname: isOneUserA ? ONE_OFFICIAL_NAME : u.nickname || 'Student',
      userAPhotoURL: isOneUserA ? ONE_LOGO_DATA_URL : u.photoURL || '',
      userABadge: isOneUserA ? ONE_OFFICIAL_BADGE : u.badge || 'verified',
      userBId: isOneUserA ? u.uid : ONE_OFFICIAL_UID,
      userBNickname: isOneUserA ? u.nickname || 'Student' : ONE_OFFICIAL_NAME,
      userBPhotoURL: isOneUserA ? u.photoURL || '' : ONE_LOGO_DATA_URL,
      userBBadge: isOneUserA ? u.badge || 'verified' : ONE_OFFICIAL_BADGE,
      lastMessage: previewText,
      lastSenderId: ONE_OFFICIAL_UID,
      lastMessageRead: false,
      deletedBy: nextDeletedBy,
      createdAt: existingThread?.createdAt || nowTs,
      updatedAt: nowTs,
    });

    const msgId = `msg_admin_post_${post.id}_${u.uid}`.slice(0, 120);
    msgMap.set(msgId, {
      id: msgId,
      chatId,
      participantIds: sortedUids,
      senderId: ONE_OFFICIAL_UID,
      recipientId: u.uid,
      senderNickname: ONE_OFFICIAL_NAME,
      senderPhotoURL: ONE_LOGO_DATA_URL,
      senderBadge: ONE_OFFICIAL_BADGE,
      text: msgText,
      attachmentType: post.attachmentType || 'none',
      attachmentName: post.attachmentName || '',
      attachmentSize: post.attachmentSize || 0,
      attachmentMime: post.attachmentMime || '',
      attachmentDataUrl: post.attachmentDataUrl || '',
      read: false,
      createdAt: nowTs,
    });
  });

  safeWriteJson(STORAGE_KEYS.NOTIFICATIONS, Array.from(notifMap.values()));
  safeWriteJson(STORAGE_KEYS.CHATS, Array.from(chatMap.values()));
  safeWriteJson(STORAGE_KEYS.MESSAGES, Array.from(msgMap.values()));

  pushCloudMutation('broadcast_admin_post', {
    post,
    adminNickname: adminProfile?.nickname || 'xander',
    oneLogoDataUrl: ONE_LOGO_DATA_URL,
  });

  notifyDbUpdated('notifications');
  notifyDbUpdated('chats');
  notifyDbUpdated('messages');
}

export function getLocalSupportTickets(): SupportTicket[] {
  ensureLocalDatabaseInitialized();
  const raw = safeReadJson<SupportTicket[]>(STORAGE_KEYS.SUPPORT_TICKETS, []);
  const hydrated = raw
    .filter((t) => t?.id && t?.userId)
    .map((t) => ({
      ...t,
      replies: Array.isArray(t.replies)
        ? t.replies.map((r) => ({
            ...r,
            createdAt: hydrateTimestamp(r.createdAt),
          }))
        : [],
      createdAt: hydrateTimestamp(t.createdAt),
      updatedAt: hydrateTimestamp(t.updatedAt),
    }));
  hydrated.sort((a, b) => {
    const aTime = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
    const bTime = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
    return bTime - aTime;
  });
  return hydrated;
}

export function upsertLocalSupportTicket(ticket: SupportTicket): void {
  const existing = safeReadJson<SupportTicket[]>(STORAGE_KEYS.SUPPORT_TICKETS, []);
  const map = new Map<string, SupportTicket>();
  existing.forEach((t) => {
    if (t?.id) map.set(t.id, t);
  });
  const nextTicket: SupportTicket = {
    ...ticket,
    createdAt: ticket.createdAt || Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  map.set(ticket.id, nextTicket);
  safeWriteJson(STORAGE_KEYS.SUPPORT_TICKETS, Array.from(map.values()));
  pushCloudMutation('upsert_support_ticket', { ticket: nextTicket });
  notifyDbUpdated('support_tickets');
}

export function updateLocalSupportTicketFields(
  ticketId: string,
  fields: Partial<SupportTicket>
): void {
  const existing = safeReadJson<SupportTicket[]>(STORAGE_KEYS.SUPPORT_TICKETS, []);
  const map = new Map<string, SupportTicket>();
  existing.forEach((t) => {
    if (t?.id) map.set(t.id, t);
  });
  const target = map.get(ticketId);
  if (target) {
    const updated: SupportTicket = {
      ...target,
      ...fields,
      updatedAt: Timestamp.now(),
    };
    map.set(ticketId, updated);
    safeWriteJson(STORAGE_KEYS.SUPPORT_TICKETS, Array.from(map.values()));
    pushCloudMutation('update_support_ticket_fields', { ticketId, fields });
    notifyDbUpdated('support_tickets');
  }
}

export function deleteLocalSupportTicket(ticketId: string): void {
  const existing = safeReadJson<SupportTicket[]>(STORAGE_KEYS.SUPPORT_TICKETS, []);
  safeWriteJson(
    STORAGE_KEYS.SUPPORT_TICKETS,
    existing.filter((t) => t.id !== ticketId)
  );
  pushCloudMutation('delete_support_ticket', { ticketId });
  notifyDbUpdated('support_tickets');
}

export function syncUserChatReplyToSupportTickets(msg: ChatMessage): void {
  if (!msg?.senderId || !msg?.recipientId || !msg.text) return;
  const tickets = safeReadJson<SupportTicket[]>(STORAGE_KEYS.SUPPORT_TICKETS, []);
  if (tickets.length === 0) return;

  // Check if sender is the ticket owner replying to Contact Support or the admin/developer
  const isRecipientDeveloperOrAdmin =
    msg.recipientId === SUPPORT_OFFICIAL_UID ||
    msg.recipientId === '538a6246-5cc8-4c63-bbda-0507196f3d5d' ||
    tickets.some(
      (t) =>
        t.userId === msg.senderId &&
        (t.adminId === msg.recipientId || t.chatId === msg.chatId)
    );
  if (!isRecipientDeveloperOrAdmin) return;

  let changed = false;
  const updatedTickets = tickets.map((t) => {
    if (t.userId === msg.senderId && t.status !== 'resolved') {
      const existingReplies = Array.isArray(t.replies) ? t.replies : [];
      if (existingReplies.some((r) => r.id === msg.id)) return t;
      changed = true;
      const newReply: SupportTicketReply = {
        id: msg.id,
        senderId: msg.senderId,
        senderNickname: msg.senderNickname,
        senderPhotoURL: msg.senderPhotoURL || '',
        senderBadge: msg.senderBadge || 'verified',
        isAdmin: false,
        text: msg.text,
        createdAt: hydrateTimestamp(msg.createdAt) || Timestamp.now(),
      };
      const updatedTicket: SupportTicket = {
        ...t,
        chatId: msg.chatId,
        status: 'open',
        lastReplyText: msg.text,
        lastReplyBy: msg.senderNickname,
        replies: [...existingReplies, newReply],
        updatedAt: Timestamp.now(),
      };
      pushCloudMutation('upsert_support_ticket', { ticket: updatedTicket });
      return updatedTicket;
    }
    return t;
  });

  if (changed) {
    safeWriteJson(STORAGE_KEYS.SUPPORT_TICKETS, updatedTickets);
    notifyDbUpdated('support_tickets');
  }
}

/**
 * Full Database Restoration & Real User Synchronization Action:
 * Syncs all 529+ real verified MSUan users from Supabase Auth + Live Cloud Storage.
 */
export async function restoreFullDatabase(): Promise<{
  usersRestored: number;
  postsRestored: number;
  commentsRestored: number;
  suggestionsRestored: number;
  cloudSynced: boolean;
}> {
  ensureLocalDatabaseInitialized();
  let cloudSynced = false;
  for (const origin of BACKEND_API_ORIGINS) {
    try {
      const syncRes = await fetch(`${origin}/api/db/sync-auth-users`, { method: 'POST' });
      const contentType = syncRes.headers.get('content-type') || '';
      if (syncRes.ok && contentType.includes('application/json')) {
        cloudSynced = await syncFromBackendServer(true);
        break;
      }
    } catch {
      // Try next origin
    }
  }
  if (!cloudSynced) {
    cloudSynced = await syncFromBackendServer(true);
  }

  const finalUsers = getLocalUsers();
  const finalPosts = getLocalPosts();
  const finalComments = getLocalComments();
  const finalSuggestions = getLocalSuggestions();
  notifyDbUpdated('all');

  return {
    usersRestored: finalUsers.length,
    postsRestored: finalPosts.length,
    commentsRestored: finalComments.length,
    suggestionsRestored: finalSuggestions.length,
    cloudSynced,
  };
}

export function exportDatabaseBackupJson(): string {
  ensureLocalDatabaseInitialized();
  const payload = {
    version: 3,
    exportedAt: new Date().toISOString(),
    users: getLocalUsers(),
    usersPrivate: getLocalPrivateEmails(),
    presence: getLocalPresence(),
    posts: getLocalPosts(),
    comments: getLocalComments(),
    reactions: getLocalReactions(),
    suggestions: getLocalSuggestions(),
    moderationRules: getLocalModerationRules(),
    platformSettings: getLocalPlatformSettings(),
  };
  return JSON.stringify(payload, null, 2);
}

export function importDatabaseBackupJson(rawJson: string): {
  usersCount: number;
  postsCount: number;
} {
  const parsed = JSON.parse(rawJson) as {
    users?: UserPublicProfile[];
    usersPrivate?: Record<string, string>;
    posts?: Post[];
    comments?: Comment[];
    suggestions?: Suggestion[];
    moderationRules?: ModerationRule[];
    platformSettings?: PlatformSettings;
  };
  if (Array.isArray(parsed.users)) {
    saveLocalUsers(parsed.users);
  }
  if (parsed.usersPrivate && typeof parsed.usersPrivate === 'object') {
    safeWriteJson(STORAGE_KEYS.USERS_PRIVATE, parsed.usersPrivate);
  }
  if (Array.isArray(parsed.posts)) {
    saveLocalPosts(parsed.posts);
  }
  if (Array.isArray(parsed.comments)) {
    safeWriteJson(STORAGE_KEYS.COMMENTS, parsed.comments);
  }
  if (Array.isArray(parsed.suggestions)) {
    saveLocalSuggestions(parsed.suggestions);
  }
  if (Array.isArray(parsed.moderationRules)) {
    safeWriteJson(STORAGE_KEYS.MODERATION_RULES, parsed.moderationRules);
  }
  if (parsed.platformSettings && typeof parsed.platformSettings === 'object') {
    saveLocalPlatformSettings(parsed.platformSettings);
  }
  notifyDbUpdated('all');
  return {
    usersCount: getLocalUsers().length,
    postsCount: getLocalPosts().length,
  };
}
