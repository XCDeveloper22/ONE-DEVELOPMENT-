import { Timestamp } from 'firebase/firestore';

export type AttachmentType = 'none' | 'photo' | 'video' | 'pdf' | 'word' | 'excel' | 'ppt';

export type UserBadge = 'verified' | 'developer' | 'moderator' | 'tulips' | 'one_official';

export type UserAccountStatus = 'active' | 'suspended' | 'banned';

export interface UserPermissions {
  canPost: boolean;
  canComment: boolean;
  canUploadFiles: boolean;
  canChat: boolean;
  canReport: boolean;
  isVerifiedStudent: boolean;
  canDeletePosts?: boolean;
}

export type PostCategory =
  | 'Academic Rant'
  | 'Campus Life'
  | 'Dorm & Housing'
  | 'Subjects'
  | 'Org & Events'
  | 'Study Materials'
  | 'General Rant';

export const POST_CATEGORIES: PostCategory[] = [
  'Academic Rant',
  'Campus Life',
  'Dorm & Housing',
  'Subjects',
  'Org & Events',
  'Study Materials',
  'General Rant',
];

export const MSU_CAMPUSES: string[] = [
  'MSU Main Campus - Marawi',
  'MSU-IIT (Iligan Institute of Technology)',
  'MSU General Santos',
  'MSU Tawi-Tawi (CTO)',
  'MSU Naawan',
  'MSU Maguindanao',
  'MSU Sulu',
  'MSU Buug',
  'MSU Maigo',
  'MSU LNCAT / LNAC',
];

