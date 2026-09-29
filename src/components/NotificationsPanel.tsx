import React, { useState } from 'react';
import {
  Bell,
  Heart,
  MessageCircle,
  MessageSquare,
  CheckCheck,
  Trash2,
  Check,
  Megaphone,
} from 'lucide-react';
import {
  formatPeerDisplayName,
  isOneOfficialAccount,
  resolvePeerAvatar,
} from '../firebase';
import { ChatPeerTarget, NotificationItem } from '../types';
import { formatRelativeTime } from './PostCard';
import { UserBadgeTag } from './UserBadgeTag';
import { playChatNotificationSound } from '../utils/soundEffects';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';

interface NotificationsPanelProps {
  notifications: NotificationItem[];
  onMarkAsRead: (notificationId: string) => Promise<void>;
  onMarkAllAsRead: () => Promise<void>;
  onDeleteNotification: (notificationId: string) => Promise<void>;
  onStartChat: (peer: ChatPeerTarget) => void;
  onSelectPostNotification: (postId: string, notificationId: string) => void;
}

export const NotificationsPanel: React.FC<NotificationsPanelProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDeleteNotification,
  onStartChat,
  onSelectPostNotification,
}) => {
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllClick = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      await onMarkAllAsRead();
    } finally {
      setIsMarkingAll(false);
    }
  };

  const renderTypeIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'like':
        return <Heart className="w-3.5 h-3.5 text-[#7B1113] fill-[#7B1113]" />;
      case 'comment':
        return <MessageSquare className="w-3.5 h-3.5 text-[#7B1113]" />;
      case 'message':
        return <MessageCircle className="w-3.5 h-3.5 text-[#D4AF37]" />;
      case 'developer_post':
        return <Megaphone className="w-3.5 h-3.5 text-[#7B1113]" />;
    }
  };

  const renderActionLabel = (type: NotificationItem['type']) => {
    switch (type) {
      case 'like':
        return 'liked your post';
      case 'comment':
        return 'commented on your post';
      case 'message':
        return 'sent you a message';
      case 'developer_post':
        return 'published a new Developer post';
    }
  };

  return (
    <div className="bg-white border border-[#E8DFDC] rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#F2ECE9] pb-3.5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => playChatNotificationSound(true)}
            title="Play Messenger notification sound"
            className="w-9 h-9 rounded-xl bg-[#7B1113] hover:bg-[#580B0C] text-[#D4AF37] flex items-center justify-center transition-colors cursor-pointer"
          >
            <Bell className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-display text-2xl text-[#7B1113]">Notifications</h2>
            <p className="text-xs text-[#6E5D5F]">
              Likes, comments, and direct messages from MSU students.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleMarkAllClick}
          disabled={unreadCount === 0 || isMarkingAll}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 min-h-[36px] ${
            unreadCount > 0
              ? 'bg-[#7B1113] hover:bg-[#580B0C] text-white border border-[#D4AF37]/40'
              : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC] opacity-60 cursor-not-allowed'
          }`}
        >
          <CheckCheck className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>
            {isMarkingAll
              ? 'Marking read...'
              : unreadCount > 0
              ? `Mark all read (${unreadCount})`
              : 'All caught up'}
          </span>
        </button>
      </div>

      {notifications.length === 0 ? (
        <div className="py-10 text-center space-y-2">
          <Bell className="w-7 h-7 text-[#6E5D5F] mx-auto opacity-60" />
          <p className="text-sm font-semibold text-[#1F1617]">No notifications yet</p>
          <p className="text-xs text-[#6E5D5F]">
            When someone likes your post, comments, or sends you a chat message, it will show here.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notifications.map((item) => {
            const isAnonymousActor =
              item.actorNickname.toLowerCase().includes('anonymous') || !item.actorId;
            const isActorOneOfficial = isOneOfficialAccount(
              item.actorId || item.actorNickname,
              item.actorBadge
            );
            const actorAvatarUrl = resolvePeerAvatar(
              item.actorPhotoURL,
              item.actorId,
              item.actorNickname,
              item.actorBadge,
              studentAvatarFallback
            );
            const actorBadgeToRender = isActorOneOfficial
              ? 'one_official'
              : item.actorBadge;

            return (
              <div
                key={item.id}
                onClick={async () => {
                  if (!item.read) {
                    await onMarkAsRead(item.id);
                  }
                  if (item.type === 'message' && !isAnonymousActor) {
                    onStartChat({
                      uid: item.actorId,
                      nickname: item.actorNickname,
                      photoURL: actorAvatarUrl,
                      badge: actorBadgeToRender,
                    });
                  } else {
                    onSelectPostNotification(item.targetId, item.id);
                  }
                }}
                className={`p-3.5 rounded-xl border transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                  item.read
                    ? 'bg-white border-[#E8DFDC] hover:bg-[#FAF8F5]'
                    : 'bg-[#F7EFE0]/55 border-[#D4AF37] hover:bg-[#F7EFE0]/80'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="relative shrink-0">
                    <img
                      src={actorAvatarUrl}
                      alt={item.actorNickname}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-[#D4AF37]"
                    />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white border border-[#E8DFDC] flex items-center justify-center">
                      {renderTypeIcon(item.type)}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1 text-xs min-w-0">
                      {!item.read && (
                        <span
                          className="w-2 h-2 rounded-full bg-[#7B1113] shrink-0"
                          title="Unread"
                        />
                      )}
                      <span className="inline-flex items-center gap-1 min-w-0 max-w-full">
                        <span className="font-semibold text-[#1F1617] truncate">
                          {isAnonymousActor
                            ? item.actorNickname
                            : formatPeerDisplayName(
                                item.actorNickname,
                                item.actorId,
                                item.actorBadge
                              )}
                        </span>
                        <UserBadgeTag badge={actorBadgeToRender} size="sm" />
                      </span>
                      <span className="text-[#6E5D5F]">{renderActionLabel(item.type)}</span>
                    </div>

                    {item.previewText && (
                      <p className="text-xs text-[#1F1617] line-clamp-2 break-words [overflow-wrap:anywhere]">
                        “{item.previewText}”
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-[#6E5D5F]">
                      <span>{formatRelativeTime(item.createdAt)}</span>
                      <span>·</span>
                      <span className={item.read ? 'text-emerald-700' : 'text-[#7B1113] font-semibold'}>
                        {item.read ? 'Read' : 'Unread (Click to read)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#F2ECE9]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {!item.read && (
                    <button
                      type="button"
                      onClick={() => onMarkAsRead(item.id)}
                      className="px-2.5 py-1.5 bg-[#FAF8F5] hover:bg-[#F2ECE9] text-[#7B1113] border border-[#E8DFDC] rounded-lg text-xs font-medium transition-colors flex items-center gap-1 min-h-[34px]"
                      title="Mark as read"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Read</span>
                    </button>
                  )}

                  {!isAnonymousActor && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!item.read) await onMarkAsRead(item.id);
                        onStartChat({
                          uid: item.actorId,
                          nickname: item.actorNickname,
                          photoURL: actorAvatarUrl,
                          badge: actorBadgeToRender,
                        });
                      }}
                      className="w-8 h-8 bg-[#7B1113] hover:bg-[#580B0C] text-[#D4AF37] rounded-lg transition-colors flex items-center justify-center shrink-0 cursor-pointer"
                      title={`Message ${formatPeerDisplayName(
                        item.actorNickname,
                        item.actorId,
                        item.actorBadge
                      )}`}
                      aria-label={`Message ${formatPeerDisplayName(
                        item.actorNickname,
                        item.actorId,
                        item.actorBadge
                      )}`}
                    >
                      <MessageCircle className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDeleteNotification(item.id)}
                    className="p-1.5 text-[#6E5D5F] hover:text-rose-700 rounded-lg min-h-[34px] min-w-[34px] flex items-center justify-center"
                    title="Delete notification"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
