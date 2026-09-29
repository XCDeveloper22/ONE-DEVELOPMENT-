import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPABASE_URL = 'https://kofgxwcnkapibioedhrh.supabase.co';
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_9FMsfEEp5dQd4f2vHt1u3A_amL3CsqM';

const sbAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STORAGE_BUCKET = 'app-files';
const DB_OBJECT_PATH = 'one-msu-live-db.json';
const LOCAL_DB_BACKUP_PATH = path.join(__dirname, '.one-msu-live-db-backup.json');

function getSupabaseForRequest(req?: express.Request) {
  const authHeader = req?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ') && authHeader.length > 25) {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
  }
  return sbAdmin;
}

const FAKE_USER_UIDS = new Set([
  'usr_xandercamarin_gmail_com',
  'usr_delacernaahrene122008_gmail_com',
  'usr_camarin_xn839_s_msumain_edu_ph',
  'usr_amirah_s_msumain_edu_ph',
  'usr_khalid_msuiit_edu_ph',
  'usr_ysabel_gensan_msu_edu_ph',
  'ibKOXniSPNYErJvZTJuyu3RBIqL2',
]);

const LEGACY_UID_TO_CANONICAL_UUID: Record<string, string> = {
  usr_xandercamarin_gmail_com: '538a6246-5cc8-4c63-bbda-0507196f3d5d',
  ibKOXniSPNYErJvZTJuyu3RBIqL2: '538a6246-5cc8-4c63-bbda-0507196f3d5d',
  usr_delacernaahrene122008_gmail_com: 'e61d24c6-ffc2-463c-bff9-2cd74b1edb5c',
  usr_camarin_xn839_s_msumain_edu_ph: '4ae58a7b-5104-4479-8667-ed9e465ba447',
  usr_amirah_s_msumain_edu_ph: '616a4ee1-a750-46af-86c3-23e10727f7d1',
  usr_khalid_msuiit_edu_ph: 'd89b4c02-cf71-4b46-963e-460e75c37674',
  usr_ysabel_gensan_msu_edu_ph: '062a2f0d-9673-424f-9f97-1db781d38d0e',
};

const CANONICAL_UUID_BY_EMAIL: Record<string, string> = {
  'xandercamarin@gmail.com': '538a6246-5cc8-4c63-bbda-0507196f3d5d',
  'camarin.xn839@s.msumain.edu.ph': '4ae58a7b-5104-4479-8667-ed9e465ba447',
  'delacernaahrene122008@gmail.com': 'e61d24c6-ffc2-463c-bff9-2cd74b1edb5c',
  'delecernaahrene122008@gmail.com': 'e61d24c6-ffc2-463c-bff9-2cd74b1edb5c',
};

const FAKE_POST_IDS = new Set([
  'post_one_latest_platform_update_v6',
  'post_one_latest_platform_update_v7',
  'post_welcome_one_msu',
  'post_tulips_campus_vibes',
  'post_study_reviewers_midterms',
  'post_anon_dorm_curfew',
  'post_1790442776915_ysqqhp',
]);
const FAKE_COMMENT_IDS = new Set([
  'cmt_welcome_1',
  'cmt_welcome_2',
  'cmt_welcome_3',
  'cmt_tulips_1',
  'cmt_tulips_2',
  'cmt_study_1',
  'cmt_dorm_1',
]);
const FAKE_SUGGESTION_IDS = new Set();
const FAKE_MARKETPLACE_IDS = new Set([
  'mkt_casio_classwiz_calc',
  'mkt_wtb_gec_textbooks',
  'mkt_dorm_desk_lamp_fan',
  'mkt_1790539752999_j0gbh',
  'mkt_1790564988600_hbzta',
  'mkt_1790565673437_73cwv',
]);

function isValidUuid(val = '') {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(val || '').trim()
  );
}

function resolveCanonicalUid(rawUid = '', rawEmail = ''): string {
  const cleanUid = String(rawUid || '').trim();
  const cleanEmail = String(rawEmail || '').trim().toLowerCase();
  if (cleanUid && LEGACY_UID_TO_CANONICAL_UUID[cleanUid]) {
    return LEGACY_UID_TO_CANONICAL_UUID[cleanUid];
  }
  if (cleanEmail && CANONICAL_UUID_BY_EMAIL[cleanEmail]) {
    return CANONICAL_UUID_BY_EMAIL[cleanEmail];
  }
  if (cleanEmail) {
    for (const [existingUid, existingEmail] of Object.entries(liveDb.usersPrivate)) {
      if (
        String(existingEmail || '').trim().toLowerCase() === cleanEmail &&
        isValidUuid(existingUid)
      ) {
        return existingUid;
      }
    }
  }
  return cleanUid;
}

function deduplicateAndNormalizeLiveUsers() {
  // Remove any legacy/fake/duplicate UIDs and merge into canonical UUIDs
  for (const fakeUid of Array.from(FAKE_USER_UIDS)) {
    delete liveDb.users[fakeUid];
    delete liveDb.usersPrivate[fakeUid];
    delete liveDb.presence[fakeUid];
  }

  // Deduplicate users sharing the same email so Desktop & Mobile always use 1 account
  const uidByEmail = new Map<string, string>();
  for (const [uid, emailVal] of Object.entries(liveDb.usersPrivate)) {
    const email = String(emailVal || '').trim().toLowerCase();
    if (!email) continue;
    const canonical = CANONICAL_UUID_BY_EMAIL[email] || uidByEmail.get(email);
    if (!canonical) {
      uidByEmail.set(email, uid);
    } else if (canonical !== uid) {
      const keepUid = isValidUuid(canonical) ? canonical : isValidUuid(uid) ? uid : canonical;
      const dropUid = keepUid === canonical ? uid : canonical;
      uidByEmail.set(email, keepUid);
      if (liveDb.users[dropUid]) {
        const keepUser = liveDb.users[keepUid] || {};
        const dropUser = liveDb.users[dropUid] || {};
        const keepTime = Number(keepUser.updatedAtMs || 0);
        const dropTime = Number(dropUser.updatedAtMs || 0);
        liveDb.users[keepUid] =
          dropTime > keepTime
            ? { ...keepUser, ...dropUser, uid: keepUid }
            : { ...dropUser, ...keepUser, uid: keepUid };
        delete liveDb.users[dropUid];
      }
      delete liveDb.usersPrivate[dropUid];
      delete liveDb.presence[dropUid];
      liveDb.usersPrivate[keepUid] = email;
    }
  }

  // Ensure xandercamarin@gmail.com (538a6246-5cc8-4c63-bbda-0507196f3d5d) is properly configured as Developer
  const xanderUid = '538a6246-5cc8-4c63-bbda-0507196f3d5d';
  if (liveDb.users[xanderUid]) {
    const u = liveDb.users[xanderUid];
    u.uid = xanderUid;
    u.badge = 'developer';
    u.role = 'developer';
    u.accountStatus = 'active';
    u.isVerifiedStudent = true;
    if (!u.nickname || u.nickname === 'student') {
      u.nickname = 'xander';
    }
    if (!u.googleDisplayName || u.googleDisplayName === 'MSU Student') {
      u.googleDisplayName = 'Xander James';
    }
    liveDb.usersPrivate[xanderUid] = 'xandercamarin@gmail.com';
    if (liveDb.presence[xanderUid]) {
      liveDb.presence[xanderUid].nickname = u.nickname;
      liveDb.presence[xanderUid].photoURL = u.photoURL || liveDb.presence[xanderUid].photoURL || '';
      liveDb.presence[xanderUid].badge = 'developer';
      liveDb.presence[xanderUid].campus = u.campus || 'MSU Main Campus - Marawi';
    }
  }

  // Ensure camarin.xn839@s.msumain.edu.ph (4ae58a7b-5104-4479-8667-ed9e465ba447) is properly configured as Verified Student
  const camarinUid = '4ae58a7b-5104-4479-8667-ed9e465ba447';
  if (liveDb.users[camarinUid]) {
    const u = liveDb.users[camarinUid];
    u.uid = camarinUid;
    u.badge = 'verified';
    u.role = 'student';
    u.accountStatus = 'active';
    u.isVerifiedStudent = true;
    u.emailDomain = 's.msumain.edu.ph';
    if (!u.nickname || u.nickname === 'student') {
      u.nickname = 'camarin.xn839';
    }
    if (
      !u.googleDisplayName ||
      u.googleDisplayName === 'student' ||
      u.googleDisplayName === 'MSU Student'
    ) {
      u.googleDisplayName = 'Xander James Camarin';
    }
    liveDb.usersPrivate[camarinUid] = 'camarin.xn839@s.msumain.edu.ph';
    if (liveDb.presence[camarinUid]) {
      liveDb.presence[camarinUid].nickname = u.nickname;
      liveDb.presence[camarinUid].photoURL = u.photoURL || liveDb.presence[camarinUid].photoURL || '';
      liveDb.presence[camarinUid].badge = 'verified';
      liveDb.presence[camarinUid].campus = u.campus || 'MSU Main Campus - Marawi';
    }
  }
}

function toIsoTimestamp(val: any): string {
  if (!val) return new Date().toISOString();
  if (typeof val === 'string') {
    const parsed = Date.parse(val);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  if (typeof val === 'number' && val > 0) {
    return new Date(val).toISOString();
  }
  if (typeof val === 'object') {
    if (typeof val.seconds === 'number') {
      return new Date(val.seconds * 1000).toISOString();
    }
    if (typeof val._seconds === 'number') {
      return new Date(val._seconds * 1000).toISOString();
    }
  }
  return new Date().toISOString();
}

function isoToTimestampLike(iso: any) {
  const ms = typeof iso === 'string' ? Date.parse(iso) : typeof iso === 'number' ? iso : Date.now();
  const safeMs = Number.isNaN(ms) || ms <= 0 ? Date.now() : ms;
  return {
    seconds: Math.floor(safeMs / 1000),
    nanoseconds: 0,
  };
}

const ALLOWED_MSU_DOMAINS = new Set([
  's.msumain.edu.ph',
  'msumain.edu.ph',
  'msuiit.edu.ph',
  'g.msuiit.edu.ph',
  'sulat.msuiit.edu.ph',
  'msugensan.edu.ph',
  'msutawi-tawi.edu.ph',
  'msunaawan.edu.ph',
  'msumaguindanao.edu.ph',
  'msusulu.edu.ph',
  'msubuug.edu.ph',
]);

function mapDomainToCampus(domain = '') {
  const d = String(domain || '').toLowerCase();
  if (d === 'msugensan.edu.ph' || d.includes('msugensan')) return 'MSU General Santos';
  if (
    d === 'msuiit.edu.ph' ||
    d === 'g.msuiit.edu.ph' ||
    d === 'sulat.msuiit.edu.ph' ||
    d.includes('msuiit')
  ) {
    return 'MSU-IIT (Iligan Institute of Technology)';
  }
  if (d === 'msumaguindanao.edu.ph' || d.includes('msumaguindanao')) return 'MSU Maguindanao';
  if (d === 'msubuug.edu.ph' || d.includes('msubuug')) return 'MSU Buug';
  if (d === 'msunaawan.edu.ph' || d.includes('msunaawan')) return 'MSU Naawan';
  if (d === 'msutawi-tawi.edu.ph' || d.includes('msutawi')) return 'MSU Tawi-Tawi';
  if (d === 'msusulu.edu.ph' || d.includes('msusulu')) return 'MSU Sulu';
  return 'MSU Main Campus - Marawi';
}

function sanitizeNick(raw = '') {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_.-]/g, '')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 28);
}

// ============================================================================
// SUPABASE POSTGRESQL ROW MAPPERS
// ============================================================================

function userToSupabaseProfileRow(u: any) {
  if (!u?.uid || !isValidUuid(u.uid)) return null;
  return {
    id: u.uid,
    nickname: String(u.nickname || 'student').slice(0, 32),
    nickname_updated_at: toIsoTimestamp(u.nicknameUpdatedAt || u.createdAtMs || u.createdAt),
    google_display_name: String(u.googleDisplayName || u.nickname || 'MSU Student').slice(0, 100),
    photo_url: String(u.photoURL || ''),
    email_domain: String(u.emailDomain || 's.msumain.edu.ph').slice(0, 64),
    campus: String(u.campus || 'MSU Main Campus - Marawi').slice(0, 80),
    bio: String(u.bio || '').slice(0, 280),
    default_anonymous: Boolean(u.defaultAnonymous),
    badge: String(u.badge || 'verified'),
    role: String(u.role || (u.badge === 'developer' ? 'developer' : 'student')),
    is_verified_student: u.isVerifiedStudent !== false,
    created_at: toIsoTimestamp(u.createdAtMs || u.createdAt),
    updated_at: toIsoTimestamp(u.updatedAtMs || u.updatedAt || Date.now()),
  };
}

