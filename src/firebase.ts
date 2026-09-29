import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import realUsersSnapshotRaw from './utils/realUsersSnapshot.json';
import {
  ChatThread,
  Post,
  Suggestion,
  UserBadge,
  UserPresence,
  UserPrivateInfo,
  UserPublicProfile,
} from './types';

// Silence internal @firebase/firestore transient connection retry logs
setLogLevel('silent');

const app = initializeApp(firebaseConfig);

function createFirestoreInstance() {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Validate connection to Firestore on boot as required by firebase-integration skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export let isFirestoreQuotaExceeded = true;

export function canUseFirestore(_requiredUid?: string | null): boolean {
  return false;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): void {
  const errCode = (error as { code?: string } | null)?.code || '';
  const errMsg = error instanceof Error ? error.message : String(error);

  if (
    errCode === 'resource-exhausted' ||
    errMsg.includes('Quota exceeded') ||
    errMsg.includes('resource-exhausted')
  ) {
    isFirestoreQuotaExceeded = true;
    console.warn(`Firestore quota exceeded during ${operationType} on ${path}. Using cached/fallback state.`);
    return;
  }

  // Ignore transient network/offline unavailability, index precondition, not-found, or Supabase-session permission warnings so they don't crash the app
  if (
    errCode === 'unavailable' ||
    errCode === 'failed-precondition' ||
    errCode === 'permission-denied' ||
    errCode === 'not-found' ||
    errMsg.includes('[code=unavailable]') ||
    errMsg.includes('[code=failed-precondition]') ||
    errMsg.includes('No document to update') ||
    errMsg.includes('Missing or insufficient permissions') ||
    errMsg.includes('requires an index') ||
    errMsg.includes('Could not reach Cloud Firestore backend') ||
    errMsg.includes('client is offline')
  ) {
    return;
  }

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export const DEVELOPER_EMAIL = 'xandercamarin@gmail.com';
export const DEVELOPER_EMAILS = [
  'xandercamarin@gmail.com',
];

export const ALLOWED_MSU_EMAIL_DOMAINS = [
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
] as const;

export const TULIPS_USER_EMAIL = 'delacernaahrene122008@gmail.com';
export const TULIPS_USER_EMAILS = [
  'delacernaahrene122008@gmail.com',
  'delecernaahrene122008@gmail.com',
];
export const ALLOWLISTED_VERIFIED_EMAILS = [
  'delacernaahrene122008@gmail.com',
  'delecernaahrene122008@gmail.com',
];

export const ONE_OFFICIAL_UID = 'one_official';
export const ONE_OFFICIAL_NAME = 'ONE';
export const ONE_OFFICIAL_BADGE: UserBadge = 'one_official';

// Official ONE Logo SVG Data URL (MSU Maroon & Gold Emblem)
export const ONE_LOGO_DATA_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <rect width="120" height="120" rx="28" fill="#580B0C"/>
    <circle cx="60" cy="60" r="54" fill="#7B1113" stroke="#D4AF37" stroke-width="5"/>
    <text x="60" y="72" text-anchor="middle" fill="#D4AF37" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="35" letter-spacing="1.5">ONE</text>
  </svg>`
)}`;

export const SUPPORT_OFFICIAL_UID = 'contact_support_official';
export const SUPPORT_OFFICIAL_NAME = 'Contact Support';
export const SUPPORT_OFFICIAL_BADGE: UserBadge = 'developer';

export function isSupportOfficialAccount(uidOrNickname?: string | null): boolean {
  if (!uidOrNickname) return false;
  const norm = uidOrNickname.trim().toLowerCase();
  return (
    norm === 'contact_support_official' ||
    norm === 'contact support' ||
    norm === 'official admin' ||
    norm === 'official admin response'
  );
}

export function isOneOfficialAccount(
  uidOrNickname?: string | null,
  badge?: string | null
): boolean {
  if (isSupportOfficialAccount(uidOrNickname)) return false;
  if (badge === 'one_official') return true;
  if (!uidOrNickname) return false;
  const norm = uidOrNickname.trim().toLowerCase();
  return norm === 'one_official' || norm === 'one';
}

export function formatPeerDisplayName(
  nickname?: string | null,
  uid?: string | null,
  badge?: string | null
): string {
  if (isSupportOfficialAccount(uid) || isSupportOfficialAccount(nickname)) {
    return SUPPORT_OFFICIAL_NAME;
  }
  if (
    isOneOfficialAccount(uid, badge) ||
    isOneOfficialAccount(nickname, badge)
  ) {
    return ONE_OFFICIAL_NAME;
  }
  return `@${nickname || 'student'}`;
}

export function resolvePeerAvatar(
  photoURL?: string | null,
  uid?: string | null,
  nickname?: string | null,
  badge?: string | null,
  fallbackUrl = ''
): string {
  if (
    isSupportOfficialAccount(uid) ||
    isSupportOfficialAccount(nickname) ||
    isOneOfficialAccount(uid, badge) ||
    isOneOfficialAccount(nickname, badge)
  ) {
    return ONE_LOGO_DATA_URL;
  }
  return photoURL || fallbackUrl;
}

export const VERIFIED_EMAIL_SESSION_KEY = 'one_msu_verified_email_session';

function normalizeEmailForComparison(email: string | null | undefined): string {
  if (!email) return '';
  const lower = email.trim().toLowerCase();
  const [local, domain] = lower.split('@');
  if (!domain) return lower;
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return `${local.replace(/[._\-\s]/g, '')}@gmail.com`;
  }
  return lower;
}

export function getAuthenticatedUserEmail(user: unknown = auth.currentUser): string {
  if (!user || typeof user !== 'object') return '';
  const u = user as {
    email?: string | null;
    providerData?: Array<{ email?: string | null } | null>;
    user_metadata?: { email?: string | null };
    identities?: Array<{ identity_data?: { email?: string | null } }>;
  };
  if (u.email && u.email.trim()) return u.email.trim().toLowerCase();
  if (Array.isArray(u.providerData)) {
    for (const p of u.providerData) {
      if (p?.email && p.email.trim()) return p.email.trim().toLowerCase();
    }
  }
  if (u.user_metadata?.email && u.user_metadata.email.trim()) {
    return u.user_metadata.email.trim().toLowerCase();
  }
  if (Array.isArray(u.identities)) {
    for (const id of u.identities) {
      if (id?.identity_data?.email && id.identity_data.email.trim()) {
        return id.identity_data.email.trim().toLowerCase();
      }
    }
  }
  return '';
}

export function isDeveloperEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = email.trim().toLowerCase();
  const norm = normalizeEmailForComparison(raw);
  return DEVELOPER_EMAILS.includes(raw) || DEVELOPER_EMAILS.includes(norm);
}

