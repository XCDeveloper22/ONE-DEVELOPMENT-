import React from 'react';
import { UserBadge } from '../types';

interface UserBadgeTagProps {
  badge?: UserBadge | string | null;
  isAnonymous?: boolean;
  size?: 'sm' | 'md';
}

export const UserBadgeTag: React.FC<UserBadgeTagProps> = ({
  badge = 'verified',
  isAnonymous = false,
  size = 'sm',
}) => {
  const isOneOfficial = badge === 'one_official' && !isAnonymous;
  const isDeveloper = badge === 'developer' && !isAnonymous;
  const isModerator = badge === 'moderator' && !isAnonymous;
  const isTulips = badge === 'tulips' && !isAnonymous;

  const badgeTitle = isOneOfficial
    ? 'ONE Official Welcome'
    : isDeveloper
    ? 'Verified MSUan · Platform Developer'
    : isModerator
    ? 'Verified MSUan · Campus Moderator'
    : isTulips
    ? 'Verified MSUan Account (Tulips)'
    : 'Verified MSUan Account';

  const iconSizeClass = size === 'md' ? 'w-[17px] h-[17px]' : 'w-[15px] h-[15px]';

  return (
    <span className="inline-flex items-center gap-1 shrink-0 select-none leading-none">
      <span
        title={badgeTitle}
        aria-label={badgeTitle}
        className="inline-flex items-center justify-center shrink-0 leading-none"
      >
        {isOneOfficial ? (
          /* Distinct Paper Airplane Icon for Official ONE Account */
          <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`${iconSizeClass} block shrink-0`}
          >
            {/* Paper Airplane Inner Fold */}
            <path
              d="M9.5 13.5L21.5 2.5L12.5 16.5L9.5 20.5V13.5Z"
              fill="#D97706"
            />
            {/* Paper Airplane Upper Wing */}
            <path
              d="M21.5 2.5L2.5 10.2L9.5 13.5L21.5 2.5Z"
              fill="#FBBF24"
            />
            {/* Paper Airplane Lower Wing */}
            <path
              d="M21.5 2.5L15.2 21.5L11.2 15.2L21.5 2.5Z"
              fill="#F59E0B"
            />
            {/* Crisp Paper Airplane Crease & Outline */}
            <path
              d="M21.5 2.5L2.5 10.2L9.5 13.5M21.5 2.5L15.2 21.5L11.2 15.2M21.5 2.5L9.5 13.5V20.2L12.5 16.5"
              stroke="#7B1113"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : isDeveloper ? (
          /* Distinct Gold Scalloped Starburst Developer Badge Icon with </> Code Emblem */
          <svg
            viewBox="0 0.92 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`${iconSizeClass} block shrink-0`}
          >
            <path
              d="M12 1.25L14.59 3.29L17.85 2.83L19.07 5.89L22.17 7.03L21.62 10.28L23.59 12.92L21.62 15.56L22.17 18.81L19.07 19.95L17.85 23.01L14.59 22.55L12 24.59L9.41 22.55L6.15 23.01L4.93 19.95L1.83 18.81L2.38 15.56L0.41 12.92L2.38 10.28L1.83 7.03L4.93 5.89L6.15 2.83L9.41 3.29L12 1.25Z"
              fill="#F59E0B"
            />
            <path
              d="M9.1 10.4L6.5 12.92L9.1 15.44"
              stroke="#111827"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M14.9 10.4L17.5 12.92L14.9 15.44"
              stroke="#111827"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12.9 9.7L11.1 16.14"
              stroke="#111827"
              strokeWidth="2.0"
              strokeLinecap="round"
            />
          </svg>
        ) : isTulips ? (
          /* Distinct Blooming Pink Tulip Icon with Emerald Stem & Leaves */
          <svg
            viewBox="0 0.92 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`${iconSizeClass} block shrink-0`}
          >
            {/* Stem */}
            <path
              d="M12 13.2V23.2"
              stroke="#10B981"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            {/* Left Leaf */}
            <path
              d="M12 21.8C8.1 21.1 5.1 18.5 4.4 14.6C7.8 15.1 10.5 17.4 12 20.8Z"
              fill="#10B981"
            />
            {/* Right Leaf */}
            <path
              d="M12 21.8C15.9 21.1 18.9 18.5 19.6 14.6C16.2 15.1 13.5 17.4 12 20.8Z"
              fill="#059669"
            />
            {/* Center Tulip Petal */}
            <path
              d="M12 2.1C9.8 4.8 8.9 7.8 9.4 10.9C9.8 12.8 10.8 13.8 12 13.8C13.2 13.8 14.2 12.8 14.6 10.9C15.1 7.8 14.2 4.8 12 2.1Z"
              fill="#E11D48"
            />
            {/* Left Tulip Petal */}
            <path
              d="M12 14.1C8.1 14.1 5.6 11.4 5.6 7.6C5.6 5.8 6.3 4.1 7.2 3.1C8.7 4.6 9.7 6.8 10.1 9.6C10.5 11.8 12.1 13.3 12 14.1Z"
              fill="#FB7185"
            />
            {/* Right Tulip Petal */}
            <path
              d="M12 14.1C15.9 14.1 18.4 11.4 18.4 7.6C18.4 5.8 17.7 4.1 16.8 3.1C15.3 4.6 14.3 6.8 13.9 9.6C13.5 11.8 12.9 13.3 12 14.1Z"
              fill="#F43F5E"
            />
          </svg>
        ) : isModerator ? (
          /* Distinct Emerald Scalloped Starburst Moderator Badge Icon */
          <svg
            viewBox="0 0.92 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`${iconSizeClass} block shrink-0`}
          >
            <path
              d="M12 1.25L14.59 3.29L17.85 2.83L19.07 5.89L22.17 7.03L21.62 10.28L23.59 12.92L21.62 15.56L22.17 18.81L19.07 19.95L17.85 23.01L14.59 22.55L12 24.59L9.41 22.55L6.15 23.01L4.93 19.95L1.83 18.81L2.38 15.56L0.41 12.92L2.38 10.28L1.83 7.03L4.93 5.89L6.15 2.83L9.41 3.29L12 1.25Z"
              fill="#10B981"
            />
            <path
              d="M8.2 12.85L10.75 15.4L16.1 9.85"
              stroke="#111827"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          /* Solid Blue Scalloped Starburst Verified Badge Icon */
          <svg
            viewBox="0 0.92 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`${iconSizeClass} block shrink-0`}
          >
            <path
              d="M12 1.25L14.59 3.29L17.85 2.83L19.07 5.89L22.17 7.03L21.62 10.28L23.59 12.92L21.62 15.56L22.17 18.81L19.07 19.95L17.85 23.01L14.59 22.55L12 24.59L9.41 22.55L6.15 23.01L4.93 19.95L1.83 18.81L2.38 15.56L0.41 12.92L2.38 10.28L1.83 7.03L4.93 5.89L6.15 2.83L9.41 3.29L12 1.25Z"
              fill="#0066FF"
            />
            <path
              d="M8.2 12.85L10.75 15.4L16.1 9.85"
              stroke="#111827"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </span>
  );
};

