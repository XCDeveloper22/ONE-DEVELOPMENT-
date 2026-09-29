import React, { useEffect, useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  deleteUser,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocsFromCache,
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
  Search,
  Plus,
  Settings,
  Compass,
  FolderOpen,
  LogOut,
  EyeOff,
  Eye,
  Clock,
  Download,
  X,
  Bell,
  MessageCircle,
  BookOpen,
  Lightbulb,
  Info,
  FileText,
  Inbox,
  Code2,
  ShieldAlert,
  Megaphone,
  AlertTriangle,
  Wrench,
  TrendingUp,
  ShoppingBag,
  LifeBuoy,
  ArrowLeft,
} from 'lucide-react';
import {
  auth,
  buildChatId,
  canUseFirestore,
  checkNicknameAvailability,
  db,
  extractEmailDomain,
  formatPeerDisplayName,
  getAuthenticatedUserEmail,
  getCachedOrFallbackUserProfile,
  getNicknameCooldownInfo,
  googleProvider,
  handleFirestoreError,
  isDeveloperEmail,
  isFirestoreQuotaExceeded,
  isInstitutionalEduEmail,
  isOneOfficialAccount,
  isTulipsEmail,
  isUserCurrentlyOnline,
  normalizeNicknameId,
  ONE_LOGO_DATA_URL,
  ONE_OFFICIAL_BADGE,
  ONE_OFFICIAL_NAME,
  ONE_OFFICIAL_UID,
  OperationType,
  resolveOriginalUserUid,
  resolvePeerAvatar,
  resolveUserBadge,
  sanitizeNicknameInput,
  VERIFIED_EMAIL_SESSION_KEY,
} from './firebase';
import {
  ActiveNavTab,
  ChatMessage,
  ChatPeerTarget,
  ChatThread,
  DEFAULT_PLATFORM_SETTINGS,
  MarketplaceListing,
  MarketplaceStatus,
  NotificationItem,
  PlatformSettings,
  POST_CATEGORIES,
  Post,
  PostCategory,
  UserBadge,
  UserPresence,
  UserPrivateInfo,
  UserPublicProfile,
} from './types';
import {
  formatFileSize,
  getAttachmentMeta,
  ProcessedAttachment,
  triggerAttachmentDownload,
} from './utils/fileHelpers';
import { AuthGate } from './components/AuthGate';
import { NicknameOnboardingModal } from './components/NicknameOnboardingModal';
import { PostComposer } from './components/PostComposer';
import { PostCard } from './components/PostCard';
import { SettingsView } from './components/SettingsView';
import { UserBadgeTag } from './components/UserBadgeTag';
import { OnlineUsersPanel } from './components/OnlineUsersPanel';
import { NotificationsPanel } from './components/NotificationsPanel';
import { ChatDashboard } from './components/ChatDashboard';
import { DesktopMessengerPopup } from './components/DesktopMessengerPopup';
import { AboutView } from './components/AboutView';
import { TermsView } from './components/TermsView';
import { SuggestionBoxView } from './components/SuggestionBoxView';
import { DeveloperAdminDashboard } from './components/DeveloperAdminDashboard';
import { MarketplaceView } from './components/MarketplaceView';
import { InDevelopmentView } from './components/InDevelopmentView';
import { supabase, signInWithGoogle, signOutWithSupabase } from './supabaseClient';
import { playChatNotificationSound } from './utils/soundEffects';
import {
  broadcastAdminPostToAllUsers,
  DB_UPDATE_EVENT,
  deleteLocalMarketplaceListing,
  deleteLocalNotification,
  deleteLocalPost,
  deleteLocalUser,
  ensureLocalDatabaseInitialized,
  getDeletedPostIds,
  getLocalChatThreadsForUser,
  getLocalMarketplaceListings,
  getLocalNotificationsForUser,
  getLocalPlatformSettings,
  getLocalPosts,
  getLocalPresence,
  getLocalReactions,
  getLocalUsers,
  markAllLocalNotificationsRead,
  markLocalChatThreadRead,
  markLocalNotificationRead,
  restoreFullDatabase,
  saveLocalPlatformSettings,
  saveLocalPosts,
  saveLocalUsers,
  syncDeletedPostIdsFromRemote,
  syncUserProfileToPastContent,
  toggleLocalReaction,
  updateLocalMarketplaceListingFields,
  updateLocalPostFields,
  upsertLocalChatMessage,
  upsertLocalChatThread,
  upsertLocalMarketplaceListing,
  upsertLocalNotification,
  upsertLocalPost,
  upsertLocalPresence,
  upsertLocalUser,
} from './utils/databaseRestore';
import studentAvatarFallback from './assets/images/student_avatar_1_1790401794136.jpg';

const APP_REFERRAL_OPTIONS = [
  'Facebook / MSU Campus Page',
  'Friend / Classmate / Blockmate',
  'TikTok / Instagram / Social Media',
  'Campus Org / Student Council',
  'Google Search / Direct Link',
  'Other',
] as const;

type SettingsSectionTab = 'account' | 'support' | 'about' | 'terms' | 'rules';

const ACTIVE_TAB_STORAGE_KEY = 'one_msu_active_tab_route';
const SETTINGS_SECTION_STORAGE_KEY = 'one_msu_settings_section_route';

function parseRouteFromPath(rawPath: string): {
  matched: boolean;
  activeTab: ActiveNavTab;
  settingsSection: SettingsSectionTab;
} {
  const cleaned =
    (rawPath || '/')
      .toLowerCase()
      .replace(/\/index\.html$/i, '')
      .replace(/\.html$/i, '')
      .replace(/\/+$/, '') || '/';

  if (cleaned === '/marketplace' || cleaned.startsWith('/marketplace/')) {
    return { matched: true, activeTab: 'marketplace', settingsSection: 'account' };
  }
  if (
    cleaned === '/chats' ||
    cleaned === '/messages' ||
    cleaned === '/inbox' ||
    cleaned.startsWith('/messages/') ||
    cleaned.startsWith('/chats/') ||
    cleaned.startsWith('/inbox/')
  ) {
    return { matched: true, activeTab: 'chats', settingsSection: 'account' };
  }
  if (cleaned === '/notifications' || cleaned.startsWith('/notifications/')) {
    return { matched: true, activeTab: 'notifications', settingsSection: 'account' };
  }
  if (cleaned === '/files' || cleaned.startsWith('/files/')) {
    return { matched: true, activeTab: 'files', settingsSection: 'account' };
  }
  if (
    cleaned === '/my-posts' ||
    cleaned === '/my_posts' ||
    cleaned.startsWith('/my-posts/') ||
    cleaned.startsWith('/my_posts/')
  ) {
    return { matched: true, activeTab: 'my_posts', settingsSection: 'account' };
  }
  if (cleaned === '/guidelines' || cleaned === '/rules') {
    return { matched: true, activeTab: 'guidelines', settingsSection: 'account' };
  }
  if (cleaned === '/suggestions' || cleaned.startsWith('/suggestions/')) {
    return { matched: true, activeTab: 'suggestions', settingsSection: 'account' };
  }
  if (cleaned === '/about') {
    return { matched: true, activeTab: 'about', settingsSection: 'account' };
  }
  if (cleaned === '/terms') {
    return { matched: true, activeTab: 'terms', settingsSection: 'account' };
  }
  if (cleaned === '/admin' || cleaned.startsWith('/admin/')) {
    return { matched: true, activeTab: 'admin', settingsSection: 'account' };
  }
  if (
    cleaned === '/settings/support' ||
    cleaned === '/support' ||
    cleaned.startsWith('/support/')
  ) {
    return { matched: true, activeTab: 'settings', settingsSection: 'support' };
  }
  if (cleaned === '/settings/about') {
    return { matched: true, activeTab: 'settings', settingsSection: 'about' };
  }
  if (cleaned === '/settings/terms') {
    return { matched: true, activeTab: 'settings', settingsSection: 'terms' };
  }
  if (cleaned === '/settings/rules') {
    return { matched: true, activeTab: 'settings', settingsSection: 'rules' };
  }
  if (cleaned === '/settings' || cleaned.startsWith('/settings/')) {
    return { matched: true, activeTab: 'settings', settingsSection: 'account' };
  }
  if (cleaned === '/feed') {
    return { matched: true, activeTab: 'feed', settingsSection: 'account' };
  }
  return { matched: false, activeTab: 'feed', settingsSection: 'account' };
}

function getTargetPathForRoute(
  activeTab: ActiveNavTab,
  settingsSection: SettingsSectionTab
): string {
  if (activeTab === 'feed') return '/';
  if (activeTab === 'marketplace') return '/marketplace';
  if (activeTab === 'chats') return '/messages';
  if (activeTab === 'notifications') return '/notifications';
  if (activeTab === 'files') return '/files';
  if (activeTab === 'my_posts') return '/my-posts';
  if (activeTab === 'guidelines') return '/guidelines';
  if (activeTab === 'suggestions') return '/suggestions';
  if (activeTab === 'about') return '/about';
  if (activeTab === 'terms') return '/terms';
  if (activeTab === 'admin') return '/admin';
  if (activeTab === 'support') return '/support';
  if (activeTab === 'settings') {
    return settingsSection === 'account' ? '/settings' : `/settings/${settingsSection}`;
  }
  return '/';
}

function resolveInitialRouteState(): {
  activeTab: ActiveNavTab;
  settingsSection: SettingsSectionTab;
} {
  if (typeof window === 'undefined') {
    return { activeTab: 'feed', settingsSection: 'account' };
  }

  // 1. Direct URL pathname match (e.g. https://onewall.wasmer.app/marketplace)
  const fromPathname = parseRouteFromPath(window.location.pathname);
  if (fromPathname.matched) {
    return {
      activeTab: fromPathname.activeTab,
      settingsSection: fromPathname.settingsSection,
    };
  }

  // 2. Query parameter match (?p=/marketplace or ?route=marketplace or ?tab=marketplace)
  try {
    const params = new URLSearchParams(window.location.search);
    const redirectedPath = params.get('p') || params.get('route') || params.get('tab');
    if (redirectedPath) {
      const normalizedRedirect = redirectedPath.startsWith('/')
        ? redirectedPath
        : `/${redirectedPath}`;
      const fromQuery = parseRouteFromPath(normalizedRedirect);
      if (fromQuery.matched) {
        return {
          activeTab: fromQuery.activeTab,
          settingsSection: fromQuery.settingsSection,
        };
      }
    }
  } catch {
    // Ignore URLSearchParams errors
  }

  // 3. Hash route match (e.g. #/marketplace) when not an OAuth callback token
  const rawHash = window.location.hash || '';
  if (rawHash.startsWith('#/') && !rawHash.includes('access_token=')) {
    const fromHash = parseRouteFromPath(rawHash.slice(1));
    if (fromHash.matched) {
      return {
        activeTab: fromHash.activeTab,
        settingsSection: fromHash.settingsSection,
      };
    }
  }

  // 4. Session storage fallback so refreshing in the same tab stays on the active dashboard even if the host rewrites to '/'
  try {
    const savedTab = window.sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY) as ActiveNavTab | null;
    const savedSection = (window.sessionStorage.getItem(SETTINGS_SECTION_STORAGE_KEY) ||
      'account') as SettingsSectionTab;
    const validTabs: ActiveNavTab[] = [
      'feed',
      'marketplace',
      'chats',
      'notifications',
      'files',
      'my_posts',
      'guidelines',
      'suggestions',
      'about',
      'terms',
      'admin',
      'support',
      'settings',
    ];
    if (savedTab && validTabs.includes(savedTab)) {
      return {
        activeTab: savedTab,
        settingsSection: savedSection,
      };
    }
  } catch {
    // Ignore storage access errors
  }

  return { activeTab: 'feed', settingsSection: 'account' };
}

