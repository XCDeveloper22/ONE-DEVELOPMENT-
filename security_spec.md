# Security Architecture Specification — ONEMSUan (MSUan Student Platform)

## 1. Data Invariants & Master Source of Truth
1. **Institutional Gate Invariant**: All read and write operations require an authenticated user (`request.auth != null`), verified email (`request.auth.token.email_verified == true`), and a valid `.edu.ph` institutional domain (`request.auth.token.email.matches('.*\\.edu\\.ph$')`) or the bootstrapped developer email (`xandercamarin@gmail.com`).
2. **Badge Integrity Invariant**: Every created user receives a `badge` field (`'verified'` or `'developer'`). The `'developer'` badge value is strictly restricted to the verified developer email (`xandercamarin@gmail.com`); standard `.edu.ph` users can only hold or write `'verified'`.
3. **Unique Nickname Invariant**: `/nicknames/{nicknameId}` maps normalized nickname IDs to `uid`. A reservation can only be created or updated when `incoming().uid == request.auth.uid`, and existing reservations owned by another user cannot be overwritten (`existing().uid == request.auth.uid`).
4. **Real-Time Presence Invariant**: `/presence/{userId}` can only be written by `request.auth.uid == userId` and listed by verified users when `existing().visibility == 'edu_verified'`.
5. **Notifications Isolation**: `/notifications/{notificationId}` can only be read/listed or marked as read by `existing().recipientId == request.auth.uid`, and created when `incoming().actorId == request.auth.uid`.
6. **Direct Chat Isolation**: `/chats/{chatId}` and `/chats/{chatId}/messages/{messageId}` require `request.auth.uid in existing().participantIds` for reads/lists and `request.auth.uid in incoming().participantIds` for writes, with bounded 2-element `participantIds` arrays.
7. **PII Split Collection Isolation**: Student PII (`email`, password state) is strictly isolated inside `/users_private/{userId}` where only `request.auth.uid == userId` has `get`, `create`, `update`, or `delete` access (`allow list: if false`).
8. **Temporal Integrity**: All `createdAt` and `updatedAt` fields must equal `request.time`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unverified or Non-.edu.ph Email Access**: Authenticated `@gmail.com` user (not `xandercamarin@gmail.com`) attempts to create a post -> `PERMISSION_DENIED`.
2. **Developer Badge Privilege Escalation**: Regular `.edu.ph` student attempts to set `badge: "developer"` -> Rejected by `isValidBadgeField()`.
3. **Nickname Hijacking**: User B attempts to overwrite `/nicknames/xander` owned by User A -> Rejected by `existing().uid == request.auth.uid`.
4. **PII Leak via Cross-User Get**: User A attempts `get(/users_private/userB)` -> Rejected by `request.auth.uid == userId`.
5. **Cross-User Notification Read**: User A attempts to list notifications for User B -> Rejected by `existing().recipientId == request.auth.uid`.
6. **Unauthorized Chat Eavesdropping**: User C attempts to read `/chats/userA_userB/messages` -> Rejected by `request.auth.uid in existing().participantIds`.
7. **ID Poisoning Attack**: Document ID contains 200 characters or invalid symbols -> Rejected by `isValidId()`.
8. **Denial-of-Wallet Oversized Content**: Post `content` exceeds 5000 characters or Chat `text` exceeds 3000 characters -> Rejected by `.size()` checks.
9. **Orphaned Comment Creation**: Comment created under non-existent `postId` -> Rejected by `exists(/databases/$(database)/documents/posts/$(postId))`.
10. **Timestamp Forgery**: Client passes past or future timestamp for `createdAt` -> Rejected by `incoming().createdAt == request.time`.
11. **Invalid Attachment Enum in Chat**: Chat message specifies `attachmentType: "exe"` -> Rejected by enum allowlist check.
12. **Cross-User Presence Spoofing**: User A attempts to update `/presence/userB` -> Rejected by `request.auth.uid == userId`.
