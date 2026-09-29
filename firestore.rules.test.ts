/**
 * Firestore Security Rules Test Specification (Dirty Dozen Verification)
 */
export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedResult: 'PERMISSION_DENIED';
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Non-edu.ph email blocked from creating post',
    collection: '/posts/post_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'intruder@gmail.com', email_verified: true },
    payload: { authorId: 'user_1', content: 'Hello', visibility: 'edu_verified' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Shadow field injection on UserPublicProfile',
    collection: '/users/user_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    payload: { uid: 'user_1', nickname: 'msuan', isAdmin: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity spoofing on Post creation',
    collection: '/posts/post_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    payload: { authorId: 'user_2', content: 'Spoofed post', visibility: 'edu_verified' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Cross-user PII read on users_private',
    collection: '/users_private/user_2',
    operation: 'get',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'ID poisoning with invalid characters',
    collection: '/posts/invalid$id!@#',
    operation: 'get',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Oversized post content exceeding 5000 chars',
    collection: '/posts/post_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    payload: { authorId: 'user_1', content: 'x'.repeat(5005), visibility: 'edu_verified' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Orphaned comment under non-existent post',
    collection: '/posts/missing_post/comments/comment_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    payload: { postId: 'missing_post', authorId: 'user_1', content: 'Orphan' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Timestamp forgery on create',
    collection: '/posts/post_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    payload: { authorId: 'user_1', content: 'Forged time', createdAt: '2020-01-01T00:00:00Z' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Immutable field mutation on Post update',
    collection: '/posts/post_1',
    operation: 'update',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    payload: { authorId: 'user_2' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Invalid attachmentType enum value',
    collection: '/posts/post_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    payload: { authorId: 'user_1', attachmentType: 'executable' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Unverified email spoof attack',
    collection: '/posts/post_1',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: false },
    payload: { authorId: 'user_1', content: 'Unverified' },
    expectedResult: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Cross-user reaction impersonation',
    collection: '/posts/post_1/reactions/user_2',
    operation: 'create',
    auth: { uid: 'user_1', email: 'student@s.msumain.edu.ph', email_verified: true },
    payload: { postId: 'post_1', userId: 'user_2', type: 'damay' },
    expectedResult: 'PERMISSION_DENIED',
  },
];