function supabaseProfileRowToUser(row: any, existing: any = {}) {
  const createdMs = Date.parse(row.created_at || '') || existing.createdAtMs || Date.now();
  const updatedMs = Date.parse(row.updated_at || '') || existing.updatedAtMs || createdMs;
  return {
    ...existing,
    uid: row.id,
    nickname: row.nickname || existing.nickname || 'student',
    nicknameUpdatedAt:
      row.nickname_updated_at || existing.nicknameUpdatedAt || new Date(createdMs).toISOString(),
    googleDisplayName: row.google_display_name || existing.googleDisplayName || row.nickname,
    photoURL: row.photo_url || existing.photoURL || '',
    emailDomain: row.email_domain || existing.emailDomain || 's.msumain.edu.ph',
    campus: row.campus || existing.campus || 'MSU Main Campus - Marawi',
    bio: row.bio ?? existing.bio ?? '',
    defaultAnonymous: Boolean(row.default_anonymous ?? existing.defaultAnonymous),
    badge: row.badge || existing.badge || 'verified',
    role: row.role || existing.role || 'student',
    accountStatus: existing.accountStatus || 'active',
    isVerifiedStudent: row.is_verified_student !== false,
    createdAtMs: createdMs,
    updatedAtMs: updatedMs,
  };
}

function postToSupabaseRow(p: any) {
  if (!p?.id) return null;
  return {
    id: String(p.id),
    user_id: isValidUuid(p.authorId) ? p.authorId : null,
    author_id: String(p.authorId || ''),
    author_nickname: String(p.authorNickname || 'Anonymous Student'),
    author_display_name: String(p.authorDisplayName || p.authorNickname || 'Anonymous Student'),
    author_photo_url: String(p.authorPhotoURL || ''),
    author_domain: String(p.authorDomain || 's.msumain.edu.ph'),
    author_badge: String(p.authorBadge || 'verified'),
    is_anonymous: Boolean(p.isAnonymous),
    category: String(p.category || 'Campus Life'),
    title: String(p.title || ''),
    content: String(p.content || ''),
    attachment_type: String(p.attachmentType || 'none'),
    attachment_name: String(p.attachmentName || ''),
    attachment_size: Number(p.attachmentSize || 0),
    attachment_mime: String(p.attachmentMime || ''),
    attachment_data_url: String(p.attachmentDataUrl || ''),
    likes_count: Number(p.likesCount || 0),
    comments_count: Number(p.commentsCount || 0),
    is_pinned: Boolean(p.isPinned),
    is_hidden: Boolean(p.isHidden),
    comments_locked: Boolean(p.commentsLocked),
    reports_count: Number(p.reportsCount || 0),
    visibility: String(p.visibility || 'edu_verified'),
    created_at: toIsoTimestamp(p.createdAt),
    updated_at: toIsoTimestamp(p.updatedAt || Date.now()),
  };
}

function supabaseRowToPost(row: any) {
  return {
    id: row.id,
    authorId: row.author_id || row.user_id || '',
    authorNickname: row.author_nickname || 'Anonymous Student',
    authorDisplayName: row.author_display_name || row.author_nickname || 'Anonymous Student',
    authorPhotoURL: row.author_photo_url || '',
    authorDomain: row.author_domain || 's.msumain.edu.ph',
    authorBadge: row.author_badge || 'verified',
    isAnonymous: Boolean(row.is_anonymous),
    category: row.category || 'Campus Life',
    title: row.title || '',
    content: row.content || '',
    attachmentType: row.attachment_type || 'none',
    attachmentName: row.attachment_name || '',
    attachmentSize: Number(row.attachment_size || 0),
    attachmentMime: row.attachment_mime || '',
    attachmentDataUrl: row.attachment_data_url || '',
    likesCount: Number(row.likes_count || 0),
    commentsCount: Number(row.comments_count || 0),
    isPinned: Boolean(row.is_pinned),
    isHidden: Boolean(row.is_hidden),
    commentsLocked: Boolean(row.comments_locked),
    reportsCount: Number(row.reports_count || 0),
    visibility: row.visibility || 'edu_verified',
    createdAt: isoToTimestampLike(row.created_at),
    updatedAt: isoToTimestampLike(row.updated_at),
  };
}

function commentToSupabaseRow(c: any) {
  if (!c?.id || !c?.postId) return null;
  return {
    id: String(c.id),
    post_id: String(c.postId),
    user_id: isValidUuid(c.authorId) ? c.authorId : null,
    author_id: String(c.authorId || ''),
    author_nickname: String(c.authorNickname || 'Anonymous Student'),
    author_display_name: String(c.authorDisplayName || c.authorNickname || 'Anonymous Student'),
    author_photo_url: String(c.authorPhotoURL || ''),
    author_badge: String(c.authorBadge || 'verified'),
    is_anonymous: Boolean(c.isAnonymous),
    content: String(c.content || ''),
    reply_to_comment_id: c.replyToCommentId ? String(c.replyToCommentId) : null,
    reply_to_nickname: c.replyToNickname ? String(c.replyToNickname) : null,
    visibility: String(c.visibility || 'edu_verified'),
    created_at: toIsoTimestamp(c.createdAt),
    updated_at: toIsoTimestamp(c.updatedAt || Date.now()),
  };
}

function supabaseRowToComment(row: any) {
  return {
    id: row.id,
    postId: row.post_id,
    authorId: row.author_id || row.user_id || '',
    authorNickname: row.author_nickname || 'Anonymous Student',
    authorDisplayName: row.author_display_name || row.author_nickname || 'Anonymous Student',
    authorPhotoURL: row.author_photo_url || '',
    authorBadge: row.author_badge || 'verified',
    isAnonymous: Boolean(row.is_anonymous),
    content: row.content || '',
    replyToCommentId: row.reply_to_comment_id || undefined,
    replyToNickname: row.reply_to_nickname || undefined,
    visibility: row.visibility || 'edu_verified',
    createdAt: isoToTimestampLike(row.created_at),
    updatedAt: isoToTimestampLike(row.updated_at),
  };
}

function notificationToSupabaseRow(n: any) {
  if (!n?.id || !n?.recipientId) return null;
  return {
    id: String(n.id),
    user_id: isValidUuid(n.recipientId) ? n.recipientId : null,
    recipient_id: String(n.recipientId),
    actor_id: String(n.actorId || 'one_official'),
    actor_nickname: String(n.actorNickname || 'ONE'),
    actor_photo_url: String(n.actorPhotoURL || ''),
    actor_badge: String(n.actorBadge || 'verified'),
    type: String(n.type || 'comment'),
    target_id: String(n.targetId || ''),
    preview_text: String(n.previewText || ''),
    read: Boolean(n.read),
    created_at: toIsoTimestamp(n.createdAt),
  };
}

function supabaseRowToNotification(row: any) {
  return {
    id: row.id,
    recipientId: row.recipient_id || row.user_id || '',
    actorId: row.actor_id || '',
    actorNickname: row.actor_nickname || 'Student',
    actorPhotoURL: row.actor_photo_url || '',
    actorBadge: row.actor_badge || 'verified',
    type: row.type || 'comment',
    targetId: row.target_id || '',
    previewText: row.preview_text || '',
    read: Boolean(row.read),
    createdAt: isoToTimestampLike(row.created_at),
  };
}

function suggestionToSupabaseRow(s: any) {
  if (!s?.id) return null;
  return {
    id: String(s.id),
    user_id: isValidUuid(s.authorId) ? s.authorId : null,
    author_id: String(s.authorId || ''),
    author_nickname: String(s.authorNickname || 'Anonymous Student'),
    author_photo_url: String(s.authorPhotoURL || ''),
    author_badge: String(s.authorBadge || 'verified'),
    is_anonymous: Boolean(s.isAnonymous),
    category: String(s.category || 'Feature Request'),
    title: String(s.title || ''),
    content: String(s.content || ''),
    upvotes_count: Number(s.upvotesCount || 0),
    status: String(s.status || 'under_review'),
    admin_reply: s.adminReply ? String(s.adminReply) : null,
    admin_reply_by: s.adminReplyBy ? String(s.adminReplyBy) : null,
    admin_reply_badge: s.adminReplyBadge ? String(s.adminReplyBadge) : null,
    admin_replied_at: s.adminRepliedAt ? toIsoTimestamp(s.adminRepliedAt) : null,
    visibility: String(s.visibility || 'edu_verified'),
    created_at: toIsoTimestamp(s.createdAt),
    updated_at: toIsoTimestamp(s.updatedAt || Date.now()),
  };
}

function supabaseRowToSuggestion(row: any) {
  return {
    id: row.id,
    authorId: row.author_id || row.user_id || '',
    authorNickname: row.author_nickname || 'Anonymous Student',
    authorPhotoURL: row.author_photo_url || '',
    authorBadge: row.author_badge || 'verified',
    isAnonymous: Boolean(row.is_anonymous),
    category: row.category || 'Feature Request',
    title: row.title || '',
    content: row.content || '',
    upvotesCount: Number(row.upvotes_count || 0),
    status: row.status || 'under_review',
    adminReply: row.admin_reply || undefined,
    adminReplyBy: row.admin_reply_by || undefined,
    adminReplyBadge: row.admin_reply_badge || undefined,
    adminRepliedAt: row.admin_replied_at ? isoToTimestampLike(row.admin_replied_at) : null,
    visibility: row.visibility || 'edu_verified',
    createdAt: isoToTimestampLike(row.created_at),
    updatedAt: isoToTimestampLike(row.updated_at),
  };
}

function chatMessageToSupabaseRow(m: any) {
  if (!m?.id || !m?.chatId) return null;
  return {
    id: String(m.id),
    chat_id: String(m.chatId),
    user_id: isValidUuid(m.senderId) ? m.senderId : null,
    sender_id: String(m.senderId || ''),
    recipient_id: String(m.recipientId || ''),
    sender_nickname: String(m.senderNickname || 'Student'),
    sender_photo_url: String(m.senderPhotoURL || ''),
    sender_badge: String(m.senderBadge || 'verified'),
    text: String(m.text || ''),
    attachment_type: String(m.attachmentType || 'none'),
    attachment_name: String(m.attachmentName || ''),
    attachment_size: Number(m.attachmentSize || 0),
    attachment_mime: String(m.attachmentMime || ''),
    attachment_data_url: String(m.attachmentDataUrl || ''),
    read: Boolean(m.read),
    created_at: toIsoTimestamp(m.createdAt),
  };
}

function supabaseRowToChatMessage(row: any, existing: any = {}) {
  const sId = row.sender_id || row.user_id || '';
  const rId = row.recipient_id || '';
  return {
    ...existing,
    id: row.id,
    chatId: row.chat_id,
    participantIds: [sId, rId].filter(Boolean).sort(),
    senderId: sId,
    recipientId: rId,
    senderNickname: row.sender_nickname || existing.senderNickname || 'Student',
    senderPhotoURL: row.sender_photo_url || existing.senderPhotoURL || '',
    senderBadge: row.sender_badge || existing.senderBadge || 'verified',
    text: row.text || '',
    attachmentType: row.attachment_type || 'none',
    attachmentName: row.attachment_name || '',
    attachmentSize: Number(row.attachment_size || 0),
    attachmentMime: row.attachment_mime || '',
    attachmentDataUrl: row.attachment_data_url || '',
    read: Boolean(row.read),
    createdAt: isoToTimestampLike(row.created_at),
  };
}

const liveDb = JSON.parse(
  JSON.stringify({
    version: 3,
    updatedAt: Date.now(),
    users: {},
    usersPrivate: {},
    deletedUserIds: [],
    presence: {},
    posts: {},
    deletedPostIds: [],
    deletedCommentIds: [],
    comments: {},
    reactions: {},
    commentReactions: {},
    suggestions: {},
    chats: {},
    messages: {},
    notifications: {},
    reports: {},
    moderationRules: {},
    platformSettings: null,
    marketplace: {},
    deletedMarketplaceIds: [],
    supportTickets: {},
  })
);

function reconcileLivePostCounts(targetPostId?: string) {
  const deletedPostSet = new Set<string>(liveDb.deletedPostIds || []);
  const deletedCommentSet = new Set<string>(liveDb.deletedCommentIds || []);

  // Remove any comments belonging to deleted posts or in deletedCommentIds
  for (const cid of Object.keys(liveDb.comments)) {
    const c = liveDb.comments[cid];
    if (!c || !c.postId || deletedPostSet.has(c.postId) || deletedCommentSet.has(cid)) {
      delete liveDb.comments[cid];
    }
  }

  const commentCountsByPost = new Map<string, number>();
  for (const c of Object.values(liveDb.comments) as any[]) {
    if (c?.id && c?.postId && !deletedPostSet.has(c.postId) && !deletedCommentSet.has(c.id)) {
      commentCountsByPost.set(c.postId, (commentCountsByPost.get(c.postId) || 0) + 1);
    }
  }

  const reactionCountsByPost = new Map<string, number>();
  for (const r of Object.values(liveDb.reactions) as any[]) {
    if (r?.postId && r?.userId && !deletedPostSet.has(r.postId)) {
      reactionCountsByPost.set(r.postId, (reactionCountsByPost.get(r.postId) || 0) + 1);
    }
  }

  const postIdsToCheck = targetPostId ? [targetPostId] : Object.keys(liveDb.posts);
  for (const pid of postIdsToCheck) {
    const p = liveDb.posts[pid];
    if (!p || deletedPostSet.has(pid)) continue;
    const actualComments = commentCountsByPost.get(pid) || 0;
    p.commentsCount = actualComments;
    const actualReactions = reactionCountsByPost.get(pid) || 0;
    if ((p.likesCount || 0) < actualReactions) {
      p.likesCount = actualReactions;
    }
  }
}