export function isTulipsEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = email.trim().toLowerCase();
  const norm = normalizeEmailForComparison(raw);
  return (
    TULIPS_USER_EMAILS.includes(raw) ||
    TULIPS_USER_EMAILS.includes(norm)
  );
}

/**
 * Resolves the user's badge: 'developer' for developer emails
 * (xandercamarin@gmail.com, camarin.xn839@s.msumain.edu.ph),
 * 'tulips' for delecernaahrene122008@gmail.com,
 * and 'verified' for all other created accounts.
 */
export function resolveUserBadge(
  badge?: UserBadge | string | null,
  email?: string | null
): UserBadge {
  if (badge === 'one_official') {
    return 'one_official';
  }
  const cleanEmail = (email || '').trim().toLowerCase();
  if (cleanEmail === 'camarin.xn839@s.msumain.edu.ph') {
    return 'verified';
  }
  if (isDeveloperEmail(cleanEmail)) {
    return 'developer';
  }
  if (badge === 'developer' && !cleanEmail) {
    return 'developer';
  }
  if (badge === 'tulips' || isTulipsEmail(cleanEmail)) {
    return 'tulips';
  }
  if (badge === 'moderator') {
    return 'moderator';
  }
  return 'verified';
}

/**
 * Checks whether an email satisfies the official MSU institutional email requirement:
 * @s.msumain.edu.ph, @msumain.edu.ph, @msuiit.edu.ph, @g.msuiit.edu.ph, @sulat.msuiit.edu.ph,
 * @msugensan.edu.ph, @msutawi-tawi.edu.ph, @msunaawan.edu.ph, @msumaguindanao.edu.ph,
 * @msusulu.edu.ph, @msubuug.edu.ph
 * or belongs to an allowlisted/Developer account.
 */
export function isInstitutionalEduEmail(
  email: string | null | undefined,
  extraAllowlistedEmails?: string[]
): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const gmailNormalized = normalizeEmailForComparison(normalized);
  if (
    isDeveloperEmail(normalized) ||
    isTulipsEmail(normalized) ||
    ALLOWLISTED_VERIFIED_EMAILS.includes(normalized) ||
    ALLOWLISTED_VERIFIED_EMAILS.includes(gmailNormalized)
  ) {
    return true;
  }
  if (Array.isArray(extraAllowlistedEmails)) {
    const matchExtra = extraAllowlistedEmails.some((item) => {
      const clean = (item || '').trim().toLowerCase();
      return (
        clean.length > 3 &&
        (clean === normalized || normalizeEmailForComparison(clean) === gmailNormalized)
      );
    });
    if (matchExtra) return true;
  }
  const atIdx = normalized.lastIndexOf('@');
  if (atIdx === -1) return false;
  const domain = normalized.slice(atIdx + 1);
  return (ALLOWED_MSU_EMAIL_DOMAINS as readonly string[]).includes(domain);
}

/**
 * Extracts institutional domain from email (e.g., "s.msumain.edu.ph")
 */
export function extractEmailDomain(
  email: string | null | undefined,
  isSandboxOverride = false
): string {
  if (!email) return 's.msumain.edu.ph';
  const normalized = email.trim().toLowerCase();
  if (normalized === DEVELOPER_EMAIL || isTulipsEmail(normalized)) {
    return 'msumain.edu.ph';
  }
  const parts = normalized.split('@');
  const domain = parts[1] || '';
  if ((ALLOWED_MSU_EMAIL_DOMAINS as readonly string[]).includes(domain)) {
    return domain;
  }
  return isSandboxOverride ? 's.msumain.edu.ph' : domain || 's.msumain.edu.ph';
}

/**
 * Normalizes a nickname into a valid Firestore document ID for uniqueness enforcement.
 */
