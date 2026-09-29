import React, { useState, useEffect } from 'react';
import { MessageCircle, UserCheck, UserMinus } from 'lucide-react';
import { isUserCurrentlyOnline } from '../firebase';
import { ChatPeerTarget, UserPresence } from '../types';
import { UserBadgeTag } from './UserBadgeTag';
import studentAvatarFallback from '../assets/images/student_avatar_1_1790401794136.jpg';

interface OnlineUsersPanelProps {
  presenceList: UserPresence[];
  currentUserId: string;
  onStartChat: (peer: ChatPeerTarget) => void;
  compactMobileBar?: boolean;
}

export const OnlineUsersPanel: React.FC<OnlineUsersPanelProps> = ({
  presenceList,
  currentUserId,
  onStartChat,
  compactMobileBar = false,
}) => {
  const [mobileTab, setMobileTab] = useState<'online' | 'offline'>('online');
  const [, setTick] = useState(0);

  // Re-evaluate online/offline status every 15s so stale users move to Offline automatically
  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 15000);
    return () => window.clearInterval(id);
  }, []);

  // Deduplicate by uid and strictly separate Online MSUans vs Offline Users
  const uniqueUsersMap = new Map<string, UserPresence>();
  for (const u of presenceList) {
    if (u && u.uid) {
      uniqueUsersMap.set(u.uid, u);
    }
  }
  const allUsers = Array.from(uniqueUsersMap.values());

  const onlineUsers = allUsers
    .filter((u) => isUserCurrentlyOnline(u))
    .sort((a, b) => (b.lastSeenMs || 0) - (a.lastSeenMs || 0));

  const offlineUsers = allUsers
    .filter((u) => !isUserCurrentlyOnline(u))
    .sort((a, b) => (b.lastSeenMs || 0) - (a.lastSeenMs || 0));

  // =========================================================================
  // MOBILE COMPACT BAR
  // - Balanced Online MSUans / Offline Users tabs
  // - Shows 5 users in view; swipe/scroll horizontally to view the rest
  // - Icon-only message button (no overlapping text)
  // =========================================================================
  if (compactMobileBar) {
    const activeList = mobileTab === 'online' ? onlineUsers : offlineUsers;

    return (
      <div className="bg-white border border-[#E8DFDC] rounded-2xl p-3 space-y-2.5 overflow-hidden">
        {/* Balanced Online MSUans / Offline Users Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileTab('online')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                mobileTab === 'online'
                  ? 'bg-[#7B1113] text-white'
                  : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="whitespace-nowrap">Online MSUans ({onlineUsers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setMobileTab('offline')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                mobileTab === 'offline'
                  ? 'bg-[#7B1113] text-white'
                  : 'bg-[#FAF8F5] text-[#6E5D5F] border border-[#E8DFDC]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-stone-400 shrink-0" />
              <span className="whitespace-nowrap">Offline ({offlineUsers.length})</span>
            </button>
          </div>

          {activeList.length > 5 && (
            <span className="text-[10px] font-mono text-[#6E5D5F] shrink-0">
              Swipe ({activeList.length}) →
            </span>
          )}
        </div>

        {/* Swipeable User Strip: 5 users visible at once, swipe/scroll horizontally for the rest */}
        {activeList.length === 0 ? (
          <p className="text-xs text-[#6E5D5F] py-1.5 px-1">
            {mobileTab === 'online'
              ? 'No MSUans online right now.'
              : 'No offline users right now.'}
          </p>
        ) : (
          <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar py-1 snap-x snap-mandatory">
            {activeList.map((u) => {
              const isOnline = mobileTab === 'online';
              const isMe = u.uid === currentUserId;
              return (
                <div
                  key={u.uid}
                  className="snap-start shrink-0 min-w-[96px] max-w-[120px] p-2 rounded-xl border border-[#E8DFDC] bg-[#FAF8F5] flex flex-col items-center justify-between text-center gap-1"
                >
                  <div className="relative shrink-0">
                    <img
                      src={u.photoURL || studentAvatarFallback}
                      alt={u.nickname}
                      referrerPolicy="no-referrer"
                      className="w-8 h-8 rounded-full object-cover border border-[#D4AF37]"
                    />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                        isOnline ? 'bg-emerald-500' : 'bg-stone-400'
                      }`}
                    />
                  </div>

                  <div className="flex items-center justify-center gap-1 w-full min-w-0 max-w-full px-0.5">
                    <span className="text-[11px] font-semibold text-[#1F1617] truncate">
                      @{u.nickname}
                    </span>
                    <UserBadgeTag badge={u.badge} size="sm" />
                  </div>

                  {!isMe ? (
                    <button
                      type="button"
                      onClick={() =>
                        onStartChat({
                          uid: u.uid,
                          nickname: u.nickname,
                          photoURL: u.photoURL,
                          badge: u.badge,
                        })
                      }
                      className="w-7 h-7 rounded-lg bg-[#7B1113] hover:bg-[#580B0C] text-[#D4AF37] flex items-center justify-center cursor-pointer transition-colors shrink-0"
                      title={`Message @${u.nickname}`}
                      aria-label={`Message @${u.nickname}`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="text-[9px] font-mono text-[#6E5D5F] h-7 flex items-center justify-center">
                      You
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // DESKTOP SIDEBAR PANEL
  // - Strictly separate Online MSUans vs Offline Users
  // - Shows only 5 users in visible list; scroll/swipe vertically for the rest
  // - Shows ONLY Chat icon (zero overlapping)
  // =========================================================================
  const renderDesktopUserRow = (u: UserPresence, isOnline: boolean) => {
    const isMe = u.uid === currentUserId;
    return (
      <div
        key={u.uid}
        className="h-[54px] px-2.5 rounded-xl bg-[#FAF8F5] border border-[#E8DFDC] flex items-center justify-between gap-2 shrink-0 overflow-hidden"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          <div className="relative shrink-0">
            <img
              src={u.photoURL || studentAvatarFallback}
              alt={u.nickname}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full object-cover border border-[#D4AF37]"
            />
            <span
              title={isOnline ? 'Online now' : 'Offline'}
              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                isOnline ? 'bg-emerald-500' : 'bg-stone-400'
              }`}
            />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-1 text-xs min-w-0">
              <span className="font-semibold text-[#1F1617] truncate">
                @{u.nickname}
              </span>
              <UserBadgeTag badge={u.badge} size="sm" />
              {isMe && <span className="text-[10px] text-[#6E5D5F] shrink-0">(You)</span>}
            </div>
            <div className="text-[11px] text-[#6E5D5F] truncate mt-0.5">
              {isOnline ? 'Online now' : 'Offline'}
            </div>
          </div>
        </div>

        {!isMe && (
          <button
            type="button"
            onClick={() =>
              onStartChat({
                uid: u.uid,
                nickname: u.nickname,
                photoURL: u.photoURL,
                badge: u.badge,
              })
            }
            className="w-8 h-8 bg-[#7B1113] hover:bg-[#580B0C] text-[#D4AF37] rounded-lg transition-colors flex items-center justify-center shrink-0 cursor-pointer"
            title={`Message @${u.nickname}`}
            aria-label={`Message @${u.nickname}`}
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 1. ONLINE MSUANS CARD (Only 5 users shown at once; scroll/swipe for more) */}
      <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 space-y-3 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#F2ECE9] pb-2.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[#7B1113] truncate">Online MSUans</h3>
              <p className="text-[11px] text-[#6E5D5F] font-mono tabular-nums">
                {onlineUsers.length} active now
              </p>
            </div>
          </div>
          <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        </div>

        {onlineUsers.length === 0 ? (
          <p className="text-xs text-[#6E5D5F] py-2">No MSUans online right now.</p>
        ) : (
          <>
            {/* 5 items visible height (5 * 54px + 4 * 6px gaps = 294px), scroll vertically for the rest */}
            <div className="space-y-1.5 max-h-[294px] overflow-y-auto overscroll-contain pr-1">
              {onlineUsers.map((u) => renderDesktopUserRow(u, true))}
            </div>
            {onlineUsers.length > 5 && (
              <p className="text-[11px] font-mono text-[#6E5D5F] text-center pt-1 border-t border-[#F2ECE9]">
                Showing 5 of {onlineUsers.length} · Scroll for more
              </p>
            )}
          </>
        )}
      </div>

      {/* 2. OFFLINE USERS CARD (Balanced separate section; 5 users shown at once; scroll for more) */}
      <div className="bg-white border border-[#E8DFDC] rounded-2xl p-4 space-y-3 overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#F2ECE9] pb-2.5 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full bg-stone-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[#1F1617] truncate">Offline Users</h3>
              <p className="text-[11px] text-[#6E5D5F] font-mono tabular-nums">
                {offlineUsers.length} offline
              </p>
            </div>
          </div>
          <UserMinus className="w-4 h-4 text-[#6E5D5F] shrink-0" />
        </div>

        {offlineUsers.length === 0 ? (
          <p className="text-xs text-[#6E5D5F] py-2">All MSUans are currently online.</p>
        ) : (
          <>
            {/* 5 items visible height (5 * 54px + 4 * 6px gaps = 294px), scroll vertically for the rest */}
            <div className="space-y-1.5 max-h-[294px] overflow-y-auto overscroll-contain pr-1">
              {offlineUsers.map((u) => renderDesktopUserRow(u, false))}
            </div>
            {offlineUsers.length > 5 && (
              <p className="text-[11px] font-mono text-[#6E5D5F] text-center pt-1 border-t border-[#F2ECE9]">
                Showing 5 of {offlineUsers.length} · Scroll for more
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};