// Active Server-Sent Events (SSE) clients for instant real-time broadcast
const sseClients = JSON.parse('[]');
const activeSocketsByUid = new Map();

function broadcastRealtimeEvent(action = '', payload = {}) {
  const packet = `data: ${JSON.stringify({
    action,
    payload,
    updatedAt: liveDb.updatedAt,
  })}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(packet);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

// Load initial snapshot from src/utils/realUsersSnapshot.json synchronously on startup
try {
  const snapshotPath = path.join(__dirname, 'src', 'utils', 'realUsersSnapshot.json');
  if (fs.existsSync(snapshotPath)) {
    const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
    if (Array.isArray(raw.users)) {
      for (const u of raw.users) {
        if (u?.uid && !FAKE_USER_UIDS.has(u.uid)) {
          liveDb.users[u.uid] = u;
          liveDb.presence[u.uid] = {
            uid: u.uid,
            nickname: u.nickname,
            photoURL: u.photoURL || '',
            badge: u.badge || 'verified',
            campus: u.campus || 'MSU Main Campus - Marawi',
            isOnline: Date.now() - (u.updatedAtMs || 0) < 15 * 60 * 1000,
            lastSeenMs: u.updatedAtMs || u.createdAtMs || Date.now() - 3600000,
            visibility: 'edu_verified',
            updatedAtMs: u.updatedAtMs || Date.now(),
          };
        }
      }
    }
    if (raw.emails && typeof raw.emails === 'object') {
      Object.assign(liveDb.usersPrivate, raw.emails);
    }
  }
} catch (err) {
  console.warn('Initial snapshot load warning:', err);
}

const SAMPLE_PDF_BASE64 = Buffer.from(
  `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 126 >> stream
BT
/F1 16 Tf
72 700 Td
(ONE MSUan - Calculus & General Education Midterm Reviewer) Tj
/F1 12 Tf
0 -28 Td
(Shared via ONE Student Wall - Mindanao State University) Tj
ET
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000405 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
473
%%EOF`
).toString('base64');

function makeFirestoreTimestampLike(minutesAgo = 60) {
  const ms = Date.now() - minutesAgo * 60 * 1000;
  return {
    seconds: Math.floor(ms / 1000),
    nanoseconds: 0,
  };
}

function seedInitialRestoredContent() {
  for (const fakePid of Array.from(FAKE_POST_IDS)) {
    if (!liveDb.deletedPostIds.includes(fakePid)) {
      liveDb.deletedPostIds.push(fakePid);
    }
    delete liveDb.posts[fakePid];
  }
  for (const fakeMktId of Array.from(FAKE_MARKETPLACE_IDS)) {
    if (!liveDb.deletedMarketplaceIds.includes(fakeMktId)) {
      liveDb.deletedMarketplaceIds.push(fakeMktId);
    }
    delete liveDb.marketplace[fakeMktId];
  }

  const initialWelcomeMessages = [
    {
      id: 'msg_welcome_538a6246-5cc8-4c63-bbda-0507196f3d5d',
      chatId: '538a6246-5cc8-4c63-bbda-0507196f3d5d_one_official',
      participantIds: ['538a6246-5cc8-4c63-bbda-0507196f3d5d', 'one_official'],
      senderId: 'one_official',
      recipientId: '538a6246-5cc8-4c63-bbda-0507196f3d5d',
      senderNickname: 'ONE',
      senderPhotoURL: '',
      senderBadge: 'one_official',
      text: 'Hi, welcome to ONE! 👋\n\nWelcome to the official MSUan Student Wall, @xander! Feel free to share your campus thoughts, post anonymously anytime, upload study notes & files, and connect with fellow MSUans.',
      attachmentType: 'none',
      attachmentName: '',
      attachmentSize: 0,
      attachmentMime: '',
      attachmentDataUrl: '',
      read: true,
      createdAt: makeFirestoreTimestampLike(700),
    },
    {
      id: 'msg_welcome_e61d24c6-ffc2-463c-bff9-2cd74b1edb5c',
      chatId: 'e61d24c6-ffc2-463c-bff9-2cd74b1edb5c_one_official',
      participantIds: ['e61d24c6-ffc2-463c-bff9-2cd74b1edb5c', 'one_official'],
      senderId: 'one_official',
      recipientId: 'e61d24c6-ffc2-463c-bff9-2cd74b1edb5c',
      senderNickname: 'ONE',
      senderPhotoURL: '',
      senderBadge: 'one_official',
      text: 'Hi, welcome to ONE! 👋\n\nWelcome to the official MSUan Student Wall, @ahrene! Feel free to share your campus thoughts, post anonymously anytime, upload study notes & files, and connect with fellow MSUans.',
      attachmentType: 'none',
      attachmentName: '',
      attachmentSize: 0,
      attachmentMime: '',
      attachmentDataUrl: '',
      read: true,
      createdAt: makeFirestoreTimestampLike(330),
    },
  ];

  for (const m of initialWelcomeMessages) {
    if (!liveDb.messages[m.id]) {
      liveDb.messages[m.id] = m;
    }
  }
}

seedInitialRestoredContent();

async function ensureStoragePublicUrl(
  dataUrl: string,
  fileName = 'attachment',
  mimeType = 'application/octet-stream',
  folder = 'uploads'
): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  if (dataUrl.startsWith('data:image/svg+xml')) {
    return dataUrl;
  }
  try {
    const commaIdx = dataUrl.indexOf(',');
    const rawBase64 = commaIdx !== -1 ? dataUrl.slice(commaIdx + 1) : dataUrl;
    const buffer = Buffer.from(rawBase64, 'base64');
    const safeFolder = String(folder || 'uploads').replace(/[^a-zA-Z0-9_-]/g, '');
    const safeName = String(fileName || 'attachment')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 100);
    const objectPath = `${safeFolder}/${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}_${safeName}`;

    const { error } = await sbAdmin.storage.from(STORAGE_BUCKET).upload(objectPath, buffer, {
      contentType: mimeType || 'application/octet-stream',
      upsert: true,
    });
    if (!error) {
      const { data: pubData } = sbAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
      if (pubData?.publicUrl) {
        return pubData.publicUrl;
      }
    }
  } catch {
    // Fallback to original dataUrl if storage upload fails
  }
  return dataUrl;
}

let isPersistingToStorage = false;
let pendingPersist = false;
let persistDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function persistLiveDbToCloud() {
  reconcileLiveDbPostCounts();
  try {
    liveDb.updatedAt = Date.now();
    fs.writeFileSync(LOCAL_DB_BACKUP_PATH, JSON.stringify(liveDb));
  } catch {
    // Non-fatal local disk cache error
  }
  if (persistDebounceTimer) {
    clearTimeout(persistDebounceTimer);
  }
  persistDebounceTimer = setTimeout(() => {
    persistDebounceTimer = null;
    void flushLiveDbToCloud();
  }, 2500);
}

function reconcileLiveDbPostCounts() {
  const deletedPostSet = new Set<string>(liveDb.deletedPostIds || []);
  const deletedCommentSet = new Set<string>(liveDb.deletedCommentIds || []);
  const actualCommentsByPost: Record<string, number> = {};
  const actualReactionsByPost: Record<string, number> = {};

  for (const cid of Object.keys(liveDb.comments || {})) {
    const c = liveDb.comments[cid];
    if (!c || !c.id || !c.postId || deletedPostSet.has(c.postId) || deletedCommentSet.has(c.id)) {
      delete liveDb.comments[cid];
      continue;
    }
    actualCommentsByPost[c.postId] = (actualCommentsByPost[c.postId] || 0) + 1;
  }

  for (const rid of Object.keys(liveDb.reactions || {})) {
    const r = liveDb.reactions[rid];
    if (!r || !r.postId || !r.userId || deletedPostSet.has(r.postId)) {
      delete liveDb.reactions[rid];
      continue;
    }
    actualReactionsByPost[r.postId] = (actualReactionsByPost[r.postId] || 0) + 1;
  }

  for (const pid of Object.keys(liveDb.posts || {})) {
    const p = liveDb.posts[pid];
    if (!p || deletedPostSet.has(pid)) continue;
    p.commentsCount = actualCommentsByPost[pid] || 0;
    const minLikes = actualReactionsByPost[pid] || 0;
    p.likesCount = Math.max(Number(p.likesCount || 0), minLikes);
  }
}

async function flushLiveDbToCloud() {
  if (isPersistingToStorage) {
    pendingPersist = true;
    return;
  }
  isPersistingToStorage = true;
  try {
    reconcileLiveDbPostCounts();
    liveDb.updatedAt = Date.now();
    const body = JSON.stringify(liveDb);
    try {
      fs.writeFileSync(LOCAL_DB_BACKUP_PATH, body);
    } catch {
      // ignore disk write error
    }
    await sbAdmin.storage.from(STORAGE_BUCKET).upload(DB_OBJECT_PATH, Buffer.from(body), {
      contentType: 'application/json',
      upsert: true,
    });
  } catch {
    // Non-fatal storage error
  } finally {
    isPersistingToStorage = false;
    if (pendingPersist) {
      pendingPersist = false;
      persistLiveDbToCloud();
    }
  }
}

async function syncAllTablesToSupabase() {
  try {
    // 1. Upsert profiles in batches of 150
    const profileRows = Object.values(liveDb.users)
      .map((u) => userToSupabaseProfileRow(u))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    for (let i = 0; i < profileRows.length; i += 150) {
      await sbAdmin.from('profiles').upsert(profileRows.slice(i, i + 150));
    }

    // 2. Delete any removed posts/comments from Supabase, then upsert active posts
    if (Array.isArray(liveDb.deletedPostIds) && liveDb.deletedPostIds.length > 0) {
      await sbAdmin.from('comments').delete().in('post_id', liveDb.deletedPostIds);
      await sbAdmin.from('post_reactions').delete().in('post_id', liveDb.deletedPostIds);
      await sbAdmin.from('posts').delete().in('id', liveDb.deletedPostIds);
    }
    if (Array.isArray(liveDb.deletedCommentIds) && liveDb.deletedCommentIds.length > 0) {
      await sbAdmin.from('comments').delete().in('id', liveDb.deletedCommentIds);
    }

    const postRows = Object.values(liveDb.posts)
      .filter((p: any) => p?.id && !liveDb.deletedPostIds.includes(p.id) && !FAKE_POST_IDS.has(p.id))
      .map((p) => postToSupabaseRow(p))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (postRows.length > 0) {
      await sbAdmin.from('posts').upsert(postRows);
    }

    // 3. Upsert comments
    const commentRows = Object.values(liveDb.comments)
      .filter(
        (c: any) =>
          c?.id &&
          c?.postId &&
          Boolean(liveDb.posts[c.postId]) &&
          !liveDb.deletedPostIds.includes(c.postId) &&
          !liveDb.deletedCommentIds.includes(c.id)
      )
      .map((c) => commentToSupabaseRow(c))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (commentRows.length > 0) {
      await sbAdmin.from('comments').upsert(commentRows);
    }

    // 4. Upsert post_reactions
    const reactionRows = Object.values(liveDb.reactions)
      .filter(
        (r: any) =>
          r?.id &&
          r?.postId &&
          Boolean(liveDb.posts[r.postId]) &&
          !liveDb.deletedPostIds.includes(r.postId) &&
          isValidUuid(r.userId)
      )
      .map((r: any) => ({
        id: String(r.id),
        post_id: String(r.postId),
        user_id: r.userId,
        type: String(r.type || 'damay'),
        created_at: toIsoTimestamp(r.createdAtMs || r.createdAt),
      }));
    if (reactionRows.length > 0) {
      await sbAdmin.from('post_reactions').upsert(reactionRows);
    }

    // 5. Upsert suggestions
    const suggestionRows = Object.values(liveDb.suggestions)
      .map((s) => suggestionToSupabaseRow(s))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (suggestionRows.length > 0) {
      await sbAdmin.from('suggestions').upsert(suggestionRows);
    }

    // 6. Upsert notifications
    const notifRows = Object.values(liveDb.notifications)
      .map((n) => notificationToSupabaseRow(n))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (notifRows.length > 0) {
      await sbAdmin.from('notifications').upsert(notifRows);
    }

    // 7. Upsert chat_messages
    const msgRows = Object.values(liveDb.messages)
      .map((m) => chatMessageToSupabaseRow(m))
      .filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (msgRows.length > 0) {
      await sbAdmin.from('chat_messages').upsert(msgRows);
    }
  } catch (err) {
    console.warn('Supabase table sync warning:', err);
  }
}

let lastAuthSyncMs = 0;
let isSyncingAuth = false;

async function syncRealUsersFromSupabaseAuth(force = false) {
  if (isSyncingAuth) return;
  if (!force && Date.now() - lastAuthSyncMs < 20000) return;
  isSyncingAuth = true;
  try {
    let page = 1;
    const allAuthUsers = JSON.parse('[]');
    while (true) {
      const { data, error } = await sbAdmin.auth.admin.listUsers({ page, perPage: 100 });
      if (error || !data?.users?.length) break;
      allAuthUsers.push(...data.users);
      if (data.users.length < 100) break;
      page++;
    }

    if (allAuthUsers.length > 0) {
      const sortedOldest = [...allAuthUsers].sort(
        (a, b) => Date.parse(a.created_at || '2026-01-01') - Date.parse(b.created_at || '2026-01-01')
      );

      const usedNicks = new Set(['one', 'one_official']);
      for (const uidKey of Object.keys(liveDb.users)) {
        const userObj = liveDb.users[uidKey];
        if (userObj && userObj.nickname) usedNicks.add(String(userObj.nickname).toLowerCase());
      }

      let changed = false;
      const changedProfiles: any[] = [];
      for (const u of sortedOldest) {
        const email = (u.email || '').trim().toLowerCase();
        if (!email) continue;
        const isDev = email === 'xandercamarin@gmail.com';
        const isCamarinStudent =
          email === 'camarin.xn839@s.msumain.edu.ph' ||
          u.id === '4ae58a7b-5104-4479-8667-ed9e465ba447';
        const isTulips =
          email === 'delacernaahrene122008@gmail.com' ||
          email === 'delecernaahrene122008@gmail.com';
        const rawDomain = email.split('@')[1] || '';
        const isEdu = ALLOWED_MSU_DOMAINS.has(rawDomain);
        if (!isEdu && !isDev && !isTulips) continue;

        const existing = liveDb.users[u.id];
        const meta = u.user_metadata || {};
        const oneProfile = meta.one_profile || {};
        const oneProfileUpdatedMs = Number(oneProfile.updatedAtMs || 0);
        const existingUpdatedMs = Number(existing?.updatedAtMs || 0);
        const preferOneProfile = oneProfileUpdatedMs >= existingUpdatedMs;

        const preferredDisplayName = preferOneProfile
          ? oneProfile.googleDisplayName || existing?.googleDisplayName
          : existing?.googleDisplayName || oneProfile.googleDisplayName;
        const displayName = (
          preferredDisplayName ||
          meta.full_name ||
          meta.name ||
          (isCamarinStudent ? 'Xander James Camarin' : email.split('@')[0])
        ).trim();

        const preferredPhoto = preferOneProfile
          ? oneProfile.photoURL || existing?.photoURL
          : existing?.photoURL || oneProfile.photoURL;
        const photoURL = (
          preferredPhoto ||
          meta.avatar_url ||
          meta.picture ||
          ''
        ).trim();

        const emailDomain =
          isDev && email.endsWith('@gmail.com')
            ? 'msumain.edu.ph'
            : isTulips
            ? 'msumain.edu.ph'
            : rawDomain || 's.msumain.edu.ph';
        const campus =
          (preferOneProfile
            ? oneProfile.campus || existing?.campus
            : existing?.campus || oneProfile.campus) || mapDomainToCampus(emailDomain);
        const createdMs = Date.parse(u.created_at || '') || Date.now() - 86400000;
        const lastSignInMs = Date.parse(u.last_sign_in_at || u.created_at || '') || createdMs;

        const rawSavedNick = preferOneProfile
          ? oneProfile.nickname || existing?.nickname || ''
          : existing?.nickname || oneProfile.nickname || '';
        let finalNick =
          rawSavedNick && rawSavedNick !== 'student' ? rawSavedNick : '';
        if (!finalNick) {
          let baseNick =
            email === 'xandercamarin@gmail.com'
              ? 'xander'
              : isCamarinStudent
              ? 'camarin.xn839'
              : isTulips
              ? 'ahrene'
              : sanitizeNick(email.split('@')[0]);
          if (!baseNick || baseNick.length < 2) {
            baseNick = sanitizeNick(displayName) || 'msuan_' + u.id.slice(0, 6);
          }
          finalNick = baseNick;
          let counter = 2;
          while (
            usedNicks.has(finalNick.toLowerCase()) &&
            liveDb.users[u.id]?.nickname?.toLowerCase() !== finalNick.toLowerCase()
          ) {
            finalNick = (baseNick.slice(0, 24) + '_' + counter).slice(0, 32);
            counter++;
          }
          usedNicks.add(finalNick.toLowerCase());
        }

        const badge = isCamarinStudent
          ? existing?.badge || 'verified'
          : isDev
          ? 'developer'
          : isTulips
          ? existing?.badge || 'tulips'
          : existing?.badge || oneProfile.badge || 'verified';
        const role =
          badge === 'developer'
            ? 'developer'
            : badge === 'moderator'
            ? 'moderator'
            : existing?.role || 'student';

        const bestUpdatedMs = Math.max(existingUpdatedMs, oneProfileUpdatedMs, lastSignInMs);

        const updatedUserObj = {
          ...existing,
          uid: u.id,
          nickname: finalNick,
          nicknameUpdatedAt:
            (preferOneProfile
              ? oneProfile.nicknameUpdatedAt || existing?.nicknameUpdatedAt
              : existing?.nicknameUpdatedAt || oneProfile.nicknameUpdatedAt) ||
            u.created_at ||
            new Date(createdMs).toISOString(),
          googleDisplayName: displayName.slice(0, 100),
          photoURL,
          emailDomain,
          campus,
          bio:
            (preferOneProfile
              ? oneProfile.bio ?? existing?.bio
              : existing?.bio ?? oneProfile.bio) ?? '',
          defaultAnonymous: Boolean(
            preferOneProfile
              ? oneProfile.defaultAnonymous ?? existing?.defaultAnonymous
              : existing?.defaultAnonymous ?? oneProfile.defaultAnonymous
          ),
          referralSource: existing?.referralSource ?? oneProfile.referralSource ?? '',
          referralSubmittedAt:
            existing?.referralSubmittedAt ?? oneProfile.referralSubmittedAt ?? '',
          badge,
          role,
          accountStatus: existing?.accountStatus || oneProfile.accountStatus || 'active',
          isVerifiedStudent:
            existing?.isVerifiedStudent !== undefined
              ? existing.isVerifiedStudent
              : oneProfile.isVerifiedStudent !== false,
          permissions: existing?.permissions || oneProfile.permissions,
          createdAtMs: existing?.createdAtMs || createdMs,
          updatedAtMs: bestUpdatedMs,
        };

        if (!existing || (existing.updatedAtMs || 0) < lastSignInMs) {
          changed = true;
          const pRow = userToSupabaseProfileRow(updatedUserObj);
          if (pRow) changedProfiles.push(pRow);
        }

        liveDb.usersPrivate[u.id] = email;
        liveDb.users[u.id] = updatedUserObj;

        const prevPres = liveDb.presence[u.id];
        const hasOpenStream =
          activeSocketsByUid.has(u.id) && activeSocketsByUid.get(u.id).size > 0;
        const effectiveLastSeen = hasOpenStream
          ? Date.now()
          : Math.max(prevPres?.lastSeenMs || 0, lastSignInMs);
        liveDb.presence[u.id] = {
          uid: u.id,
          nickname: finalNick,
          photoURL,
          badge,
          campus,
          isOnline:
            hasOpenStream ||
            Boolean(prevPres?.isOnline && Date.now() - (prevPres?.lastSeenMs || 0) < 120000) ||
            Date.now() - effectiveLastSeen < 15 * 60 * 1000,
          lastSeenMs: effectiveLastSeen,
          visibility: 'edu_verified',
          updatedAtMs: effectiveLastSeen,
        };
      }

      if (changedProfiles.length > 0) {
        for (let i = 0; i < changedProfiles.length; i += 150) {
          sbAdmin
            .from('profiles')
            .upsert(changedProfiles.slice(i, i + 150))
            .then(() => {});
        }
      }

      lastAuthSyncMs = Date.now();
      if (changed) {
        void persistLiveDbToCloud();
      }
    }
  } catch (err) {
    console.warn('Supabase Auth sync warning:', err);
  } finally {
    isSyncingAuth = false;
  }
}

async function initializeCloudState() {
  // Ensure app-files bucket is public so uploaded files have direct public CDN URLs
  try {
    await sbAdmin.storage.updateBucket(STORAGE_BUCKET, { public: true });
  } catch {
    // Non-fatal
  }

  // 1. Load supplementary state from one-msu-live-db.json
  try {
    const { data, error } = await sbAdmin.storage.from(STORAGE_BUCKET).download(DB_OBJECT_PATH);
    if (!error && data) {
      const text = await data.text();
      const cloud = JSON.parse(text);
      if (cloud.users) {
        for (const uid of Object.keys(cloud.users)) {
          if (!FAKE_USER_UIDS.has(uid)) {
            liveDb.users[uid] = { ...liveDb.users[uid], ...cloud.users[uid] };
          }
        }
      }
      if (cloud.usersPrivate) {
        for (const uid of Object.keys(cloud.usersPrivate)) {
          if (!FAKE_USER_UIDS.has(uid)) {
            liveDb.usersPrivate[uid] = cloud.usersPrivate[uid];
          }
        }
      }
      if (cloud.presence) {
        for (const uid of Object.keys(cloud.presence)) {
          if (!FAKE_USER_UIDS.has(uid)) {
            liveDb.presence[uid] = { ...liveDb.presence[uid], ...cloud.presence[uid] };
          }
        }
      }
      if (Array.isArray(cloud.deletedPostIds)) {
        liveDb.deletedPostIds = cloud.deletedPostIds;
      }
      if (Array.isArray(cloud.deletedCommentIds)) {
        liveDb.deletedCommentIds = cloud.deletedCommentIds;
      }
      if (cloud.posts) {
        for (const id of Object.keys(cloud.posts)) {
          if (!FAKE_POST_IDS.has(id) && !liveDb.deletedPostIds.includes(id)) {
            liveDb.posts[id] = cloud.posts[id];
          }
        }
      }
      if (cloud.comments) {
        for (const id of Object.keys(cloud.comments)) {
          const c = cloud.comments[id];
          if (
            !FAKE_COMMENT_IDS.has(id) &&
            !liveDb.deletedCommentIds.includes(id) &&
            c?.postId &&
            !liveDb.deletedPostIds.includes(c.postId)
          ) {
            if (c.authorPhotoURL && String(c.authorPhotoURL).startsWith('data:')) {
              c.authorPhotoURL = liveDb.users[c.authorId]?.photoURL || '';
            }
            liveDb.comments[id] = c;
          }
        }
      }
      if (cloud.reactions) Object.assign(liveDb.reactions, cloud.reactions);
      if (cloud.commentReactions) Object.assign(liveDb.commentReactions, cloud.commentReactions);
      if (Array.isArray(cloud.deletedUserIds)) {
        liveDb.deletedUserIds = cloud.deletedUserIds;
      }
      if (cloud.suggestions) {
        for (const id of Object.keys(cloud.suggestions)) {
          if (!FAKE_SUGGESTION_IDS.has(id)) {
            liveDb.suggestions[id] = cloud.suggestions[id];
          }
        }
      }
      if (cloud.chats) Object.assign(liveDb.chats, cloud.chats);
      if (cloud.messages) Object.assign(liveDb.messages, cloud.messages);
      if (cloud.notifications) Object.assign(liveDb.notifications, cloud.notifications);
      if (cloud.reports) Object.assign(liveDb.reports, cloud.reports);
      if (cloud.moderationRules) Object.assign(liveDb.moderationRules, cloud.moderationRules);
      if (cloud.platformSettings) liveDb.platformSettings = cloud.platformSettings;
      if (Array.isArray(cloud.deletedMarketplaceIds)) {
        liveDb.deletedMarketplaceIds = cloud.deletedMarketplaceIds;
      }
      if (cloud.marketplace) {
        for (const id of Object.keys(cloud.marketplace)) {
          if (
            !FAKE_MARKETPLACE_IDS.has(id) &&
            !id.startsWith('demo_') &&
            !id.startsWith('test_') &&
            !liveDb.deletedMarketplaceIds.includes(id)
          ) {
            liveDb.marketplace[id] = cloud.marketplace[id];
          }
        }
      }
      if (cloud.supportTickets && typeof cloud.supportTickets === 'object') {
        Object.assign(liveDb.supportTickets, cloud.supportTickets);
      }
    }
  } catch {
    // Will initialize fresh cloud file below
  }

  // 2. Load primary records from Supabase PostgreSQL tables
  try {
    const [
      { data: dbProfiles },
      { data: dbPosts },
      { data: dbComments },
      { data: dbReactions },
      { data: dbSuggestions },
      { data: dbNotifications },
      { data: dbChatMessages },
    ] = await Promise.all([
      sbAdmin.from('profiles').select('*').limit(1000),
      sbAdmin.from('posts').select('*').order('created_at', { ascending: false }).limit(500),
      sbAdmin.from('comments').select('*').order('created_at', { ascending: true }).limit(1000),
      sbAdmin.from('post_reactions').select('*').limit(2000),
      sbAdmin.from('suggestions').select('*').order('created_at', { ascending: false }).limit(500),
      sbAdmin.from('notifications').select('*').order('created_at', { ascending: false }).limit(1000),
      sbAdmin.from('chat_messages').select('*').order('created_at', { ascending: true }).limit(1000),
    ]);

    if (Array.isArray(dbProfiles)) {
      for (const row of dbProfiles) {
        if (row?.id && !FAKE_USER_UIDS.has(row.id)) {
          liveDb.users[row.id] = supabaseProfileRowToUser(row, liveDb.users[row.id]);
        }
      }
    }
    if (Array.isArray(dbPosts)) {
      for (const row of dbPosts) {
        if (row?.id && !liveDb.deletedPostIds.includes(row.id)) {
          const fromRow = supabaseRowToPost(row);
          const existingPost = liveDb.posts[row.id];
          liveDb.posts[row.id] = existingPost
            ? {
                ...fromRow,
                ...existingPost,
                likesCount: Math.max(
                  Number(existingPost.likesCount || 0),
                  Number(fromRow.likesCount || 0)
                ),
                commentsCount: Math.max(
                  Number(existingPost.commentsCount || 0),
                  Number(fromRow.commentsCount || 0)
                ),
              }
            : fromRow;
        }
      }
    }
    if (Array.isArray(dbComments)) {
      for (const row of dbComments) {
        if (
          row?.id &&
          !liveDb.deletedPostIds.includes(row.post_id) &&
          !liveDb.deletedCommentIds.includes(row.id)
        ) {
          liveDb.comments[row.id] = {
            ...liveDb.comments[row.id],
            ...supabaseRowToComment(row),
          };
        }
      }
    }
    if (Array.isArray(dbReactions)) {
      for (const row of dbReactions) {
        if (row?.id && row?.post_id && row?.user_id) {
          liveDb.reactions[row.id] = {
            id: row.id,
            postId: row.post_id,
            userId: row.user_id,
            type: row.type || 'damay',
            createdAtMs: Date.parse(row.created_at || '') || Date.now(),
          };
        }
      }
    }
    if (Array.isArray(dbSuggestions)) {
      for (const row of dbSuggestions) {
        if (row?.id) {
          liveDb.suggestions[row.id] = supabaseRowToSuggestion(row);
        }
      }
    }
    if (Array.isArray(dbNotifications)) {
      for (const row of dbNotifications) {
        if (row?.id) {
          liveDb.notifications[row.id] = supabaseRowToNotification(row);
        }
      }
    }
    if (Array.isArray(dbChatMessages)) {
      for (const row of dbChatMessages) {
        if (row?.id) {
          const msgObj = supabaseRowToChatMessage(row, liveDb.messages[row.id]);
          liveDb.messages[row.id] = msgObj;
          if (msgObj.chatId && msgObj.senderId && msgObj.recipientId) {
            const sorted = [msgObj.senderId, msgObj.recipientId].sort();
            const userAId = sorted[0];
            const userBId = sorted[1];
            const userA = liveDb.users[userAId] || {};
            const userB = liveDb.users[userBId] || {};
            const existingThread = liveDb.chats[msgObj.chatId];
            const preview =
              msgObj.text ||
              (msgObj.attachmentName ? `Sent ${msgObj.attachmentName}` : 'Sent a message');
            liveDb.chats[msgObj.chatId] = {
              ...existingThread,
              id: msgObj.chatId,
              participantIds: sorted,
              userAId,
              userANickname:
                existingThread?.userANickname ||
                userA.nickname ||
                (userAId === msgObj.senderId ? msgObj.senderNickname : 'Student'),
              userAPhotoURL:
                existingThread?.userAPhotoURL ||
                userA.photoURL ||
                (userAId === msgObj.senderId ? msgObj.senderPhotoURL : ''),
              userABadge:
                existingThread?.userABadge ||
                userA.badge ||
                (userAId === msgObj.senderId ? msgObj.senderBadge : 'verified'),
              userBId,
              userBNickname:
                existingThread?.userBNickname ||
                userB.nickname ||
                (userBId === msgObj.senderId ? msgObj.senderNickname : 'Student'),
              userBPhotoURL:
                existingThread?.userBPhotoURL ||
                userB.photoURL ||
                (userBId === msgObj.senderId ? msgObj.senderPhotoURL : ''),
              userBBadge:
                existingThread?.userBBadge ||
                userB.badge ||
                (userBId === msgObj.senderId ? msgObj.senderBadge : 'verified'),
              lastMessage: preview.slice(0, 300),
              lastSenderId: msgObj.senderId,
              lastMessageRead: Boolean(msgObj.read),
              createdAt: existingThread?.createdAt || msgObj.createdAt,
              updatedAt: msgObj.createdAt,
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('Supabase table load warning:', err);
  }

  // 3. Merge local disk backup if present so recent server mutations survive restarts
  try {
    if (fs.existsSync(LOCAL_DB_BACKUP_PATH)) {
      const localRaw = fs.readFileSync(LOCAL_DB_BACKUP_PATH, 'utf8');
      const localSnap = JSON.parse(localRaw);
      if (Array.isArray(localSnap.deletedPostIds)) {
        liveDb.deletedPostIds = Array.from(
          new Set([...(liveDb.deletedPostIds || []), ...localSnap.deletedPostIds])
        );
      }
      if (Array.isArray(localSnap.deletedCommentIds)) {
        liveDb.deletedCommentIds = Array.from(
          new Set([...(liveDb.deletedCommentIds || []), ...localSnap.deletedCommentIds])
        );
      }
      if (localSnap.posts && typeof localSnap.posts === 'object') {
        for (const pid of Object.keys(localSnap.posts)) {
          if (!FAKE_POST_IDS.has(pid) && !liveDb.deletedPostIds.includes(pid)) {
            const lp = localSnap.posts[pid];
            const ep = liveDb.posts[pid];
            liveDb.posts[pid] = ep
              ? {
                  ...ep,
                  ...lp,
                  likesCount: Math.max(Number(ep.likesCount || 0), Number(lp.likesCount || 0)),
                }
              : lp;
          }
        }
      }
      if (localSnap.comments && typeof localSnap.comments === 'object') {
        for (const cid of Object.keys(localSnap.comments)) {
          const c = localSnap.comments[cid];
          if (
            c?.id &&
            c?.postId &&
            !liveDb.deletedPostIds.includes(c.postId) &&
            !liveDb.deletedCommentIds.includes(cid)
          ) {
            liveDb.comments[cid] = { ...liveDb.comments[cid], ...c };
          }
        }
      }
      if (localSnap.reactions && typeof localSnap.reactions === 'object') {
        liveDb.reactions = { ...liveDb.reactions, ...localSnap.reactions };
      }
      if (localSnap.commentReactions && typeof localSnap.commentReactions === 'object') {
        liveDb.commentReactions = { ...liveDb.commentReactions, ...localSnap.commentReactions };
      }
      if (Array.isArray(localSnap.deletedUserIds)) {
        liveDb.deletedUserIds = Array.from(
          new Set([...(liveDb.deletedUserIds || []), ...localSnap.deletedUserIds])
        );
      }
      if (localSnap.platformSettings && typeof localSnap.platformSettings === 'object') {
        liveDb.platformSettings = {
          ...(liveDb.platformSettings || {}),
          ...localSnap.platformSettings,
        };
      }
      if (localSnap.reports && typeof localSnap.reports === 'object') {
        liveDb.reports = { ...liveDb.reports, ...localSnap.reports };
      }
      if (localSnap.moderationRules && typeof localSnap.moderationRules === 'object') {
        liveDb.moderationRules = { ...liveDb.moderationRules, ...localSnap.moderationRules };
      }
      if (localSnap.notifications && typeof localSnap.notifications === 'object') {
        liveDb.notifications = { ...liveDb.notifications, ...localSnap.notifications };
      }
      if (localSnap.chats && typeof localSnap.chats === 'object') {
        liveDb.chats = { ...liveDb.chats, ...localSnap.chats };
      }
      if (localSnap.messages && typeof localSnap.messages === 'object') {
        liveDb.messages = { ...liveDb.messages, ...localSnap.messages };
      }
      if (Array.isArray(localSnap.deletedMarketplaceIds)) {
        liveDb.deletedMarketplaceIds = Array.from(
          new Set([...(liveDb.deletedMarketplaceIds || []), ...localSnap.deletedMarketplaceIds])
        );
      }
      if (localSnap.marketplace && typeof localSnap.marketplace === 'object') {
        for (const mid of Object.keys(localSnap.marketplace)) {
          if (
            !FAKE_MARKETPLACE_IDS.has(mid) &&
            !mid.startsWith('demo_') &&
            !mid.startsWith('test_') &&
            !liveDb.deletedMarketplaceIds.includes(mid)
          ) {
            liveDb.marketplace[mid] = { ...liveDb.marketplace[mid], ...localSnap.marketplace[mid] };
          }
        }
      }
      if (localSnap.supportTickets && typeof localSnap.supportTickets === 'object') {
        liveDb.supportTickets = { ...liveDb.supportTickets, ...localSnap.supportTickets };
      }
    }
  } catch {
    // Non-fatal
  }

  await syncRealUsersFromSupabaseAuth(true);
  deduplicateAndNormalizeLiveUsers();
  seedInitialRestoredContent();

  // Strictly purge any deleted posts, comments, or marketplace items loaded from any source
  for (const delPid of liveDb.deletedPostIds || []) {
    delete liveDb.posts[delPid];
  }
  for (const delCid of liveDb.deletedCommentIds || []) {
    delete liveDb.comments[delCid];
  }
  for (const delMid of liveDb.deletedMarketplaceIds || []) {
    delete liveDb.marketplace[delMid];
  }

  reconcileLivePostCounts();
  void syncAllTablesToSupabase();
  void flushLiveDbToCloud();
}

// Keep active SSE connections fresh and broadcast presence heartbeats every 15 seconds
setInterval(() => {
  const now = Date.now();
  activeSocketsByUid.forEach((sockets, uid) => {
    if (sockets.size > 0 && liveDb.presence[uid]) {
      liveDb.presence[uid].isOnline = true;
      liveDb.presence[uid].lastSeenMs = now;
      liveDb.presence[uid].updatedAtMs = now;
    }
  });
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].write(`: heartbeat ${now}\n\n`);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}, 15000);

async function startServer() {
  await initializeCloudState();

  const app = express();
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Accept, Cache-Control'
    );
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: '30mb' }));

  // Supabase Storage Direct File Upload Endpoint (Photos, Videos, PDFs, Word, Excel, PPT, Avatars)
  app.post('/api/storage/upload', async (req, res) => {
    try {
      const { fileName, mimeType, base64Data, folder = 'uploads' } = req.body || {};
      if (!base64Data || typeof base64Data !== 'string') {
        res.status(400).json({ ok: false, error: 'Missing file data' });
        return;
      }

      const commaIdx = base64Data.indexOf(',');
      const rawBase64 = commaIdx !== -1 ? base64Data.slice(commaIdx + 1) : base64Data;
      const buffer = Buffer.from(rawBase64, 'base64');

      const safeFolder = String(folder || 'uploads').replace(/[^a-zA-Z0-9_-]/g, '');
      const safeFileName = String(fileName || 'attachment')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 100);
      const objectPath = `${safeFolder}/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}_${safeFileName}`;

      const { error } = await sbAdmin.storage.from(STORAGE_BUCKET).upload(objectPath, buffer, {
        contentType: mimeType || 'application/octet-stream',
        upsert: true,
      });

      if (error) {
        res.status(500).json({ ok: false, error: error.message });
        return;
      }

      const { data: pubData } = sbAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);
      res.json({
        ok: true,
        path: objectPath,
        publicUrl: pubData.publicUrl,
      });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  // Supabase Nickname Availability Check Endpoint
  app.get(['/api/supabase/check-nickname', '/api/db/check-nickname'], async (req, res) => {
    try {
      const nickname = String(req.query.nickname || '').trim();
      const uid = String(req.query.uid || '').trim();
      const email = String(req.query.email || '').trim().toLowerCase();
      const norm = nickname.toLowerCase();

      if (!norm || norm.length < 2) {
        res.json({ available: false, reason: 'Nickname must be at least 2 characters.' });
        return;
      }
      if (norm === 'one' || norm === 'one_official') {
        res.json({
          available: false,
          reason: 'Nickname @ONE is reserved for the official ONE account.',
        });
        return;
      }

      // If the requesting user already owns this nickname on their own profile, it is available to them
      if (uid && liveDb.users[uid] && String(liveDb.users[uid].nickname || '').toLowerCase() === norm) {
        res.json({ available: true });
        return;
      }

      // Check Supabase profiles table first
      const { data: matches } = await sbAdmin
        .from('profiles')
        .select('id, nickname')
        .ilike('nickname', norm)
        .limit(5);

      if (Array.isArray(matches) && matches.length > 0) {
        if (uid && matches.some((m) => m.id === uid && String(m.nickname || '').toLowerCase() === norm)) {
          res.json({ available: true });
          return;
        }
        const conflict = matches.find((m) => {
          if (m.id === uid) return false;
          if (email && liveDb.usersPrivate[m.id]?.toLowerCase() === email) return false;
          return String(m.nickname || '').toLowerCase() === norm;
        });
        if (conflict) {
          res.json({
            available: false,
            reason: `Nickname @${nickname} is already used by another user.`,
          });
          return;
        }
      }

      // Also check liveDb.users
      for (const existingUid of Object.keys(liveDb.users)) {
        if (existingUid === uid) continue;
        if (email && liveDb.usersPrivate[existingUid]?.toLowerCase() === email) continue;
        const u = liveDb.users[existingUid];
        if (u && String(u.nickname || '').toLowerCase() === norm) {
          res.json({
            available: false,
            reason: `Nickname @${nickname} is already used by another user.`,
          });
          return;
        }
      }

      res.json({ available: true });
    } catch {
      res.json({ available: true });
    }
  });

  // Real-Time Server-Sent Events (SSE) Stream for instant live updates & active presence
  app.get('/api/db/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const uid = String(req.query.uid || '').trim();
    const nickname = String(req.query.nickname || '').trim();
    const badge = String(req.query.badge || '').trim();
    const campus = String(req.query.campus || '').trim();

    sseClients.push(res);

    if (uid && !FAKE_USER_UIDS.has(uid) && uid !== 'one_official') {
      if (!activeSocketsByUid.has(uid)) {
        activeSocketsByUid.set(uid, new Set());
      }
      activeSocketsByUid.get(uid).add(res);

      const userRecord = liveDb.users[uid] || {};
      const existingPres = liveDb.presence[uid] || {};
      const now = Date.now();
      const updatedPresence = {
        ...existingPres,
        uid,
        nickname: nickname || userRecord.nickname || existingPres.nickname || 'student',
        photoURL: userRecord.photoURL || existingPres.photoURL || '',
        badge: badge || userRecord.badge || existingPres.badge || 'verified',
        campus: campus || userRecord.campus || existingPres.campus || 'MSU Main Campus - Marawi',
        isOnline: true,
        lastSeenMs: now,
        visibility: 'edu_verified',
        updatedAtMs: now,
      };
      liveDb.presence[uid] = updatedPresence;
      broadcastRealtimeEvent('upsert_presence', { presence: updatedPresence });
    }

    res.write(
      `data: ${JSON.stringify({
        action: 'connected',
        updatedAt: liveDb.updatedAt,
      })}\n\n`
    );

    req.on('close', () => {
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
      if (uid && activeSocketsByUid.has(uid)) {
        const setForUid = activeSocketsByUid.get(uid);
        setForUid.delete(res);
        if (setForUid.size === 0) {
          activeSocketsByUid.delete(uid);
          setTimeout(() => {
            const stillConnected =
              activeSocketsByUid.has(uid) && activeSocketsByUid.get(uid).size > 0;
            if (!stillConnected && liveDb.presence[uid]) {
              liveDb.presence[uid] = {
                ...liveDb.presence[uid],
                isOnline: false,
                lastSeenMs: Date.now(),
                updatedAtMs: Date.now(),
              };
              broadcastRealtimeEvent('upsert_presence', {
                presence: liveDb.presence[uid],
              });
            }
          }, 12000);
        }
      }
    });
  });

  app.get('/api/db/state', async (_req, res) => {
    void syncRealUsersFromSupabaseAuth(false);
    reconcileLivePostCounts();
    const now = Date.now();
    activeSocketsByUid.forEach((sockets, uid) => {
      if (sockets.size > 0 && liveDb.presence[uid]) {
        liveDb.presence[uid].isOnline = true;
        liveDb.presence[uid].lastSeenMs = now;
      }
    });
    res.json({
      updatedAt: liveDb.updatedAt,
      users: Object.keys(liveDb.users)
        .filter((uid) => !(liveDb.deletedUserIds || []).includes(uid))
        .map((uid) => liveDb.users[uid]),
      usersPrivate: liveDb.usersPrivate,
      deletedUserIds: liveDb.deletedUserIds || [],
      presence: Object.keys(liveDb.presence)
        .filter((uid) => !(liveDb.deletedUserIds || []).includes(uid))
        .map((uid) => liveDb.presence[uid]),
      posts: Object.keys(liveDb.posts)
        .filter((pid) => !liveDb.deletedPostIds.includes(pid))
        .map((pid) => liveDb.posts[pid]),
      deletedPostIds: liveDb.deletedPostIds,
      deletedCommentIds: liveDb.deletedCommentIds,
      comments: Object.values(liveDb.comments),
      reactions: Object.values(liveDb.reactions),
      commentReactions: Object.values(liveDb.commentReactions || {}),
      suggestions: Object.values(liveDb.suggestions),
      chats: Object.values(liveDb.chats),
      messages: Object.values(liveDb.messages),
      notifications: Object.values(liveDb.notifications),
      reports: Object.values(liveDb.reports),
      moderationRules: Object.values(liveDb.moderationRules),
      platformSettings: liveDb.platformSettings,
      marketplace: Object.keys(liveDb.marketplace)
        .filter(
          (mid) =>
            !FAKE_MARKETPLACE_IDS.has(mid) &&
            !mid.startsWith('demo_') &&
            !mid.startsWith('test_') &&
            !liveDb.deletedMarketplaceIds.includes(mid)
        )
        .map((mid) => liveDb.marketplace[mid]),
      deletedMarketplaceIds: liveDb.deletedMarketplaceIds,
      supportTickets: Object.values(liveDb.supportTickets || {}),
      releaseVersion: '2026.09.29.v10',
    });
  });

  app.post('/api/db/sync-auth-users', async (_req, res) => {
    await syncRealUsersFromSupabaseAuth(true);
    await syncAllTablesToSupabase();
    broadcastRealtimeEvent('sync_all', {});
    res.json({
      ok: true,
      usersCount: Object.keys(liveDb.users).length,
      postsCount: Object.keys(liveDb.posts).length,
      commentsCount: Object.keys(liveDb.comments).length,
      suggestionsCount: Object.keys(liveDb.suggestions).length,
    });
  });

  app.post('/api/db/mutate', async (req, res) => {
    const { action, payload } = req.body || {};
    const reqSb = getSupabaseForRequest(req);
    try {
      switch (action) {
        case 'upsert_user': {
          const { user, email } = payload || {};
          if (user?.uid) {
            const cleanEmail = String(email || liveDb.usersPrivate[user.uid] || '')
              .trim()
              .toLowerCase();
            const canonicalUid = resolveCanonicalUid(user.uid, cleanEmail);
            if (canonicalUid && !FAKE_USER_UIDS.has(canonicalUid)) {
              if (user.uid !== canonicalUid) {
                delete liveDb.users[user.uid];
                delete liveDb.usersPrivate[user.uid];
                delete liveDb.presence[user.uid];
              }
              user.uid = canonicalUid;
              if (user.photoURL && String(user.photoURL).startsWith('data:image/')) {
                user.photoURL = await ensureStoragePublicUrl(
                  user.photoURL,
                  `avatar_${canonicalUid}.jpg`,
                  'image/jpeg',
                  'avatars'
                );
              }
              const prev = liveDb.users[canonicalUid] || {};
              const isCamarin =
                canonicalUid === '4ae58a7b-5104-4479-8667-ed9e465ba447' ||
                cleanEmail === 'camarin.xn839@s.msumain.edu.ph';
              const isXanderDev =
                canonicalUid === '538a6246-5cc8-4c63-bbda-0507196f3d5d' ||
                cleanEmail === 'xandercamarin@gmail.com';
              const nowMs = Date.now();
              const merged = {
                ...prev,
                ...user,
                uid: canonicalUid,
                nickname:
                  user.nickname && user.nickname !== 'student'
                    ? user.nickname
                    : prev.nickname && prev.nickname !== 'student'
                    ? prev.nickname
                    : isXanderDev
                    ? 'xander'
                    : isCamarin
                    ? 'camarin.xn839'
                    : user.nickname || prev.nickname || 'student',
                googleDisplayName:
                  user.googleDisplayName ||
                  prev.googleDisplayName ||
                  (isXanderDev
                    ? 'Xander James'
                    : isCamarin
                    ? 'Xander James Camarin'
                    : user.nickname || 'MSU Student'),
                photoURL: user.photoURL || prev.photoURL || '',
                badge: isXanderDev
                  ? 'developer'
                  : user.badge || prev.badge || 'verified',
                role: isXanderDev
                  ? 'developer'
                  : user.role ||
                    (user.badge === 'developer'
                      ? 'developer'
                      : user.badge === 'moderator'
                      ? 'moderator'
                      : prev.role || 'student'),
                referralSource: user.referralSource ?? prev.referralSource ?? '',
                referralSubmittedAt: user.referralSubmittedAt ?? prev.referralSubmittedAt ?? '',
                updatedAtMs: nowMs,
              };
              if (Array.isArray(liveDb.deletedUserIds)) {
                liveDb.deletedUserIds = liveDb.deletedUserIds.filter((id: string) => id !== canonicalUid);
              }
              liveDb.users[canonicalUid] = merged;
              if (cleanEmail) {
                liveDb.usersPrivate[canonicalUid] = cleanEmail;
              }
              deduplicateAndNormalizeLiveUsers();
              if (liveDb.presence[canonicalUid]) {
                liveDb.presence[canonicalUid] = {
                  ...liveDb.presence[canonicalUid],
                  uid: canonicalUid,
                  nickname: merged.nickname || liveDb.presence[canonicalUid].nickname,
                  photoURL: merged.photoURL ?? liveDb.presence[canonicalUid].photoURL,
                  badge: merged.badge || liveDb.presence[canonicalUid].badge,
                  campus: merged.campus || liveDb.presence[canonicalUid].campus,
                  updatedAtMs: nowMs,
                };
              }
              // Update payload so broadcastRealtimeEvent sends the canonical merged user
              payload.user = merged;
              if (cleanEmail) payload.email = cleanEmail;

              // Update author info on non-anonymous posts & comments for this user
              Object.values(liveDb.posts).forEach((p: any) => {
                if (p && p.authorId === canonicalUid && !p.isAnonymous) {
                  p.authorNickname = merged.nickname;
                  p.authorDisplayName = merged.googleDisplayName || merged.nickname;
                  if (merged.photoURL) p.authorPhotoURL = merged.photoURL;
                  p.authorBadge = merged.badge;
                }
              });
              Object.values(liveDb.comments).forEach((c: any) => {
                if (c && c.authorId === canonicalUid && !c.isAnonymous) {
                  c.authorNickname = merged.nickname;
                  c.authorDisplayName = merged.googleDisplayName || merged.nickname;
                  if (merged.photoURL) c.authorPhotoURL = merged.photoURL;
                  c.authorBadge = merged.badge;
                }
              });

              const profileRow = userToSupabaseProfileRow(merged);
              if (profileRow) {
                sbAdmin
                  .from('profiles')
                  .upsert(profileRow)
                  .then(() => {});
              }
              if (isValidUuid(canonicalUid)) {
                sbAdmin.auth.admin
                  .updateUserById(canonicalUid, {
                    user_metadata: {
                      full_name: merged.googleDisplayName,
                      name: merged.googleDisplayName,
                      ...(merged.photoURL && merged.photoURL.length < 4096
                        ? { avatar_url: merged.photoURL, picture: merged.photoURL }
                        : {}),
                      one_profile: {
                        nickname: merged.nickname,
                        nicknameUpdatedAt: merged.nicknameUpdatedAt,
                        googleDisplayName: merged.googleDisplayName,
                        photoURL:
                          merged.photoURL && merged.photoURL.length < 4096
                            ? merged.photoURL
                            : undefined,
                        campus: merged.campus,
                        bio: merged.bio,
                        defaultAnonymous: merged.defaultAnonymous,
                        referralSource: merged.referralSource,
                        referralSubmittedAt: merged.referralSubmittedAt,
                        badge: merged.badge,
                        role: merged.role,
                        accountStatus: merged.accountStatus,
                        isVerifiedStudent: merged.isVerifiedStudent,
                        permissions: merged.permissions,
                        updatedAtMs: nowMs,
                      },
                    },
                  })
                  .catch(() => {});
              }
            }
          }
          break;
        }
        case 'delete_user': {
          const { uid } = payload || {};
          if (uid) {
            if (!Array.isArray(liveDb.deletedUserIds)) {
              liveDb.deletedUserIds = [];
            }
            if (!liveDb.deletedUserIds.includes(uid)) {
              liveDb.deletedUserIds.push(uid);
            }
            delete liveDb.users[uid];
            delete liveDb.usersPrivate[uid];
            delete liveDb.presence[uid];
            if (isValidUuid(uid)) {
              sbAdmin
                .from('profiles')
                .delete()
                .eq('id', uid)
                .then(() => {});
            }
          }
          break;
        }
        case 'upsert_presence': {
          const { presence } = payload || {};
          if (presence?.uid && !FAKE_USER_UIDS.has(presence.uid)) {
            liveDb.presence[presence.uid] = {
              ...liveDb.presence[presence.uid],
              ...presence,
              lastSeenMs: presence.lastSeenMs || Date.now(),
              updatedAtMs: Date.now(),
            };
          }
          break;
        }
        case 'upsert_post': {
          const { post } = payload || {};
          if (
            post?.id &&
            !FAKE_POST_IDS.has(post.id) &&
            !liveDb.deletedPostIds.includes(post.id)
          ) {
            if (post.attachmentDataUrl && String(post.attachmentDataUrl).startsWith('data:')) {
              post.attachmentDataUrl = await ensureStoragePublicUrl(
                post.attachmentDataUrl,
                post.attachmentName || 'post_file',
                post.attachmentMime || 'application/octet-stream',
                'post-files'
              );
            }
            const mergedPost = {
              ...liveDb.posts[post.id],
              ...post,
            };
            liveDb.posts[post.id] = mergedPost;
            const postRow = postToSupabaseRow(mergedPost);
            if (postRow) {
              sbAdmin
                .from('posts')
                .upsert(postRow)
                .then(() => {});
            }
          }
          break;
        }
        case 'update_post_fields': {
          const { postId, fields } = payload || {};
          if (postId && liveDb.posts[postId]) {
            const updatedPost = {
              ...liveDb.posts[postId],
              ...fields,
              updatedAtMs: Date.now(),
            };
            liveDb.posts[postId] = updatedPost;
            const postRow = postToSupabaseRow(updatedPost);
            if (postRow) {
              sbAdmin
                .from('posts')
                .upsert(postRow)
                .then(() => {});
            }
          }
          break;
        }
        case 'delete_post': {
          const { postId } = payload || {};
          if (postId) {
            if (!liveDb.deletedPostIds.includes(postId)) {
              liveDb.deletedPostIds.push(postId);
            }
            delete liveDb.posts[postId];
            Object.keys(liveDb.comments).forEach((cid) => {
              if (liveDb.comments[cid]?.postId === postId) {
                delete liveDb.comments[cid];
              }
            });
            Object.keys(liveDb.commentReactions || {}).forEach((rid) => {
              if (liveDb.commentReactions[rid]?.postId === postId) {
                delete liveDb.commentReactions[rid];
              }
            });
            sbAdmin
              .from('comments')
              .delete()
              .eq('post_id', postId)
              .then(() => {});
            sbAdmin
              .from('post_reactions')
              .delete()
              .eq('post_id', postId)
              .then(() => {});
            sbAdmin
              .from('posts')
              .delete()
              .eq('id', postId)
              .then(() => {});
          }
          break;
        }
        case 'upsert_comment': {
          const { comment } = payload || {};
          if (
            comment?.id &&
            comment?.postId &&
            !FAKE_COMMENT_IDS.has(comment.id) &&
            !liveDb.deletedPostIds.includes(comment.postId) &&
            !liveDb.deletedCommentIds.includes(comment.id)
          ) {
            const canonicalAuthorId = resolveCanonicalUid(comment.authorId) || comment.authorId;
            comment.authorId = canonicalAuthorId;
            if (comment.authorPhotoURL && String(comment.authorPhotoURL).startsWith('data:')) {
              comment.authorPhotoURL = liveDb.users[canonicalAuthorId]?.photoURL || '';
            }
            const nowTs = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
            const normalizedComment = {
              ...liveDb.comments[comment.id],
              ...comment,
              createdAt: comment.createdAt || liveDb.comments[comment.id]?.createdAt || nowTs,
              updatedAt: nowTs,
            };
            liveDb.comments[comment.id] = normalizedComment;
            payload.comment = normalizedComment;

            reconcileLivePostCounts(comment.postId);
            if (liveDb.posts[comment.postId]) {
              liveDb.posts[comment.postId].updatedAtMs = Date.now();
              const cRow = commentToSupabaseRow(normalizedComment);
              if (cRow) {
                sbAdmin
                  .from('comments')
                  .upsert(cRow)
                  .then(() => {});
              }
              const postRow = postToSupabaseRow(liveDb.posts[comment.postId]);
              if (postRow) {
                sbAdmin
                  .from('posts')
                  .upsert(postRow)
                  .then(() => {});
              }
            }
          }
          break;
        }
        case 'delete_comment': {
          const { commentId, postId } = payload || {};
          if (commentId) {
            const targetPostId = postId || liveDb.comments[commentId]?.postId;
            if (!liveDb.deletedCommentIds.includes(commentId)) {
              liveDb.deletedCommentIds.push(commentId);
            }
            delete liveDb.comments[commentId];
            Object.keys(liveDb.commentReactions || {}).forEach((rid) => {
              if (liveDb.commentReactions[rid]?.commentId === commentId) {
                delete liveDb.commentReactions[rid];
              }
            });
            sbAdmin
              .from('comments')
              .delete()
              .eq('id', commentId)
              .then(() => {});
            if (targetPostId && liveDb.posts[targetPostId]) {
              reconcileLivePostCounts(targetPostId);
              liveDb.posts[targetPostId].updatedAtMs = Date.now();
              const postRow = postToSupabaseRow(liveDb.posts[targetPostId]);
              if (postRow) {
                sbAdmin
                  .from('posts')
                  .upsert(postRow)
                  .then(() => {});
              }
            }
          }
          break;
        }
        case 'toggle_comment_like': {
          const { commentId, userId } = payload || {};
          if (commentId && userId && liveDb.comments[commentId]) {
            const canonicalUid = resolveCanonicalUid(userId) || userId;
            const cmt = liveDb.comments[commentId];
            const prevLikedBy: string[] = Array.isArray(cmt.likedBy) ? cmt.likedBy : [];
            const alreadyLiked = prevLikedBy.includes(canonicalUid);
            const nextLikedBy = alreadyLiked
              ? prevLikedBy.filter((id) => id !== canonicalUid)
              : [...prevLikedBy, canonicalUid];
            cmt.likedBy = nextLikedBy;
            cmt.likesCount = nextLikedBy.length;
            liveDb.comments[commentId] = cmt;
            if (payload) {
              payload.likedBy = nextLikedBy;
              payload.likesCount = nextLikedBy.length;
            }
          }
          break;
        }
        case 'toggle_comment_reaction': {
          const { postId, commentId, userId, emoji } = payload || {};
          if (postId && commentId && userId) {
            const canonicalUid = resolveCanonicalUid(userId) || userId;
            const rId = `${commentId}_${canonicalUid}`;
            const rawRId = `${commentId}_${userId}`;
            liveDb.commentReactions = liveDb.commentReactions || {};
            const existingRxn = liveDb.commentReactions[rId] || liveDb.commentReactions[rawRId];
            if (!emoji || (existingRxn && existingRxn.emoji === emoji)) {
              delete liveDb.commentReactions[rId];
              delete liveDb.commentReactions[rawRId];
              if (payload) {
                payload.id = rId;
                payload.userId = canonicalUid;
                payload.removed = true;
              }
            } else {
              const nowTs = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
              const nextRxn = {
                id: rId,
                postId: String(postId),
                commentId: String(commentId),
                userId: canonicalUid,
                emoji: String(emoji),
                visibility: 'edu_verified',
                createdAt: existingRxn?.createdAt || nowTs,
                updatedAt: nowTs,
              };
              delete liveDb.commentReactions[rawRId];
              liveDb.commentReactions[rId] = nextRxn;
              if (payload) {
                payload.id = rId;
                payload.userId = canonicalUid;
                payload.removed = false;
                payload.reaction = nextRxn;
              }
            }
          }
          break;
        }
        case 'toggle_reaction': {
          const { postId, userId, currentlyReacted, likesCount } = payload || {};
          if (postId && userId) {
            const canonicalUserId = resolveCanonicalUid(userId) || userId;
            const rId = `${postId}_${canonicalUserId}`;
            const rawRId = `${postId}_${userId}`;
            if (currentlyReacted) {
              delete liveDb.reactions[rId];
              delete liveDb.reactions[rawRId];
              sbAdmin
                .from('post_reactions')
                .delete()
                .in('id', [rId, rawRId])
                .then(() => {});
            } else {
              liveDb.reactions[rId] = {
                id: rId,
                postId,
                userId: canonicalUserId,
                type: 'damay',
                createdAtMs: Date.now(),
              };
              if (isValidUuid(canonicalUserId)) {
                sbAdmin
                  .from('post_reactions')
                  .upsert({
                    id: rId,
                    post_id: String(postId),
                    user_id: canonicalUserId,
                    type: 'damay',
                    created_at: new Date().toISOString(),
                  })
                  .then(() => {});
              }
            }

            if (liveDb.posts[postId]) {
              const currentLikes = Number(liveDb.posts[postId].likesCount || 0);
              const computedNext =
                typeof likesCount === 'number' && likesCount >= 0
                  ? likesCount
                  : currentlyReacted
                  ? Math.max(0, currentLikes - 1)
                  : currentLikes + 1;
              const activeReactionCount = Object.values(liveDb.reactions).filter(
                (r: any) => r?.postId === postId
              ).length;
              const finalLikesCount = Math.max(computedNext, activeReactionCount);
              liveDb.posts[postId] = {
                ...liveDb.posts[postId],
                likesCount: finalLikesCount,
                updatedAtMs: Date.now(),
              };
              payload.likesCount = finalLikesCount;
              const postRow = postToSupabaseRow(liveDb.posts[postId]);
              if (postRow) {
                sbAdmin
                  .from('posts')
                  .upsert(postRow)
                  .then(() => {});
              }
            }
          }
          break;
        }
        case 'upsert_suggestion': {
          const { suggestion } = payload || {};
          if (suggestion?.id && !FAKE_SUGGESTION_IDS.has(suggestion.id)) {
            const mergedSug = {
              ...liveDb.suggestions[suggestion.id],
              ...suggestion,
            };
            liveDb.suggestions[suggestion.id] = mergedSug;
            const sRow = suggestionToSupabaseRow(mergedSug);
            if (sRow) {
              sbAdmin
                .from('suggestions')
                .upsert(sRow)
                .then(() => {});
            }
          }
          break;
        }
        case 'update_suggestion_fields': {
          const { suggestionId, fields } = payload || {};
          if (suggestionId && liveDb.suggestions[suggestionId]) {
            const updatedSug = {
              ...liveDb.suggestions[suggestionId],
              ...fields,
            };
            liveDb.suggestions[suggestionId] = updatedSug;
            const sRow = suggestionToSupabaseRow(updatedSug);
            if (sRow) {
              sbAdmin
                .from('suggestions')
                .upsert(sRow)
                .then(() => {});
            }
          }
          break;
        }
        case 'delete_suggestion': {
          const { suggestionId } = payload || {};
          if (suggestionId) {
            delete liveDb.suggestions[suggestionId];
            sbAdmin
              .from('suggestions')
              .delete()
              .eq('id', suggestionId)
              .then(() => {});
          }
          break;
        }
        case 'upsert_chat_thread': {
          const { thread } = payload || {};
          if (thread?.id) {
            liveDb.chats[thread.id] = {
              ...liveDb.chats[thread.id],
              ...thread,
            };
          }
          break;
        }
        case 'delete_chat_thread_for_user': {
          const { chatId, userId } = payload || {};
          if (chatId && userId) {
            const existingThread = liveDb.chats[chatId];
            if (existingThread) {
              const prevDeletedBy = Array.isArray(existingThread.deletedBy)
                ? existingThread.deletedBy
                : [];
              if (!prevDeletedBy.includes(userId)) {
                liveDb.chats[chatId] = {
                  ...existingThread,
                  deletedBy: [...prevDeletedBy, userId],
                };
              }
            }
            Object.keys(liveDb.messages).forEach((mid) => {
              const m = liveDb.messages[mid];
              if (m && m.chatId === chatId) {
                const prevDeletedFor = Array.isArray(m.deletedFor) ? m.deletedFor : [];
                if (!prevDeletedFor.includes(userId)) {
                  liveDb.messages[mid] = {
                    ...m,
                    deletedFor: [...prevDeletedFor, userId],
                  };
                }
              }
            });
          }
          break;
        }
        case 'upsert_chat_message': {
          const { message } = payload || {};
          if (message?.id) {
            if (message.attachmentDataUrl && String(message.attachmentDataUrl).startsWith('data:')) {
              message.attachmentDataUrl = await ensureStoragePublicUrl(
                message.attachmentDataUrl,
                message.attachmentName || 'chat_file',
                message.attachmentMime || 'application/octet-stream',
                'chat-files'
              );
            }
            const mergedMsg = {
              ...liveDb.messages[message.id],
              ...message,
            };
            liveDb.messages[message.id] = mergedMsg;
            if (mergedMsg.chatId && liveDb.chats[mergedMsg.chatId]) {
              const curThread = liveDb.chats[mergedMsg.chatId];
              const nextDeletedBy = Array.isArray(curThread.deletedBy)
                ? curThread.deletedBy.filter(
                    (uid: string) => uid !== mergedMsg.senderId && uid !== mergedMsg.recipientId
                  )
                : [];
              liveDb.chats[mergedMsg.chatId] = {
                ...curThread,
                deletedBy: nextDeletedBy,
                ...(mergedMsg.read && curThread.lastSenderId === mergedMsg.senderId
                  ? { lastMessageRead: true }
                  : {}),
              };
            }
            const mRow = chatMessageToSupabaseRow(mergedMsg);
            if (mRow) {
              sbAdmin
                .from('chat_messages')
                .upsert(mRow)
                .then(() => {});
            }
          }
          break;
        }
        case 'mark_chat_read':
        case 'mark_chat_thread_read': {
          const { chatId, recipientId } = payload || {};
          if (chatId && recipientId) {
            Object.keys(liveDb.messages).forEach((mid) => {
              const m = liveDb.messages[mid];
              if (
                m &&
                m.chatId === chatId &&
                (m.recipientId === recipientId || m.senderId !== recipientId) &&
                !m.read
              ) {
                liveDb.messages[mid] = {
                  ...m,
                  read: true,
                };
              }
            });
            if (liveDb.chats[chatId]) {
              liveDb.chats[chatId] = {
                ...liveDb.chats[chatId],
                lastMessageRead: true,
              };
            }
            sbAdmin
              .from('chat_messages')
              .update({ read: true })
              .eq('chat_id', String(chatId))
              .eq('recipient_id', String(recipientId))
              .then(() => {});
          }
          break;
        }
        case 'delete_chat_message': {
          const { messageId } = payload || {};
          if (messageId) {
            delete liveDb.messages[messageId];
            sbAdmin
              .from('chat_messages')
              .delete()
              .eq('id', messageId)
              .then(() => {});
          }
          break;
        }
        case 'upsert_notification': {
          const { notification } = payload || {};
          if (notification?.id) {
            const mergedNotif = {
              ...liveDb.notifications[notification.id],
              ...notification,
            };
            liveDb.notifications[notification.id] = mergedNotif;
            const nRow = notificationToSupabaseRow(mergedNotif);
            if (nRow) {
              sbAdmin
                .from('notifications')
                .upsert(nRow)
                .then(() => {});
            }
          }
          break;
        }
        case 'mark_notification_read': {
          const { notificationId } = payload || {};
          if (notificationId) {
            if (liveDb.notifications[notificationId]) {
              liveDb.notifications[notificationId] = {
                ...liveDb.notifications[notificationId],
                read: true,
              };
            }
            sbAdmin
              .from('notifications')
              .update({ read: true })
              .eq('id', notificationId)
              .then(() => {});
          }
          break;
        }
        case 'mark_all_notifications_read': {
          const { recipientId } = payload || {};
          if (recipientId) {
            Object.keys(liveDb.notifications).forEach((nid) => {
              if (liveDb.notifications[nid]?.recipientId === recipientId) {
                liveDb.notifications[nid].read = true;
              }
            });
            sbAdmin
              .from('notifications')
              .update({ read: true })
              .eq('recipient_id', recipientId)
              .then(() => {});
          }
          break;
        }
        case 'delete_notification': {
          const { notificationId } = payload || {};
          if (notificationId) {
            delete liveDb.notifications[notificationId];
            sbAdmin
              .from('notifications')
              .delete()
              .eq('id', notificationId)
              .then(() => {});
          }
          break;
        }
        case 'clear_all_notifications': {
          const { recipientId } = payload || {};
          if (recipientId) {
            Object.keys(liveDb.notifications).forEach((nid) => {
              if (liveDb.notifications[nid]?.recipientId === recipientId) {
                delete liveDb.notifications[nid];
              }
            });
            sbAdmin
              .from('notifications')
              .delete()
              .eq('recipient_id', recipientId)
              .then(() => {});
          }
          break;
        }
        case 'upsert_report': {
          const { report } = payload || {};
          if (report?.id) {
            liveDb.reports[report.id] = {
              ...liveDb.reports[report.id],
              ...report,
            };
          }
          break;
        }
        case 'delete_report': {
          const { reportId } = payload || {};
          if (reportId) {
            delete liveDb.reports[reportId];
          }
          break;
        }
        case 'upsert_moderation_rule': {
          const { rule } = payload || {};
          if (rule?.id) {
            liveDb.moderationRules[rule.id] = {
              ...liveDb.moderationRules[rule.id],
              ...rule,
            };
          }
          break;
        }
        case 'delete_moderation_rule': {
          const { ruleId } = payload || {};
          if (ruleId) {
            delete liveDb.moderationRules[ruleId];
          }
          break;
        }
        case 'save_platform_settings': {
          const { settings } = payload || {};
          if (settings) {
            const mergedSettings = {
              ...(liveDb.platformSettings || {}),
              ...settings,
              updatedAtMs: Date.now(),
            };
            liveDb.platformSettings = mergedSettings;
            if (payload) {
              payload.settings = mergedSettings;
            }
          }
          break;
        }
        case 'upsert_marketplace_listing': {
          const { listing } = payload || {};
          if (
            listing?.id &&
            !FAKE_MARKETPLACE_IDS.has(listing.id) &&
            !String(listing.id).startsWith('demo_') &&
            !String(listing.id).startsWith('test_') &&
            !liveDb.deletedMarketplaceIds.includes(listing.id)
          ) {
            if (listing.imageUrl && String(listing.imageUrl).startsWith('data:image/')) {
              listing.imageUrl = await ensureStoragePublicUrl(
                listing.imageUrl,
                listing.imageName || `mkt_${listing.id}.jpg`,
                'image/jpeg',
                'marketplace'
              );
            }
            liveDb.marketplace[listing.id] = {
              ...liveDb.marketplace[listing.id],
              ...listing,
            };
          }
          break;
        }
        case 'update_marketplace_listing_fields': {
          const { listingId, fields } = payload || {};
          if (listingId && fields && liveDb.marketplace[listingId]) {
            liveDb.marketplace[listingId] = {
              ...liveDb.marketplace[listingId],
              ...fields,
              updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
            };
          }
          break;
        }
        case 'delete_marketplace_listing': {
          const { listingId } = payload || {};
          if (listingId) {
            delete liveDb.marketplace[listingId];
            if (!liveDb.deletedMarketplaceIds.includes(listingId)) {
              liveDb.deletedMarketplaceIds.push(listingId);
            }
          }
          break;
        }
        case 'upsert_support_ticket': {
          const { ticket } = payload || {};
          if (ticket?.id) {
            liveDb.supportTickets[ticket.id] = {
              ...liveDb.supportTickets[ticket.id],
              ...ticket,
            };
          }
          break;
        }
        case 'update_support_ticket_fields': {
          const { ticketId, fields } = payload || {};
          if (ticketId && fields && liveDb.supportTickets[ticketId]) {
            liveDb.supportTickets[ticketId] = {
              ...liveDb.supportTickets[ticketId],
              ...fields,
              updatedAt: { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 },
            };
          }
          break;
        }
        case 'delete_support_ticket': {
          const { ticketId } = payload || {};
          if (ticketId) {
            delete liveDb.supportTickets[ticketId];
          }
          break;
        }
        case 'broadcast_admin_post': {
          const { post, oneLogoDataUrl } = payload || {};
          if (post?.id) {
            const nowTs = { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
            const postTitleLine = post.title ? `📌 ${post.title}\n\n` : '';
            const msgText = `📢 Official Announcement from ONE\n\n${postTitleLine}${String(
              post.content || ''
            ).slice(0, 1800)}`;
            const previewText = `📢 Official Announcement: ${
              post.title || String(post.content || '').slice(0, 120)
            }`.slice(0, 280);

            Object.values(liveDb.users).forEach((u: any) => {
              if (!u?.uid || u.uid === 'one_official' || u.uid === post.authorId) return;
              const notifId = `notif_admin_post_${post.id}_${u.uid}`.slice(0, 120);
              liveDb.notifications[notifId] = {
                id: notifId,
                recipientId: u.uid,
                actorId: 'one_official',
                actorNickname: 'ONE',
                actorPhotoURL: oneLogoDataUrl || '',
                actorBadge: 'one_official',
                type: 'developer_post',
                targetId: post.id,
                previewText: previewText,
                read: false,
                createdAt: nowTs,
              };

              const sortedUids = [u.uid, 'one_official'].sort();
              const chatId = `${sortedUids[0]}_${sortedUids[1]}`;
              const isOneUserA = sortedUids[0] === 'one_official';
              const existingThread = liveDb.chats[chatId];
              const nextDeletedBy = Array.isArray(existingThread?.deletedBy)
                ? existingThread.deletedBy.filter((id: string) => id !== u.uid)
                : [];

              liveDb.chats[chatId] = {
                ...existingThread,
                id: chatId,
                participantIds: sortedUids,
                userAId: isOneUserA ? 'one_official' : u.uid,
                userANickname: isOneUserA ? 'ONE' : u.nickname || 'Student',
                userAPhotoURL: isOneUserA ? oneLogoDataUrl || '' : u.photoURL || '',
                userABadge: isOneUserA ? 'one_official' : u.badge || 'verified',
                userBId: isOneUserA ? u.uid : 'one_official',
                userBNickname: isOneUserA ? u.nickname || 'Student' : 'ONE',
                userBPhotoURL: isOneUserA ? u.photoURL || '' : oneLogoDataUrl || '',
                userBBadge: isOneUserA ? u.badge || 'verified' : 'one_official',
                lastMessage: previewText,
                lastSenderId: 'one_official',
                lastMessageRead: false,
                deletedBy: nextDeletedBy,
                createdAt: existingThread?.createdAt || nowTs,
                updatedAt: nowTs,
              };

              const msgId = `msg_admin_post_${post.id}_${u.uid}`.slice(0, 120);
              liveDb.messages[msgId] = {
                id: msgId,
                chatId,
                participantIds: sortedUids,
                senderId: 'one_official',
                recipientId: u.uid,
                senderNickname: 'ONE',
                senderPhotoURL: oneLogoDataUrl || '',
                senderBadge: 'one_official',
                text: msgText,
                attachmentType: post.attachmentType || 'none',
                attachmentName: post.attachmentName || '',
                attachmentSize: post.attachmentSize || 0,
                attachmentMime: post.attachmentMime || '',
                attachmentDataUrl: post.attachmentDataUrl || '',
                read: false,
                createdAt: nowTs,
              };
            });
          }
          break;
        }
      }
      liveDb.updatedAt = Date.now();
      broadcastRealtimeEvent(action, payload);
      if (
        action === 'upsert_marketplace_listing' ||
        action === 'update_marketplace_listing_fields' ||
        action === 'delete_marketplace_listing' ||
        action === 'delete_post' ||
        action === 'update_post_fields' ||
        action === 'upsert_post' ||
        action === 'upsert_comment' ||
        action === 'delete_comment' ||
        action === 'toggle_reaction' ||
        action === 'toggle_comment_reaction' ||
        action === 'toggle_comment_like' ||
        action === 'upsert_notification' ||
        action === 'save_platform_settings' ||
        action === 'upsert_report' ||
        action === 'delete_report' ||
        action === 'upsert_moderation_rule' ||
        action === 'delete_moderation_rule' ||
        action === 'upsert_suggestion' ||
        action === 'update_suggestion_fields' ||
        action === 'delete_suggestion' ||
        action === 'upsert_user' ||
        action === 'delete_user' ||
        action === 'mark_chat_thread_read' ||
        action === 'mark_chat_read' ||
        action === 'upsert_support_ticket' ||
        action === 'update_support_ticket_fields' ||
        action === 'delete_support_ticket' ||
        action === 'broadcast_admin_post'
      ) {
        void flushLiveDbToCloud();
      } else if (action !== 'upsert_presence') {
        persistLiveDbToCloud();
      }
      res.json({ ok: true, updatedAt: liveDb.updatedAt });
    } catch (err) {
      res.status(500).json({ ok: false, error: String(err) });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ONE MSUan Full-Stack Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