export function normalizeNicknameId(nickname: string): string {
  return nickname
    .trim()
    .replace(/^@+/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
}

/**
 * Sanitizes raw nickname input into a clean display handle (2-32 chars).
 */
export function sanitizeNicknameInput(rawNickname: string): string {
  return rawNickname
    .trim()
    .replace(/^@+/, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 32);
}

/**
 * Checks whether a nickname is available or already used by another student.
 */
export async function checkNicknameAvailability(
  nickname: string,
  currentUid: string,
  currentUserEmail?: string | null
): Promise<{ available: boolean; normalizedId: string; reason?: string }> {
  const cleaned = nickname.trim().replace(/^@+/, '').trim();
  if (cleaned.length < 2 || cleaned.length > 32) {
    return {
      available: false,
      normalizedId: '',
      reason: 'Nickname must be 2 to 32 characters long.',
    };
  }
  if (!/^[a-zA-Z0-9_.\-\s]+$/.test(cleaned)) {
    return {
      available: false,
      normalizedId: '',
      reason: 'Use only letters, numbers, spaces, dots (.), underscores (_), or hyphens (-).',
    };
  }

  const normalizedId = normalizeNicknameId(cleaned);
  if (!normalizedId || normalizedId.length < 2) {
    return {
      available: false,
      normalizedId: '',
      reason: 'Please enter a valid nickname (at least 2 letters or numbers).',
    };
  }

  if (normalizedId === 'one' || normalizedId === 'one_official') {
    return {
      available: false,
      normalizedId,
      reason: 'Nickname @ONE is reserved for the official ONE account.',
    };
  }

  // 1. Check Supabase profiles table and live server database first via /api/db/check-nickname
  const apiOrigins = [
    '',
    'https://ais-pre-jvczvc3zf5s4xavwr2wjxh-24974164073.asia-southeast1.run.app',
    'https://ais-dev-jvczvc3zf5s4xavwr2wjxh-24974164073.asia-southeast1.run.app',
  ];
  for (const origin of apiOrigins) {
    try {
      const params = new URLSearchParams({
        nickname: cleaned,
        uid: currentUid || '',
        email: currentUserEmail || '',
      });
      const res = await fetch(`${origin}/api/db/check-nickname?${params.toString()}`);
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json = (await res.json()) as { available?: boolean; reason?: string };
        if (json.available === false) {
          return {
            available: false,
            normalizedId,
            reason: json.reason || `Nickname @${cleaned} is already used by another user.`,
          };
        }
        if (json.available === true) {
          return { available: true, normalizedId };
        }
      }
    } catch {
      // Try next origin or fallback
    }
  }

  if (!canUseFirestore()) {
    return { available: true, normalizedId };
  }

  try {
    const snap = await Promise.race([
      getDoc(doc(db, 'nicknames', normalizedId)),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (!snap || !snap.exists()) {
      return { available: true, normalizedId };
    }
    const data = snap.data() as { uid?: string };
    if (!data.uid || data.uid === currentUid) {
      return { available: true, normalizedId };
    }
    // Check if the owner profile actually exists (reclaim orphaned nickname reservations)
    try {
      const ownerSnap = await Promise.race([
        getDoc(doc(db, 'users', data.uid)),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1800)),
      ]);
      if (ownerSnap && !ownerSnap.exists()) {
        return { available: true, normalizedId };
      }
      // If currentUserEmail is provided, check if the reservation belongs to the same person's original UID
      if (currentUserEmail) {
        const privSnap = await Promise.race([
          getDoc(doc(db, 'users_private', data.uid)),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
        ]);
        if (privSnap && privSnap.exists()) {
          const privData = privSnap.data() as { email?: string };
          if (
            privData.email &&
            normalizeEmailForComparison(privData.email) ===
              normalizeEmailForComparison(currentUserEmail)
          ) {
            return { available: true, normalizedId };
          }
        }
      }
    } catch {
      // Ignore owner lookup error
    }
    return {
      available: false,
      normalizedId,
      reason: `Nickname @${cleaned} is already used by another user.`,
    };
  } catch {
    return { available: true, normalizedId };
  }
}

function getTimestampMillis(ts: unknown): number {
  if (!ts || typeof ts !== 'object') return 0;
  const t = ts as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
}

const REAL_USERS_BY_UID = new Map<string, UserPublicProfile>();
const REAL_UID_BY_EMAIL = new Map<string, string>([
  ['xandercamarin@gmail.com', '538a6246-5cc8-4c63-bbda-0507196f3d5d'],
  ['camarin.xn839@s.msumain.edu.ph', '4ae58a7b-5104-4479-8667-ed9e465ba447'],
  ['delacernaahrene122008@gmail.com', 'e61d24c6-ffc2-463c-bff9-2cd74b1edb5c'],
  ['delecernaahrene122008@gmail.com', 'e61d24c6-ffc2-463c-bff9-2cd74b1edb5c'],
]);

const LEGACY_DUPLICATE_UID_MAP: Record<string, string> = {
  ibKOXniSPNYErJvZTJuyu3RBIqL2: '538a6246-5cc8-4c63-bbda-0507196f3d5d',
  usr_xandercamarin_gmail_com: '538a6246-5cc8-4c63-bbda-0507196f3d5d',
  usr_camarin_xn839_s_msumain_edu_ph: '4ae58a7b-5104-4479-8667-ed9e465ba447',
  usr_delacernaahrene122008_gmail_com: 'e61d24c6-ffc2-463c-bff9-2cd74b1edb5c',
};

try {
  const snap = realUsersSnapshotRaw as unknown as {
    users?: Array<UserPublicProfile & { createdAtMs?: number; updatedAtMs?: number }>;
    emails?: Record<string, string>;
  };
  if (snap?.emails) {
    Object.entries(snap.emails).forEach(([uid, email]) => {
      if (email && !LEGACY_DUPLICATE_UID_MAP[uid]) {
        const clean = email.trim().toLowerCase();
        if (!REAL_UID_BY_EMAIL.has(clean)) {
          REAL_UID_BY_EMAIL.set(clean, uid);
        }
      }
    });
  }
  if (Array.isArray(snap?.users)) {
    snap.users.forEach((u) => {
      if (u?.uid && !LEGACY_DUPLICATE_UID_MAP[u.uid]) {
        REAL_USERS_BY_UID.set(u.uid, u);
      }
    });
  }
} catch {
  // ignore snapshot init
}

function isSyntheticOrSupabaseUid(uid: string): boolean {
  if (!uid) return true;
  if (LEGACY_DUPLICATE_UID_MAP[uid]) return true;
  return uid.startsWith('usr_') || uid.startsWith('verified_');
}