export default function App() {
  useEffect(() => {
    ensureLocalDatabaseInitialized();
  }, []);

  const [showSplash, setShowSplash] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [userProfile, setUserProfile] = useState<UserPublicProfile | null>(null);
  const [userPrivate, setUserPrivate] = useState<UserPrivateInfo | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [showReferralGateModal, setShowReferralGateModal] = useState(false);
  const [referralChoice, setReferralChoice] = useState<string>(APP_REFERRAL_OPTIONS[0]);
  const [referralCustomText, setReferralCustomText] = useState('');
  const [isSavingReferral, setIsSavingReferral] = useState(false);

  const [posts, setPosts] = useState<Post[]>(() => getLocalPosts());
  const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListing[]>(() =>
    getLocalMarketplaceListings()
  );
  const [userReactions, setUserReactions] = useState<Record<string, boolean>>({});
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);

  const [presenceList, setPresenceList] = useState<UserPresence[]>(() => getLocalPresence());
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [chatThreads, setChatThreads] = useState<ChatThread[]>([]);
  const [activeChatPeer, setActiveChatPeer] = useState<ChatPeerTarget | null>(null);
  const [isDesktopMessengerOpen, setIsDesktopMessengerOpen] = useState(false);
  const [isDesktopMessengerMinimized, setIsDesktopMessengerMinimized] = useState(false);
  const [isTransitioningToFullInbox, setIsTransitioningToFullInbox] = useState(false);

  // Incoming Chat Message Toast Effect State
  const [incomingChatAlert, setIncomingChatAlert] = useState<{
    notification: NotificationItem;
  } | null>(null);
  const notifIdsKnownRef = useRef<Set<string>>(new Set());
  const initialNotifsLoadedRef = useRef<boolean>(false);
  const knownThreadMsgRef = useRef<Map<string, string>>(new Map());
  const initialThreadsLoadedRef = useRef<boolean>(false);
  const welcomeCheckedUidRef = useRef<string | null>(null);
  const completedOnboardingProfileRef = useRef<UserPublicProfile | null>(null);
  const userProfileRef = useRef<UserPublicProfile | null>(null);
  userProfileRef.current = userProfile;

  const [activeTab, setActiveTab] = useState<ActiveNavTab>(
    () => resolveInitialRouteState().activeTab
  );
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSectionTab>(
    () => resolveInitialRouteState().settingsSection
  );

  // In Development Mode:
  // Defaults to true as requested ("now display only a In Development").
  // Normal visitors see exclusively the "In Development" holding screen.
  // Developers and admins can toggle preview to test features or sign in.
  const [inDevelopmentMode, setInDevelopmentMode] = useState<boolean>(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('preview') === 'true') return false;
      const previewActive = localStorage.getItem('one_msu_dev_preview_active');
      if (previewActive === 'true') return false;
    } catch {
      // ignore
    }
    return true;
  });

  const isHandlingPopStateRef = useRef<boolean>(false);

  // Client-Side SPA Router: Listen to browser Back/Forward navigation (popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const fromPath = parseRouteFromPath(window.location.pathname);
    if (fromPath.matched) {
      setActiveTab(fromPath.activeTab);
      setSettingsInitialSection(fromPath.settingsSection);
    }

    const handlePopState = (ev: PopStateEvent) => {
      isHandlingPopStateRef.current = true;
      const stateTab = ev.state?.activeTab as ActiveNavTab | undefined;
      const stateSection = ev.state?.settingsInitialSection as SettingsSectionTab | undefined;
      const parsed = parseRouteFromPath(window.location.pathname);
      if (parsed.matched) {
        setActiveTab(parsed.activeTab);
        setSettingsInitialSection(parsed.settingsSection);
      } else if (stateTab) {
        setActiveTab(stateTab);
        if (stateSection) setSettingsInitialSection(stateSection);
      } else {
        setActiveTab('feed');
        setSettingsInitialSection('account');
      }
      window.setTimeout(() => {
        isHandlingPopStateRef.current = false;
      }, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Sync Active Tab & Settings Section -> Browser URL Path & Session Storage (Client-Side SPA Routing)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
      window.sessionStorage.setItem(SETTINGS_SECTION_STORAGE_KEY, settingsInitialSection);
    } catch {
      // Ignore storage errors
    }

    if (isHandlingPopStateRef.current) return;
    // Never overwrite OAuth callback parameters in URL hash or search before Supabase parses them
    const rawHash = window.location.hash || '';
    const rawSearch = window.location.search || '';
    if (
      rawHash.includes('access_token=') ||
      rawHash.includes('refresh_token=') ||
      rawHash.includes('error_description=') ||
      rawSearch.includes('code=')
    ) {
      return;
    }

    const targetPath = getTargetPathForRoute(activeTab, settingsInitialSection);
    const currentCleanPath =
      (window.location.pathname || '/')
        .replace(/\/index\.html$/i, '')
        .replace(/\.html$/i, '')
        .replace(/\/+$/, '') || '/';
    if (currentCleanPath !== targetPath || window.location.pathname !== targetPath) {
      try {
        window.history.pushState({ activeTab, settingsInitialSection }, '', targetPath);
      } catch {
        // Ignore history push errors in restricted sandboxed contexts
      }
    }
  }, [activeTab, settingsInitialSection]);
  const [selectedCategory, setSelectedCategory] = useState<
    PostCategory | 'All' | 'Trending Topics'
  >('All');
  const [selectedTrendingTopic, setSelectedTrendingTopic] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<'all' | 'media' | 'docs'>('all');
  const [selectedFileCategoryFilter, setSelectedFileCategoryFilter] = useState<
    'all' | 'pdf' | 'word' | 'excel' | 'ppt' | 'media'
  >('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [showMobileComposerSheet, setShowMobileComposerSheet] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(() =>
    getLocalPlatformSettings()
  );
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.localStorage.getItem('one_msu_dark_mode') === 'true';
    }
    return false;
  });
  const [charSize, setCharSize] = useState<'sm' | 'md' | 'lg' | 'xl'>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('one_msu_char_size');
      if (saved === 'sm' || saved === 'md' || saved === 'lg' || saved === 'xl') {
        return saved;
      }
    }
    return 'md';
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDarkMode);
      window.localStorage.setItem('one_msu_dark_mode', String(isDarkMode));
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-char-size', charSize);
      window.localStorage.setItem('one_msu_char_size', charSize);
    }
  }, [charSize]);

  // Auto-close incoming chat notification banner after 3 seconds
  useEffect(() => {
    if (!incomingChatAlert) return;
    const timer = window.setTimeout(() => {
      setIncomingChatAlert(null);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [incomingChatAlert]);

  // Opening Splash Timer + Auth Ready Safety Fallback so app never hangs on splash screen
  useEffect(() => {
    ensureLocalDatabaseInitialized();
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1200);
    const authFallbackTimer = setTimeout(() => {
      setIsAuthReady(true);
      setIsLoadingProfile(false);
    }, 2000);
    return () => {
      clearTimeout(timer);
      clearTimeout(authFallbackTimer);
    };
  }, []);

  // Responsive Screen Detection (Separate Mobile & Desktop UI automatically)
  useEffect(() => {
    const onResize = () => setIsMobileScreen(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const readStoredVerifiedSession = (): User | null => {
      try {
        const raw =
          window.localStorage.getItem(VERIFIED_EMAIL_SESSION_KEY) ||
          window.sessionStorage.getItem(VERIFIED_EMAIL_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
          uid?: string;
          email?: string;
          displayName?: string;
          photoURL?: string | null;
        };
        if (parsed?.uid && parsed?.email && isInstitutionalEduEmail(parsed.email)) {
          return {
            uid: parsed.uid,
            email: parsed.email,
            displayName: parsed.displayName || parsed.email.split('@')[0] || 'MSU Student',
            photoURL: parsed.photoURL || null,
            emailVerified: true,
          } as User;
        }
      } catch {
        // Ignore storage error
      }
      return null;
    };

    const applyResolvedUser = async (rawUser: User | null) => {
      if (!rawUser) {
        setCurrentUser(null);
        setIsAuthReady(true);
        return;
      }
      const rawEmail = getAuthenticatedUserEmail(rawUser);
      if (!isInstitutionalEduEmail(rawEmail)) {
        setCurrentUser((prev) =>
          prev?.uid === rawUser.uid && getAuthenticatedUserEmail(prev) === rawEmail ? prev : rawUser
        );
        setIsAuthReady(true);
        return;
      }
      const resolved = await resolveOriginalUserUid({
        uid: rawUser.uid,
        email: rawEmail,
        displayName: rawUser.displayName,
        photoURL: rawUser.photoURL,
      });
      const nextEmail = resolved.email || rawEmail;
      const nextDisplayName = resolved.displayName || rawUser.displayName || 'MSU Student';
      const nextPhotoURL = resolved.photoURL || rawUser.photoURL || null;
      const sessionPayload = {
        uid: resolved.uid,
        email: nextEmail,
        displayName: nextDisplayName,
        photoURL: nextPhotoURL,
      };
      try {
        window.localStorage.setItem(VERIFIED_EMAIL_SESSION_KEY, JSON.stringify(sessionPayload));
        window.sessionStorage.setItem(VERIFIED_EMAIL_SESSION_KEY, JSON.stringify(sessionPayload));
      } catch {
        // Ignore storage error
      }
      setCurrentUser((prev) => {
        if (prev && prev.uid === resolved.uid && getAuthenticatedUserEmail(prev) === nextEmail) {
          return prev;
        }
        return {
          ...rawUser,
          uid: resolved.uid,
          email: nextEmail,
          displayName: nextDisplayName,
          photoURL: nextPhotoURL,
          emailVerified: true,
        } as User;
      });
      setIsAuthReady(true);
    };

    const syncAuthSession = (fbUser: User | null) => {
      supabase.auth
        .getSession()
        .then(({ data: { session } }) => {
          const storedSession = readStoredVerifiedSession();
          if (session?.user) {
            const sbEmail = getAuthenticatedUserEmail(session.user) || null;
            const oneProf = (session.user.user_metadata?.one_profile || {}) as {
              googleDisplayName?: string;
              photoURL?: string;
            };
            const sbUser = {
              uid: session.user.id,
              email: sbEmail,
              displayName:
                oneProf.googleDisplayName ||
                (session.user.user_metadata?.full_name as string) ||
                (session.user.user_metadata?.name as string) ||
                'MSU Student',
              photoURL:
                oneProf.photoURL ||
                (session.user.user_metadata?.avatar_url as string) ||
                (session.user.user_metadata?.picture as string) ||
                null,
              emailVerified: true,
            } as User;
            if (isInstitutionalEduEmail(sbEmail)) {
              void applyResolvedUser(sbUser);
              return;
            }
          }

          const fbEmail = getAuthenticatedUserEmail(fbUser);
          if (fbUser && isInstitutionalEduEmail(fbEmail)) {
            void applyResolvedUser(fbUser);
            return;
          }

          if (fbUser && !isInstitutionalEduEmail(fbEmail)) {
            signOut(auth).catch(() => {});
          }

          if (storedSession) {
            void applyResolvedUser(storedSession);
          } else if (session?.user) {
            const sbEmail = getAuthenticatedUserEmail(session.user) || null;
            setCurrentUser({
              uid: session.user.id,
              email: sbEmail,
              displayName:
                (session.user.user_metadata?.full_name as string) ||
                (session.user.user_metadata?.name as string) ||
                'MSU Student',
              photoURL:
                (session.user.user_metadata?.avatar_url as string) ||
                (session.user.user_metadata?.picture as string) ||
                null,
              emailVerified: true,
            } as User);
            setIsAuthReady(true);
          } else {
            setCurrentUser(fbUser || null);
            setIsAuthReady(true);
          }
        })
        .catch(() => {
          const storedSession = readStoredVerifiedSession();
          const fbEmail = getAuthenticatedUserEmail(fbUser);
          if (fbUser && isInstitutionalEduEmail(fbEmail)) {
            void applyResolvedUser(fbUser);
          } else if (storedSession) {
            void applyResolvedUser(storedSession);
          } else {
            setCurrentUser(fbUser || null);
            setIsAuthReady(true);
          }
        });
    };

    const unsub = onAuthStateChanged(auth, (user) => {
      syncAuthSession(user);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const sbEmail = getAuthenticatedUserEmail(session.user) || null;
        const oneProf = (session.user.user_metadata?.one_profile || {}) as {
          googleDisplayName?: string;
          photoURL?: string;
        };
        const sbUser = {
          uid: session.user.id,
          email: sbEmail,
          displayName:
            oneProf.googleDisplayName ||
            (session.user.user_metadata?.full_name as string) ||
            (session.user.user_metadata?.name as string) ||
            'MSU Student',
          photoURL:
            oneProf.photoURL ||
            (session.user.user_metadata?.avatar_url as string) ||
            (session.user.user_metadata?.picture as string) ||
            null,
          emailVerified: true,
        } as User;
        void applyResolvedUser(sbUser);
      }
    });

    let authBc: BroadcastChannel | null = null;
    try {
      authBc = new BroadcastChannel('one_msu_supabase_auth');
      authBc.onmessage = (ev) => {
        if (ev.data?.type === 'SUPABASE_AUTH_SESSION' && ev.data?.session?.access_token) {
          supabase.auth
            .setSession({
              access_token: ev.data.session.access_token,
              refresh_token: ev.data.session.refresh_token,
            })
            .then(() => {
              syncAuthSession(auth.currentUser);
            })
            .catch(() => {});
        }
      };
    } catch {
      // Ignore BroadcastChannel unsupported
    }

    const handlePopupMessage = (ev: MessageEvent) => {
      if (ev.data?.type === 'SUPABASE_AUTH_SESSION' && ev.data?.session?.access_token) {
        supabase.auth
          .setSession({
            access_token: ev.data.session.access_token,
            refresh_token: ev.data.session.refresh_token,
          })
          .then(() => {
            syncAuthSession(auth.currentUser);
          })
          .catch(() => {});
      }
    };
    window.addEventListener('message', handlePopupMessage);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === VERIFIED_EMAIL_SESSION_KEY) {
        syncAuthSession(auth.currentUser);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      unsub();
      subscription.unsubscribe();
      if (authBc) authBc.close();
      window.removeEventListener('message', handlePopupMessage);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const effectiveEmail = useMemo(() => {
    return getAuthenticatedUserEmail(currentUser);
  }, [currentUser]);

  const hasValidEduAccess = useMemo(() => {
    if (!currentUser) return false;
    return isInstitutionalEduEmail(effectiveEmail);
  }, [currentUser, effectiveEmail]);

  const emailDomain = useMemo(() => {
    return extractEmailDomain(effectiveEmail, false);
  }, [effectiveEmail]);

  const unreadNotificationsCount = useMemo(() => {
    return notifications.filter((n) => !n.read).length;
  }, [notifications]);

  const onlineUsersCount = useMemo(() => {
    return presenceList.filter((u) => isUserCurrentlyOnline(u)).length;
  }, [presenceList]);

  // Keep Web Tab Title synced to ONE
  useEffect(() => {
    if (unreadNotificationsCount > 0) {
      document.title = `(${unreadNotificationsCount}) ONE`;
    } else {
      document.title = 'ONE';
    }
  }, [unreadNotificationsCount]);

  // Sync local restored database changes across the app in real time
  useEffect(() => {
    const handleDbUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ collection?: string }>).detail;
      const col = detail?.collection || 'all';
      if (col === 'all' || col === 'posts' || col === 'comments') {
        setPosts(getLocalPosts());
      }
      if (col === 'all' || col === 'marketplace') {
        setMarketplaceListings(getLocalMarketplaceListings());
      }
      if ((col === 'all' || col === 'reactions') && currentUser?.uid) {
        const localReactMap: Record<string, boolean> = {};
        getLocalReactions().forEach((r) => {
          if (r.userId === currentUser.uid) {
            localReactMap[r.postId] = true;
          }
        });
        setUserReactions(localReactMap);
      }
      if (col === 'all' || col === 'presence' || col === 'users') {
        setPresenceList(getLocalPresence());
        if (currentUser?.uid) {
          const updatedMe = getLocalUsers().find((u) => u.uid === currentUser.uid);
          if (updatedMe) {
            setUserProfile((prev) => {
              if (!prev) return updatedMe;
              const unchanged =
                prev.uid === updatedMe.uid &&
                prev.nickname === updatedMe.nickname &&
                prev.googleDisplayName === updatedMe.googleDisplayName &&
                prev.photoURL === updatedMe.photoURL &&
                prev.badge === updatedMe.badge &&
                prev.bio === updatedMe.bio &&
                prev.campus === updatedMe.campus &&
                prev.defaultAnonymous === updatedMe.defaultAnonymous &&
                prev.role === updatedMe.role &&
                prev.accountStatus === updatedMe.accountStatus &&
                prev.isVerifiedStudent === updatedMe.isVerifiedStudent &&
                prev.referralSource === updatedMe.referralSource;
              return unchanged ? prev : { ...prev, ...updatedMe };
            });
          }
        }
      }
      if (col === 'all' || col === 'platform_settings') {
        setPlatformSettings(getLocalPlatformSettings());
      }
      if ((col === 'all' || col === 'notifications') && currentUser?.uid) {
        const items = getLocalNotificationsForUser(currentUser.uid);
        if (initialNotifsLoadedRef.current) {
          const newlyArrivedUnreadNotifs = items.filter(
            (n) => !n.read && !notifIdsKnownRef.current.has(n.id)
          );
          if (newlyArrivedUnreadNotifs.length > 0) {
            playChatNotificationSound();
          }
          const newlyArrivedChatNotif = newlyArrivedUnreadNotifs.find(
            (n) => n.type === 'message'
          );
          if (newlyArrivedChatNotif) {
            setIncomingChatAlert({ notification: newlyArrivedChatNotif });
          }
        } else {
          initialNotifsLoadedRef.current = true;
        }
        notifIdsKnownRef.current = new Set(items.map((n) => n.id));
        setNotifications(items);
      }
      const activeProfile = userProfileRef.current;
      if ((col === 'all' || col === 'chats' || col === 'messages') && activeProfile) {
        const threads = getLocalChatThreadsForUser(activeProfile);
        if (initialThreadsLoadedRef.current && currentUser?.uid) {
          for (const t of threads) {
            const sig = `${t.lastSenderId || ''}:${t.lastMessage || ''}:${t.updatedAt?.seconds || 0}`;
            const prevSig = knownThreadMsgRef.current.get(t.id);
            if (
              prevSig !== undefined &&
              prevSig !== sig &&
              t.lastSenderId &&
              t.lastSenderId !== currentUser.uid &&
              t.lastMessageRead === false
            ) {
              playChatNotificationSound();
              const isUserA = t.userAId === currentUser.uid;
              const peerUid = isUserA ? t.userBId : t.userAId;
              const peerNick = isUserA ? t.userBNickname : t.userANickname;
              const peerPhoto = isUserA ? t.userBPhotoURL : t.userAPhotoURL;
              const peerBadge = isUserA ? t.userBBadge : t.userABadge;
              setIncomingChatAlert({
                notification: {
                  id: `thread_alert_${t.id}_${Date.now()}`,
                  recipientId: currentUser.uid,
                  actorId: peerUid,
                  actorNickname: peerNick,
                  actorPhotoURL: peerPhoto,
                  actorBadge: peerBadge,
                  type: 'message',
                  targetId: t.id,
                  previewText: t.lastMessage || 'Sent you a message',
                  read: false,
                  createdAt: t.updatedAt,
                },
              });
              break;
            }
          }
        } else if (threads.length > 0) {
          initialThreadsLoadedRef.current = true;
        }
        const nextMap = new Map<string, string>();
        threads.forEach((t) => {
          nextMap.set(
            t.id,
            `${t.lastSenderId || ''}:${t.lastMessage || ''}:${t.updatedAt?.seconds || 0}`
          );
        });
        knownThreadMsgRef.current = nextMap;
        setChatThreads(threads);
      }
    };
    window.addEventListener(DB_UPDATE_EVENT, handleDbUpdate);
    return () => window.removeEventListener(DB_UPDATE_EVENT, handleDbUpdate);
  }, [currentUser?.uid]);

  // Subscribe to current user's public & private profile
  useEffect(() => {
    if (!isAuthReady || !currentUser || !hasValidEduAccess) {
      setUserProfile(null);
      setUserPrivate(null);
      return;
    }

    // Immediate local resolution so restored accounts never wait on network timeouts
    const immediateCached =
      (completedOnboardingProfileRef.current &&
      completedOnboardingProfileRef.current.uid === currentUser.uid
        ? completedOnboardingProfileRef.current
        : null) ||
      getLocalUsers().find((u) => u.uid === currentUser.uid) ||
      getCachedOrFallbackUserProfile(
        currentUser.uid,
        effectiveEmail,
        currentUser.displayName,
        currentUser.photoURL
      );

    if (immediateCached) {
      setUserProfile(immediateCached);
      setIsLoadingProfile(false);
    } else {
      setIsLoadingProfile(true);
    }

    if (!canUseFirestore(currentUser.uid)) {
      setIsLoadingProfile(false);
      return;
    }

    const publicRef = doc(db, 'users', currentUser.uid);
    const privateRef = doc(db, 'users_private', currentUser.uid);

    const unsubPublic = onSnapshot(
      publicRef,
      (snap) => {
        if (snap.exists()) {
          const raw = snap.data() as UserPublicProfile;
          const localCurrent = getLocalUsers().find((u) => u.uid === currentUser.uid);
          const snapUpdatedMs = raw.updatedAt?.toMillis?.() || 0;
          const localUpdatedMs =
            (localCurrent as { updatedAtMs?: number } | undefined)?.updatedAtMs ||
            localCurrent?.updatedAt?.toMillis?.() ||
            0;

          // Prefer local/Supabase synced profile if it is newer than the Firestore document
          const baseProfile =
            localCurrent && localUpdatedMs > snapUpdatedMs
              ? { ...raw, ...localCurrent }
              : { ...localCurrent, ...raw };

          const expectedBadge = resolveUserBadge(baseProfile.badge, effectiveEmail);
          const shouldForceVerified =
            expectedBadge === 'tulips' ||
            expectedBadge === 'developer' ||
            isTulipsEmail(effectiveEmail);
          const resolvedProfile: UserPublicProfile = {
            ...baseProfile,
            uid: currentUser.uid,
            badge: expectedBadge,
            isVerifiedStudent: shouldForceVerified
              ? true
              : baseProfile.isVerifiedStudent !== false,
          };
          completedOnboardingProfileRef.current = resolvedProfile;
          if (!localCurrent || snapUpdatedMs > localUpdatedMs) {
            upsertLocalUser(resolvedProfile, effectiveEmail);
          }
          setUserProfile(resolvedProfile);
          // Sync badge and verified status to Firestore if missing or upgraded
          if (
            raw.badge !== expectedBadge ||
            (shouldForceVerified && raw.isVerifiedStudent === false)
          ) {
            updateDoc(publicRef, {
              badge: expectedBadge,
              isVerifiedStudent: true,
              updatedAt: serverTimestamp(),
            }).catch(() => {});
          }
          // Ensure user's nickname is claimed in /nicknames/{normalizedId}
          const normId = normalizeNicknameId(raw.nickname);
          if (normId.length >= 2) {
            getDoc(doc(db, 'nicknames', normId))
              .then((nickSnap) => {
                if (!nickSnap.exists()) {
                  setDoc(doc(db, 'nicknames', normId), {
                    uid: currentUser.uid,
                    nickname: raw.nickname.slice(0, 32),
                    normalizedNickname: normId,
                    updatedAt: serverTimestamp(),
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
          // Ensure private info record exists once public profile is established
          if (effectiveEmail) {
            getDoc(privateRef)
              .then((privSnap) => {
                if (!privSnap.exists()) {
                  setDoc(privateRef, {
                    uid: currentUser.uid,
                    email: effectiveEmail.slice(0, 254),
                    hasCustomPassword: false,
                    passwordUpdatedAt: '',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  }).catch(() => {});
                }
              })
              .catch(() => {});
          }
        } else {
          if (
            completedOnboardingProfileRef.current &&
            completedOnboardingProfileRef.current.uid === currentUser.uid
          ) {
            setUserProfile(completedOnboardingProfileRef.current);
          } else {
            const cached =
              getLocalUsers().find((u) => u.uid === currentUser.uid) ||
              getCachedOrFallbackUserProfile(
                currentUser.uid,
                effectiveEmail,
                currentUser.displayName,
                currentUser.photoURL
              );
            if (cached) {
              upsertLocalUser(cached, effectiveEmail);
            }
            setUserProfile(cached);
          }
        }
        setIsLoadingProfile(false);
      },
      (err) => {
        const fallback =
          (completedOnboardingProfileRef.current &&
          completedOnboardingProfileRef.current.uid === currentUser.uid
            ? completedOnboardingProfileRef.current
            : null) ||
          getLocalUsers().find((u) => u.uid === currentUser.uid) ||
          getCachedOrFallbackUserProfile(
            currentUser.uid,
            effectiveEmail,
            currentUser.displayName,
            currentUser.photoURL
          );
        if (fallback) {
          upsertLocalUser(fallback, effectiveEmail);
          setUserProfile(fallback);
        }
        setIsLoadingProfile(false);
        handleFirestoreError(err, OperationType.GET, `users/${currentUser.uid}`);
      }
    );

    const unsubPrivate = onSnapshot(
      privateRef,
      (snap) => {
        if (snap.exists()) {
          setUserPrivate(snap.data() as UserPrivateInfo);
        } else {
          setUserPrivate(null);
        }
      },
      () => {
        // Ignore private info listener error before onboarding completes
      }
    );

    return () => {
      unsubPublic();
      unsubPrivate();
    };
  }, [isAuthReady, currentUser?.uid, hasValidEduAccess]);

  // Real-time User Presence Heartbeat + Online Users Subscription
  useEffect(() => {
    if (!isAuthReady || !currentUser || !hasValidEduAccess || !userProfile) {
      setPresenceList([]);
      return;
    }

    const myPresenceRef = doc(db, 'presence', currentUser.uid);
    const resolvedBadge = resolveUserBadge(userProfile.badge, effectiveEmail);

    const publishHeartbeat = (onlineState = true) => {
      const presencePayload: UserPresence = {
        uid: currentUser.uid,
        nickname: userProfile.nickname.slice(0, 32),
        photoURL: (userProfile.photoURL || '').slice(0, 2048),
        badge: resolvedBadge,
        campus: (userProfile.campus || 'MSU Main Campus - Marawi').slice(0, 80),
        isOnline: onlineState,
        lastSeenMs: Date.now(),
        visibility: 'edu_verified',
        updatedAt: Timestamp.now(),
      };
      upsertLocalPresence(presencePayload);
      if (canUseFirestore(currentUser.uid)) {
        setDoc(myPresenceRef, {
          ...presencePayload,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    };

    publishHeartbeat(true);
    const intervalId = window.setInterval(() => {
      publishHeartbeat(true);
    }, 20000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        publishHeartbeat(true);
      }
    };
    const handleBeforeUnload = () => {
      publishHeartbeat(false);
    };

    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('beforeunload', handleBeforeUnload);

    const presenceQuery = collection(db, 'presence');
    const usersQuery = collection(db, 'users');

    let latestPresenceMap = new Map<string, UserPresence>();
    let latestUsersMap = new Map<string, UserPublicProfile>();

    const syncCombinedPresence = () => {
      const merged = new Map<string, UserPresence>();
      // Seed from restored local database first
      getLocalUsers().forEach((u) => {
        if (!u.uid || u.uid === ONE_OFFICIAL_UID) return;
        merged.set(u.uid, {
          uid: u.uid,
          nickname: u.nickname || 'student',
          photoURL: u.photoURL || '',
          badge: resolveUserBadge(u.badge),
          campus: u.campus || 'MSU Main Campus - Marawi',
          isOnline: false,
          lastSeenMs: 0,
          visibility: 'edu_verified',
          updatedAt: u.updatedAt || null,
        });
      });
      getLocalPresence().forEach((p) => {
        if (!p.uid || p.uid === ONE_OFFICIAL_UID) return;
        merged.set(p.uid, p);
      });
      // Then merge from live Firestore users & presence without overwriting newer local profiles
      const localUsersByUid = new Map<string, UserPublicProfile>();
      getLocalUsers().forEach((lu) => {
        if (lu?.uid) localUsersByUid.set(lu.uid, lu);
      });
      latestUsersMap.forEach((u, uid) => {
        if (
          !uid ||
          uid === ONE_OFFICIAL_UID ||
          uid === 'ibKOXniSPNYErJvZTJuyu3RBIqL2' ||
          uid.startsWith('usr_')
        ) {
          return;
        }
        const existingPres = merged.get(uid);
        const localU = localUsersByUid.get(uid);
        merged.set(uid, {
          uid,
          nickname: localU?.nickname || u.nickname || 'student',
          photoURL: localU?.photoURL || u.photoURL || '',
          badge: resolveUserBadge(localU?.badge || u.badge),
          campus: localU?.campus || u.campus || 'MSU Main Campus - Marawi',
          isOnline: existingPres?.isOnline || false,
          lastSeenMs: existingPres?.lastSeenMs || 0,
          visibility: 'edu_verified',
          updatedAt: localU?.updatedAt || u.updatedAt || null,
        });
      });
      latestPresenceMap.forEach((p, uid) => {
        if (
          !uid ||
          uid === ONE_OFFICIAL_UID ||
          uid === 'ibKOXniSPNYErJvZTJuyu3RBIqL2' ||
          uid.startsWith('usr_')
        ) {
          return;
        }
        const localU = localUsersByUid.get(uid);
        const userDoc = latestUsersMap.get(uid);
        const existingPres = merged.get(uid);
        const cloudLastSeen = typeof p.lastSeenMs === 'number' ? p.lastSeenMs : 0;
        const localLastSeen = existingPres?.lastSeenMs || 0;
        const keepLocalOnline =
          uid === currentUser.uid ||
          (Boolean(existingPres?.isOnline) && localLastSeen >= cloudLastSeen);
        merged.set(uid, {
          ...p,
          uid,
          nickname:
            localU?.nickname ||
            userDoc?.nickname ||
            existingPres?.nickname ||
            p.nickname ||
            'student',
          photoURL:
            localU?.photoURL ||
            userDoc?.photoURL ||
            existingPres?.photoURL ||
            p.photoURL ||
            '',
          badge: resolveUserBadge(
            localU?.badge || userDoc?.badge || existingPres?.badge || p.badge
          ),
          campus:
            localU?.campus ||
            userDoc?.campus ||
            existingPres?.campus ||
            p.campus ||
            'MSU Main Campus - Marawi',
          isOnline: keepLocalOnline ? true : Boolean(p.isOnline),
          lastSeenMs: Math.max(cloudLastSeen, localLastSeen),
          visibility: 'edu_verified',
        });
      });
      // Always guarantee current signed-in user is marked online with fresh timestamp
      merged.set(currentUser.uid, {
        uid: currentUser.uid,
        nickname: userProfile.nickname.slice(0, 32),
        photoURL: (userProfile.photoURL || '').slice(0, 2048),
        badge: resolvedBadge,
        campus: (userProfile.campus || 'MSU Main Campus - Marawi').slice(0, 80),
        isOnline: true,
        lastSeenMs: Date.now(),
        visibility: 'edu_verified',
        updatedAt: Timestamp.now(),
      });
      setPresenceList(Array.from(merged.values()));
    };

    syncCombinedPresence();

    if (!canUseFirestore()) {
      return () => {
        window.clearInterval(intervalId);
        window.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }

    const unsubPresence = onSnapshot(
      presenceQuery,
      (snap) => {
        const nextMap = new Map<string, UserPresence>();
        snap.docs.forEach((d) => {
          nextMap.set(d.id, {
            ...(d.data() as UserPresence),
            uid: d.id,
          });
        });
        latestPresenceMap = nextMap;
        syncCombinedPresence();
      },
      (err) => {
        syncCombinedPresence();
        handleFirestoreError(err, OperationType.LIST, 'presence');
      }
    );

    const unsubUsers = onSnapshot(
      usersQuery,
      (snap) => {
        const nextUsers = new Map<string, UserPublicProfile>();
        const usersArr: UserPublicProfile[] = [];
        snap.docs.forEach((d) => {
          const prof = {
            ...(d.data() as UserPublicProfile),
            uid: d.id,
          };
          nextUsers.set(d.id, prof);
          usersArr.push(prof);
        });
        if (usersArr.length > 0) {
          saveLocalUsers(usersArr);
        }
        latestUsersMap = nextUsers;
        syncCombinedPresence();
      },
      () => {
        syncCombinedPresence();
      }
    );

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      unsubPresence();
      unsubUsers();
    };
  }, [
    isAuthReady,
    currentUser,
    hasValidEduAccess,
    userProfile?.uid,
    userProfile?.nickname,
    userProfile?.photoURL,
    userProfile?.badge,
    userProfile?.campus,
  ]);

  // Subscribe to Real-time Notifications for Current User + Trigger Incoming Chat Effect
  useEffect(() => {
    if (!isAuthReady || !currentUser || !hasValidEduAccess || !userProfile) {
      setNotifications([]);
      return;
    }

    setNotifications(getLocalNotificationsForUser(currentUser.uid));

    if (!canUseFirestore(currentUser.uid)) {
      return;
    }

    const notifQuery = query(
      collection(db, 'notifications'),
      where('recipientId', '==', currentUser.uid)
    );

    const unsubNotifs = onSnapshot(
      notifQuery,
      (snap) => {
        const cloudItems: NotificationItem[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<NotificationItem, 'id'>),
        }));
        cloudItems.forEach((item) => upsertLocalNotification(item));
        const items = getLocalNotificationsForUser(currentUser.uid);

        // Detect newly arrived notifications (likes, comments, and chat messages) for Messenger ling-ping sound, toast, and automatic Desktop Messenger popup
        if (initialNotifsLoadedRef.current) {
          const newlyArrivedUnreadNotifs = items.filter(
            (n) => !n.read && !notifIdsKnownRef.current.has(n.id)
          );
          if (newlyArrivedUnreadNotifs.length > 0) {
            playChatNotificationSound();
          }

          const newlyArrivedChatNotif = newlyArrivedUnreadNotifs.find(
            (n) => n.type === 'message'
          );
          if (newlyArrivedChatNotif) {
            setIncomingChatAlert({ notification: newlyArrivedChatNotif });
          }
        } else {
          initialNotifsLoadedRef.current = true;
        }

        notifIdsKnownRef.current = new Set(items.map((n) => n.id));
        setNotifications(items);
      },
      (err) => {
        setNotifications(getLocalNotificationsForUser(currentUser.uid));
        handleFirestoreError(err, OperationType.LIST, 'notifications');
      }
    );

    return () => unsubNotifs();
  }, [isAuthReady, currentUser, hasValidEduAccess, userProfile?.uid]);

  // Subscribe to Real-time Direct Chat Threads for Current User
  useEffect(() => {
    if (!isAuthReady || !currentUser || !hasValidEduAccess || !userProfile) {
      setChatThreads([]);
      return;
    }

    setChatThreads(getLocalChatThreadsForUser(userProfile));

    if (!canUseFirestore(currentUser.uid)) {
      return;
    }

    const chatsQuery = query(
      collection(db, 'chats'),
      where('participantIds', 'array-contains', currentUser.uid)
    );

    const unsubChats = onSnapshot(
      chatsQuery,
      (snap) => {
        const cloudThreads: ChatThread[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ChatThread, 'id'>),
        }));
        cloudThreads.forEach((t) => upsertLocalChatThread(t));
        const threads = getLocalChatThreadsForUser(userProfile);

        // Also detect new incoming chat messages directly on threads for instant Desktop Messenger popup
        if (initialThreadsLoadedRef.current) {
          for (const t of threads) {
            const sig = `${t.lastSenderId || ''}:${t.lastMessage || ''}:${t.updatedAt?.seconds || 0}`;
            const prevSig = knownThreadMsgRef.current.get(t.id);
            if (
              prevSig !== undefined &&
              prevSig !== sig &&
              t.lastSenderId &&
              t.lastSenderId !== currentUser.uid &&
              t.lastMessageRead === false
            ) {
              playChatNotificationSound();
              const isUserA = t.userAId === currentUser.uid;
              const peerUid = isUserA ? t.userBId : t.userAId;
              const peerNick = isUserA ? t.userBNickname : t.userANickname;
              const peerPhoto = isUserA ? t.userBPhotoURL : t.userAPhotoURL;
              const peerBadge = isUserA ? t.userBBadge : t.userABadge;

              setIncomingChatAlert({
                notification: {
                  id: `thread_alert_${t.id}_${Date.now()}`,
                  recipientId: currentUser.uid,
                  actorId: peerUid,
                  actorNickname: peerNick,
                  actorPhotoURL: peerPhoto,
                  actorBadge: peerBadge,
                  type: 'message',
                  targetId: t.id,
                  previewText: t.lastMessage || 'Sent you a message',
                  read: false,
                  createdAt: t.updatedAt,
                },
              });
              break;
            }
          }
        } else {
          initialThreadsLoadedRef.current = true;
        }

        const nextMap = new Map<string, string>();
        threads.forEach((t) => {
          nextMap.set(
            t.id,
            `${t.lastSenderId || ''}:${t.lastMessage || ''}:${t.updatedAt?.seconds || 0}`
          );
        });
        knownThreadMsgRef.current = nextMap;

        setChatThreads(threads);
      },
      (err) => {
        setChatThreads(getLocalChatThreadsForUser(userProfile));
        handleFirestoreError(err, OperationType.LIST, 'chats');
      }
    );

    return () => unsubChats();
  }, [isAuthReady, currentUser, hasValidEduAccess, userProfile?.uid]);

  const currentUserBadge = resolveUserBadge(userProfile?.badge, effectiveEmail);
  const isDeveloperUser =
    isDeveloperEmail(effectiveEmail) ||
    currentUserBadge === 'developer' ||
    userProfile?.role === 'developer';

  // Helper to send the official "Hi, welcome to ONE!" message from ONE (with ONE logo profile & paper airplane icon)
  const ensureWelcomeMessageForUser = async (
    targetUid: string,
    targetNickname: string,
    targetPhotoURL: string,
    targetBadge: UserBadge,
    isNewlyOnboarded = false
  ) => {
    const welcomeChatId = buildChatId(targetUid, ONE_OFFICIAL_UID);
    const welcomeMsgId = `msg_welcome_${targetUid}`.slice(0, 120);
    const welcomeNotifId = `notif_welcome_${targetUid}`.slice(0, 120);

    const chatRef = doc(db, 'chats', welcomeChatId);
    const msgRef = doc(db, 'chats', welcomeChatId, 'messages', welcomeMsgId);
    const notifRef = doc(db, 'notifications', welcomeNotifId);

    let alreadyExists = getLocalChatThreadsForUser({
      uid: targetUid,
      nickname: targetNickname,
      nicknameUpdatedAt: '',
      googleDisplayName: targetNickname,
      photoURL: targetPhotoURL,
      emailDomain: 's.msumain.edu.ph',
      campus: 'MSU Main Campus - Marawi',
      bio: '',
      defaultAnonymous: false,
      badge: targetBadge,
      createdAt: null,
      updatedAt: null,
    }).some((t) => t.id === welcomeChatId);

    if (!alreadyExists && canUseFirestore(targetUid)) {
      try {
        const existingSnap = await Promise.race([
          getDoc(chatRef),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
        ]);
        if (existingSnap && existingSnap.exists()) {
          alreadyExists = true;
        }
      } catch {
        // Proceed to create if not found
      }
    }

    if (!alreadyExists) {
      const sortedUids = [targetUid, ONE_OFFICIAL_UID].sort();
      const isOneUserA = sortedUids[0] === ONE_OFFICIAL_UID;
      const initialReadState = !isNewlyOnboarded;
      const welcomePreview = 'Hi, welcome to ONE! 👋 We are glad to have you in our MSUan community.';
      const welcomeFullText = `Hi, welcome to ONE! 👋\n\nWelcome to the official MSUan Student Wall, @${targetNickname}! Feel free to share your campus thoughts, post anonymously anytime, upload study notes & files, and connect with fellow MSUans.`;

      const welcomeThread: ChatThread = {
        id: welcomeChatId,
        participantIds: sortedUids,
        userAId: isOneUserA ? ONE_OFFICIAL_UID : targetUid,
        userANickname: (isOneUserA ? ONE_OFFICIAL_NAME : targetNickname).slice(0, 64),
        userAPhotoURL: (isOneUserA ? ONE_LOGO_DATA_URL : targetPhotoURL || '').slice(0, 2048),
        userABadge: isOneUserA ? ONE_OFFICIAL_BADGE : targetBadge,
        userBId: isOneUserA ? targetUid : ONE_OFFICIAL_UID,
        userBNickname: (isOneUserA ? targetNickname : ONE_OFFICIAL_NAME).slice(0, 64),
        userBPhotoURL: (isOneUserA ? targetPhotoURL || '' : ONE_LOGO_DATA_URL).slice(0, 2048),
        userBBadge: isOneUserA ? targetBadge : ONE_OFFICIAL_BADGE,
        lastMessage: welcomePreview.slice(0, 300),
        lastSenderId: ONE_OFFICIAL_UID,
        lastMessageRead: initialReadState,
        lastMessageReadAt: initialReadState ? Timestamp.now() : null,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };
      upsertLocalChatThread(welcomeThread);

      upsertLocalChatMessage({
        id: welcomeMsgId,
        chatId: welcomeChatId,
        participantIds: sortedUids,
        senderId: ONE_OFFICIAL_UID,
        recipientId: targetUid,
        senderNickname: ONE_OFFICIAL_NAME,
        senderPhotoURL: ONE_LOGO_DATA_URL.slice(0, 2048),
        senderBadge: ONE_OFFICIAL_BADGE,
        text: welcomeFullText.slice(0, 3000),
        attachmentType: 'none',
        attachmentName: '',
        attachmentSize: 0,
        attachmentMime: '',
        attachmentDataUrl: '',
        read: initialReadState,
        createdAt: Timestamp.now(),
      });

      upsertLocalNotification({
        id: welcomeNotifId,
        recipientId: targetUid,
        actorId: ONE_OFFICIAL_UID,
        actorNickname: ONE_OFFICIAL_NAME,
        actorPhotoURL: ONE_LOGO_DATA_URL.slice(0, 2048),
        actorBadge: ONE_OFFICIAL_BADGE,
        type: 'message',
        targetId: welcomeChatId,
        previewText: welcomePreview.slice(0, 240),
        read: initialReadState,
        createdAt: Timestamp.now(),
      });

      if (canUseFirestore(targetUid)) {
        try {
          const batch = writeBatch(db);

          batch.set(chatRef, {
            participantIds: sortedUids,
            userAId: isOneUserA ? ONE_OFFICIAL_UID : targetUid,
            userANickname: (isOneUserA ? ONE_OFFICIAL_NAME : targetNickname).slice(0, 64),
            userAPhotoURL: (isOneUserA ? ONE_LOGO_DATA_URL : targetPhotoURL || '').slice(0, 2048),
            userABadge: isOneUserA ? ONE_OFFICIAL_BADGE : targetBadge,
            userBId: isOneUserA ? targetUid : ONE_OFFICIAL_UID,
            userBNickname: (isOneUserA ? targetNickname : ONE_OFFICIAL_NAME).slice(0, 64),
            userBPhotoURL: (isOneUserA ? targetPhotoURL || '' : ONE_LOGO_DATA_URL).slice(0, 2048),
            userBBadge: isOneUserA ? targetBadge : ONE_OFFICIAL_BADGE,
            lastMessage: welcomePreview.slice(0, 300),
            lastSenderId: ONE_OFFICIAL_UID,
            lastMessageRead: false,
            lastMessageReadAt: null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          batch.set(msgRef, {
            chatId: welcomeChatId,
            participantIds: sortedUids,
            senderId: ONE_OFFICIAL_UID,
            recipientId: targetUid,
            senderNickname: ONE_OFFICIAL_NAME,
            senderPhotoURL: ONE_LOGO_DATA_URL.slice(0, 2048),
            senderBadge: ONE_OFFICIAL_BADGE,
            text: welcomeFullText.slice(0, 3000),
            attachmentType: 'none',
            attachmentName: '',
            attachmentSize: 0,
            attachmentMime: '',
            attachmentDataUrl: '',
            read: false,
            createdAt: serverTimestamp(),
          });

          batch.set(notifRef, {
            recipientId: targetUid,
            actorId: ONE_OFFICIAL_UID,
            actorNickname: ONE_OFFICIAL_NAME,
            actorPhotoURL: ONE_LOGO_DATA_URL.slice(0, 2048),
            actorBadge: ONE_OFFICIAL_BADGE,
            type: 'message',
            targetId: welcomeChatId,
            previewText: welcomePreview.slice(0, 240),
            read: false,
            createdAt: serverTimestamp(),
          });

          batch.commit().catch(() => {});
        } catch {
          // Non-blocking welcome message creation
        }
      }
    }

    if (isNewlyOnboarded) {
      playChatNotificationSound();
      setActiveChatPeer({
        uid: ONE_OFFICIAL_UID,
        nickname: ONE_OFFICIAL_NAME,
        photoURL: ONE_LOGO_DATA_URL,
        badge: ONE_OFFICIAL_BADGE,
      });
      if (window.innerWidth >= 768) {
        setIsDesktopMessengerOpen(true);
        setIsDesktopMessengerMinimized(false);
      }
    }
  };

  // Ensure every user has received their welcoming message from ONE
  useEffect(() => {
    if (!isAuthReady || !currentUser || !hasValidEduAccess || !userProfile) return;
    if (welcomeCheckedUidRef.current === currentUser.uid) return;
    welcomeCheckedUidRef.current = currentUser.uid;

    ensureWelcomeMessageForUser(
      currentUser.uid,
      userProfile.nickname,
      userProfile.photoURL || '',
      currentUserBadge,
      false
    );
  }, [
    isAuthReady,
    currentUser?.uid,
    hasValidEduAccess,
    userProfile?.uid,
    userProfile?.nickname,
    userProfile?.photoURL,
    currentUserBadge,
  ]);

  // Subscribe to Global Platform Settings (Website Controls)
  useEffect(() => {
    if (!isAuthReady || !currentUser || !hasValidEduAccess) return;
    setPlatformSettings(getLocalPlatformSettings());
    if (!canUseFirestore()) return;
    const settingsRef = doc(db, 'platform_settings', 'global');
    const unsubSettings = onSnapshot(
      settingsRef,
      (snap) => {
        if (snap.exists()) {
          const merged = {
            ...DEFAULT_PLATFORM_SETTINGS,
            ...(snap.data() as Partial<PlatformSettings>),
          };
          if (Array.isArray(merged.deletedPostIds) && merged.deletedPostIds.length > 0) {
            syncDeletedPostIdsFromRemote(merged.deletedPostIds);
            setPosts(getLocalPosts());
          }
          saveLocalPlatformSettings(merged);
          setPlatformSettings(merged);
        } else {
          setPlatformSettings(getLocalPlatformSettings());
        }
      },
      () => {
        setPlatformSettings(getLocalPlatformSettings());
      }
    );
    return () => unsubSettings();
  }, [isAuthReady, currentUser, hasValidEduAccess]);

  // Subscribe to Posts Feed
  useEffect(() => {
    if (!isAuthReady || !currentUser || !hasValidEduAccess || !userProfile) {
      setPosts([]);
      return;
    }

    const initialLocalPosts = getLocalPosts();
    setPosts(initialLocalPosts);
    setIsLoadingPosts(initialLocalPosts.length === 0);

    if (!canUseFirestore()) {
      setIsLoadingPosts(false);
      return;
    }

    const postsQuery = query(
      collection(db, 'posts'),
      where('visibility', '==', 'edu_verified')
    );

    // Recover any posts cached in browser IndexedDB even if Firestore network quota is exhausted
    getDocsFromCache(postsQuery)
      .then((cacheSnap) => {
        if (!cacheSnap.empty) {
          const cachedPosts: Post[] = cacheSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<Post, 'id'>),
          }));
          saveLocalPosts(cachedPosts);
          setPosts(getLocalPosts());
          setIsLoadingPosts(false);
        }
      })
      .catch(() => {});

    const unsubPosts = onSnapshot(
      postsQuery,
      (snap) => {
        const fetched: Post[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Post, 'id'>),
        }));
        if (fetched.length > 0) {
          saveLocalPosts(fetched);
        }
        setPosts(getLocalPosts());
        setIsLoadingPosts(false);

        // If current user has a special badge ('developer' or 'tulips'), ensure their public posts carry that badge
        if (currentUserBadge === 'developer' || currentUserBadge === 'tulips') {
          fetched.forEach((p) => {
            if (
              p.authorId === currentUser.uid &&
              !p.isAnonymous &&
              p.authorBadge !== currentUserBadge
            ) {
              updateLocalPostFields(p.id, { authorBadge: currentUserBadge });
              updateDoc(doc(db, 'posts', p.id), {
                authorBadge: currentUserBadge,
                updatedAt: serverTimestamp(),
              }).catch(() => {});
            }
          });
        }
      },
      (err) => {
        setPosts(getLocalPosts());
        setIsLoadingPosts(false);
        handleFirestoreError(err, OperationType.LIST, 'posts');
      }
    );

    return () => unsubPosts();
  }, [isAuthReady, currentUser, hasValidEduAccess, userProfile?.uid]);

  // Subscribe to Marketplace Listings in real time so all users see every marketplace post
  useEffect(() => {
    setMarketplaceListings(getLocalMarketplaceListings());
    if (!isAuthReady || !currentUser || !hasValidEduAccess) return;
    if (!canUseFirestore(currentUser.uid)) return;

    const unsubMarketplace = onSnapshot(
      collection(db, 'marketplace_listings'),
      (snap) => {
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as Omit<MarketplaceListing, 'id'>;
          if (data && data.title && data.authorId) {
            upsertLocalMarketplaceListing({
              id: docSnap.id,
              ...data,
            });
          }
        });
        setMarketplaceListings(getLocalMarketplaceListings());
      },
      () => {
        setMarketplaceListings(getLocalMarketplaceListings());
      }
    );

    return () => unsubMarketplace();
  }, [isAuthReady, currentUser, hasValidEduAccess]);

  // Check Current User Reactions on Posts
  useEffect(() => {
    if (!currentUser || !userProfile || posts.length === 0) return;
    let active = true;
    const localReactMap: Record<string, boolean> = {};
    getLocalReactions().forEach((r) => {
      if (r.userId === currentUser.uid) {
        localReactMap[r.postId] = true;
      }
    });
    setUserReactions(localReactMap);

    const checkReactions = async () => {
      if (!canUseFirestore(currentUser.uid)) return;
      const firestoreFound: Record<string, boolean> = {};
      for (const p of posts.slice(0, 15)) {
        try {
          const rSnap = await getDoc(doc(db, 'posts', p.id, 'reactions', currentUser.uid));
          if (rSnap.exists()) {
            firestoreFound[p.id] = true;
          }
        } catch {
          // Ignore individual read error
        }
      }
      if (active && Object.keys(firestoreFound).length > 0) {
        setUserReactions((prev) => ({ ...firestoreFound, ...prev }));
      }
    };
    checkReactions();
    return () => {
      active = false;
    };
  }, [currentUser?.uid, userProfile?.uid, posts.length]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      // Initiate Supabase Google OAuth first and synchronously on click gesture so popup is never blocked
      try {
        const oauthResult = (await signInWithGoogle()) as {
          session?: { user?: any };
          user?: any;
          cancelled?: boolean;
        } | null;

        const sbUser = oauthResult?.user || oauthResult?.session?.user;
        if (sbUser) {
          const email = getAuthenticatedUserEmail(sbUser);
          const meta = sbUser.user_metadata || {};
          const rawName = meta.full_name || meta.name || email.split('@')[0] || 'MSU Student';
          const rawAvatar = meta.avatar_url || meta.picture || null;

          if (isInstitutionalEduEmail(email)) {
            const resolved = await resolveOriginalUserUid({
              uid: sbUser.id,
              email,
              displayName: rawName,
              photoURL: rawAvatar,
            });
            const sessionPayload = {
              uid: resolved.uid,
              email: resolved.email || email,
              displayName: resolved.displayName || rawName,
              photoURL: resolved.photoURL || rawAvatar,
            };
            try {
              window.localStorage.setItem(
                VERIFIED_EMAIL_SESSION_KEY,
                JSON.stringify(sessionPayload)
              );
              window.sessionStorage.setItem(
                VERIFIED_EMAIL_SESSION_KEY,
                JSON.stringify(sessionPayload)
              );
            } catch {
              // ignore
            }
            setCurrentUser({
              uid: resolved.uid,
              email: resolved.email || email,
              displayName: resolved.displayName || rawName,
              photoURL: resolved.photoURL || rawAvatar,
              emailVerified: true,
            } as User);
          } else {
            setCurrentUser({
              uid: sbUser.id,
              email,
              displayName: rawName,
              photoURL: rawAvatar,
              emailVerified: Boolean(sbUser.email_confirmed_at),
            } as User);
          }
          setIsAuthReady(true);
          return;
        }

        if (oauthResult?.cancelled) {
          return;
        }
      } catch {
        // Fallback to Firebase Google popup if Supabase OAuth throws
        const cred = await signInWithPopup(auth, googleProvider);
        if (cred?.user) {
          const email = getAuthenticatedUserEmail(cred.user);
          if (isInstitutionalEduEmail(email)) {
            const resolved = await resolveOriginalUserUid({
              uid: cred.user.uid,
              email,
              displayName: cred.user.displayName,
              photoURL: cred.user.photoURL,
            });
            const sessionPayload = {
              uid: resolved.uid,
              email: resolved.email || email,
              displayName: resolved.displayName || cred.user.displayName || 'MSU Student',
              photoURL: resolved.photoURL || cred.user.photoURL || null,
            };
            try {
              window.localStorage.setItem(VERIFIED_EMAIL_SESSION_KEY, JSON.stringify(sessionPayload));
              window.sessionStorage.setItem(VERIFIED_EMAIL_SESSION_KEY, JSON.stringify(sessionPayload));
            } catch {
              // ignore
            }
            setCurrentUser({
              ...cred.user,
              uid: resolved.uid,
              email: resolved.email || email,
              displayName: resolved.displayName || cred.user.displayName || 'MSU Student',
              photoURL: resolved.photoURL || cred.user.photoURL || null,
              emailVerified: true,
            } as User);
          } else {
            setCurrentUser(cred.user);
          }
          setIsAuthReady(true);
          return;
        }
      }
    } catch (err) {
      const errCode = (err as { code?: string } | null)?.code || '';
      if (errCode === 'auth/popup-closed-by-user' || errCode === 'auth/cancelled-popup-request') {
        return;
      }
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleVerifiedEmailSignIn = async (rawEmail: string) => {
    const cleaned = rawEmail.trim().toLowerCase();
    if (!isInstitutionalEduEmail(cleaned)) {
      setAuthError('Please enter a valid @s.msumain.edu.ph, .edu.ph, or allowlisted email.');
      return;
    }
    setIsSigningIn(true);
    setAuthError(null);
    try {
      if (auth.currentUser && getAuthenticatedUserEmail(auth.currentUser) !== cleaned) {
        try {
          await signOut(auth);
        } catch {
          // ignore
        }
      }
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user && getAuthenticatedUserEmail(session.user) !== cleaned) {
          await signOutWithSupabase();
        }
      } catch {
        // ignore
      }

      const canonicalEmail = isTulipsEmail(cleaned)
        ? 'delacernaahrene122008@gmail.com'
        : cleaned;
      const deterministicUid = `usr_${canonicalEmail.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)}`;
      const fallbackDisplayName = isTulipsEmail(cleaned)
        ? 'Ahrene Dela Cerna'
        : cleaned.split('@')[0] || 'MSU Student';

      const resolved = await resolveOriginalUserUid({
        uid: deterministicUid,
        email: canonicalEmail,
        displayName: fallbackDisplayName,
        photoURL: null,
      });

      const sessionPayload = {
        uid: resolved.uid,
        email: canonicalEmail,
        displayName: resolved.displayName || fallbackDisplayName,
        photoURL: resolved.photoURL || null,
      };
      try {
        window.localStorage.setItem(VERIFIED_EMAIL_SESSION_KEY, JSON.stringify(sessionPayload));
      } catch {
        // ignore
      }
      try {
        window.sessionStorage.setItem(VERIFIED_EMAIL_SESSION_KEY, JSON.stringify(sessionPayload));
      } catch {
        // ignore
      }
      setCurrentUser({
        uid: resolved.uid,
        email: canonicalEmail,
        displayName: resolved.displayName || fallbackDisplayName,
        photoURL: resolved.photoURL || null,
        emailVerified: true,
      } as User);
      try {
        if (window.localStorage.getItem(`one_msu_referral_submitted_${resolved.uid}`) !== 'true') {
          setShowReferralGateModal(true);
        }
      } catch {
        setShowReferralGateModal(true);
      }
      setIsAuthReady(true);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    if (currentUser && userProfile) {
      const resolvedBadge = resolveUserBadge(userProfile.badge, effectiveEmail);
      const offlinePresence: UserPresence = {
        uid: currentUser.uid,
        nickname: userProfile.nickname.slice(0, 32),
        photoURL: (userProfile.photoURL || '').slice(0, 2048),
        badge: resolvedBadge,
        campus: (userProfile.campus || 'MSU Main Campus - Marawi').slice(0, 80),
        isOnline: false,
        lastSeenMs: Date.now(),
        visibility: 'edu_verified',
        updatedAt: Timestamp.now(),
      };
      upsertLocalPresence(offlinePresence);
      if (canUseFirestore(currentUser.uid)) {
        setDoc(doc(db, 'presence', currentUser.uid), {
          ...offlinePresence,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    }
    try {
      window.localStorage.removeItem(VERIFIED_EMAIL_SESSION_KEY);
      window.sessionStorage.removeItem(VERIFIED_EMAIL_SESSION_KEY);
    } catch {
      // Ignore
    }
    await new Promise((r) => setTimeout(r, 850));
    try {
      await signOutWithSupabase();
    } catch {
      // Ignore
    }
    try {
      await signOut(auth);
    } catch {
      // Ignore
    }
    setCurrentUser(null);
    setIsLoggingOut(false);
  };

  const handleCompleteOnboarding = async (data: {
    nickname: string;
    campus: string;
    bio: string;
    defaultAnonymous: boolean;
    referralSource?: string;
  }) => {
    if (!currentUser) return;
    const rawNick = sanitizeNicknameInput(data.nickname) || data.nickname.trim();
    const cleanedNick = rawNick.length >= 2 ? rawNick.slice(0, 32) : 'msu_student';
    const availability = await checkNicknameAvailability(
      cleanedNick,
      currentUser.uid,
      effectiveEmail
    );
    if (!availability.available) {
      throw new Error(
        availability.reason || `Nickname @${cleanedNick} is already used by another user.`
      );
    }

    const normalizedNickId = availability.normalizedId || normalizeNicknameId(cleanedNick);
    const nowIso = new Date().toISOString();
    const publicRef = doc(db, 'users', currentUser.uid);
    const privateRef = doc(db, 'users_private', currentUser.uid);
    const nickRef = doc(db, 'nicknames', normalizedNickId);

    const displayName = (currentUser.displayName || 'MSU Student').slice(0, 100);
    const photoURL = (currentUser.photoURL || '').slice(0, 2048);
    const assignedBadge = resolveUserBadge(undefined, effectiveEmail);
    const safeDomain = (emailDomain || 's.msumain.edu.ph').slice(0, 64);
    const safeEmail = (
      effectiveEmail ||
      currentUser.email ||
      `${currentUser.uid}@s.msumain.edu.ph`
    )
      .trim()
      .slice(0, 254);
    const safeReferralSource = (data.referralSource || 'Direct / Campus Invite')
      .trim()
      .slice(0, 160);

    try {
      window.localStorage.setItem(`one_msu_referral_submitted_${currentUser.uid}`, 'true');
    } catch {
      // ignore
    }
    setShowReferralGateModal(false);

    const optimisticProfile: UserPublicProfile = {
      uid: currentUser.uid,
      nickname: cleanedNick,
      nicknameUpdatedAt: nowIso,
      googleDisplayName: displayName,
      photoURL,
      emailDomain: safeDomain,
      campus: (data.campus || 'MSU Main Campus - Marawi').slice(0, 80),
      bio: (data.bio || '').slice(0, 280),
      defaultAnonymous: Boolean(data.defaultAnonymous),
      referralSource: safeReferralSource,
      referralSubmittedAt: nowIso,
      badge: assignedBadge,
      isVerifiedStudent: true,
      createdAt: null,
      updatedAt: null,
    };

    // 1. Immediately persist to Supabase (profiles + Auth metadata) and transition UI
    completedOnboardingProfileRef.current = optimisticProfile;
    upsertLocalUser(optimisticProfile, safeEmail);
    setUserProfile(optimisticProfile);
    welcomeCheckedUidRef.current = currentUser.uid;
    void ensureWelcomeMessageForUser(
      currentUser.uid,
      cleanedNick,
      photoURL,
      assignedBadge,
      true
    );

    if (canUseFirestore(currentUser.uid)) {
      // 2. Also mirror public student profile to Firestore in the background
      setDoc(publicRef, {
        uid: currentUser.uid,
        nickname: cleanedNick,
        nicknameUpdatedAt: nowIso,
        googleDisplayName: displayName,
        photoURL,
        emailDomain: safeDomain,
        campus: (data.campus || 'MSU Main Campus - Marawi').slice(0, 80),
        bio: (data.bio || '').slice(0, 280),
        defaultAnonymous: Boolean(data.defaultAnonymous),
        referralSource: safeReferralSource,
        referralSubmittedAt: nowIso,
        badge: assignedBadge,
        isVerifiedStudent: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, `users/${currentUser.uid}`);
      });

      // 3. Reserve nickname & store private email info non-destructively
      if (normalizedNickId.length >= 2) {
        setDoc(nickRef, {
          uid: currentUser.uid,
          nickname: cleanedNick,
          normalizedNickname: normalizedNickId,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }

      getDoc(privateRef)
        .then((privSnap) => {
          if (!privSnap.exists()) {
            return setDoc(privateRef, {
              uid: currentUser.uid,
              email: safeEmail,
              hasCustomPassword: false,
              passwordUpdatedAt: '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          }
        })
        .catch(() => {});
    }
  };

  const handleCreatePost = async (payload: {
    title: string;
    content: string;
    category: PostCategory;
    isAnonymous: boolean;
    attachment: ProcessedAttachment | null;
  }) => {
    if (!currentUser || !userProfile) return;
    const postId = `post_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const postRef = doc(db, 'posts', postId);
    const att = payload.attachment;
    const resolvedBadge = resolveUserBadge(userProfile.badge, effectiveEmail);

    const newPost: Post = {
      id: postId,
      authorId: currentUser.uid,
      authorNickname: payload.isAnonymous ? 'Anonymous Student' : userProfile.nickname,
      authorDisplayName: payload.isAnonymous
        ? 'Anonymous Student'
        : userProfile.googleDisplayName || userProfile.nickname,
      authorPhotoURL: payload.isAnonymous ? '' : userProfile.photoURL,
      authorDomain: userProfile.emailDomain,
      authorBadge: payload.isAnonymous ? 'verified' : resolvedBadge,
      isAnonymous: payload.isAnonymous,
      category: payload.category,
      title: payload.title.slice(0, 160),
      content: payload.content.slice(0, 5000),
      attachmentType: att ? att.attachmentType : 'none',
      attachmentName: att ? att.attachmentName.slice(0, 255) : '',
      attachmentSize: att ? att.attachmentSize : 0,
      attachmentMime: att ? att.attachmentMime.slice(0, 120) : '',
      attachmentDataUrl: att ? att.attachmentDataUrl.slice(0, 750000) : '',
      likesCount: 0,
      commentsCount: 0,
      visibility: 'edu_verified',
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    upsertLocalPost(newPost);
    setPosts(getLocalPosts());

    // If Developer/Admin posts (non-anonymously), notify all registered users AND send an official ONE message in Messenger
    if (
      !payload.isAnonymous &&
      (resolvedBadge === 'developer' || isDeveloperEmail(effectiveEmail))
    ) {
      broadcastAdminPostToAllUsers(newPost, userProfile);

      const allRecipientUids = new Set<string>();
      getLocalUsers().forEach((u) => {
        if (u.uid && u.uid !== currentUser.uid && u.uid !== ONE_OFFICIAL_UID) {
          allRecipientUids.add(u.uid);
        }
      });
      presenceList.forEach((p) => {
        if (p.uid && p.uid !== currentUser.uid && p.uid !== ONE_OFFICIAL_UID) {
          allRecipientUids.add(p.uid);
        }
      });
      const previewSnippet = (
        newPost.title ||
        newPost.content ||
        'New Developer announcement on ONE'
      ).slice(0, 140);
      const oneBroadcastPreview = `📢 Official ONE Update from @${userProfile.nickname}: ${previewSnippet}`.slice(
        0,
        280
      );
      const oneBroadcastText = `📢 Official Announcement from @${userProfile.nickname} (ONE Admin)\n\n${
        newPost.title ? `📌 ${newPost.title}\n\n` : ''
      }${newPost.content || ''}`.slice(0, 2900);

      allRecipientUids.forEach((recipientUid) => {
        const notifId = `notif_devpost_${postId}_${recipientUid}`;
        const devNotif: NotificationItem = {
          id: notifId,
          recipientId: recipientUid,
          actorId: currentUser.uid,
          actorNickname: userProfile.nickname,
          actorPhotoURL: userProfile.photoURL || '',
          actorBadge: 'developer',
          type: 'developer_post',
          targetId: postId,
          previewText: previewSnippet,
          read: false,
          createdAt: Timestamp.now(),
        };
        upsertLocalNotification(devNotif);
        if (canUseFirestore(currentUser.uid)) {
          setDoc(doc(db, 'notifications', notifId), {
            ...devNotif,
            createdAt: serverTimestamp(),
          }).catch(() => {});

          const oneChatId = buildChatId(recipientUid, ONE_OFFICIAL_UID);
          const sortedUids = [recipientUid, ONE_OFFICIAL_UID].sort();
          const isOneUserA = sortedUids[0] === ONE_OFFICIAL_UID;
          const recipientProfile = getLocalUsers().find((u) => u.uid === recipientUid);
          const oneMsgId = `msg_one_post_${postId}_${recipientUid}`.slice(0, 120);

          setDoc(
            doc(db, 'chats', oneChatId),
            {
              participantIds: sortedUids,
              userAId: isOneUserA ? ONE_OFFICIAL_UID : recipientUid,
              userANickname: isOneUserA
                ? ONE_OFFICIAL_NAME
                : recipientProfile?.nickname || 'Student',
              userAPhotoURL: isOneUserA
                ? ONE_LOGO_DATA_URL
                : recipientProfile?.photoURL || '',
              userABadge: isOneUserA
                ? ONE_OFFICIAL_BADGE
                : recipientProfile?.badge || 'verified',
              userBId: isOneUserA ? recipientUid : ONE_OFFICIAL_UID,
              userBNickname: isOneUserA
                ? recipientProfile?.nickname || 'Student'
                : ONE_OFFICIAL_NAME,
              userBPhotoURL: isOneUserA
                ? recipientProfile?.photoURL || ''
                : ONE_LOGO_DATA_URL,
              userBBadge: isOneUserA
                ? recipientProfile?.badge || 'verified'
                : ONE_OFFICIAL_BADGE,
              lastMessage: oneBroadcastPreview,
              lastSenderId: ONE_OFFICIAL_UID,
              lastMessageRead: false,
              lastMessageReadAt: null,
              deletedBy: [],
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          ).catch(() => {});

          setDoc(doc(db, 'chats', oneChatId, 'messages', oneMsgId), {
            chatId: oneChatId,
            participantIds: sortedUids,
            senderId: ONE_OFFICIAL_UID,
            recipientId: recipientUid,
            senderNickname: ONE_OFFICIAL_NAME,
            senderPhotoURL: ONE_LOGO_DATA_URL,
            senderBadge: ONE_OFFICIAL_BADGE,
            text: oneBroadcastText,
            attachmentType: newPost.attachmentType || 'none',
            attachmentName: newPost.attachmentName || '',
            attachmentSize: newPost.attachmentSize || 0,
            attachmentMime: newPost.attachmentMime || '',
            attachmentDataUrl: newPost.attachmentDataUrl || '',
            read: false,
            createdAt: serverTimestamp(),
          }).catch(() => {});
        }
      });
    }

    if (canUseFirestore(currentUser.uid)) {
      setDoc(postRef, {
        authorId: newPost.authorId,
        authorNickname: newPost.authorNickname,
        authorDisplayName: newPost.authorDisplayName,
        authorPhotoURL: newPost.authorPhotoURL,
        authorDomain: newPost.authorDomain,
        authorBadge: newPost.authorBadge,
        isAnonymous: newPost.isAnonymous,
        category: newPost.category,
        title: newPost.title,
        content: newPost.content,
        attachmentType: newPost.attachmentType,
        attachmentName: newPost.attachmentName,
        attachmentSize: newPost.attachmentSize,
        attachmentMime: newPost.attachmentMime,
        attachmentDataUrl: newPost.attachmentDataUrl,
        likesCount: 0,
        commentsCount: 0,
        visibility: 'edu_verified',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, `posts/${postId}`);
      });
    }
  };

  const handleToggleReaction = async (post: Post) => {
    if (!currentUser || !userProfile) return;
    const reactionRef = doc(db, 'posts', post.id, 'reactions', currentUser.uid);
    const postRef = doc(db, 'posts', post.id);
    const localPost = getLocalPosts().find((p) => p.id === post.id) || post;
    const currentlyReacted =
      userReactions[post.id] !== undefined
        ? Boolean(userReactions[post.id])
        : getLocalReactions().some(
            (r) => r.postId === post.id && r.userId === currentUser.uid
          );
    const resolvedBadge = resolveUserBadge(userProfile.badge, effectiveEmail);
    const baseLikes = Math.max(0, Number(localPost.likesCount ?? post.likesCount ?? 0));
    const nextLikesCount = currentlyReacted
      ? Math.max(0, baseLikes - 1)
      : baseLikes + 1;

    setUserReactions((prev) => ({ ...prev, [post.id]: !currentlyReacted }));
    toggleLocalReaction(post.id, currentUser.uid, currentlyReacted, nextLikesCount);
    setPosts(getLocalPosts());

    // Send a real-time notification when liking another user's post
    if (!currentlyReacted && post.authorId !== currentUser.uid) {
      const notifId = `notif_like_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const notifPayload: NotificationItem = {
        id: notifId,
        recipientId: post.authorId,
        actorId: currentUser.uid,
        actorNickname: userProfile.nickname,
        actorPhotoURL: userProfile.photoURL || '',
        actorBadge: resolvedBadge,
        type: 'like',
        targetId: post.id,
        previewText: (post.title || post.content || 'Liked your post').slice(0, 140),
        read: false,
        createdAt: Timestamp.now(),
      };
      upsertLocalNotification(notifPayload);
      if (canUseFirestore(currentUser.uid)) {
        setDoc(doc(db, 'notifications', notifId), {
          ...notifPayload,
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }
    }

    if (canUseFirestore(currentUser.uid)) {
      if (currentlyReacted) {
        deleteDoc(reactionRef).catch((err) => {
          handleFirestoreError(
            err,
            OperationType.DELETE,
            `posts/${post.id}/reactions/${currentUser.uid}`
          );
        });
      } else {
        setDoc(reactionRef, {
          postId: post.id,
          userId: currentUser.uid,
          type: 'damay',
          createdAt: serverTimestamp(),
        }).catch((err) => {
          handleFirestoreError(
            err,
            OperationType.WRITE,
            `posts/${post.id}/reactions/${currentUser.uid}`
          );
        });
      }
      updateDoc(postRef, {
        likesCount: nextLikesCount,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  };

  const handleDeletePost = async (postId: string) => {
    deleteLocalPost(postId);
    setPosts(getLocalPosts());
    if (canUseFirestore()) {
      deleteDoc(doc(db, 'posts', postId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, `posts/${postId}`);
      });
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
  };

  const handleUpdateProfile = async (updates: {
    nickname: string;
    nicknameUpdatedAt: string;
    googleDisplayName?: string;
    photoURL?: string;
    campus: string;
    bio: string;
    defaultAnonymous: boolean;
  }) => {
    if (!currentUser || !userProfile) return;
    const cleanedNick = updates.nickname.trim().slice(0, 32);
    const oldNormId = normalizeNicknameId(userProfile.nickname);
    const newNormId = normalizeNicknameId(cleanedNick);
    const isNickChanged = oldNormId !== newNormId;

    if (isNickChanged) {
      const check = await checkNicknameAvailability(
        cleanedNick,
        currentUser.uid,
        effectiveEmail
      );
      if (!check.available) {
        throw new Error(
          check.reason || `Nickname @${cleanedNick} is already used by another user.`
        );
      }
    }

    const publicRef = doc(db, 'users', currentUser.uid);
    const resolvedBadge = resolveUserBadge(userProfile.badge, effectiveEmail);
    const nextDisplayName = (
      updates.googleDisplayName !== undefined
        ? updates.googleDisplayName.trim() || cleanedNick
        : userProfile.googleDisplayName || currentUser.displayName || 'MSU Student'
    ).slice(0, 100);
    const nextPhotoURL = (
      updates.photoURL !== undefined
        ? updates.photoURL
        : userProfile.photoURL || currentUser.photoURL || ''
    ).slice(0, 350000);

    const updatedProfileLocal: UserPublicProfile = {
      ...userProfile,
      nickname: cleanedNick,
      nicknameUpdatedAt: updates.nicknameUpdatedAt.slice(0, 64),
      googleDisplayName: nextDisplayName,
      photoURL: nextPhotoURL,
      campus: updates.campus.slice(0, 80),
      bio: updates.bio.slice(0, 280),
      defaultAnonymous: updates.defaultAnonymous,
      badge: resolvedBadge,
    };
    completedOnboardingProfileRef.current = updatedProfileLocal;
    upsertLocalUser(updatedProfileLocal, effectiveEmail);
    syncUserProfileToPastContent(updatedProfileLocal);
    upsertLocalPresence({
      uid: currentUser.uid,
      nickname: cleanedNick,
      photoURL: nextPhotoURL,
      badge: resolvedBadge,
      campus: updates.campus.slice(0, 80),
      isOnline: true,
      lastSeenMs: Date.now(),
      visibility: 'edu_verified',
      updatedAt: Timestamp.now(),
    });
    try {
      const updatedSessionPayload = {
        uid: currentUser.uid,
        email: effectiveEmail || currentUser.email,
        displayName: nextDisplayName,
        photoURL: nextPhotoURL || null,
      };
      window.localStorage.setItem(
        VERIFIED_EMAIL_SESSION_KEY,
        JSON.stringify(updatedSessionPayload)
      );
      window.sessionStorage.setItem(
        VERIFIED_EMAIL_SESSION_KEY,
        JSON.stringify(updatedSessionPayload)
      );
    } catch {
      // ignore
    }
    setPosts(getLocalPosts());
    setAvatarFailed(false);
    setUserProfile(updatedProfileLocal);

    if (canUseFirestore(currentUser.uid)) {
      try {
        const batch = writeBatch(db);
        batch.set(
          publicRef,
          {
            uid: currentUser.uid,
            nickname: cleanedNick,
            nicknameUpdatedAt: updates.nicknameUpdatedAt.slice(0, 64),
            googleDisplayName: nextDisplayName,
            photoURL: nextPhotoURL,
            emailDomain: userProfile.emailDomain || emailDomain,
            campus: updates.campus.slice(0, 80),
            bio: updates.bio.slice(0, 280),
            defaultAnonymous: updates.defaultAnonymous,
            role: userProfile.role || 'student',
            badge: resolvedBadge,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        if (isNickChanged) {
          if (oldNormId.length >= 2) {
            batch.delete(doc(db, 'nicknames', oldNormId));
          }
          batch.set(doc(db, 'nicknames', newNormId), {
            uid: currentUser.uid,
            nickname: cleanedNick,
            normalizedNickname: newNormId,
            updatedAt: serverTimestamp(),
          });
        }

        batch.commit().catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
        });

        // Also update all non-anonymous past posts in Firestore so past posts show updated profile
        const myPastPublicPosts = posts.filter(
          (p) => p.authorId === currentUser.uid && !p.isAnonymous
        );
        for (const pastPost of myPastPublicPosts) {
          updateDoc(doc(db, 'posts', pastPost.id), {
            authorNickname: cleanedNick,
            authorDisplayName: nextDisplayName,
            authorPhotoURL: nextPhotoURL,
            authorBadge: resolvedBadge,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }

        setDoc(doc(db, 'presence', currentUser.uid), {
          uid: currentUser.uid,
          nickname: cleanedNick,
          photoURL: nextPhotoURL,
          badge: resolvedBadge,
          campus: updates.campus.slice(0, 80),
          isOnline: true,
          lastSeenMs: Date.now(),
          visibility: 'edu_verified',
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
      }
    }
  };

  const handleRecordPasswordChange = async () => {
    if (!currentUser) return;
    if (canUseFirestore(currentUser.uid)) {
      const privateRef = doc(db, 'users_private', currentUser.uid);
      updateDoc(privateRef, {
        hasCustomPassword: true,
        passwordUpdatedAt: new Date().toISOString(),
        updatedAt: serverTimestamp(),
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, `users_private/${currentUser.uid}`);
      });
    }
  };

  const handleBatchSetPostsAnonymity = async (makeAnonymous: boolean): Promise<number> => {
    if (!currentUser || !userProfile) return 0;
    const myPosts = posts.filter((p) => p.authorId === currentUser.uid);
    const resolvedBadge = resolveUserBadge(userProfile.badge, effectiveEmail);
    let updatedCount = 0;
    for (const p of myPosts) {
      updateLocalPostFields(p.id, {
        isAnonymous: makeAnonymous,
        authorNickname: makeAnonymous ? 'Anonymous Student' : userProfile.nickname,
        authorDisplayName: makeAnonymous
          ? 'Anonymous Student'
          : userProfile.googleDisplayName || userProfile.nickname,
        authorPhotoURL: makeAnonymous ? '' : userProfile.photoURL,
        authorBadge: makeAnonymous ? 'verified' : resolvedBadge,
      });
      updatedCount++;
      if (canUseFirestore(currentUser.uid)) {
        updateDoc(doc(db, 'posts', p.id), {
          isAnonymous: makeAnonymous,
          authorNickname: makeAnonymous ? 'Anonymous Student' : userProfile.nickname,
          authorDisplayName: makeAnonymous
            ? 'Anonymous Student'
            : userProfile.googleDisplayName || userProfile.nickname,
          authorPhotoURL: makeAnonymous ? '' : userProfile.photoURL,
          authorBadge: makeAnonymous ? 'verified' : resolvedBadge,
          updatedAt: serverTimestamp(),
        }).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `posts/${p.id}`);
        });
      }
    }
    setPosts(getLocalPosts());
    return updatedCount;
  };

  const handleDeleteAccountPermanently = async () => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const normNick = userProfile ? normalizeNicknameId(userProfile.nickname) : '';

    const myPosts = posts.filter((p) => p.authorId === uid);
    for (const p of myPosts) {
      deleteLocalPost(p.id);
      if (canUseFirestore(uid)) {
        deleteDoc(doc(db, 'posts', p.id)).catch(() => {});
      }
    }
    deleteLocalUser(uid);

    if (canUseFirestore(uid)) {
      if (normNick.length >= 2) {
        deleteDoc(doc(db, 'nicknames', normNick)).catch(() => {});
      }
      deleteDoc(doc(db, 'presence', uid)).catch(() => {});
      deleteDoc(doc(db, 'users_private', uid)).catch(() => {});
      deleteDoc(doc(db, 'users', uid)).catch(() => {});
    }

    try {
      window.localStorage.removeItem(VERIFIED_EMAIL_SESSION_KEY);
      window.sessionStorage.removeItem(VERIFIED_EMAIL_SESSION_KEY);
    } catch {
      // Ignore
    }

    try {
      await signOutWithSupabase();
    } catch {
      // Ignore
    }

    if (auth.currentUser) {
      try {
        await deleteUser(auth.currentUser);
      } catch {
        await signOut(auth).catch(() => {});
      }
    }
    setCurrentUser(null);
  };

  const handleStartChatWithPeer = (peer: ChatPeerTarget) => {
    if (!currentUser || peer.uid === currentUser.uid) return;
    setActiveChatPeer(peer);
    if (!isMobileScreen && activeTab !== 'chats') {
      // On desktop, pop open the Messenger-style chat window at the bottom-right
      setIsDesktopMessengerOpen(true);
      setIsDesktopMessengerMinimized(false);
    } else {
      setActiveTab('chats');
    }
  };

  const handleMarkNotificationAsRead = async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, read: true } : n))
    );
    markLocalNotificationRead(notificationId);
    if (canUseFirestore(currentUser?.uid)) {
      updateDoc(doc(db, 'notifications', notificationId), {
        read: true,
      }).catch(() => {});
    }
  };

  // Mark all notifications as read using Supabase + local persistence
  const handleMarkAllNotificationsAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (currentUser?.uid) {
      markAllLocalNotificationsRead(currentUser.uid);
    }
    if (userProfile) {
      setChatThreads(getLocalChatThreadsForUser(userProfile));
    }
    if (unread.length === 0) return;

    if (canUseFirestore(currentUser?.uid)) {
      try {
        const batch = writeBatch(db);
        for (const item of unread) {
          batch.update(doc(db, 'notifications', item.id), {
            read: true,
          });
        }
        batch.commit().catch(() => {});
      } catch {
        // Ignore
      }
    }
  };

  // Mark chat thread notifications as read when opening/clicking chat
  const handleMarkChatThreadRead = async (chatId: string, peerUid: string) => {
    if (currentUser?.uid) {
      markLocalChatThreadRead(chatId, currentUser.uid);
    }
    if (userProfile) {
      setChatThreads(getLocalChatThreadsForUser(userProfile));
    }
    if (canUseFirestore(currentUser?.uid)) {
      updateDoc(doc(db, 'chats', chatId), {
        lastMessageRead: true,
        lastMessageReadAt: serverTimestamp(),
      }).catch(() => {});
    }

    const matchingUnread = notifications.filter(
      (n) => n.type === 'message' && !n.read && (n.targetId === chatId || n.actorId === peerUid)
    );
    if (matchingUnread.length === 0) return;

    setNotifications((prev) =>
      prev.map((n) =>
        n.type === 'message' && (n.targetId === chatId || n.actorId === peerUid)
          ? { ...n, read: true }
          : n
      )
    );
    matchingUnread.forEach((item) => markLocalNotificationRead(item.id));

    if (canUseFirestore(currentUser?.uid)) {
      try {
        const batch = writeBatch(db);
        for (const item of matchingUnread) {
          batch.update(doc(db, 'notifications', item.id), {
            read: true,
          });
        }
        batch.commit().catch(() => {});
      } catch {
        // Ignore
      }
    }
  };

  const handleDeleteNotification = async (notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    deleteLocalNotification(notificationId);
    if (canUseFirestore(currentUser?.uid)) {
      deleteDoc(doc(db, 'notifications', notificationId)).catch(() => {});
    }
  };

  const handleSelectPostFromNotification = (targetId?: string) => {
    if (targetId && targetId.startsWith('sug_')) {
      setActiveTab('suggestions');
      return;
    }
    if (targetId && targetId.startsWith('mkt_')) {
      setActiveTab('marketplace');
      return;
    }
    setSelectedCategory('All');
    setSelectedTrendingTopic(null);
    setActiveTab('feed');
  };

  const handleCreateOrUpdateMarketplaceListing = async (
    listing: MarketplaceListing,
    _isEdit: boolean
  ) => {
    upsertLocalMarketplaceListing(listing);
    setMarketplaceListings(getLocalMarketplaceListings());
    if (canUseFirestore(currentUser?.uid)) {
      setDoc(
        doc(db, 'marketplace_listings', listing.id),
        {
          ...listing,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => {});
    }
  };

  const handleUpdateMarketplaceListingStatus = async (
    listingId: string,
    status: MarketplaceStatus
  ) => {
    updateLocalMarketplaceListingFields(listingId, { status });
    setMarketplaceListings(getLocalMarketplaceListings());
    if (canUseFirestore(currentUser?.uid)) {
      updateDoc(doc(db, 'marketplace_listings', listingId), {
        status,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  };

  const handleDeleteMarketplaceListing = async (listingId: string) => {
    deleteLocalMarketplaceListing(listingId);
    setMarketplaceListings(getLocalMarketplaceListings());
    if (canUseFirestore(currentUser?.uid)) {
      deleteDoc(doc(db, 'marketplace_listings', listingId)).catch(() => {});
    }
  };

  const handleSendMarketplaceInquiry = async (
    listing: MarketplaceListing,
    inquiryText: string,
    openChatAfter: boolean
  ) => {
    if (!currentUser || !userProfile || listing.authorId === currentUser.uid) return;
    const chatId = buildChatId(currentUser.uid, listing.authorId);
    const sortedIds = [currentUser.uid, listing.authorId].sort();
    const isCurrentUserA = sortedIds[0] === currentUser.uid;
    const nowTs = Timestamp.now();

    const priceLabel =
      listing.price && listing.price > 0
        ? `₱${listing.price.toLocaleString('en-PH')}`
        : 'Free / Swap';
    const typeTag = listing.listingType === 'sell' ? 'FOR SALE' : 'LOOKING TO BUY';
    const formattedText = `📦 [Marketplace · ${typeTag}: ${listing.title} (${priceLabel})]\n${inquiryText.trim()}`;

    const threadObj: ChatThread = {
      id: chatId,
      participantIds: sortedIds,
      userAId: sortedIds[0],
      userANickname: isCurrentUserA ? userProfile.nickname : listing.authorNickname,
      userAPhotoURL: isCurrentUserA ? userProfile.photoURL || '' : listing.authorPhotoURL || '',
      userABadge: (isCurrentUserA ? currentUserBadge : listing.authorBadge || 'verified') as UserBadge,
      userBId: sortedIds[1],
      userBNickname: isCurrentUserA ? listing.authorNickname : userProfile.nickname,
      userBPhotoURL: isCurrentUserA ? listing.authorPhotoURL || '' : userProfile.photoURL || '',
      userBBadge: (isCurrentUserA ? listing.authorBadge || 'verified' : currentUserBadge) as UserBadge,
      lastMessage: formattedText.slice(0, 280),
      lastSenderId: currentUser.uid,
      lastMessageRead: false,
      createdAt: nowTs,
      updatedAt: nowTs,
    };

    const msgObj: ChatMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      chatId,
      participantIds: sortedIds,
      senderId: currentUser.uid,
      recipientId: listing.authorId,
      senderNickname: userProfile.nickname,
      senderPhotoURL: userProfile.photoURL || '',
      senderBadge: currentUserBadge,
      text: formattedText,
      attachmentType: 'none',
      attachmentName: '',
      attachmentSize: 0,
      attachmentMime: '',
      attachmentDataUrl: '',
      read: false,
      createdAt: nowTs,
    };

    upsertLocalChatThread(threadObj);
    upsertLocalChatMessage(msgObj);

    const notifObj: NotificationItem = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      recipientId: listing.authorId,
      actorId: currentUser.uid,
      actorNickname: userProfile.nickname,
      actorPhotoURL: userProfile.photoURL || '',
      actorBadge: currentUserBadge,
      type: 'message',
      targetId: chatId,
      previewText: `Marketplace inquiry on "${listing.title}": ${inquiryText.trim().slice(0, 120)}`,
      read: false,
      createdAt: nowTs,
    };
    upsertLocalNotification(notifObj);

    const nextInquiries = (listing.inquiriesCount || 0) + 1;
    updateLocalMarketplaceListingFields(listing.id, { inquiriesCount: nextInquiries });
    setMarketplaceListings(getLocalMarketplaceListings());

    if (openChatAfter) {
      handleStartChatWithPeer({
        uid: listing.authorId,
        nickname: listing.authorNickname,
        photoURL: listing.authorPhotoURL || '',
        badge: (listing.authorBadge || 'verified') as UserBadge,
      });
    }
  };

  // Analyze existing post content to identify Trending Topics
  const trendingTopics = useMemo(() => {
    const visiblePosts = posts.filter(
      (p) =>
        !p.isHidden ||
        isDeveloperUser ||
        currentUserBadge === 'moderator' ||
        p.authorId === currentUser?.uid
    );
    if (visiblePosts.length === 0) return [];

    const STOPWORDS = new Set([
      'about', 'after', 'again', 'also', 'always', 'another', 'anyone', 'anything', 'around',
      'because', 'before', 'being', 'between', 'both', 'could', 'does', 'doing', 'done', 'down',
      'during', 'each', 'even', 'every', 'everyone', 'everything', 'from', 'good', 'great',
      'have', 'having', 'here', 'into', 'just', 'know', 'like', 'make', 'many', 'more', 'most',
      'much', 'must', 'need', 'never', 'only', 'other', 'over', 'please', 'really', 'right',
      'same', 'should', 'since', 'some', 'someone', 'something', 'still', 'such', 'take', 'than',
      'that', 'their', 'them', 'then', 'there', 'these', 'they', 'thing', 'things', 'think',
      'this', 'those', 'through', 'time', 'today', 'very', 'want', 'well', 'were', 'what',
      'when', 'where', 'which', 'while', 'with', 'would', 'your', 'para', 'lang', 'naman',
      'kasi', 'kaya', 'pero', 'yung', 'iyan', 'ito', 'dito', 'doon', 'nila', 'namin', 'natin',
      'kayo', 'kami', 'sila', 'tayo', 'siya', 'niya', 'aking', 'iyong', 'mga', 'ang', 'ng', 'sa',
      'na', 'pa', 'ba', 'po', 'opo', 'din', 'rin', 'daw', 'raw', 'kung', 'kapag', 'bakit',
      'paano', 'saan', 'kailan', 'sino', 'ano', 'lahat', 'wala', 'meron', 'may', 'hindi', 'oo',
      'ung', 'nman', 'lng', 'pala', 'talaga', 'grabe', 'sana', 'baka', 'muna', 'ulit', 'ganun',
      'ganito', 'ganyan', 'kanina', 'ngayon', 'bukas', 'kahapon', 'post', 'posts', 'student',
      'students', 'anonymous',
    ]);

    const THEME_RULES: {
      id: string;
      label: string;
      keywords: string[];
    }[] = [
      {
        id: 'theme_exams',
        label: 'Exams & Midterms',
        keywords: ['exam', 'exams', 'midterm', 'midterms', 'finals', 'prelim', 'prelims', 'quiz', 'quizzes'],
      },
      {
        id: 'theme_scholarship',
        label: 'Scholarship & Stipend',
        keywords: ['scholarship', 'stipend', 'allowance', 'ched', 'dost', 'tes', 'cash', 'grant'],
      },
      {
        id: 'theme_enrollment',
        label: 'Enrollment & Portal',
        keywords: ['enroll', 'enrollment', 'enrolment', 'cor', 'portal', 'registrar', 'load', 'adding', 'dropping'],
      },
      {
        id: 'theme_dorm',
        label: 'Dorm & Housing',
        keywords: ['dorm', 'dormitory', 'bhouse', 'boarding', 'roommate', 'cottages', 'water', 'curfew', 'kuryente', 'brownout'],
      },
      {
        id: 'theme_subjects',
        label: 'Subjects & Grades',
        keywords: ['subject', 'subjects', 'course', 'instructor', 'terror', 'grade', 'grades', 'inc', 'tres', 'uno', 'class'],
      },
      {
        id: 'theme_reviewers',
        label: 'Reviewers & Notes',
        keywords: ['reviewer', 'reviewers', 'notes', 'pdf', 'module', 'modules', 'handout', 'syllabus', 'study'],
      },
      {
        id: 'theme_events',
        label: 'Campus Events & Orgs',
        keywords: ['event', 'events', 'intrams', 'intramurals', 'foundation', 'concert', 'org', 'orgs', 'booth', 'assembly'],
      },
      {
        id: 'theme_wifi',
        label: 'Campus WiFi & Library',
        keywords: ['wifi', 'internet', 'signal', 'library', 'canteen', 'shuttle', 'jeep', 'campus'],
      },
    ];

    interface TopicCandidate {
      id: string;
      label: string;
      postIds: Set<string>;
      interactions: number;
      score: number;
      categoryHint: string;
    }

    const candidates = new Map<string, TopicCandidate>();

    const registerMatch = (
      id: string,
      label: string,
      post: Post,
      weightMultiplier = 1
    ) => {
      const existing = candidates.get(id) || {
        id,
        label,
        postIds: new Set<string>(),
        interactions: 0,
        score: 0,
        categoryHint: post.category,
      };
      if (!existing.postIds.has(post.id)) {
        existing.postIds.add(post.id);
        const postInteractions = (post.likesCount || 0) + (post.commentsCount || 0);
        existing.interactions += postInteractions;
        existing.score +=
          (2 + (post.likesCount || 0) * 1.2 + (post.commentsCount || 0) * 1.6) *
          weightMultiplier;
      }
      candidates.set(id, existing);
    };

    visiblePosts.forEach((post) => {
      const combinedText = `${post.title || ''} ${post.content || ''}`;
      const lowerText = combinedText.toLowerCase();

      // 1. Explicit #hashtags in post content
      const hashtags = combinedText.match(/#[a-zA-Z0-9_]{2,28}/g) || [];
      hashtags.forEach((tag) => {
        const cleanTag = tag.toLowerCase();
        registerMatch(`tag_${cleanTag}`, tag, post, 1.5);
      });

      // 2. Semantic campus themes matched in post content
      const words = lowerText
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
      const wordSet = new Set(words);

      THEME_RULES.forEach((theme) => {
        if (theme.keywords.some((kw) => wordSet.has(kw))) {
          registerMatch(theme.id, theme.label, post, 1.35);
        }
      });

      // 3. Frequent meaningful keywords in post titles & content
      const uniqueWordsInPost = new Set(
        words.filter((w) => w.length >= 4 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
      );
      uniqueWordsInPost.forEach((word) => {
        const formatted = word.charAt(0).toUpperCase() + word.slice(1);
        registerMatch(`kw_${word}`, formatted, post, 1.0);
      });

      // 4. Post category distribution
      if (post.category) {
        registerMatch(`cat_${post.category}`, post.category, post, 0.9);
      }
    });

    const allCandidates = Array.from(candidates.values());

    // Prioritize hashtags, semantic themes, and multi-post keywords first, then active categories/keywords
    const multiPostOrTheme = allCandidates
      .filter(
        (c) =>
          c.id.startsWith('tag_') ||
          c.id.startsWith('theme_') ||
          (c.id.startsWith('kw_') && c.postIds.size >= 2)
      )
      .sort((a, b) => b.score - a.score || b.postIds.size - a.postIds.size);

    const selected: TopicCandidate[] = [];
    const usedLabels = new Set<string>();

    for (const item of multiPostOrTheme) {
      const normLabel = item.label.toLowerCase();
      if (!usedLabels.has(normLabel) && selected.length < 6) {
        usedLabels.add(normLabel);
        selected.push(item);
      }
    }

    // Fill remaining slots up to 5 with active categories or top-engaged keywords from existing posts
    if (selected.length < 5) {
      const fallbackPool = allCandidates
        .filter((c) => c.id.startsWith('cat_') || c.id.startsWith('kw_'))
        .sort((a, b) => b.score - a.score || b.postIds.size - a.postIds.size);

      for (const item of fallbackPool) {
        const normLabel = item.label.toLowerCase();
        if (!usedLabels.has(normLabel) && selected.length < 5) {
          usedLabels.add(normLabel);
          selected.push(item);
        }
      }
    }

    return selected.map((item) => ({
      id: item.id,
      label: item.label,
      postsCount: item.postIds.size,
      interactions: item.interactions,
      score: item.score,
      postIds: item.postIds,
      categoryHint: item.categoryHint,
    }));
  }, [posts, isDeveloperUser, currentUserBadge, currentUser?.uid]);

  const filteredPosts = useMemo(() => {
    const activeTopicObj = selectedTrendingTopic
      ? trendingTopics.find((t) => t.id === selectedTrendingTopic || t.label === selectedTrendingTopic)
      : null;

    const allTrendingPostIds = new Set<string>();
    trendingTopics.forEach((t) => {
      t.postIds.forEach((id) => allTrendingPostIds.add(id));
    });

    return posts
      .filter((post) => {
        // Hide posts marked as hidden by Moderator/Developer from regular students
        if (
          post.isHidden &&
          !isDeveloperUser &&
          currentUserBadge !== 'moderator' &&
          post.authorId !== currentUser?.uid
        ) {
          return false;
        }
        if (activeTab === 'my_posts' && post.authorId !== currentUser?.uid) {
          return false;
        }
        if (activeTab === 'files') {
          if (post.attachmentType === 'none' || !post.attachmentName) {
            return false;
          }
          if (
            selectedFileCategoryFilter === 'media' &&
            !['photo', 'video'].includes(post.attachmentType)
          ) {
            return false;
          }
          if (
            selectedFileCategoryFilter !== 'all' &&
            selectedFileCategoryFilter !== 'media' &&
            post.attachmentType !== selectedFileCategoryFilter
          ) {
            return false;
          }
        }
        if (activeTopicObj) {
          if (!activeTopicObj.postIds.has(post.id)) {
            return false;
          }
        } else if (selectedCategory === 'Trending Topics') {
          if (allTrendingPostIds.size > 0 && !allTrendingPostIds.has(post.id)) {
            return false;
          }
        } else if (selectedCategory !== 'All') {
          const normalizedPostCat =
            (post.category as string) === 'Prof & Subjects' ? 'Subjects' : post.category;
          if (normalizedPostCat !== selectedCategory) {
            return false;
          }
        }
        if (formatFilter === 'media' && !['photo', 'video'].includes(post.attachmentType)) {
          return false;
        }
        if (
          formatFilter === 'docs' &&
          !['pdf', 'word', 'excel', 'ppt'].includes(post.attachmentType)
        ) {
          return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const inTitle = post.title.toLowerCase().includes(q);
          const inContent = post.content.toLowerCase().includes(q);
          const inAuthor = post.authorNickname.toLowerCase().includes(q);
          const inFile = post.attachmentName.toLowerCase().includes(q);
          if (!inTitle && !inContent && !inAuthor && !inFile) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aPinned = a.isPinned ? 1 : 0;
        const bPinned = b.isPinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        if (selectedCategory === 'Trending Topics' || activeTopicObj) {
          const aScore = (a.likesCount || 0) * 1.2 + (a.commentsCount || 0) * 1.6;
          const bScore = (b.likesCount || 0) * 1.2 + (b.commentsCount || 0) * 1.6;
          if (bScore !== aScore) return bScore - aScore;
        }
        return 0;
      });
  }, [
    posts,
    activeTab,
    currentUser?.uid,
    selectedCategory,
    selectedTrendingTopic,
    trendingTopics,
    formatFilter,
    selectedFileCategoryFilter,
    searchQuery,
    isDeveloperUser,
    currentUserBadge,
  ]);

  const sharedAttachments = useMemo(() => {
    return posts.filter(
      (p) =>
        p.attachmentType !== 'none' &&
        p.attachmentName &&
        (!p.isHidden ||
          isDeveloperUser ||
          currentUserBadge === 'moderator' ||
          p.authorId === currentUser?.uid)
    );
  }, [posts, isDeveloperUser, currentUserBadge, currentUser?.uid]);

  const fileCategoryCounts = useMemo(() => {
    return {
      total: sharedAttachments.length,
      pdf: sharedAttachments.filter((p) => p.attachmentType === 'pdf').length,
      word: sharedAttachments.filter((p) => p.attachmentType === 'word').length,
      excel: sharedAttachments.filter((p) => p.attachmentType === 'excel').length,
      ppt: sharedAttachments.filter((p) => p.attachmentType === 'ppt').length,
      media: sharedAttachments.filter((p) => ['photo', 'video'].includes(p.attachmentType)).length,
    };
  }, [sharedAttachments]);

  const filteredSharedAttachments = useMemo(() => {
    return sharedAttachments.filter((item) => {
      if (
        selectedFileCategoryFilter === 'media' &&
        !['photo', 'video'].includes(item.attachmentType)
      ) {
        return false;
      }
      if (
        selectedFileCategoryFilter !== 'all' &&
        selectedFileCategoryFilter !== 'media' &&
        item.attachmentType !== selectedFileCategoryFilter
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inName = item.attachmentName.toLowerCase().includes(q);
        const inTitle = item.title.toLowerCase().includes(q);
        const inContent = item.content.toLowerCase().includes(q);
        const inAuthor = item.authorNickname.toLowerCase().includes(q);
        if (!inName && !inTitle && !inContent && !inAuthor) return false;
      }
      return true;
    });
  }, [sharedAttachments, selectedFileCategoryFilter, searchQuery]);

  // =========================================================================
  // 0. IN DEVELOPMENT HOLDING VIEW
  // Defaults to true as requested ("now display only a In Development").
  // Normal visitors see exclusively the "In Development" holding view.
  // Developers and admins can toggle preview to test features or sign in.
  // =========================================================================
  if (inDevelopmentMode) {
    return (
      <InDevelopmentView
        siteName={platformSettings.siteName || 'ONE'}
        isLoggedIn={Boolean(currentUser)}
        currentUserEmail={effectiveEmail}
        onEnterPreview={() => {
          try {
            localStorage.setItem('one_msu_dev_preview_active', 'true');
          } catch {}
          setInDevelopmentMode(false);
        }}
        onDeveloperSignIn={handleGoogleSignIn}
      />
    );
  }

  // =========================================================================
  // 1. OPENING SPLASH SCREEN ANIMATION (ONE)
  // =========================================================================
  if (showSplash || !isAuthReady || isLoadingProfile) {
    return (
      <div className="min-h-screen bg-[#7B1113] flex flex-col items-center justify-center p-6 text-center select-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
          className="space-y-4 flex flex-col items-center"
        >
          <div className="relative w-20 h-20 rounded-2xl bg-[#580B0C] border-2 border-[#D4AF37] flex items-center justify-center shadow-lg">
            <span className="font-display text-4xl text-[#D4AF37] tracking-tight">ONE</span>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-[#F7EFE0]/80 tracking-widest uppercase font-mono">
              Student Wall · MSUan
            </p>
          </div>

          <div className="w-40 h-1 bg-[#580B0C] rounded-full overflow-hidden mt-2">
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: '100%' }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              className="w-full h-full bg-[#D4AF37]"
            />
          </div>
        </motion.div>
      </div>
    );
  }

  // =========================================================================
  // 2. LOG OUT ANIMATION OVERLAY
  // =========================================================================
  if (isLoggingOut) {
    return (
      <div className="min-h-screen bg-[#7B1113] flex flex-col items-center justify-center p-6 text-center text-white">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-4 flex flex-col items-center"
        >
          <div className="relative w-16 h-16 flex items-center justify-center">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37]"
            />
            <LogOut className="w-6 h-6 text-[#D4AF37]" />
          </div>
          <h2 className="font-display text-3xl text-white">Signing Out</h2>
          <p className="text-xs text-[#F7EFE0]/80">Closing your ONE session...</p>
        </motion.div>
      </div>
    );
  }

  if (!currentUser || !hasValidEduAccess) {
    return (
      <AuthGate
        currentUser={currentUser}
        isSigningIn={isSigningIn}
        authError={authError}
        onGoogleSignIn={handleGoogleSignIn}
        onSignOut={handleSignOut}
        onVerifiedEmailSignIn={handleVerifiedEmailSignIn}
        onBackToInDevelopment={() => {
          try {
            localStorage.removeItem('one_msu_dev_preview_active');
          } catch {}
          setInDevelopmentMode(true);
        }}
      />
    );
  }

  if (!userProfile) {
    return (
      <NicknameOnboardingModal
        currentUser={currentUser}
        effectiveEmail={effectiveEmail}
        emailDomain={emailDomain}
        onCompleteOnboarding={handleCompleteOnboarding}
      />
    );
  }

  // After "Continue with Google", ask "Hi MSUan before you proceed where did you find this app ?"
  // and send the answer directly to the Developer & Admin Dashboard
  const handleSubmitReferralGate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingReferral) return;
    const finalSource =
      referralChoice === 'Other'
        ? referralCustomText.trim() || 'Other (MSU Student Referral)'
        : referralChoice;
    const nowIso = new Date().toISOString();
    setIsSavingReferral(true);
    try {
      const updatedUser: UserPublicProfile = {
        ...userProfile,
        referralSource: finalSource.slice(0, 160),
        referralSubmittedAt: nowIso,
      };
      upsertLocalUser(updatedUser, effectiveEmail);
      setUserProfile(updatedUser);
      try {
        window.localStorage.setItem(`one_msu_referral_submitted_${currentUser.uid}`, 'true');
      } catch {
        // ignore
      }
      if (canUseFirestore(currentUser.uid)) {
        setDoc(
          doc(db, 'users', currentUser.uid),
          {
            referralSource: finalSource.slice(0, 160),
            referralSubmittedAt: nowIso,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => {});
      }
    } finally {
      setIsSavingReferral(false);
      setShowReferralGateModal(false);
    }
  };

  const renderReferralGateModal = () => {
    if (!showReferralGateModal) return null;
    return (
      <div className="fixed inset-0 z-[120] bg-black/55 backdrop-blur-xs flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="w-full max-w-md bg-white border border-[#E8DFDC] rounded-2xl overflow-hidden shadow-2xl"
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />
          <form onSubmit={handleSubmitReferralGate} className="p-6 sm:p-7 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#7B1113] text-[#D4AF37] border-2 border-[#D4AF37] flex items-center justify-center shrink-0">
                <span className="font-display text-lg">ONE</span>
              </div>
              <div>
                <p className="text-[11px] font-mono uppercase tracking-wider text-[#7B1113] font-semibold">
                  Quick MSUan Check-In
                </p>
                <h1 className="font-display text-2xl text-[#1F1617] leading-snug">
                  Hi MSUan before you proceed where did you find this app ?
                </h1>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {APP_REFERRAL_OPTIONS.map((opt) => {
                const isSelected = referralChoice === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setReferralChoice(opt)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-medium text-left border transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-[#7B1113] text-white border-[#D4AF37] font-semibold shadow-2xs'
                        : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC] hover:bg-[#F2ECE9]'
                    }`}
                  >
                    <span>{opt}</span>
                    {isSelected && (
                      <span className="text-[10px] font-mono text-[#D4AF37] uppercase">
                        Selected
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {referralChoice === 'Other' && (
              <input
                type="text"
                value={referralCustomText}
                onChange={(e) => setReferralCustomText(e.target.value)}
                maxLength={140}
                placeholder="Type where you found this app..."
                className="w-full px-3.5 py-2.5 text-xs bg-white border border-[#E8DFDC] rounded-xl focus:outline-none focus:border-[#7B1113]"
                required
              />
            )}

            <p className="text-[11px] text-[#6E5D5F]">
              Your response will be sent directly to the Developer &amp; Admin Dashboards.
            </p>

            <button
              type="submit"
              disabled={isSavingReferral}
              className="w-full py-3 px-5 bg-[#7B1113] hover:bg-[#580B0C] disabled:opacity-50 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 border border-[#D4AF37]/40 cursor-pointer"
            >
              <span>{isSavingReferral ? 'Sending to Admin Dashboard...' : 'Proceed to ONE'}</span>
            </button>
          </form>
        </motion.div>
      </div>
    );
  };

  // Enforce Account Ban / Suspension (Developers are never locked out)
  const isAccountBanned = !isDeveloperUser && userProfile.accountStatus === 'banned';
  const isAccountSuspended =
    !isDeveloperUser &&
    userProfile.accountStatus === 'suspended' &&
    (!userProfile.suspendedUntil || new Date(userProfile.suspendedUntil).getTime() > Date.now());

  if (isAccountBanned || isAccountSuspended) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#E8DFDC] rounded-2xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="font-display text-2xl text-[#7B1113]">
            {isAccountBanned ? 'Account Permanently Banned' : 'Account Temporarily Suspended'}
          </h2>
          <p className="text-xs text-[#6E5D5F] leading-relaxed">
            {userProfile.banReason ||
              'Your MSU student account has been restricted by platform moderation due to community rule violations.'}
          </p>
          {isAccountSuspended && userProfile.suspendedUntil && (
            <p className="text-xs font-mono text-[#7B1113] bg-[#FAF8F5] border border-[#E8DFDC] rounded-xl py-2 px-3">
              Suspended until: {new Date(userProfile.suspendedUntil).toLocaleString()}
            </p>
          )}
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full py-2.5 px-4 bg-[#7B1113] text-white text-xs font-semibold rounded-xl cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Enforce Maintenance Mode for non-developer users
  if (platformSettings.maintenanceMode && !isDeveloperUser) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#E8DFDC] rounded-2xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#7B1113] text-[#D4AF37] flex items-center justify-center mx-auto">
            <Wrench className="w-6 h-6" />
          </div>
          <h2 className="font-display text-2xl text-[#7B1113]">
            {platformSettings.siteName || 'ONE'} Maintenance Mode
          </h2>
          <p className="text-xs text-[#6E5D5F] leading-relaxed">
            {platformSettings.maintenanceMessage ||
              'ONE is currently undergoing scheduled maintenance. Please check back shortly.'}
          </p>
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full py-2.5 px-4 bg-[#7B1113] text-white text-xs font-semibold rounded-xl cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const cooldownInfo = getNicknameCooldownInfo(userProfile.nicknameUpdatedAt);
  const unreadInboxCount = chatThreads.filter((t) => {
    if (t.lastMessageRead === true) return false;
    const isUserA = t.userAId === currentUser.uid;
    const peerUid = isUserA ? t.userBId : t.userAId;
    const unreadFromThread =
      Boolean(t.lastSenderId) && t.lastSenderId !== currentUser.uid && t.lastMessageRead === false;
    const unreadFromNotif = notifications.some(
      (n) =>
        n.type === 'message' && !n.read && (n.targetId === t.id || n.actorId === peerUid)
    );
    return unreadFromThread || unreadFromNotif;
  }).length;

  const renderGuidelinesView = () => (
    <div className="bg-white border border-[#E8DFDC] rounded-2xl p-6 space-y-5 dashboard-enter-anim">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-[#7B1113]">ONE Community Rules</h2>
          <p className="text-xs text-[#6E5D5F] mt-0.5">
            Simple rules for all MSU students on ONE.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('feed')}
          className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Student Wall</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-[#6E5D5F]">
        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1">
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
            Every created user receives a <strong>Verified</strong> badge, while the creator holds
            the <strong>Developer</strong> badge.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1">
          <h3 className="text-sm font-semibold text-[#7B1113]">
            2. Unique Nickname Only (No Email Shown)
          </h3>
          <p>
            Your posts only show your unique nickname and badge — your email address is never shown
            on posts. Each nickname is unique and can be changed once every{' '}
            <strong>2 weeks (14 days)</strong>.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1">
          <h3 className="text-sm font-semibold text-[#7B1113]">
            3. Direct Chat &amp; Microsoft File Sharing
          </h3>
          <p>
            Tap <strong>Chat</strong> on any student&apos;s post or in the live{' '}
            <strong>Online MSUans</strong> panel to message them directly and send{' '}
            <strong>Photos</strong>, <strong>Word</strong>, <strong>Excel</strong>,{' '}
            <strong>PowerPoint</strong>, or <strong>PDF</strong> files.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] space-y-1">
          <h3 className="text-sm font-semibold text-[#7B1113]">4. Anonymous Mode &amp; Alerts</h3>
          <p>
            Turn on <strong>Anonymous Mode</strong> anytime to hide your nickname and show the{' '}
            <strong>Anonymous</strong> badge in the feed. Receive instant notifications when
            someone likes or comments on your posts.
          </p>
        </div>
      </div>
    </div>
  );

  const renderFilesDashboardView = () => (
    <div className="space-y-4 dashboard-enter-anim">
      {/* Files & Study Resources Header Banner */}
      <div className="bg-white border border-[#E8DFDC] rounded-2xl overflow-hidden shadow-2xs">
        <div className="h-1.5 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-[#7B1113] text-[#D4AF37] border-2 border-[#D4AF37] flex items-center justify-center shrink-0">
                <FolderOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl text-[#7B1113] leading-none">
                    Files &amp; Study Resources
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#7B1113]/10 text-[#7B1113] font-mono tabular-nums text-xs font-bold">
                    {fileCategoryCounts.total} {fileCategoryCounts.total === 1 ? 'file' : 'files'} shared
                  </span>
                </div>
                <p className="text-xs text-[#6E5D5F] mt-1">
                  Upload and download PDF reviewers, Word handouts, Excel sheets, PowerPoint slides &amp; campus media
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('feed')}
              className="px-3.5 py-2 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Student Wall</span>
            </button>
          </div>

          {/* Interactive File Format Counter Filter Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
            {(
              [
                { id: 'all', label: 'All Files', count: fileCategoryCounts.total },
                { id: 'pdf', label: 'PDF Reviewers', count: fileCategoryCounts.pdf },
                { id: 'word', label: 'Word Docs', count: fileCategoryCounts.word },
                { id: 'excel', label: 'Excel Sheets', count: fileCategoryCounts.excel },
                { id: 'ppt', label: 'PowerPoint', count: fileCategoryCounts.ppt },
                { id: 'media', label: 'Photos & Video', count: fileCategoryCounts.media },
              ] as const
            ).map((card) => {
              const isSelected = selectedFileCategoryFilter === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => setSelectedFileCategoryFilter(card.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1 ${
                    isSelected
                      ? 'bg-[#7B1113] text-white border-[#7B1113] shadow-2xs'
                      : 'bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#1F1617] border-[#E8DFDC]'
                  }`}
                >
                  <span
                    className={`text-[11px] font-medium truncate ${
                      isSelected ? 'text-[#F7EFE0]' : 'text-[#6E5D5F]'
                    }`}
                  >
                    {card.label}
                  </span>
                  <span
                    className={`text-lg font-mono tabular-nums font-bold leading-none ${
                      isSelected ? 'text-[#D4AF37]' : 'text-[#7B1113]'
                    }`}
                  >
                    {card.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Upload / Share a File or Reviewer Directly on Files Dashboard */}
      {platformSettings.allowNewPosts !== false && userProfile.permissions?.canPost !== false ? (
        <PostComposer userProfile={userProfile} onCreatePost={handleCreatePost} />
      ) : (
        <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 text-xs text-[#6E5D5F] text-center">
          Uploading new files is currently disabled by administrator settings.
        </div>
      )}

      {/* Quick Downloadable File Directory */}
      <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F2ECE9] pb-3">
          <div>
            <h3 className="text-sm font-semibold text-[#7B1113]">
              Shared File Directory ({filteredSharedAttachments.length})
            </h3>
            <p className="text-xs text-[#6E5D5F]">
              Click Download on any file or scroll below to view and discuss the full posts
            </p>
          </div>
          {selectedFileCategoryFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedFileCategoryFilter('all')}
              className="px-2.5 py-1 rounded-lg bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] text-xs font-medium text-[#7B1113] cursor-pointer"
            >
              Show All ({fileCategoryCounts.total})
            </button>
          )}
        </div>

        {filteredSharedAttachments.length === 0 ? (
          <div className="py-8 text-center space-y-1.5">
            <p className="text-sm font-semibold text-[#1F1617]">No matching files found</p>
            <p className="text-xs text-[#6E5D5F]">
              Upload a PDF, Word, Excel, PowerPoint, Photo, or Video file above to share with MSUans.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {filteredSharedAttachments.map((item) => {
              const meta = getAttachmentMeta(item.attachmentType);
              return (
                <div
                  key={item.id}
                  className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-[#7B1113]/10 text-[#7B1113] font-mono text-[10px] font-bold shrink-0">
                        {meta.extBadge}
                      </span>
                      <p className="text-xs font-semibold text-[#1F1617] truncate">
                        {item.attachmentName || item.title || 'Shared File'}
                      </p>
                    </div>
                    <p className="text-[11px] text-[#6E5D5F] truncate">
                      @{item.authorNickname} · {item.category} ·{' '}
                      <span className="font-mono tabular-nums">
                        {formatFileSize(item.attachmentSize)}
                      </span>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      triggerAttachmentDownload(item.attachmentDataUrl, item.attachmentName)
                    }
                    className="px-3 py-1.5 rounded-xl bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                    title="Download file"
                  >
                    <Download className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Download</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Full Posts with File Previews & Comments */}
      {filteredPosts.length > 0 && (
        <div className="space-y-4">
          {filteredPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserProfile={userProfile}
              presenceList={presenceList}
              usersList={getLocalUsers()}
              hasReacted={!!userReactions[post.id]}
              onToggleReaction={handleToggleReaction}
              onDeletePost={handleDeletePost}
              onStartChat={handleStartChatWithPeer}
            />
          ))}
        </div>
      )}
    </div>
  );

  // =========================================================================
  // MOBILE LAYOUT (Automatic on mobile viewports < 768px)
  // =========================================================================
  if (isMobileScreen) {
    // Full-screen Mobile Chat Dashboard when chatting with a specific user
    if (activeTab === 'chats' && activeChatPeer) {
      return (
        <ChatDashboard
          currentUserProfile={userProfile}
          threads={chatThreads}
          presenceList={presenceList}
          activePeer={activeChatPeer}
          onSelectPeer={(peer) => setActiveChatPeer(peer)}
          isMobileFullDashboard={true}
          notifications={notifications}
          onMarkChatThreadRead={handleMarkChatThreadRead}
          onMarkAllRead={handleMarkAllNotificationsAsRead}
        />
      );
    }

    return (
      <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#FAF8F5] text-[#1F1617] flex flex-col pb-24">
        {/* Floating Real-Time Incoming Chat Notification Banner */}
        <AnimatePresence>
          {incomingChatAlert && (
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              className="fixed top-2 left-3 right-3 z-50 p-3 bg-[#7B1113] text-white rounded-2xl shadow-xl border-2 border-[#D4AF37] flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0">
                  <img
                    src={resolvePeerAvatar(
                      incomingChatAlert.notification.actorPhotoURL,
                      incomingChatAlert.notification.actorId,
                      incomingChatAlert.notification.actorNickname,
                      incomingChatAlert.notification.actorBadge,
                      studentAvatarFallback
                    )}
                    alt={incomingChatAlert.notification.actorNickname}
                    className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]"
                  />
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#D4AF37] border border-[#7B1113] animate-ping" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <p className="text-xs font-semibold text-[#D4AF37] truncate">
                      {formatPeerDisplayName(
                        incomingChatAlert.notification.actorNickname,
                        incomingChatAlert.notification.actorId,
                        incomingChatAlert.notification.actorBadge
                      )}
                    </p>
                    <UserBadgeTag
                      badge={
                        isOneOfficialAccount(
                          incomingChatAlert.notification.actorId ||
                            incomingChatAlert.notification.actorNickname,
                          incomingChatAlert.notification.actorBadge
                        )
                          ? 'one_official'
                          : incomingChatAlert.notification.actorBadge
                      }
                      size="sm"
                    />
                  </div>
                  <p className="text-xs text-white truncate">
                    {incomingChatAlert.notification.previewText || 'Sent you a message'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const isAlertOne = isOneOfficialAccount(
                      incomingChatAlert.notification.actorId ||
                        incomingChatAlert.notification.actorNickname,
                      incomingChatAlert.notification.actorBadge
                    );
                    handleStartChatWithPeer({
                      uid: incomingChatAlert.notification.actorId,
                      nickname: incomingChatAlert.notification.actorNickname,
                      photoURL: resolvePeerAvatar(
                        incomingChatAlert.notification.actorPhotoURL,
                        incomingChatAlert.notification.actorId,
                        incomingChatAlert.notification.actorNickname,
                        incomingChatAlert.notification.actorBadge,
                        studentAvatarFallback
                      ),
                      badge: isAlertOne
                        ? ONE_OFFICIAL_BADGE
                        : incomingChatAlert.notification.actorBadge,
                    });
                    handleMarkNotificationAsRead(incomingChatAlert.notification.id);
                    setIncomingChatAlert(null);
                  }}
                  className="px-2.5 py-1.5 bg-[#D4AF37] text-[#7B1113] text-xs font-bold rounded-lg cursor-pointer"
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleMarkNotificationAsRead(incomingChatAlert.notification.id);
                    setIncomingChatAlert(null);
                  }}
                  className="p-1.5 text-white/80 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Top Developer Preview Active Bar */}
        <div className="bg-[#580B0C] border-b border-[#D4AF37]/50 text-white px-3 py-1.5 flex items-center justify-between text-xs sticky top-0 z-40 shadow-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse shrink-0" />
            <span className="font-bold text-[#D4AF37] text-[11px] shrink-0">PREVIEW ACTIVE</span>
            <span className="text-[#F7EFE0]/80 text-[10px] truncate">Visitors see In Development</span>
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('one_msu_dev_preview_active');
              } catch {}
              setInDevelopmentMode(true);
            }}
            className="px-2 py-0.5 rounded-lg bg-[#D4AF37] text-[#7B1113] font-bold text-[11px] shrink-0 cursor-pointer"
          >
            Display In Development
          </button>
        </div>

        {/* Mobile Top Bar in MSU Maroon & Gold with Logo + Search Beside Logo */}
        <header className="sticky top-0 z-30 bg-[#7B1113] border-b border-[#D4AF37]/40 text-white">
          <div className="h-[58px] px-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab('feed')}
                className="flex items-center text-left shrink-0 cursor-pointer"
                title={`${platformSettings.siteName || 'ONE'} - Home`}
              >
                <div className="w-9 h-9 rounded-xl bg-[#580B0C] border-2 border-[#D4AF37] flex items-center justify-center shadow-xs">
                  <span className="font-display text-sm text-[#D4AF37] tracking-tight">
                    {platformSettings.logoText || 'ONE'}
                  </span>
                </div>
              </button>

              {/* Search Post, Nickname or Files right beside the Logo */}
              <div className="relative flex-1 min-w-0 max-w-[240px]">
                <Search className="w-3.5 h-3.5 text-[#D4AF37] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (
                      activeTab !== 'feed' &&
                      activeTab !== 'my_posts' &&
                      activeTab !== 'files'
                    ) {
                      setActiveTab('feed');
                    }
                  }}
                  placeholder="Search post, nickname or files..."
                  className="w-full pl-8 pr-6 py-1.5 text-xs bg-[#580B0C] text-white placeholder:text-[#F7EFE0]/65 border border-[#D4AF37]/40 rounded-xl focus:outline-none focus:border-[#D4AF37]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[#F7EFE0]/70 hover:text-white"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {isDeveloperUser && (
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className={`p-2 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer ${
                    activeTab === 'admin' ? 'text-[#1F1617] bg-[#D4AF37]' : 'text-[#D4AF37] bg-[#580B0C]'
                  }`}
                  title="Developer / Admin Controls"
                >
                  <Code2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className={`relative p-2 rounded-lg min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer ${
                  activeTab === 'notifications'
                    ? 'text-[#D4AF37] bg-[#580B0C] border border-[#D4AF37]'
                    : 'text-[#F7EFE0] bg-[#580B0C]/70 border border-[#D4AF37]/30'
                }`}
                title="Notifications"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4 text-[#D4AF37]" />
                {unreadNotificationsCount > 0 && (
                  <span className="ml-1 px-1 py-0.5 rounded-full bg-[#D4AF37] text-[#7B1113] text-[9px] font-mono font-bold leading-none">
                    {unreadNotificationsCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="p-2 text-[#F7EFE0] hover:text-[#D4AF37] min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Scrollable Quick-Navigation Bar */}
          <div className="px-3 py-1.5 bg-[#580B0C]/90 border-t border-[#D4AF37]/20 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [
                { id: 'feed', label: 'Wall Feed', icon: Compass },
                { id: 'marketplace', label: `Marketplace (${marketplaceListings.length})`, icon: ShoppingBag },
                ...(isDeveloperUser
                  ? [{ id: 'admin' as const, label: 'Developer / Admin', icon: Code2 }]
                  : []),
                { id: 'suggestions', label: 'Suggestion Box', icon: Lightbulb },
                { id: 'files', label: `Files (${sharedAttachments.length})`, icon: FolderOpen },
                { id: 'settings', label: 'Settings · About · Terms · Rules', icon: Settings },
              ] as const
            ).map((navItem) => {
              const IconComp = navItem.icon;
              const isCurrent = activeTab === navItem.id;
              return (
                <button
                  key={navItem.id}
                  type="button"
                  onClick={() => {
                    if (navItem.id === 'settings') {
                      setSettingsInitialSection('account');
                    }
                    setActiveTab(navItem.id);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors cursor-pointer min-h-[30px] ${
                    isCurrent
                      ? 'bg-[#D4AF37] text-[#1F1617] font-semibold'
                      : 'text-[#F7EFE0]/90 hover:bg-white/10'
                  }`}
                >
                  <IconComp className="w-3 h-3 shrink-0" />
                  <span>{navItem.label}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* Mobile Main Body */}
        <main className="flex-1 p-3.5 space-y-3.5">
          {activeTab === 'admin' && isDeveloperUser ? (
            <DeveloperAdminDashboard
              currentUserProfile={userProfile}
              currentUserEmail={effectiveEmail}
              posts={posts}
              presenceList={presenceList}
              platformSettings={platformSettings}
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
              onBackToWall={() => setActiveTab('feed')}
            />
          ) : activeTab === 'settings' ? (
            <SettingsView
              userProfile={userProfile}
              userPrivate={userPrivate}
              effectiveEmail={effectiveEmail}
              onUpdateProfile={handleUpdateProfile}
              onRecordPasswordChange={handleRecordPasswordChange}
              onBatchSetPostsAnonymity={handleBatchSetPostsAnonymity}
              onDeleteAccountPermanently={handleDeleteAccountPermanently}
              onNavigateTab={(tab) => {
                if (tab === 'about') {
                  setSettingsInitialSection('about');
                  setActiveTab('settings');
                } else if (tab === 'terms') {
                  setSettingsInitialSection('terms');
                  setActiveTab('settings');
                } else if (tab === 'guidelines') {
                  setSettingsInitialSection('rules');
                  setActiveTab('settings');
                } else {
                  setActiveTab(tab);
                }
              }}
              initialSection={settingsInitialSection}
              onOpenChatWithPeer={handleStartChatWithPeer}
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
              charSize={charSize}
              onChangeCharSize={setCharSize}
            />
          ) : activeTab === 'marketplace' ? (
            <MarketplaceView
              listings={marketplaceListings}
              currentUserUid={currentUser.uid}
              userProfile={userProfile}
              presenceList={presenceList}
              darkMode={isDarkMode}
              isModeratorOrDev={isDeveloperUser || currentUserBadge === 'moderator'}
              onCreateOrUpdateListing={handleCreateOrUpdateMarketplaceListing}
              onUpdateListingStatus={handleUpdateMarketplaceListingStatus}
              onDeleteListing={handleDeleteMarketplaceListing}
              onSendMarketplaceInquiry={handleSendMarketplaceInquiry}
              onStartDirectChatWithPeer={handleStartChatWithPeer}
            />
          ) : activeTab === 'suggestions' ? (
            <SuggestionBoxView currentUserProfile={userProfile} isAdmin={isDeveloperUser} />
          ) : activeTab === 'about' ? (
            <AboutView
              onGoToFeed={() => setActiveTab('feed')}
              onGoToSuggestions={() => setActiveTab('suggestions')}
              onGoToTerms={() => {
                setSettingsInitialSection('terms');
                setActiveTab('settings');
              }}
            />
          ) : activeTab === 'terms' ? (
            <TermsView
              onGoToFeed={() => setActiveTab('feed')}
              onGoToSuggestions={() => setActiveTab('suggestions')}
              onGoToAbout={() => {
                setSettingsInitialSection('about');
                setActiveTab('settings');
              }}
            />
          ) : activeTab === 'files' ? (
            renderFilesDashboardView()
          ) : activeTab === 'notifications' ? (
            <NotificationsPanel
              notifications={notifications}
              onMarkAsRead={handleMarkNotificationAsRead}
              onMarkAllAsRead={handleMarkAllNotificationsAsRead}
              onDeleteNotification={handleDeleteNotification}
              onStartChat={handleStartChatWithPeer}
              onSelectPostNotification={handleSelectPostFromNotification}
            />
          ) : activeTab === 'chats' ? (
            <div className="space-y-3.5">
              <OnlineUsersPanel
                presenceList={presenceList}
                currentUserId={currentUser.uid}
                onStartChat={handleStartChatWithPeer}
                compactMobileBar={true}
              />
              <ChatDashboard
                currentUserProfile={userProfile}
                threads={chatThreads}
                presenceList={presenceList}
                activePeer={activeChatPeer}
                onSelectPeer={(peer) => setActiveChatPeer(peer)}
                isMobileFullDashboard={true}
                notifications={notifications}
                onMarkChatThreadRead={handleMarkChatThreadRead}
                onMarkAllRead={handleMarkAllNotificationsAsRead}
              />
            </div>
          ) : activeTab === 'guidelines' ? (
            renderGuidelinesView()
          ) : (
            <>
              {/* Mobile Profile Strip — Single aligned row on mobile */}
              <div className="bg-white border border-[#E8DFDC] rounded-2xl p-3 flex items-center justify-between gap-2">
                <div
                  onClick={() => {
                    setSettingsInitialSection('account');
                    setActiveTab('settings');
                  }}
                  className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer"
                  title="Tap to edit your profile"
                >
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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-xs min-w-0 max-w-full leading-tight">
                      <span className="font-semibold text-[#1F1617] truncate">
                        @{userProfile.nickname}
                      </span>
                      <UserBadgeTag
                        badge={currentUserBadge}
                        isAnonymous={userProfile.defaultAnonymous}
                        size="sm"
                      />
                    </div>
                    <div className="text-[11px] text-[#6E5D5F] truncate mt-0.5 leading-tight">
                      {userProfile.googleDisplayName &&
                      userProfile.googleDisplayName.toLowerCase() !==
                        userProfile.nickname.toLowerCase()
                        ? `${userProfile.googleDisplayName} · `
                        : ''}
                      {userProfile.campus} · <span className="text-[#7B1113] font-medium">Edit Profile</span>
                    </div>
                    {userProfile.bio && (
                      <div className="text-[11px] text-[#1F1617]/80 truncate mt-0.5 leading-tight">
                        {userProfile.bio}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveTab(activeTab === 'my_posts' ? 'feed' : 'my_posts')
                    }
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border min-h-[36px] whitespace-nowrap cursor-pointer ${
                      activeTab === 'my_posts'
                        ? 'bg-[#7B1113] text-white border-[#7B1113]'
                        : 'bg-[#FAF8F5] text-[#1F1617] border-[#E8DFDC]'
                    }`}
                  >
                    My Post
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMobileComposerSheet(true)}
                    className="px-2.5 py-1.5 bg-[#7B1113] text-white text-xs font-medium rounded-xl flex items-center gap-1 shrink-0 min-h-[36px] whitespace-nowrap cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#D4AF37]" />
                    <span>Post</span>
                  </button>
                </div>
              </div>

              {/* Real-time Online & Offline Users Strip on Mobile Feed (5 visible + swipe) */}
              <OnlineUsersPanel
                presenceList={presenceList}
                currentUserId={currentUser.uid}
                onStartChat={handleStartChatWithPeer}
                compactMobileBar={true}
              />

              {/* Inline Mobile Post Composer so users can type and view all of their post without overlapping */}
              <PostComposer
                userProfile={userProfile}
                onCreatePost={handleCreatePost}
              />

              {/* Mobile Category & Trending Topics Filter Chips */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory('All');
                      setSelectedTrendingTopic(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 min-h-[38px] transition-colors cursor-pointer ${
                      selectedCategory === 'All' && !selectedTrendingTopic
                        ? 'bg-[#7B1113] text-white'
                        : 'bg-white text-[#6E5D5F] border border-[#E8DFDC]'
                    }`}
                  >
                    All
                  </button>

                  {/* Trending Topics Filter Chip on Mobile */}
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedCategory === 'Trending Topics' && !selectedTrendingTopic) {
                        setSelectedCategory('All');
                      } else {
                        setSelectedCategory('Trending Topics');
                        setSelectedTrendingTopic(null);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 min-h-[38px] transition-colors flex items-center gap-1.5 cursor-pointer ${
                      selectedCategory === 'Trending Topics' || Boolean(selectedTrendingTopic)
                        ? 'bg-[#7B1113] text-[#D4AF37] border border-[#D4AF37]'
                        : 'bg-white text-[#7B1113] border border-[#D4AF37]/60'
                    }`}
                  >
                    <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                    <span>Trending Topics</span>
                    {trendingTopics.length > 0 && (
                      <span className="font-mono text-[11px] opacity-90">
                        ({trendingTopics.length})
                      </span>
                    )}
                  </button>

                  {POST_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(cat);
                        setSelectedTrendingTopic(null);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 min-h-[38px] transition-colors cursor-pointer ${
                        selectedCategory === cat && !selectedTrendingTopic
                          ? 'bg-[#7B1113] text-white'
                          : 'bg-white text-[#6E5D5F] border border-[#E8DFDC]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Analyzed Trending Topic Sub-Chips on Mobile */}
                {trendingTopics.length > 0 &&
                  (selectedCategory === 'Trending Topics' || Boolean(selectedTrendingTopic)) && (
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-2.5 bg-white border border-[#E8DFDC] rounded-xl">
                      <span className="text-[11px] font-semibold text-[#7B1113] shrink-0 pr-1">
                        Topics:
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategory('Trending Topics');
                          setSelectedTrendingTopic(null);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                          selectedCategory === 'Trending Topics' && !selectedTrendingTopic
                            ? 'bg-[#7B1113] text-white'
                            : 'bg-[#FAF8F5] text-[#6E5D5F]'
                        }`}
                      >
                        All Trending
                      </button>
                      {trendingTopics.map((topic) => {
                        const isTopicSelected = selectedTrendingTopic === topic.id;
                        return (
                          <button
                            key={topic.id}
                            type="button"
                            onClick={() => {
                              if (isTopicSelected) {
                                setSelectedTrendingTopic(null);
                                setSelectedCategory('Trending Topics');
                              } else {
                                setSelectedTrendingTopic(topic.id);
                                setSelectedCategory('Trending Topics');
                              }
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer transition-colors ${
                              isTopicSelected
                                ? 'bg-[#7B1113] text-[#D4AF37]'
                                : 'bg-[#FAF8F5] text-[#1F1617] hover:bg-[#F2ECE9]'
                            }`}
                          >
                            <span>{topic.label}</span>
                            <span className="font-mono text-[10px] opacity-75">
                              · {topic.postsCount}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
              </div>

              {isLoadingPosts ? (
                <div className="space-y-3">
                  {[1, 2].map((n) => (
                    <div
                      key={n}
                      className="h-36 rounded-2xl bg-white border border-[#E8DFDC] p-4 animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="bg-white border border-[#E8DFDC] rounded-2xl p-6 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#1F1617]">No posts yet</p>
                  <p className="text-xs text-[#6E5D5F]">
                    Share a rant or upload a Photo, Video, PDF, Word, Excel, or PowerPoint file.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowMobileComposerSheet(true)}
                    className="w-full py-2.5 px-4 bg-[#7B1113] text-white text-xs font-medium rounded-xl min-h-[42px] cursor-pointer"
                  >
                    + Create Post
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUserProfile={userProfile}
                      presenceList={presenceList}
                      usersList={getLocalUsers()}
                      hasReacted={!!userReactions[post.id]}
                      onToggleReaction={handleToggleReaction}
                      onDeletePost={handleDeletePost}
                      onStartChat={handleStartChatWithPeer}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        {/* Mobile Full-Screen Scrollable New Post View (Never clips or overlaps when typing with keyboard open) */}
        <AnimatePresence>
          {showMobileComposerSheet && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed inset-0 z-50 bg-[#FAF8F5] flex flex-col overflow-y-auto overscroll-contain"
            >
              <div className="sticky top-0 z-20 px-4 py-3 bg-[#7B1113] text-white border-b border-[#D4AF37]/40 flex items-center justify-between gap-2 shrink-0">
                <span className="font-display text-lg text-[#D4AF37]">Create Post</span>
                <button
                  type="button"
                  onClick={() => setShowMobileComposerSheet(false)}
                  className="px-3 py-1.5 bg-[#580B0C] text-[#F7EFE0] hover:text-white rounded-xl text-xs font-medium border border-[#D4AF37]/40 flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-4 h-4 text-[#D4AF37]" />
                  <span>Close</span>
                </button>
              </div>
              <div className="p-3.5 pb-28 flex-1">
                <PostComposer
                  userProfile={userProfile}
                  onCreatePost={handleCreatePost}
                  onCloseMobileSheet={() => setShowMobileComposerSheet(false)}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Bottom Navigation */}
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-[#E8DFDC] grid grid-cols-5 items-center h-16 px-1"
        >
          <button
            type="button"
            onClick={() => setActiveTab('feed')}
            className={`flex flex-col items-center justify-center min-h-[48px] cursor-pointer ${
              activeTab === 'feed' ? 'text-[#7B1113] font-semibold' : 'text-[#6E5D5F]'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[10px] mt-1">Home</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chats')}
            className={`relative flex flex-col items-center justify-center min-h-[48px] cursor-pointer ${
              activeTab === 'chats' ? 'text-[#7B1113] font-semibold' : 'text-[#6E5D5F]'
            }`}
          >
            <div className="relative">
              <Inbox className="w-5 h-5" />
              {unreadInboxCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#7B1113] text-[#D4AF37] text-[10px] font-mono font-bold flex items-center justify-center">
                  {unreadInboxCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1">Inbox</span>
          </button>

          <button
            type="button"
            onClick={() => setShowMobileComposerSheet(true)}
            className="flex flex-col items-center justify-center min-h-[48px] cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-[#7B1113] text-[#D4AF37] flex items-center justify-center border border-[#D4AF37]/50">
              <Plus className="w-5 h-5" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`relative flex flex-col items-center justify-center min-h-[48px] cursor-pointer ${
              activeTab === 'notifications' ? 'text-[#7B1113] font-semibold' : 'text-[#6E5D5F]'
            }`}
          >
            <div className="relative">
              <Bell className="w-5 h-5" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#7B1113] text-[#D4AF37] text-[10px] font-mono font-bold flex items-center justify-center">
                  {unreadNotificationsCount}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-1">Alerts</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSettingsInitialSection('account');
              setActiveTab('settings');
            }}
            className={`flex flex-col items-center justify-center min-h-[48px] cursor-pointer ${
              activeTab === 'settings' ? 'text-[#7B1113] font-semibold' : 'text-[#6E5D5F]'
            }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-[10px] mt-1">Settings</span>
          </button>
        </nav>
        {renderReferralGateModal()}
      </div>
    );
  }

  // =========================================================================
  // DESKTOP LAYOUT (MSU Maroon & Gold Theme, ONLY Logo Emblem in Header)
  // =========================================================================
  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1F1617] flex flex-col">
      {renderReferralGateModal()}
      {/* Floating Real-Time Incoming Chat Notification Banner */}
      <AnimatePresence>
        {incomingChatAlert && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-4 right-6 z-50 p-4 bg-[#7B1113] text-white rounded-2xl shadow-2xl border-2 border-[#D4AF37] max-w-sm w-full flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0">
                <img
                  src={resolvePeerAvatar(
                    incomingChatAlert.notification.actorPhotoURL,
                    incomingChatAlert.notification.actorId,
                    incomingChatAlert.notification.actorNickname,
                    incomingChatAlert.notification.actorBadge,
                    studentAvatarFallback
                  )}
                  alt={incomingChatAlert.notification.actorNickname}
                  className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]"
                />
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#D4AF37] border border-[#7B1113] animate-ping" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-[#D4AF37] truncate">
                    {formatPeerDisplayName(
                      incomingChatAlert.notification.actorNickname,
                      incomingChatAlert.notification.actorId,
                      incomingChatAlert.notification.actorBadge
                    )}
                  </span>
                  <UserBadgeTag
                    badge={
                      isOneOfficialAccount(
                        incomingChatAlert.notification.actorId ||
                          incomingChatAlert.notification.actorNickname,
                        incomingChatAlert.notification.actorBadge
                      )
                        ? 'one_official'
                        : incomingChatAlert.notification.actorBadge
                    }
                    size="sm"
                  />
                </div>
                <p className="text-xs text-white truncate mt-0.5">
                  {incomingChatAlert.notification.previewText || 'Sent you a message'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const isAlertOne = isOneOfficialAccount(
                    incomingChatAlert.notification.actorId ||
                      incomingChatAlert.notification.actorNickname,
                    incomingChatAlert.notification.actorBadge
                  );
                  handleStartChatWithPeer({
                    uid: incomingChatAlert.notification.actorId,
                    nickname: incomingChatAlert.notification.actorNickname,
                    photoURL: resolvePeerAvatar(
                      incomingChatAlert.notification.actorPhotoURL,
                      incomingChatAlert.notification.actorId,
                      incomingChatAlert.notification.actorNickname,
                      incomingChatAlert.notification.actorBadge,
                      studentAvatarFallback
                    ),
                    badge: isAlertOne
                      ? ONE_OFFICIAL_BADGE
                      : incomingChatAlert.notification.actorBadge,
                  });
                  handleMarkNotificationAsRead(incomingChatAlert.notification.id);
                  setIncomingChatAlert(null);
                }}
                className="px-3 py-1.5 bg-[#D4AF37] hover:bg-[#c09d2e] text-[#7B1113] text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => {
                  handleMarkNotificationAsRead(incomingChatAlert.notification.id);
                  setIncomingChatAlert(null);
                }}
                className="p-1.5 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Developer Preview Active Bar */}
      <div className="bg-[#580B0C] border-b border-[#D4AF37]/50 text-white px-6 py-2 flex items-center justify-between text-xs sticky top-0 z-40 shadow-md">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse shrink-0" />
          <span className="font-bold text-[#D4AF37] shrink-0">DEVELOPER PREVIEW ACTIVE:</span>
          <span className="text-[#F7EFE0]/90 truncate">
            The platform is configured to display ONLY the &quot;In Development&quot; screen to public visitors and students.
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem('one_msu_dev_preview_active');
            } catch {}
            setInDevelopmentMode(true);
          }}
          className="ml-3 px-3 py-1 rounded-lg bg-[#D4AF37] hover:bg-[#c39e2d] text-[#7B1113] font-bold text-xs shrink-0 cursor-pointer transition-colors shadow-xs"
        >
          Exit Preview &amp; Display In Development
        </button>
      </div>

      {/* 3-Zone Top Bar Contract in MSU Maroon & Gold: Logo + Search Beside Logo + Navigation */}
      <header className="flex items-center justify-between gap-4 px-6 py-3 border-b border-[#D4AF37]/40 bg-[#7B1113] text-white sticky top-0 z-30">
        {/* Left Zone: Logo + Search Post, Nickname or Files beside the Logo */}
        <div className="flex items-center gap-3 flex-1 max-w-md min-w-0">
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('feed');
            }}
            className="flex items-center shrink-0 cursor-pointer"
            title={`${platformSettings.siteName || 'ONE'} - Home`}
          >
            <div className="w-10 h-10 rounded-xl bg-[#580B0C] border-2 border-[#D4AF37] flex items-center justify-center shadow-xs">
              <span className="font-display text-lg text-[#D4AF37] tracking-tight">
                {platformSettings.logoText || 'ONE'}
              </span>
            </div>
          </a>

          {/* Search Post, Nickname, or Files directly beside the Logo */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="w-4 h-4 text-[#D4AF37] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (
                  activeTab !== 'feed' &&
                  activeTab !== 'my_posts' &&
                  activeTab !== 'files'
                ) {
                  setActiveTab('feed');
                }
              }}
              placeholder="Search post, nickname or files..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-[#580B0C] text-white placeholder:text-[#F7EFE0]/70 border border-[#D4AF37]/40 rounded-xl focus:outline-none focus:border-[#D4AF37] min-h-[36px] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#F7EFE0]/70 hover:text-white cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <nav className="hidden md:flex flex-wrap items-center gap-4 lg:gap-5 text-sm text-[#F7EFE0]/80">
          <button
            type="button"
            onClick={() => setActiveTab('feed')}
            className={`hover:text-white transition-colors whitespace-nowrap py-1 cursor-pointer ${
              activeTab === 'feed'
                ? 'text-white font-semibold underline underline-offset-8 decoration-[#D4AF37] decoration-2'
                : ''
            }`}
          >
            Home
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('marketplace')}
            className={`hover:text-white transition-colors whitespace-nowrap py-1 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'marketplace'
                ? 'text-white font-semibold underline underline-offset-8 decoration-[#D4AF37] decoration-2'
                : ''
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Marketplace</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[#580B0C] border border-[#D4AF37]/40 text-[#D4AF37] text-[10px] font-mono font-bold leading-none">
              {marketplaceListings.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('suggestions')}
            className={`hover:text-white transition-colors whitespace-nowrap py-1 flex items-center gap-1 cursor-pointer ${
              activeTab === 'suggestions'
                ? 'text-white font-semibold underline underline-offset-8 decoration-[#D4AF37] decoration-2'
                : ''
            }`}
          >
            <Lightbulb className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Suggestion Box</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`hover:text-white transition-colors whitespace-nowrap py-1 flex items-center gap-1 cursor-pointer ${
              activeTab === 'files'
                ? 'text-white font-semibold underline underline-offset-8 decoration-[#D4AF37] decoration-2'
                : ''
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Files ({sharedAttachments.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSettingsInitialSection('account');
              setActiveTab('settings');
            }}
            className={`hover:text-white transition-colors whitespace-nowrap py-1 flex items-center gap-1 cursor-pointer ${
              activeTab === 'settings'
                ? 'text-white font-semibold underline underline-offset-8 decoration-[#D4AF37] decoration-2'
                : ''
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Setting</span>
          </button>

          {isDeveloperUser && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
                activeTab === 'admin'
                  ? 'bg-[#D4AF37] text-[#1F1617] font-bold border-[#D4AF37]'
                  : 'bg-[#580B0C] text-[#D4AF37] border-[#D4AF37]/50 hover:bg-[#420708]'
              }`}
              title="Developer & Admin Controls"
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Admin Controls</span>
            </button>
          )}
        </nav>

        <div className="flex items-center gap-2.5">
          {/* Desktop Live Online Users Counter */}
          <div
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#580B0C] border border-[#D4AF37]/30 text-xs font-mono text-[#F7EFE0]"
            title="Real-time online MSUans"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{onlineUsersCount} online</span>
          </div>

          {/* Notification Icon right beside Sign Out (notification icon - sign out) */}
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            title="Notifications"
            aria-label="Notifications"
            className={`relative p-2 rounded-lg transition-colors flex items-center justify-center cursor-pointer border min-h-[36px] min-w-[36px] ${
              activeTab === 'notifications'
                ? 'bg-[#580B0C] text-[#D4AF37] border-[#D4AF37]'
                : 'bg-[#580B0C] hover:bg-[#420708] text-[#F7EFE0] border-[#D4AF37]/40 hover:text-white'
            }`}
          >
            <Bell className="w-4 h-4 text-[#D4AF37]" />
            {unreadNotificationsCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[#D4AF37] text-[#7B1113] text-[10px] font-mono font-bold leading-none">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="px-3.5 py-1.5 text-xs font-medium text-[#F7EFE0] hover:text-white bg-[#580B0C] hover:bg-[#420708] border border-[#D4AF37]/40 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap min-h-[36px] cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container (Full-bleed when Full Inbox or Developer Admin Dashboard is open on desktop) */}
      <div
        className={`flex-1 w-full mx-auto ${
          activeTab === 'chats'
            ? 'max-w-full px-3 sm:px-5 py-3 flex flex-col'
            : activeTab === 'admin' && isDeveloperUser
            ? 'max-w-[1440px] px-4 sm:px-6 py-6 flex flex-col'
            : 'max-w-[1280px] px-4 sm:px-6 py-6 grid grid-cols-12 gap-6 items-start'
        }`}
      >
        {/* Left Sidebar: Student Nickname Profile & Topics (Hidden when Full Inbox or Admin dashboard is open) */}
        {activeTab !== 'chats' && !(activeTab === 'admin' && isDeveloperUser) && (
        <aside className="col-span-12 lg:col-span-3 space-y-5 lg:sticky lg:top-20">
          <div className="bg-white border border-[#E8DFDC] rounded-2xl overflow-hidden">
            <div className="h-1.5 w-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]" />
            <div className="p-5 space-y-4">
              <div
                onClick={() => {
                  setSettingsInitialSection('account');
                  setActiveTab('settings');
                }}
                className="flex items-center gap-3 cursor-pointer group"
                title="Click to edit your profile, photo, and nickname"
              >
                <div className="relative shrink-0">
                  <img
                    src={
                      userProfile.photoURL && !avatarFailed
                        ? userProfile.photoURL
                        : studentAvatarFallback
                    }
                    alt={userProfile.nickname}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-11 h-11 rounded-full object-cover border-2 border-[#D4AF37] group-hover:opacity-90 transition-opacity"
                  />
                  <span
                    title="Online now"
                    className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 min-w-0 max-w-full">
                    <span className="text-sm font-semibold text-[#1F1617] group-hover:text-[#7B1113] truncate transition-colors">
                      @{userProfile.nickname}
                    </span>
                    <UserBadgeTag
                      badge={currentUserBadge}
                      isAnonymous={userProfile.defaultAnonymous}
                      size="sm"
                    />
                  </div>
                  {userProfile.googleDisplayName &&
                    userProfile.googleDisplayName.toLowerCase() !==
                      userProfile.nickname.toLowerCase() && (
                      <div className="text-xs font-medium text-[#1F1617] truncate mt-0.5">
                        {userProfile.googleDisplayName}
                      </div>
                    )}
                  <div className="text-xs text-[#6E5D5F] truncate mt-0.5">
                    {userProfile.campus} · <span className="text-[#7B1113] font-medium underline">Edit Profile</span>
                  </div>
                  {userProfile.bio && (
                    <p className="text-[11px] text-[#6E5D5F] line-clamp-2 mt-1 leading-snug">
                      {userProfile.bio}
                    </p>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-[#F2ECE9] space-y-1.5 text-xs text-[#6E5D5F]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[#7B1113]" />
                    <span>Nickname change</span>
                  </span>
                  <span className="font-mono tabular-nums text-[#1F1617]">
                    {cooldownInfo.canChange ? 'Ready' : `${cooldownInfo.daysRemaining}d left`}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    {userProfile.defaultAnonymous ? (
                      <EyeOff className="w-3.5 h-3.5 text-[#7B1113]" />
                    ) : (
                      <Eye className="w-3.5 h-3.5 text-[#7B1113]" />
                    )}
                    <span>Default post</span>
                  </span>
                  <span className="text-[#1F1617] font-medium">
                    {userProfile.defaultAnonymous ? 'Anonymous' : 'Public'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsDesktopMessengerOpen(true);
                    setIsDesktopMessengerMinimized(false);
                  }}
                  className="py-2 px-3 bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 min-h-[36px] cursor-pointer"
                  title="Open Messages"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Messages</span>
                  {unreadInboxCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-[#7B1113] text-[#D4AF37] text-[10px] font-mono font-bold leading-none">
                      {unreadInboxCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab(activeTab === 'my_posts' ? 'feed' : 'my_posts');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-1.5 min-h-[36px] cursor-pointer border ${
                    activeTab === 'my_posts'
                      ? 'bg-[#7B1113] text-white border-[#7B1113]'
                      : 'bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border-[#E8DFDC]'
                  }`}
                  title="View My Posts"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>My Post</span>
                </button>
              </div>
            </div>
          </div>

          {/* Topics */}
          <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 space-y-1">
            <div className="px-2.5 pb-2 text-xs font-semibold text-[#7B1113]">Topics</div>
            {(['All', ...POST_CATEGORIES] as const).map((cat) => {
              const isSelected =
                selectedCategory === cat &&
                (activeTab === 'feed' || activeTab === 'my_posts' || activeTab === 'files');
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setSelectedCategory(cat);
                    setSelectedTrendingTopic(null);
                    if (
                      activeTab === 'settings' ||
                      activeTab === 'guidelines' ||
                      activeTab === 'notifications' ||
                      activeTab === 'suggestions' ||
                      activeTab === 'marketplace' ||
                      activeTab === 'about' ||
                      activeTab === 'terms'
                    ) {
                      setActiveTab('feed');
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between min-h-[36px] cursor-pointer ${
                    isSelected
                      ? 'bg-[#7B1113] text-white'
                      : 'text-[#6E5D5F] hover:bg-[#FAF8F5]'
                  }`}
                >
                  <span className="truncate">{cat === 'All' ? 'All Posts' : cat}</span>
                  <span
                    className={`font-mono tabular-nums text-[11px] ${
                      isSelected ? 'text-[#D4AF37]' : 'text-[#6E5D5F]'
                    }`}
                  >
                    {cat === 'All'
                      ? posts.length
                      : posts.filter((p) => p.category === cat).length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Community & Settings Shortcuts */}
          <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 space-y-1">
            <div className="px-2.5 pb-2 text-xs font-semibold text-[#7B1113]">Community &amp; Settings</div>
            {isDeveloperUser && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between min-h-[36px] cursor-pointer bg-[#7B1113]/10 text-[#7B1113] hover:bg-[#7B1113] hover:text-white mb-1"
              >
                <span className="flex items-center gap-2">
                  <Code2 className="w-3.5 h-3.5 shrink-0 text-[#7B1113] group-hover:text-[#D4AF37]" />
                  <span>Developer / Admin Controls</span>
                </span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between min-h-[36px] cursor-pointer ${
                activeTab === 'marketplace'
                  ? 'bg-[#7B1113] text-white'
                  : 'text-[#7B1113] bg-[#FAF8F5] hover:bg-[#F2ECE9]'
              }`}
            >
              <span className="flex items-center gap-2">
                <ShoppingBag
                  className={`w-3.5 h-3.5 shrink-0 ${
                    activeTab === 'marketplace' ? 'text-[#D4AF37]' : 'text-[#7B1113]'
                  }`}
                />
                <span>Campus Marketplace</span>
              </span>
              <span
                className={`font-mono text-[11px] ${
                  activeTab === 'marketplace' ? 'text-[#D4AF37]' : 'text-[#6E5D5F]'
                }`}
              >
                {marketplaceListings.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('files')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center justify-between min-h-[36px] cursor-pointer ${
                activeTab === 'files'
                  ? 'bg-[#7B1113] text-white'
                  : 'text-[#6E5D5F] hover:bg-[#FAF8F5]'
              }`}
            >
              <span className="flex items-center gap-2">
                <FolderOpen
                  className={`w-3.5 h-3.5 shrink-0 ${
                    activeTab === 'files' ? 'text-[#D4AF37]' : 'text-[#7B1113]'
                  }`}
                />
                <span>Files &amp; Study Reviewers</span>
              </span>
              <span
                className={`font-mono tabular-nums text-[11px] ${
                  activeTab === 'files' ? 'text-[#D4AF37]' : 'text-[#6E5D5F]'
                }`}
              >
                {fileCategoryCounts.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('suggestions')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 min-h-[36px] cursor-pointer ${
                activeTab === 'suggestions'
                  ? 'bg-[#7B1113] text-white'
                  : 'text-[#6E5D5F] hover:bg-[#FAF8F5]'
              }`}
            >
              <Lightbulb
                className={`w-3.5 h-3.5 shrink-0 ${
                  activeTab === 'suggestions' ? 'text-[#D4AF37]' : 'text-[#7B1113]'
                }`}
              />
              <span>Suggestion Box</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSettingsInitialSection('support');
                setActiveTab('settings');
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 min-h-[36px] cursor-pointer ${
                activeTab === 'settings' && settingsInitialSection === 'support'
                  ? 'bg-[#7B1113] text-white'
                  : 'text-[#6E5D5F] hover:bg-[#FAF8F5]'
              }`}
            >
              <LifeBuoy
                className={`w-3.5 h-3.5 shrink-0 ${
                  activeTab === 'settings' && settingsInitialSection === 'support'
                    ? 'text-[#D4AF37]'
                    : 'text-[#7B1113]'
                }`}
              />
              <span>Contact Support (Settings)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSettingsInitialSection('about');
                setActiveTab('settings');
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 min-h-[36px] cursor-pointer ${
                activeTab === 'settings' && settingsInitialSection === 'about'
                  ? 'bg-[#7B1113] text-white'
                  : 'text-[#6E5D5F] hover:bg-[#FAF8F5]'
              }`}
            >
              <Info
                className={`w-3.5 h-3.5 shrink-0 ${
                  activeTab === 'settings' && settingsInitialSection === 'about'
                    ? 'text-[#D4AF37]'
                    : 'text-[#7B1113]'
                }`}
              />
              <span>About Us (Settings)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSettingsInitialSection('terms');
                setActiveTab('settings');
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 min-h-[36px] cursor-pointer ${
                activeTab === 'settings' && settingsInitialSection === 'terms'
                  ? 'bg-[#7B1113] text-white'
                  : 'text-[#6E5D5F] hover:bg-[#FAF8F5]'
              }`}
            >
              <FileText
                className={`w-3.5 h-3.5 shrink-0 ${
                  activeTab === 'settings' && settingsInitialSection === 'terms'
                    ? 'text-[#D4AF37]'
                    : 'text-[#7B1113]'
                }`}
              />
              <span>Terms (Settings)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSettingsInitialSection('rules');
                setActiveTab('settings');
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 min-h-[36px] cursor-pointer ${
                activeTab === 'settings' && settingsInitialSection === 'rules'
                  ? 'bg-[#7B1113] text-white'
                  : 'text-[#6E5D5F] hover:bg-[#FAF8F5]'
              }`}
            >
              <BookOpen
                className={`w-3.5 h-3.5 shrink-0 ${
                  activeTab === 'settings' && settingsInitialSection === 'rules'
                    ? 'text-[#D4AF37]'
                    : 'text-[#7B1113]'
                }`}
              />
              <span>Community Rules (Settings)</span>
            </button>
          </div>
        </aside>
        )}

        {/* Center Main Column */}
        <main
          className={`${
            activeTab === 'chats' || (activeTab === 'admin' && isDeveloperUser)
              ? 'w-full flex-1 flex flex-col'
              : 'col-span-12 lg:col-span-6 space-y-4'
          }`}
        >
          {/* Global System Notice & Announcement Banners from Website Controls */}
          {platformSettings.systemNoticeActive && platformSettings.systemNoticeText && (
            <div
              className={`rounded-2xl p-3.5 border flex items-start gap-2.5 text-xs ${
                platformSettings.systemNoticeType === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : platformSettings.systemNoticeType === 'urgent'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-[#FAF8F5] border-[#D4AF37] text-[#1F1617]'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-[#7B1113] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-[#7B1113]">System Notice</p>
                <p className="leading-relaxed">{platformSettings.systemNoticeText}</p>
              </div>
            </div>
          )}

          {platformSettings.announcementActive && platformSettings.announcementText && (
            <div className="rounded-2xl p-4 bg-gradient-to-r from-[#7B1113] to-[#580B0C] text-white border border-[#D4AF37]/50 flex items-start gap-3 shadow-xs">
              <div className="w-8 h-8 rounded-xl bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                <Megaphone className="w-4 h-4 text-[#D4AF37]" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <p className="text-xs font-bold text-[#D4AF37] uppercase tracking-wider font-mono">
                  {platformSettings.announcementTitle || 'Campus Announcement'}
                </p>
                <p className="text-xs text-[#F7EFE0] leading-relaxed">
                  {platformSettings.announcementText}
                </p>
              </div>
            </div>
          )}

          {/* Active Moderation Warning Notice for Current User */}
          {(userProfile.warningCount || 0) > 0 && (
            <div className="rounded-2xl p-3.5 bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5 text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-amber-900">
                  Moderation Warning ({userProfile.warningCount})
                </p>
                <p className="text-amber-800">
                  {userProfile.banReason ||
                    'Please review the ONE Community Rules to keep your MSU student account in good standing.'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'admin' && isDeveloperUser ? (
            <DeveloperAdminDashboard
              currentUserProfile={userProfile}
              currentUserEmail={effectiveEmail}
              posts={posts}
              presenceList={presenceList}
              platformSettings={platformSettings}
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
              onBackToWall={() => setActiveTab('feed')}
            />
          ) : activeTab === 'settings' ? (
            <SettingsView
              userProfile={userProfile}
              userPrivate={userPrivate}
              effectiveEmail={effectiveEmail}
              onUpdateProfile={handleUpdateProfile}
              onRecordPasswordChange={handleRecordPasswordChange}
              onBatchSetPostsAnonymity={handleBatchSetPostsAnonymity}
              onDeleteAccountPermanently={handleDeleteAccountPermanently}
              onNavigateTab={(tab) => {
                if (tab === 'about') {
                  setSettingsInitialSection('about');
                  setActiveTab('settings');
                } else if (tab === 'terms') {
                  setSettingsInitialSection('terms');
                  setActiveTab('settings');
                } else if (tab === 'guidelines') {
                  setSettingsInitialSection('rules');
                  setActiveTab('settings');
                } else {
                  setActiveTab(tab);
                }
              }}
              initialSection={settingsInitialSection}
              onOpenChatWithPeer={handleStartChatWithPeer}
              isDarkMode={isDarkMode}
              onToggleDarkMode={() => setIsDarkMode((prev) => !prev)}
              charSize={charSize}
              onChangeCharSize={setCharSize}
            />
          ) : activeTab === 'marketplace' ? (
            <MarketplaceView
              listings={marketplaceListings}
              currentUserUid={currentUser.uid}
              userProfile={userProfile}
              presenceList={presenceList}
              darkMode={isDarkMode}
              isModeratorOrDev={isDeveloperUser || currentUserBadge === 'moderator'}
              onCreateOrUpdateListing={handleCreateOrUpdateMarketplaceListing}
              onUpdateListingStatus={handleUpdateMarketplaceListingStatus}
              onDeleteListing={handleDeleteMarketplaceListing}
              onSendMarketplaceInquiry={handleSendMarketplaceInquiry}
              onStartDirectChatWithPeer={handleStartChatWithPeer}
            />
          ) : activeTab === 'suggestions' ? (
            <SuggestionBoxView currentUserProfile={userProfile} isAdmin={isDeveloperUser} />
          ) : activeTab === 'about' ? (
            <AboutView
              onGoToFeed={() => setActiveTab('feed')}
              onGoToSuggestions={() => setActiveTab('suggestions')}
              onGoToTerms={() => setActiveTab('terms')}
            />
          ) : activeTab === 'terms' ? (
            <TermsView
              onGoToFeed={() => setActiveTab('feed')}
              onGoToSuggestions={() => setActiveTab('suggestions')}
              onGoToAbout={() => setActiveTab('about')}
            />
          ) : activeTab === 'files' ? (
            renderFilesDashboardView()
          ) : activeTab === 'notifications' ? (
            <NotificationsPanel
              notifications={notifications}
              onMarkAsRead={handleMarkNotificationAsRead}
              onMarkAllAsRead={handleMarkAllNotificationsAsRead}
              onDeleteNotification={handleDeleteNotification}
              onStartChat={handleStartChatWithPeer}
              onSelectPostNotification={handleSelectPostFromNotification}
            />
          ) : activeTab === 'chats' ? (
            <ChatDashboard
              currentUserProfile={userProfile}
              threads={chatThreads}
              presenceList={presenceList}
              activePeer={activeChatPeer}
              onSelectPeer={(peer) => setActiveChatPeer(peer)}
              isMobileFullDashboard={false}
              isDesktopFullDashboard={true}
              onCloseFullDashboard={() => setActiveTab('feed')}
              onMinimizeToPopup={() => {
                setActiveTab('feed');
                setIsDesktopMessengerOpen(true);
                setIsDesktopMessengerMinimized(false);
              }}
              notifications={notifications}
              onMarkChatThreadRead={handleMarkChatThreadRead}
              onMarkAllRead={handleMarkAllNotificationsAsRead}
            />
          ) : activeTab === 'guidelines' ? (
            renderGuidelinesView()
          ) : (
            <>
              {platformSettings.allowNewPosts !== false &&
              userProfile.permissions?.canPost !== false ? (
                <PostComposer userProfile={userProfile} onCreatePost={handleCreatePost} />
              ) : (
                <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 text-xs text-[#6E5D5F] text-center">
                  Creating new posts is currently disabled by administrator settings.
                </div>
              )}

              {/* Campus Marketplace Live Showcase Banner on Feed so all users can see Marketplace posts */}
              {activeTab === 'feed' && (
                <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 space-y-3 shadow-2xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-[#7B1113] text-[#D4AF37] flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-[#7B1113] flex items-center gap-1.5">
                          <span>Campus Marketplace</span>
                          <span className="px-1.5 py-0.5 rounded-full bg-[#7B1113]/10 text-[#7B1113] font-mono text-[10px]">
                            {marketplaceListings.length} active
                          </span>
                        </h3>
                        <p className="text-[11px] text-[#6E5D5F]">
                          Buy &amp; sell textbooks, calculators, uniforms, or dorm items with verified MSUans
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('marketplace')}
                      className="px-3 py-1.5 rounded-xl bg-[#7B1113] hover:bg-[#580B0C] text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors"
                    >
                      Open Marketplace
                    </button>
                  </div>

                  {marketplaceListings.length > 0 && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      {marketplaceListings.slice(0, 4).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setActiveTab('marketplace')}
                          className="p-2.5 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] flex items-center justify-between gap-2.5 text-left cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                className="w-11 h-11 rounded-lg object-cover border border-[#E8DFDC] shrink-0 bg-white"
                              />
                            ) : (
                              <div className="w-11 h-11 rounded-lg bg-[#7B1113]/10 text-[#7B1113] flex items-center justify-center shrink-0">
                                <ShoppingBag className="w-4 h-4" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                                    item.listingType === 'sell'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-900'
                                  }`}
                                >
                                  {item.listingType === 'sell' ? 'Sell' : 'Buy'}
                                </span>
                                <p className="text-xs font-semibold text-[#1F1617] truncate">
                                  {item.title}
                                </p>
                              </div>
                              <p className="text-[11px] text-[#6E5D5F] truncate mt-0.5">
                                @{item.authorNickname} · {item.campus}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold font-mono text-[#7B1113] shrink-0">
                            {item.price && item.price > 0
                              ? `₱${item.price.toLocaleString('en-PH')}`
                              : 'Free/Swap'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* File & Format Filter Bar (Search is now beside the Logo in the Top Bar) */}
              <div className="bg-white border border-[#E8DFDC] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2 text-xs text-[#6E5D5F]">
                  <span className="font-semibold text-[#7B1113]">Feed Filter</span>
                  {searchQuery.trim() && (
                    <span className="px-2 py-0.5 rounded-lg bg-[#FAF8F5] border border-[#E8DFDC] text-[#1F1617] font-mono">
                      Searching: &ldquo;{searchQuery}&rdquo;
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'media', label: 'Photos & Videos' },
                      { id: 'docs', label: 'Docs (PDF/Office)' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setFormatFilter(tab.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap min-h-[34px] cursor-pointer ${
                        formatFilter === tab.id
                          ? 'bg-[#7B1113] text-white'
                          : 'text-[#6E5D5F] hover:bg-[#FAF8F5]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feed Posts */}
              {isLoadingPosts ? (
                <div className="space-y-4">
                  {[1, 2].map((n) => (
                    <div
                      key={n}
                      className="h-44 rounded-2xl bg-white border border-[#E8DFDC] p-5 animate-pulse"
                    />
                  ))}
                </div>
              ) : filteredPosts.length === 0 ? (
                <div className="bg-white border border-[#E8DFDC] rounded-2xl p-10 text-center space-y-2">
                  <h3 className="font-display text-2xl text-[#7B1113]">No posts yet</h3>
                  <p className="text-xs text-[#6E5D5F] max-w-sm mx-auto">
                    Write the first post or upload a Photo, Video, PDF, Word, Excel, or PowerPoint
                    file above.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredPosts.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      currentUserProfile={userProfile}
                      presenceList={presenceList}
                      usersList={getLocalUsers()}
                      hasReacted={!!userReactions[post.id]}
                      onToggleReaction={handleToggleReaction}
                      onDeletePost={handleDeletePost}
                      onStartChat={handleStartChatWithPeer}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </main>

        {/* Right Sidebar: Trending Topics + Real-time Online Users + Shared Files */}
        {activeTab !== 'chats' && !(activeTab === 'admin' && isDeveloperUser) && (
          <aside className="col-span-12 lg:col-span-3 space-y-5 lg:sticky lg:top-20">
            {/* Trending Topics Section (Analyzed from Existing Post Content) */}
            <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-[#F2ECE9] pb-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#7B1113]">Trending Topics</h3>
                  <p className="text-xs text-[#6E5D5F]">Analyzed from campus post content</p>
                </div>
                <TrendingUp className="w-4 h-4 text-[#7B1113] shrink-0" />
              </div>

              {trendingTopics.length === 0 ? (
                <p className="text-xs text-[#6E5D5F] py-2">
                  No trending topics yet. Share a post to spark campus discussions.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {trendingTopics.map((topic, idx) => {
                    const isTopicActive = selectedTrendingTopic === topic.id;
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => {
                          if (isTopicActive) {
                            setSelectedTrendingTopic(null);
                            if (selectedCategory === 'Trending Topics') {
                              setSelectedCategory('All');
                            }
                          } else {
                            setSelectedTrendingTopic(topic.id);
                            setSelectedCategory('Trending Topics');
                            if (
                              activeTab !== 'feed' &&
                              activeTab !== 'my_posts' &&
                              activeTab !== 'files'
                            ) {
                              setActiveTab('feed');
                            }
                          }
                        }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors flex items-center justify-between gap-2 cursor-pointer border ${
                          isTopicActive
                            ? 'bg-[#7B1113] text-white border-[#7B1113]'
                            : 'bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#1F1617] border-[#E8DFDC]'
                        }`}
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <span
                            className={`text-xs font-mono tabular-nums font-semibold shrink-0 ${
                              isTopicActive ? 'text-[#D4AF37]' : 'text-[#7B1113]'
                            }`}
                          >
                            0{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p
                              className={`text-xs font-semibold truncate ${
                                isTopicActive ? 'text-white' : 'text-[#1F1617]'
                              }`}
                            >
                              {topic.label}
                            </p>
                            <p
                              className={`text-[11px] truncate ${
                                isTopicActive ? 'text-[#F7EFE0]/85' : 'text-[#6E5D5F]'
                              }`}
                            >
                              {topic.postsCount} {topic.postsCount === 1 ? 'post' : 'posts'}
                              {topic.interactions > 0
                                ? ` · ${topic.interactions} ${
                                    topic.interactions === 1 ? 'reaction' : 'reactions'
                                  }`
                                : ''}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-mono tabular-nums shrink-0 ${
                            isTopicActive ? 'text-[#D4AF37]' : 'text-[#6E5D5F]'
                          }`}
                        >
                          {isTopicActive ? 'Active' : `${topic.postsCount}`}
                        </span>
                      </button>
                    );
                  })}

                  {(selectedTrendingTopic || selectedCategory === 'Trending Topics') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTrendingTopic(null);
                        setSelectedCategory('All');
                      }}
                      className="w-full mt-1 py-1.5 px-3 rounded-lg text-xs font-medium text-[#7B1113] hover:bg-[#FAF8F5] transition-colors text-center cursor-pointer"
                    >
                      Clear trending filter
                    </button>
                  )}
                </div>
              )}
            </div>

            <OnlineUsersPanel
              presenceList={presenceList}
              currentUserId={currentUser.uid}
              onStartChat={handleStartChatWithPeer}
            />

            <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-[#F2ECE9] pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-[#7B1113]">Recent Files</h3>
                    <span className="px-2 py-0.5 rounded-full bg-[#7B1113]/10 text-[#7B1113] font-mono tabular-nums text-[11px] font-bold">
                      {fileCategoryCounts.total}
                    </span>
                  </div>
                  <p className="text-xs text-[#6E5D5F] font-mono tabular-nums mt-0.5">
                    {fileCategoryCounts.pdf} PDF ·{' '}
                    {fileCategoryCounts.word + fileCategoryCounts.excel + fileCategoryCounts.ppt}{' '}
                    Office · {fileCategoryCounts.media} Media
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('files')}
                  className="p-1.5 rounded-lg bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] cursor-pointer transition-colors"
                  title="Open Files & Study Resources Dashboard"
                >
                  <FolderOpen className="w-4 h-4 text-[#7B1113]" />
                </button>
              </div>

              {sharedAttachments.length === 0 ? (
                <p className="text-xs text-[#6E5D5F] py-2">No files uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {sharedAttachments.slice(0, 6).map((item) => {
                    const meta = getAttachmentMeta(item.attachmentType);
                    return (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#1F1617] truncate">
                            {item.attachmentType === 'photo' ? 'Photo' : item.attachmentName}
                          </p>
                          <p className="text-[11px] text-[#6E5D5F] font-mono tabular-nums">
                            {meta.extBadge} · {formatFileSize(item.attachmentSize)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            triggerAttachmentDownload(item.attachmentDataUrl, item.attachmentName)
                          }
                          className="p-1.5 text-[#7B1113] hover:bg-white rounded-lg shrink-0 cursor-pointer"
                          title="Download file"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => setActiveTab('files')}
                    className="w-full py-2 px-3 rounded-xl bg-[#FAF8F5] hover:bg-[#F2ECE9] border border-[#E8DFDC] text-xs font-semibold text-[#7B1113] text-center cursor-pointer transition-colors"
                  >
                    View All {fileCategoryCounts.total} Shared Files →
                  </button>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 4-Second Transition Animation Overlay when opening Full Inbox */}
      <AnimatePresence>
        {isTransitioningToFullInbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-[100] bg-gradient-to-br from-[#7B1113] via-[#580B0C] to-[#3B0708] text-white flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="max-w-md w-full bg-white/10 backdrop-blur-md border border-[#D4AF37]/40 rounded-3xl p-8 flex flex-col items-center space-y-5 shadow-2xl"
            >
              <div className="relative w-20 h-20 flex items-center justify-center">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-3 border-[#D4AF37]/25 border-t-[#D4AF37] border-r-white"
                />
                <motion.div
                  animate={{ scale: [1, 1.12, 1] }}
                  transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-12 h-12 rounded-2xl bg-[#D4AF37] text-[#7B1113] flex items-center justify-center shadow-lg"
                >
                  <Inbox className="w-6 h-6" />
                </motion.div>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-mono uppercase tracking-widest text-[#D4AF37] font-semibold">
                  ONE Messenger · Fullscreen Mode
                </p>
                <h2 className="font-display text-2xl sm:text-3xl text-white">
                  Opening Full Inbox...
                </h2>
                <p className="text-xs text-[#F7EFE0]/80">
                  Syncing real-time conversations, read receipts &amp; shared files
                </p>
              </div>

              <div className="w-full space-y-1.5">
                <div className="w-full h-2 bg-[#3B0708]/80 rounded-full overflow-hidden border border-[#D4AF37]/30">
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 4, ease: 'linear' }}
                    className="h-full bg-gradient-to-r from-[#D4AF37] via-[#FFF3B0] to-[#D4AF37]"
                  />
                </div>
                <p className="text-[11px] font-mono text-[#D4AF37]">
                  Transitioning to Full Inbox Dashboard (4s)...
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop Messenger-Style Floating Popup Chat & Inbox Window */}
      {activeTab !== 'chats' && !isTransitioningToFullInbox && (
        <DesktopMessengerPopup
          currentUserProfile={userProfile}
          threads={chatThreads}
          presenceList={presenceList}
          notifications={notifications}
          isOpen={isDesktopMessengerOpen}
          isMinimized={isDesktopMessengerMinimized}
          activePeer={activeChatPeer}
          onSelectPeer={(peer) => setActiveChatPeer(peer)}
          onSetOpen={setIsDesktopMessengerOpen}
          onSetMinimized={setIsDesktopMessengerMinimized}
          onExpandToFullInbox={() => {
            setIsDesktopMessengerOpen(false);
            setIsDesktopMessengerMinimized(false);
            setIsTransitioningToFullInbox(false);
            if (!activeChatPeer && chatThreads.length > 0 && userProfile) {
              const firstThread = chatThreads[0];
              const isUserA = firstThread.userAId === userProfile.uid;
              const peerUid = isUserA ? firstThread.userBId : firstThread.userAId;
              const peerNick = isUserA ? firstThread.userBNickname : firstThread.userANickname;
              const peerPhoto = isUserA ? firstThread.userBPhotoURL : firstThread.userAPhotoURL;
              const peerBadge = isUserA ? firstThread.userBBadge : firstThread.userABadge;
              setActiveChatPeer({
                uid: peerUid,
                nickname: peerNick,
                photoURL: resolvePeerAvatar(
                  peerPhoto,
                  peerUid,
                  peerNick,
                  peerBadge,
                  studentAvatarFallback
                ),
                badge: isOneOfficialAccount(peerUid || peerNick, peerBadge)
                  ? ONE_OFFICIAL_BADGE
                  : peerBadge,
              });
            }
            setActiveTab('chats');
          }}
          onMarkChatThreadRead={handleMarkChatThreadRead}
        />
      )}
    </div>
  );
}