export interface UserPublicProfile {
  uid: string;
  nickname: string;
  nicknameUpdatedAt: string; // ISO string for 14-day (2-week) calculation
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
  accountStatus?: UserAccountStatus;
  suspendedUntil?: string;
  banReason?: string;
  warningCount?: number;
  isVerifiedStudent?: boolean;
  permissions?: UserPermissions;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserPrivateInfo {
  uid: string;
  email: string;
  hasCustomPassword: boolean;
  passwordUpdatedAt: string;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserPresence {
  uid: string;
  nickname: string;
  photoURL: string;
  badge: UserBadge;
  campus: string;
  isOnline: boolean;
  lastSeenMs: number;
  visibility: 'edu_verified';
  updatedAt: Timestamp | null;
}

export interface Post {
  id: string;
  authorId: string;
  authorNickname: string;
  authorDisplayName: string;
  authorPhotoURL: string;
  authorDomain: string;
  authorBadge?: UserBadge;
  isAnonymous: boolean;
  category: PostCategory;
  title: string;
  content: string;
  attachmentType: AttachmentType;
  attachmentName: string;
  attachmentSize: number;
  attachmentMime: string;
  attachmentDataUrl: string;
  likesCount: number;
  commentsCount: number;
  isPinned?: boolean;
  isHidden?: boolean;
  commentsLocked?: boolean;
  reportsCount?: number;
  visibility: 'edu_verified';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorNickname: string;
  authorDisplayName: string;
  authorPhotoURL: string;
  authorBadge?: UserBadge;
  isAnonymous: boolean;
  content: string;
  replyToCommentId?: string;
  replyToNickname?: string;
  likesCount?: number;
  likedBy?: string[];
  visibility: 'edu_verified';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type SuggestionCategory =
  | 'Feature Request'
  | 'Campus Life'
  | 'App Improvement'
  | 'Academics & Study'
  | 'Bug Report'
  | 'General Idea';

export const SUGGESTION_CATEGORIES: SuggestionCategory[] = [
  'Feature Request',
  'Campus Life',
  'App Improvement',
  'Academics & Study',
  'Bug Report',
  'General Idea',
];

export type SuggestionStatus = 'under_review' | 'planned' | 'in_progress' | 'completed';

export interface Suggestion {
  id: string;
  authorId: string;
  authorNickname: string;
  authorPhotoURL: string;
  authorBadge?: UserBadge;
  isAnonymous: boolean;
  category: SuggestionCategory;
  title: string;
  content: string;
  upvotesCount: number;
  status: SuggestionStatus;
  adminReply?: string;
  adminReplyBy?: string;
  adminReplyBadge?: UserBadge;
  adminRepliedAt?: Timestamp | null;
  visibility: 'edu_verified';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Reaction {
  postId: string;
  userId: string;
  type: 'damay' | 'hug' | 'fire';
  createdAt: Timestamp | null;
}

export type CommentReactionEmoji = '❤️' | '😂' | '😮' | '😢' | '🔥' | '👏';

export const COMMENT_REACTION_EMOJIS: CommentReactionEmoji[] = [
  '❤️',
  '😂',
  '😮',
  '😢',
  '🔥',
  '👏',
];

export interface CommentReaction {
  id: string;
  postId: string;
  commentId: string;
  userId: string;
  emoji: CommentReactionEmoji;
  visibility: 'edu_verified';
  createdAt: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  actorId: string;
  actorNickname: string;
  actorPhotoURL: string;
  actorBadge: UserBadge;
  type: 'like' | 'comment' | 'message' | 'developer_post';
  targetId: string;
  previewText: string;
  read: boolean;
  createdAt: Timestamp | null;
}

export interface ChatThread {
  id: string;
  participantIds: string[];
  userAId: string;
  userANickname: string;
  userAPhotoURL: string;
  userABadge: UserBadge;
  userBId: string;
  userBNickname: string;
  userBPhotoURL: string;
  userBBadge: UserBadge;
  lastMessage: string;
  lastSenderId: string;
  lastMessageRead?: boolean;
  lastMessageReadAt?: Timestamp | null;
  deletedBy?: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  participantIds: string[];
  senderId: string;
  recipientId: string;
  senderNickname: string;
  senderPhotoURL: string;
  senderBadge: UserBadge;
  text: string;
  attachmentType: AttachmentType;
  attachmentName: string;
  attachmentSize: number;
  attachmentMime: string;
  attachmentDataUrl: string;
  reactions?: Record<string, string>;
  deletedFor?: string[];
  read?: boolean;
  readAt?: Timestamp | null;
  createdAt: Timestamp | null;
}

export type SupportTicketStatus = 'open' | 'replied' | 'resolved';

export interface SupportTicketReply {
  id: string;
  senderId: string;
  senderNickname: string;
  senderPhotoURL: string;
  senderBadge: UserBadge;
  isAdmin: boolean;
  text: string;
  createdAt: Timestamp | null;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userNickname: string;
  userDisplayName: string;
  userPhotoURL: string;
  userEmail: string;
  userCampus: string;
  userBadge: UserBadge;
  category: string;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  chatId?: string;
  adminId?: string;
  adminNickname?: string;
  lastReplyText?: string;
  lastReplyBy?: string;
  replies?: SupportTicketReply[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ChatPeerTarget {
  uid: string;
  nickname: string;
  photoURL: string;
  badge: UserBadge;
}

export interface ContentReport {
  id: string;
  targetType: 'post' | 'comment' | 'user';
  targetId: string;
  targetAuthorId: string;
  targetAuthorNickname: string;
  targetPreview: string;
  reporterId: string;
  reporterNickname: string;
  reason: string;
  details?: string;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  reviewedBy?: string;
  resolutionNote?: string;
  visibility: 'edu_verified';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ModerationRule {
  id: string;
  title: string;
  description: string;
  category: string;
  severity: 'warn' | 'hide' | 'block';
  keywords: string; // comma-separated keywords
  isActive: boolean;
  createdBy: string;
  visibility: 'edu_verified';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PlatformSettings {
  siteName: string;
  siteTagline: string;
  logoText: string;
  logoImageUrl: string;
  primaryColor: string;
  accentColor: string;
  allowNewPosts: boolean;
  allowComments: boolean;
  allowFileUploads: boolean;
  allowDirectChat: boolean;
  allowAnonymousMode: boolean;
  allowSuggestionBox: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  inDevelopmentMode?: boolean;
  announcementActive: boolean;
  announcementTitle: string;
  announcementText: string;
  systemNoticeActive: boolean;
  systemNoticeText: string;
  systemNoticeType: 'info' | 'warning' | 'urgent';
  deletedPostIds?: string[];
  updatedBy: string;
  visibility: 'edu_verified';
  updatedAt?: Timestamp | null;
  updatedAtMs?: number;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  siteName: 'ONE',
  siteTagline: 'Student Wall · MSUan',
  logoText: 'ONE',
  logoImageUrl: '',
  primaryColor: '#7B1113',
  accentColor: '#D4AF37',
  allowNewPosts: true,
  allowComments: true,
  allowFileUploads: true,
  allowDirectChat: true,
  allowAnonymousMode: true,
  allowSuggestionBox: true,
  maintenanceMode: false,
  maintenanceMessage:
    'ONE is currently undergoing scheduled maintenance. Please check back shortly.',
  inDevelopmentMode: true,
  announcementActive: false,
  announcementTitle: 'Welcome to ONE — Student Wall · MSUan',
  announcementText: 'Share campus updates, study notes, and connect with fellow MSUans.',
  systemNoticeActive: false,
  systemNoticeText: '',
  systemNoticeType: 'info',
  updatedBy: 'system',
  visibility: 'edu_verified',
};

export type MarketplaceListingType = 'sell' | 'buy';

export type MarketplaceCategory =
  | 'Textbooks & Reviewers'
  | 'Electronics & Calculators'
  | 'Dorm & Essentials'
  | 'Uniforms & Apparel'
  | 'Food & Campus Snacks'
  | 'Services & Tutoring'
  | 'Other Items';

export const MARKETPLACE_CATEGORIES: MarketplaceCategory[] = [
  'Textbooks & Reviewers',
  'Electronics & Calculators',
  'Dorm & Essentials',
  'Uniforms & Apparel',
  'Food & Campus Snacks',
  'Services & Tutoring',
  'Other Items',
];

export type MarketplaceCondition =
  | 'Brand New'
  | 'Like New'
  | 'Good'
  | 'Fair'
  | 'Not Applicable';

export const MARKETPLACE_CONDITIONS: MarketplaceCondition[] = [
  'Brand New',
  'Like New',
  'Good',
  'Fair',
  'Not Applicable',
];

export type MarketplaceStatus = 'available' | 'reserved' | 'sold' | 'fulfilled';

export interface MarketplaceListing {
  id: string;
  authorId: string;
  authorNickname: string;
  authorDisplayName: string;
  authorPhotoURL: string;
  authorDomain: string;
  authorBadge?: UserBadge;
  listingType: MarketplaceListingType;
  category: MarketplaceCategory;
  title: string;
  description: string;
  price: number;
  isNegotiable: boolean;
  condition: MarketplaceCondition;
  campus: string;
  meetupLocation: string;
  imageUrl: string;
  imageName?: string;
  status: MarketplaceStatus;
  inquiriesCount?: number;
  visibility: 'edu_verified';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export type ActiveNavTab =
  | 'feed'
  | 'marketplace'
  | 'chats'
  | 'notifications'
  | 'files'
  | 'my_posts'
  | 'guidelines'
  | 'suggestions'
  | 'support'
  | 'about'
  | 'terms'
  | 'settings'
  | 'admin';
export type ViewportMode = 'auto' | 'desktop' | 'mobile';