function extractProfileUpdatedMs(p?: Partial<UserPublicProfile> | null): number {
  if (!p) return 0;
  const anyP = p as { updatedAtMs?: number; updatedAt?: unknown };
  if (typeof anyP.updatedAtMs === 'number' && anyP.updatedAtMs > 0) {
    return anyP.updatedAtMs;
  }
  return getTimestampMillis(anyP.updatedAt);
}

/**
 * Retrieves a user's cached UserPublicProfile from localStorage or real Supabase Auth snapshot,
 * always preferring the newest synced profile across Desktop & Mobile.
 */
export function getCachedOrFallbackUserProfile(
  uid: string,
  email?: string | null,
  displayName?: string | null,
  photoURL?: string | null
): UserPublicProfile | null {
  const cleanEmail = (email || '').trim().toLowerCase();
  const mappedUid = LEGACY_DUPLICATE_UID_MAP[uid] || uid;
  let realUidFromEmail = cleanEmail ? REAL_UID_BY_EMAIL.get(cleanEmail) : undefined;

  try {
    if (typeof window !== 'undefined' && cleanEmail && !realUidFromEmail) {
      const dbPrivRaw = window.localStorage.getItem('one_msu_db_v3_users_private');
      if (dbPrivRaw) {
        const privMap = JSON.parse(dbPrivRaw) as Record<string, string>;
        for (const [candidateUid, candidateEmail] of Object.entries(privMap)) {
          if (
            candidateEmail?.trim().toLowerCase() === cleanEmail &&
            !isSyntheticOrSupabaseUid(candidateUid)
          ) {
            realUidFromEmail = candidateUid;
            REAL_UID_BY_EMAIL.set(cleanEmail, candidateUid);
            break;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  const effectiveUid =
    realUidFromEmail ||
    (mappedUid && !mappedUid.startsWith('usr_') && !mappedUid.startsWith('verified_')
      ? mappedUid
      : mappedUid);

  const isCamarin =
    effectiveUid === '4ae58a7b-5104-4479-8667-ed9e465ba447' ||
    cleanEmail === 'camarin.xn839@s.msumain.edu.ph';
  const isXanderDev =
    effectiveUid === '538a6246-5cc8-4c63-bbda-0507196f3d5d' ||
    cleanEmail === 'xandercamarin@gmail.com';

  let directProfile: UserPublicProfile | null = null;
  let dbMatchedProfile: UserPublicProfile | null = null;

  try {
    if (typeof window !== 'undefined') {
      if (effectiveUid && !effectiveUid.startsWith('usr_')) {
        const directRaw = window.localStorage.getItem(`one_msu_profile_${effectiveUid}`);
        if (directRaw) {
          const parsed = JSON.parse(directRaw) as UserPublicProfile;
          if (parsed && parsed.nickname && !parsed.uid?.startsWith('usr_')) {
            const ownerUid = cleanEmail ? REAL_UID_BY_EMAIL.get(cleanEmail) : undefined;
            if (!cleanEmail || !ownerUid || ownerUid === effectiveUid) {
              directProfile = {
                ...parsed,
                uid: effectiveUid,
                badge: resolveUserBadge(parsed.badge, cleanEmail),
                role: isCamarin
                  ? 'student'
                  : isXanderDev
                  ? 'developer'
                  : parsed.role || 'student',
                isVerifiedStudent: true,
              };
            }
          }
        }
      }

      const dbUsersRaw = window.localStorage.getItem('one_msu_db_v3_users');
      const dbPrivRaw = window.localStorage.getItem('one_msu_db_v3_users_private');
      const privMap: Record<string, string> = dbPrivRaw ? JSON.parse(dbPrivRaw) : {};

      if (dbUsersRaw) {
        try {
          const dbUsers = JSON.parse(dbUsersRaw) as UserPublicProfile[];
          if (Array.isArray(dbUsers)) {
            const matched = dbUsers.find((u) => {
              if (!u?.uid || isSyntheticOrSupabaseUid(u.uid)) return false;
              if (u.uid === effectiveUid) return true;
              if (cleanEmail && privMap[u.uid]?.trim().toLowerCase() === cleanEmail) {
                return true;
              }
              return false;
            });
            if (matched && matched.nickname) {
              dbMatchedProfile = {
                ...matched,
                uid: matched.uid,
                photoURL: matched.photoURL || photoURL || '',
                badge: resolveUserBadge(matched.badge, cleanEmail),
                role: isCamarin
                  ? 'student'
                  : isXanderDev
                  ? 'developer'
                  : matched.role || 'student',
                isVerifiedStudent: true,
              };
            }
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore storage read error
  }

  if (directProfile || dbMatchedProfile) {
    const directTime = extractProfileUpdatedMs(directProfile);
    const dbTime = extractProfileUpdatedMs(dbMatchedProfile);
    const winner =
      dbMatchedProfile && (!directProfile || dbTime >= directTime)
        ? { ...directProfile, ...dbMatchedProfile }
        : { ...dbMatchedProfile, ...directProfile! };
    if (isCamarin && (!winner.nickname || winner.nickname === 'student')) {
      winner.nickname = 'camarin.xn839';
    }
    if (isXanderDev && (!winner.nickname || winner.nickname === 'student')) {
      winner.nickname = 'xander';
    }
    return winner;
  }

  const snapMatch =
    (realUidFromEmail ? REAL_USERS_BY_UID.get(realUidFromEmail) : undefined) ||
    REAL_USERS_BY_UID.get(effectiveUid);
  if (snapMatch) {
    return {
      ...snapMatch,
      uid: snapMatch.uid,
      nickname:
        isCamarin && (!snapMatch.nickname || snapMatch.nickname === 'student')
          ? 'camarin.xn839'
          : snapMatch.nickname,
      photoURL: snapMatch.photoURL || photoURL || '',
      badge: resolveUserBadge(snapMatch.badge, cleanEmail),
      role: isCamarin ? 'student' : isXanderDev ? 'developer' : snapMatch.role || 'student',
      isVerifiedStudent: true,
    };
  }

  if (!cleanEmail || !isInstitutionalEduEmail(cleanEmail)) {
    return null;
  }

  const badge = resolveUserBadge(undefined, cleanEmail);
  const defaultNickname = isDeveloperEmail(cleanEmail)
    ? 'xander'
    : isCamarin
    ? 'camarin.xn839'
    : isTulipsEmail(cleanEmail)
    ? 'ahrene'
    : sanitizeNicknameInput(
        (displayName &&
        displayName.toLowerCase() !== 'msu student' &&
        displayName.toLowerCase() !== 'google user'
          ? displayName
          : cleanEmail.split('@')[0]) || 'msu_student'
      ) || 'msu_student';

  return {
    uid: effectiveUid,
    nickname: defaultNickname.slice(0, 32),
    nicknameUpdatedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
    googleDisplayName: (displayName || defaultNickname).slice(0, 100),
    photoURL: photoURL || '',
    emailDomain: extractEmailDomain(cleanEmail),
    campus: 'MSU Main Campus - Marawi',
    bio: '',
    defaultAnonymous: false,
    badge,
    role: badge === 'developer' ? 'developer' : 'student',
    accountStatus: 'active',
    isVerifiedStudent: true,
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Resolves a signed-in user (from Supabase OAuth, Firebase Auth, or Verified Email)
 * back to their single canonical UUID so Desktop and Mobile always share 1 unified account.
 */
export async function resolveOriginalUserUid(candidate: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<{
  uid: string;
  email: string | null;
  displayName: string;
  photoURL: string | null;
}> {
  const cleanEmail = (candidate.email || '').trim().toLowerCase();
  const cleanName = (candidate.displayName || '').trim();
  const mappedCandidateUid = LEGACY_DUPLICATE_UID_MAP[candidate.uid] || candidate.uid;

  // 1. Check real Supabase Auth directory by email first so Firebase Auth & Supabase OAuth unify to the same canonical UID
  const realUidByEmail = cleanEmail ? REAL_UID_BY_EMAIL.get(cleanEmail) : undefined;
  const targetUid =
    realUidByEmail ||
    (mappedCandidateUid && !isSyntheticOrSupabaseUid(mappedCandidateUid)
      ? mappedCandidateUid
      : mappedCandidateUid);

  const cachedProfile = getCachedOrFallbackUserProfile(
    targetUid,
    cleanEmail,
    cleanName,
    candidate.photoURL
  );

  if (cachedProfile && cachedProfile.uid && !cachedProfile.uid.startsWith('usr_')) {
    return {
      uid: cachedProfile.uid,
      email: cleanEmail || null,
      displayName:
        cachedProfile.googleDisplayName ||
        (cleanName && cleanName.toLowerCase() !== 'msu student' ? cleanName : '') ||
        cachedProfile.nickname ||
        'MSU Student',
      photoURL: cachedProfile.photoURL || candidate.photoURL || null,
    };
  }

  // 2. Fallback to candidate with canonical targetUid
  return {
    uid: targetUid,
    email: cleanEmail || null,
    displayName: cleanName || 'MSU Student',
    photoURL: candidate.photoURL || null,
  };
}

let isRepairingOriginalUsers = false;

/**
 * Scans Firestore collections (/users, /users_private, /presence, /nicknames, /posts, /chats, /suggestions)
 * to restore any missing original user profiles, deduplicate split accounts back to their original UID,
 * and ensure every original user has valid /presence and /nicknames records.
 */
export async function repairAndRestoreOriginalUsers(): Promise<{
  restoredCount: number;
  repairedCount: number;
  dedupedCount: number;
}> {
  if (isRepairingOriginalUsers || !canUseFirestore()) {
    return { restoredCount: 0, repairedCount: 0, dedupedCount: 0 };
  }
  isRepairingOriginalUsers = true;
  let restoredCount = 0;
  let repairedCount = 0;
  let dedupedCount = 0;

  try {
    const [
      usersSnap,
      privSnap,
      presenceSnap,
      nicknamesSnap,
      postsSnap,
      chatsSnap,
      suggestionsSnap,
    ] = await Promise.all([
      getDocs(collection(db, 'users')).catch(() => null),
      getDocs(collection(db, 'users_private')).catch(() => null),
      getDocs(collection(db, 'presence')).catch(() => null),
      getDocs(collection(db, 'nicknames')).catch(() => null),
      getDocs(collection(db, 'posts')).catch(() => null),
      getDocs(collection(db, 'chats')).catch(() => null),
      getDocs(collection(db, 'suggestions')).catch(() => null),
    ]);

    const usersMap = new Map<string, UserPublicProfile>();
    if (usersSnap) {
      usersSnap.docs.forEach((d) => {
        usersMap.set(d.id, { ...(d.data() as UserPublicProfile), uid: d.id });
      });
    }

    const privMap = new Map<string, UserPrivateInfo>();
    if (privSnap) {
      privSnap.docs.forEach((d) => {
        privMap.set(d.id, { ...(d.data() as UserPrivateInfo), uid: d.id });
      });
    }

    const presenceMap = new Map<string, UserPresence>();
    if (presenceSnap) {
      presenceSnap.docs.forEach((d) => {
        presenceMap.set(d.id, { ...(d.data() as UserPresence), uid: d.id });
      });
    }

    const nicknamesByUid = new Map<string, string>();
    const nicknamesDocs = new Map<string, { uid: string; nickname: string }>();
    if (nicknamesSnap) {
      nicknamesSnap.docs.forEach((d) => {
        const data = d.data() as { uid?: string; nickname?: string };
        if (data?.uid && data?.nickname) {
          nicknamesByUid.set(data.uid, data.nickname);
          nicknamesDocs.set(d.id, { uid: data.uid, nickname: data.nickname });
        }
      });
    }

    const postsList: Post[] = postsSnap
      ? postsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Post, 'id'>) }))
      : [];
    const chatsList: ChatThread[] = chatsSnap
      ? chatsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ChatThread, 'id'>) }))
      : [];
    const suggestionsList: Suggestion[] = suggestionsSnap
      ? suggestionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Suggestion, 'id'>) }))
      : [];

    const postCountByUid = new Map<string, number>();
    postsList.forEach((p) => {
      if (p.authorId) {
        postCountByUid.set(p.authorId, (postCountByUid.get(p.authorId) || 0) + 1);
      }
    });

    // Collect clues for any original user whose /users/{uid} doc might be missing
    interface UserClue {
      uid: string;
      nickname?: string;
      displayName?: string;
      photoURL?: string;
      email?: string;
      emailDomain?: string;
      campus?: string;
      badge?: UserBadge;
    }
    const cluesMap = new Map<string, UserClue>();

    const ensureClue = (uid: string): UserClue | null => {
      if (!uid || uid === ONE_OFFICIAL_UID || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)) {
        return null;
      }
      let c = cluesMap.get(uid);
      if (!c) {
        c = { uid };
        cluesMap.set(uid, c);
      }
      return c;
    };

    privMap.forEach((priv, uid) => {
      const c = ensureClue(uid);
      if (c && priv.email) {
        c.email = priv.email;
        c.emailDomain = extractEmailDomain(priv.email);
        c.badge = resolveUserBadge(c.badge, priv.email);
      }
    });

    nicknamesByUid.forEach((nick, uid) => {
      const c = ensureClue(uid);
      if (c && nick && !isOneOfficialAccount(nick)) {
        c.nickname = nick;
      }
    });

    presenceMap.forEach((pres, uid) => {
      const c = ensureClue(uid);
      if (c) {
        if (pres.nickname && !isOneOfficialAccount(pres.nickname)) {
          c.nickname = c.nickname || pres.nickname;
        }
        if (pres.photoURL) c.photoURL = c.photoURL || pres.photoURL;
        if (pres.campus) c.campus = c.campus || pres.campus;
        if (pres.badge) c.badge = resolveUserBadge(pres.badge, c.email);
      }
    });

    postsList.forEach((p) => {
      const c = ensureClue(p.authorId);
      if (c) {
        if (
          !p.isAnonymous &&
          p.authorNickname &&
          p.authorNickname !== 'Anonymous Student' &&
          !isOneOfficialAccount(p.authorNickname)
        ) {
          c.nickname = c.nickname || p.authorNickname;
          c.displayName = c.displayName || p.authorDisplayName || p.authorNickname;
        }
        if (!p.isAnonymous && p.authorPhotoURL) {
          c.photoURL = c.photoURL || p.authorPhotoURL;
        }
        if (p.authorDomain) {
          c.emailDomain = c.emailDomain || p.authorDomain;
        }
        if (!p.isAnonymous && p.authorBadge) {
          c.badge = resolveUserBadge(p.authorBadge, c.email);
        }
      }
    });

    chatsList.forEach((chat) => {
      if (chat.userAId && chat.userAId !== ONE_OFFICIAL_UID) {
        const cA = ensureClue(chat.userAId);
        if (cA) {
          if (chat.userANickname && !isOneOfficialAccount(chat.userANickname)) {
            cA.nickname = cA.nickname || chat.userANickname;
          }
          if (chat.userAPhotoURL) cA.photoURL = cA.photoURL || chat.userAPhotoURL;
          if (chat.userABadge) cA.badge = resolveUserBadge(chat.userABadge, cA.email);
        }
      }
      if (chat.userBId && chat.userBId !== ONE_OFFICIAL_UID) {
        const cB = ensureClue(chat.userBId);
        if (cB) {
          if (chat.userBNickname && !isOneOfficialAccount(chat.userBNickname)) {
            cB.nickname = cB.nickname || chat.userBNickname;
          }
          if (chat.userBPhotoURL) cB.photoURL = cB.photoURL || chat.userBPhotoURL;
          if (chat.userBBadge) cB.badge = resolveUserBadge(chat.userBBadge, cB.email);
        }
      }
    });

    suggestionsList.forEach((s) => {
      const c = ensureClue(s.authorId);
      if (c) {
        if (!s.isAnonymous && s.authorNickname && s.authorNickname !== 'Anonymous Student') {
          c.nickname = c.nickname || s.authorNickname;
        }
        if (!s.isAnonymous && s.authorPhotoURL) {
          c.photoURL = c.photoURL || s.authorPhotoURL;
        }
        if (!s.isAnonymous && s.authorBadge) {
          c.badge = resolveUserBadge(s.authorBadge, c.email);
        }
      }
    });

    // Step 1: Restore any missing /users/{uid} documents for original users
    for (const [uid, clue] of cluesMap.entries()) {
      if (usersMap.has(uid)) continue;

      // Check if this uid is just a synthetic/duplicate UID for an already existing user with the same email
      if (clue.email && isSyntheticOrSupabaseUid(uid)) {
        const normClueEmail = normalizeEmailForComparison(clue.email);
        let alreadyHasOriginal = false;
        usersMap.forEach((existingU, existingUid) => {
          const existingPriv = privMap.get(existingUid);
          if (
            existingPriv?.email &&
            normalizeEmailForComparison(existingPriv.email) === normClueEmail
          ) {
            alreadyHasOriginal = true;
          }
        });
        if (alreadyHasOriginal && (postCountByUid.get(uid) || 0) === 0) {
          continue;
        }
      }

      const derivedNickRaw =
        clue.nickname ||
        (clue.email ? clue.email.split('@')[0] : '') ||
        `msuan_${uid.slice(0, 6)}`;
      const cleanNick = sanitizeNicknameInput(derivedNickRaw);
      if (!cleanNick || cleanNick.length < 2) continue;

      const badge = resolveUserBadge(clue.badge, clue.email);
      const emailDomain = clue.emailDomain || extractEmailDomain(clue.email);
      const displayName = (clue.displayName || cleanNick).slice(0, 100);
      const photoURL = (clue.photoURL || '').slice(0, 350000);
      const campus = (clue.campus || 'MSU Main Campus - Marawi').slice(0, 80);
      const nowIso = new Date(Date.now() - 15 * 86400000).toISOString();

      try {
        await setDoc(doc(db, 'users', uid), {
          uid,
          nickname: cleanNick.slice(0, 32),
          nicknameUpdatedAt: nowIso,
          googleDisplayName: displayName,
          photoURL,
          emailDomain: emailDomain.slice(0, 64),
          campus,
          bio: '',
          defaultAnonymous: false,
          badge,
          role: badge === 'developer' ? 'developer' : badge === 'moderator' ? 'moderator' : 'student',
          accountStatus: 'active',
          isVerifiedStudent: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        const restoredProfile: UserPublicProfile = {
          uid,
          nickname: cleanNick.slice(0, 32),
          nicknameUpdatedAt: nowIso,
          googleDisplayName: displayName,
          photoURL,
          emailDomain: emailDomain.slice(0, 64),
          campus,
          bio: '',
          defaultAnonymous: false,
          badge,
          role: badge === 'developer' ? 'developer' : badge === 'moderator' ? 'moderator' : 'student',
          accountStatus: 'active',
          isVerifiedStudent: true,
          createdAt: null,
          updatedAt: null,
        };
        usersMap.set(uid, restoredProfile);
        restoredCount++;
      } catch {
        // Ignore individual write error
      }
    }

    // Step 2: Deduplicate duplicate user profiles created for the same email or same normalized nickname
    const emailGroups = new Map<string, UserPublicProfile[]>();
    usersMap.forEach((u) => {
      const priv = privMap.get(u.uid);
      let groupKey = priv?.email ? normalizeEmailForComparison(priv.email) : '';
      if (!groupKey && u.badge === 'tulips') {
        groupKey = normalizeEmailForComparison(TULIPS_USER_EMAIL);
      }
      if (groupKey) {
        const list = emailGroups.get(groupKey) || [];
        list.push(u);
        emailGroups.set(groupKey, list);
      }
    });

    const removedDuplicateUids = new Set<string>();

    for (const [, group] of emailGroups.entries()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => {
        const postsA = postCountByUid.get(a.uid) || 0;
        const postsB = postCountByUid.get(b.uid) || 0;
        if (postsA !== postsB) return postsB - postsA;
        const synthA = isSyntheticOrSupabaseUid(a.uid);
        const synthB = isSyntheticOrSupabaseUid(b.uid);
        if (synthA !== synthB) return synthA ? 1 : -1;
        const timeA = getTimestampMillis(a.createdAt) || Number.MAX_SAFE_INTEGER;
        const timeB = getTimestampMillis(b.createdAt) || Number.MAX_SAFE_INTEGER;
        return timeA - timeB;
      });

      const primary = group[0];
      for (let i = 1; i < group.length; i++) {
        const dup = group[i];
        // Only remove duplicate if it's a synthetic/Supabase duplicate or has 0 posts
        if (isSyntheticOrSupabaseUid(dup.uid) || (postCountByUid.get(dup.uid) || 0) === 0) {
          // Reassign any posts from dup.uid to primary.uid
          for (const p of postsList) {
            if (p.authorId === dup.uid) {
              try {
                await updateDoc(doc(db, 'posts', p.id), {
                  authorId: primary.uid,
                  authorNickname: p.isAnonymous ? 'Anonymous Student' : primary.nickname,
                  authorDisplayName: p.isAnonymous ? 'Anonymous Student' : primary.nickname,
                  authorPhotoURL: p.isAnonymous ? '' : primary.photoURL || '',
                  authorBadge: p.isAnonymous ? 'verified' : primary.badge || 'verified',
                  updatedAt: serverTimestamp(),
                });
              } catch {
                // ignore
              }
            }
          }
          try {
            await deleteDoc(doc(db, 'users', dup.uid));
            await deleteDoc(doc(db, 'presence', dup.uid)).catch(() => {});
            usersMap.delete(dup.uid);
            presenceMap.delete(dup.uid);
            removedDuplicateUids.add(dup.uid);
            dedupedCount++;
          } catch {
            // ignore
          }
        }
      }
    }

    // Step 3: Ensure every original user in /users has a valid badge, verified status, /nicknames entry, and valid /presence record
    for (const [uid, u] of usersMap.entries()) {
      if (removedDuplicateUids.has(uid) || uid === ONE_OFFICIAL_UID) continue;
      const priv = privMap.get(uid);
      const email = priv?.email || null;
      const expectedBadge = resolveUserBadge(u.badge, email);
      const cleanNick = sanitizeNicknameInput(u.nickname || '') || `msuan_${uid.slice(0, 6)}`;
      const normNick = normalizeNicknameId(cleanNick);

      // Repair user profile if badge or verified flag needs fixing
      if (
        u.badge !== expectedBadge ||
        u.isVerifiedStudent === false ||
        !u.nickname ||
        u.nickname.length < 2
      ) {
        try {
          await updateDoc(doc(db, 'users', uid), {
            nickname: cleanNick.slice(0, 32),
            badge: expectedBadge,
            isVerifiedStudent: true,
            updatedAt: serverTimestamp(),
          });
          u.nickname = cleanNick.slice(0, 32);
          u.badge = expectedBadge;
          u.isVerifiedStudent = true;
          repairedCount++;
        } catch {
          // ignore
        }
      }

      // Ensure nickname reservation in /nicknames/{normNick} points to this user
      if (normNick.length >= 2) {
        const existingNickDoc = nicknamesDocs.get(normNick);
        if (
          !existingNickDoc ||
          existingNickDoc.uid !== uid ||
          removedDuplicateUids.has(existingNickDoc.uid)
        ) {
          // Only overwrite if unclaimed or claimed by a deleted/missing/duplicate UID
          if (
            !existingNickDoc ||
            !usersMap.has(existingNickDoc.uid) ||
            existingNickDoc.uid === uid
          ) {
            try {
              await setDoc(doc(db, 'nicknames', normNick), {
                uid,
                nickname: u.nickname.slice(0, 32),
                normalizedNickname: normNick,
                updatedAt: serverTimestamp(),
              });
            } catch {
              // ignore
            }
          }
        }
      }

      // Ensure valid /presence/{uid} doc exists so the original user appears in Campus Directory & Online/Offline lists
      const existingPres = presenceMap.get(uid);
      const presNeedsRepair =
        !existingPres ||
        existingPres.visibility !== 'edu_verified' ||
        typeof existingPres.isOnline !== 'boolean' ||
        typeof existingPres.lastSeenMs !== 'number' ||
        existingPres.nickname !== u.nickname ||
        existingPres.badge !== expectedBadge;

      if (presNeedsRepair) {
        try {
          await setDoc(doc(db, 'presence', uid), {
            uid,
            nickname: u.nickname.slice(0, 32),
            photoURL: (u.photoURL || existingPres?.photoURL || '').slice(0, 350000),
            badge: expectedBadge,
            campus: (u.campus || existingPres?.campus || 'MSU Main Campus - Marawi').slice(0, 80),
            isOnline: existingPres ? isUserCurrentlyOnline(existingPres) : false,
            lastSeenMs:
              typeof existingPres?.lastSeenMs === 'number' && existingPres.lastSeenMs > 0
                ? existingPres.lastSeenMs
                : getTimestampMillis(u.updatedAt) || getTimestampMillis(u.createdAt) || Date.now() - 3600000,
            visibility: 'edu_verified',
            updatedAt: serverTimestamp(),
          });
          repairedCount++;
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // Ignore top-level sync error
  } finally {
    isRepairingOriginalUsers = false;
  }

  return { restoredCount, repairedCount, dedupedCount };
}

/**
 * Deterministic 1-on-1 chat ID between two user UIDs.
 */
export function buildChatId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

/**
 * Determines whether a user's presence record indicates they are actively online right now.
 * Active heartbeat window: 2 minutes (120,000 ms).
 */
export function isUserCurrentlyOnline(
  presence?: { isOnline?: boolean; lastSeenMs?: number } | null
): boolean {
  if (!presence || !presence.isOnline) return false;
  if (typeof presence.lastSeenMs !== 'number') return false;
  return Date.now() - presence.lastSeenMs < 120000;
}

export const NICKNAME_COOLDOWN_DAYS = 14; // 2 weeks = 14 days
export const NICKNAME_COOLDOWN_MS = NICKNAME_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

export interface NicknameCooldownStatus {
  canChange: boolean;
  daysRemaining: number;
  hoursRemaining: number;
  lastUpdatedDate: Date;
  nextAllowedDate: Date;
  progressPercent: number;
}

/**
 * Calculates the 2-week (14-day) nickname change eligibility window.
 */
export function getNicknameCooldownInfo(nicknameUpdatedAtIso: string | undefined): NicknameCooldownStatus {
  if (!nicknameUpdatedAtIso) {
    const now = new Date();
    return {
      canChange: true,
      daysRemaining: 0,
      hoursRemaining: 0,
      lastUpdatedDate: now,
      nextAllowedDate: now,
      progressPercent: 100,
    };
  }

  const lastUpdated = new Date(nicknameUpdatedAtIso);
  if (Number.isNaN(lastUpdated.getTime())) {
    const now = new Date();
    return {
      canChange: true,
      daysRemaining: 0,
      hoursRemaining: 0,
      lastUpdatedDate: now,
      nextAllowedDate: now,
      progressPercent: 100,
    };
  }

  const nextAllowed = new Date(lastUpdated.getTime() + NICKNAME_COOLDOWN_MS);
  const now = new Date();
  const diffMs = nextAllowed.getTime() - now.getTime();

  if (diffMs <= 0) {
    return {
      canChange: true,
      daysRemaining: 0,
      hoursRemaining: 0,
      lastUpdatedDate: lastUpdated,
      nextAllowedDate: nextAllowed,
      progressPercent: 100,
    };
  }

  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.ceil(diffMs / (1000 * 60 * 60));
  const elapsedMs = Math.max(0, now.getTime() - lastUpdated.getTime());
  const progressPercent = Math.min(100, Math.round((elapsedMs / NICKNAME_COOLDOWN_MS) * 100));

  return {
    canChange: false,
    daysRemaining,
    hoursRemaining,
    lastUpdatedDate: lastUpdated,
    nextAllowedDate: nextAllowed,
    progressPercent,
  };
}
