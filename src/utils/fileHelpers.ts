import { doc, getDoc, setDoc } from 'firebase/firestore';
import { canUseFirestore, db } from '../firebase';
import { uploadFileToSupabaseStorage } from '../supabaseClient';
import { AttachmentType } from '../types';

export interface ProcessedAttachment {
  attachmentType: AttachmentType;
  attachmentName: string;
  attachmentSize: number;
  attachmentMime: string;
  attachmentDataUrl: string;
  previewUrl?: string;
}

const IDB_NAME = 'one_msu_media_db';
const IDB_STORE = 'attachments';
const CHUNK_CHAR_SIZE = 550000; // ~550 KB per Firestore chunk document (well below 1 MiB limit)

// In-memory caches for instant media resolution and Blob object URLs
const memoryDataUrlCache = new Map<string, string>();
const memoryBlobUrlCache = new Map<string, string>();

function openMediaDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(IDB_STORE)) {
        idb.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open local media store'));
  });
}

export async function saveLocalAttachment(key: string, dataUrl: string): Promise<void> {
  memoryDataUrlCache.set(key, dataUrl);
  try {
    const idb = await openMediaDB();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(dataUrl, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IDB quota errors; memory cache + Firestore chunks still work
  }
}

export async function getLocalAttachment(key: string): Promise<string | null> {
  if (memoryDataUrlCache.has(key)) {
    return memoryDataUrlCache.get(key) || null;
  }
  try {
    const idb = await openMediaDB();
    const res = await new Promise<string | null>((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as string) || null);
      req.onerror = () => resolve(null);
    });
    if (res) {
      memoryDataUrlCache.set(key, res);
    }
    return res;
  } catch {
    return null;
  }
}

export function detectAttachmentType(file: File, forcedType?: AttachmentType): AttachmentType {
  const name = file.name.toLowerCase();
  const mime = (file.type || '').toLowerCase();
  const ext = name.split('.').pop() || '';

  if (
    mime.startsWith('image/') ||
    ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp', 'jfif', 'svg'].includes(ext)
  ) {
    return 'photo';
  }
  if (
    mime.startsWith('video/') ||
    ['mp4', 'webm', 'mov', 'ogg', 'm4v', 'mkv', '3gp', 'avi', 'mpeg', 'mpg'].includes(ext)
  ) {
    return 'video';
  }
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ['doc', 'docx', 'rtf'].includes(ext)
  ) {
    return 'word';
  }
  if (
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    ['xls', 'xlsx', 'csv'].includes(ext)
  ) {
    return 'excel';
  }
  if (
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    ['ppt', 'pptx'].includes(ext)
  ) {
    return 'ppt';
  }

  if (forcedType && forcedType !== 'none') {
    return forcedType;
  }

  return 'none';
}

export function inferNormalizedMime(file: File, attachmentType: AttachmentType): string {
  const rawMime = (file.type || '').trim().toLowerCase();
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (attachmentType === 'photo') {
    if (rawMime.startsWith('image/')) return rawMime;
    if (ext === 'png') return 'image/png';
    if (ext === 'gif') return 'image/gif';
    if (ext === 'webp') return 'image/webp';
    if (ext === 'svg') return 'image/svg+xml';
    return 'image/jpeg';
  }

  if (attachmentType === 'video') {
    if (rawMime.startsWith('video/')) {
      // Normalize QuickTime .mov to video/mp4 so HTML5 <video> plays it across Chrome/Edge/Firefox
      if (rawMime === 'video/quicktime') return 'video/mp4';
      return rawMime;
    }
    if (ext === 'webm') return 'video/webm';
    if (ext === 'ogg' || ext === 'ogv') return 'video/ogg';
    return 'video/mp4';
  }

  return rawMime || 'application/octet-stream';
}

export function readFileAsDataUrl(file: File, overrideMime?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        let result = reader.result;
        // If browser used generic application/octet-stream or empty mime, patch the data URL header
        if (
          overrideMime &&
          (result.startsWith('data:application/octet-stream;') ||
            result.startsWith('data:;base64,') ||
            result.startsWith('data:video/quicktime;'))
        ) {
          const commaIdx = result.indexOf(',');
          if (commaIdx !== -1) {
            result = `data:${overrideMime};base64,${result.slice(commaIdx + 1)}`;
          }
        }
        resolve(result);
      } else {
        reject(new Error('Failed to read file'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compresses an uploaded profile avatar image into a crisp square 180x180 JPEG
 * and uploads it to the Supabase Storage `app-files` bucket.
 */
export function compressAvatarImage(file: File, size = 180): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        // Center-crop square
        const minSide = Math.min(img.width, img.height);
        const sx = Math.max(0, (img.width - minSide) / 2);
        const sy = Math.max(0, (img.height - minSide) / 2);
        ctx.fillStyle = '#FAF8F5';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        const compressed = canvas.toDataURL('image/jpeg', 0.84);
        try {
          const publicUrl = await uploadFileToSupabaseStorage({
            fileName: file.name || 'avatar.jpg',
            mimeType: 'image/jpeg',
            base64DataUrl: compressed,
            folder: 'avatars',
          });
          resolve(publicUrl || compressed);
        } catch {
          resolve(compressed);
        }
      };
      img.onerror = () => reject(new Error('Could not decode profile image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read profile image'));
    reader.readAsDataURL(file);
  });
}

/**
 * Progressively compresses an image file so the resulting JPEG data URL fits comfortably in Firestore.
 */
export function compressImageFile(
  file: File,
  _maxDimOverride?: number,
  _qualityOverride?: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const attempts = [
        { maxDim: 1080, quality: 0.8 },
        { maxDim: 860, quality: 0.7 },
        { maxDim: 680, quality: 0.6 },
        { maxDim: 520, quality: 0.5 },
      ];

      for (const attempt of attempts) {
        let { width, height } = img;
        if (width > attempt.maxDim || height > attempt.maxDim) {
          if (width > height) {
            height = Math.round((height * attempt.maxDim) / width);
            width = attempt.maxDim;
          } else {
            width = Math.round((width * attempt.maxDim) / height);
            height = attempt.maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', attempt.quality);
        if (compressed.length <= 620000) {
          resolve(compressed);
          return;
        }
      }

      // Final fallback at 420px
      const canvas = document.createElement('canvas');
      canvas.width = 420;
      canvas.height = Math.max(1, Math.round((img.height * 420) / Math.max(1, img.width)));
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.45));
      } else {
        reject(new Error('Failed to compress image'));
      }
    };
    img.onerror = async () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const fallbackDataUrl = await readFileAsDataUrl(file, 'image/jpeg');
        resolve(fallbackDataUrl);
      } catch (e) {
        reject(e);
      }
    };
    img.src = objectUrl;
  });
}

/**
 * Stores large media (e.g. videos or high-res photos > 600KB) in Firestore `media_chunks`
 * so any student across devices can stream/view them without hitting Firestore's 1 MiB single-doc limit.
 */
async function storeLargeMediaInChunks(dataUrl: string, mime: string): Promise<string> {
  const mediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await saveLocalAttachment(mediaId, dataUrl);

  if (!canUseFirestore()) {
    return `idb://${mediaId}`;
  }

  const chunks: string[] = [];
  for (let i = 0; i < dataUrl.length; i += CHUNK_CHAR_SIZE) {
    chunks.push(dataUrl.slice(i, i + CHUNK_CHAR_SIZE));
  }
  const totalChunks = chunks.length;

  try {
    // Upload chunks in parallel batches of 4 with a 2.5s timeout so uploads never hang
    const BATCH_CONCURRENCY = 4;
    for (let i = 0; i < totalChunks; i += BATCH_CONCURRENCY) {
      const slice = chunks.slice(i, i + BATCH_CONCURRENCY);
      await Promise.race([
        Promise.all(
          slice.map((chunkData, idx) => {
            const chunkIndex = i + idx;
            const chunkDocId = `${mediaId}_${chunkIndex}`;
            return setDoc(doc(db, 'media_chunks', chunkDocId), {
              mediaId,
              chunkIndex,
              totalChunks,
              data: chunkData,
            });
          })
        ),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Chunk upload timeout')), 2500)),
      ]);
    }
    return `firestore-chunked://${mediaId}?chunks=${totalChunks}&mime=${encodeURIComponent(mime)}`;
  } catch {
    // Fallback to local IndexedDB URI if Firestore chunk write is unavailable
    return `idb://${mediaId}`;
  }
}

/**
 * Converts a base64 data URL into a browser Blob Object URL (`blob:...`) for reliable HTML5 <video> and <img> playback.
 */
export function dataUrlToBlobUrl(dataUrl: string, fallbackMime?: string): string {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return dataUrl;
  }
  const cacheKey = `${fallbackMime || ''}:${dataUrl.slice(0, 64)}:${dataUrl.length}`;
  const cached = memoryBlobUrlCache.get(cacheKey);
  if (cached) return cached;

  try {
    const commaIdx = dataUrl.indexOf(',');
    if (commaIdx === -1) return dataUrl;
    const header = dataUrl.slice(0, commaIdx);
    const base64 = dataUrl.slice(commaIdx + 1);
    const mimeMatch = header.match(/^data:([^;]+);/);
    let mime = mimeMatch ? mimeMatch[1] : fallbackMime || 'application/octet-stream';
    if (
      (mime === 'application/octet-stream' || mime === 'video/quicktime' || !mime) &&
      fallbackMime
    ) {
      mime = fallbackMime;
    }

    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    const blobUrl = URL.createObjectURL(blob);
    memoryBlobUrlCache.set(cacheKey, blobUrl);
    return blobUrl;
  } catch {
    return dataUrl;
  }
}

/**
 * Resolves any attachment URL (`data:`, `firestore-chunked://`, `idb://`, `http`, `blob:`)
 * into a directly playable/renderable URL for `<img>` or `<video>`.
 */
export async function resolveMediaAttachmentUrl(
  rawUrl?: string,
  attachmentType?: AttachmentType,
  attachmentMime?: string
): Promise<string> {
  if (!rawUrl) return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';

  const defaultMime =
    attachmentMime ||
    (attachmentType === 'video'
      ? 'video/mp4'
      : attachmentType === 'photo'
      ? 'image/jpeg'
      : 'application/octet-stream');

  if (trimmed.startsWith('idb://')) {
    const mediaId = trimmed.replace('idb://', '').trim();
    const localData = await getLocalAttachment(mediaId);
    if (!localData) return '';
    return attachmentType === 'video' ? dataUrlToBlobUrl(localData, defaultMime) : localData;
  }

  if (trimmed.startsWith('firestore-chunked://')) {
    const withoutScheme = trimmed.replace('firestore-chunked://', '');
    const [mediaIdPart, queryPart] = withoutScheme.split('?');
    const mediaId = mediaIdPart.trim();
    const params = new URLSearchParams(queryPart || '');
    const totalChunks = Number(params.get('chunks') || '0');
    const chunkMime = params.get('mime') || defaultMime;

    // 1. Check local memory / IndexedDB first
    const cachedLocal = await getLocalAttachment(mediaId);
    if (cachedLocal) {
      return attachmentType === 'video' ? dataUrlToBlobUrl(cachedLocal, chunkMime) : cachedLocal;
    }

    if (totalChunks <= 0 || !canUseFirestore()) return '';

    // 2. Fetch chunks from Firestore in parallel
    try {
      const snaps = await Promise.race([
        Promise.all(
          Array.from({ length: totalChunks }, (_, idx) =>
            getDoc(doc(db, 'media_chunks', `${mediaId}_${idx}`))
          )
        ),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
      ]);
      if (!snaps) return '';
      const parts: string[] = [];
      for (const s of snaps) {
        if (!s.exists()) return '';
        const d = s.data() as { data?: string };
        parts.push(d.data || '');
      }
      const fullDataUrl = parts.join('');
      if (!fullDataUrl) return '';
      await saveLocalAttachment(mediaId, fullDataUrl);
      return attachmentType === 'video'
        ? dataUrlToBlobUrl(fullDataUrl, chunkMime)
        : fullDataUrl;
    } catch {
      return '';
    }
  }

  if (trimmed.startsWith('data:')) {
    if (attachmentType === 'video') {
      return dataUrlToBlobUrl(trimmed, defaultMime);
    }
    if (
      attachmentType === 'photo' &&
      (trimmed.startsWith('data:application/octet-stream;') || trimmed.startsWith('data:;base64,'))
    ) {
      return dataUrlToBlobUrl(trimmed, defaultMime);
    }
    return trimmed;
  }

  return trimmed;
}

/**
 * Processes an uploaded file for Posts and Direct Chat messages using Supabase Storage (`app-files` bucket)
 * as the primary storage system.
 * Supports Photos up to 25 MB, Videos up to 20 MB, and Documents (PDF, Word, Excel, PPT) up to 15 MB.
 */
export async function processFileForFirestore(
  file: File,
  forcedType?: AttachmentType
): Promise<ProcessedAttachment> {
  const attachmentType = detectAttachmentType(file, forcedType);
  if (attachmentType === 'none') {
    throw new Error(
      'Unsupported file format. Please upload a Photo, Video, PDF, Word (.doc/.docx), Excel (.xls/.xlsx), or PowerPoint (.ppt/.pptx).'
    );
  }

  const normalizedMime = inferNormalizedMime(file, attachmentType);

  if (attachmentType === 'photo') {
    if (file.size > 25 * 1024 * 1024) {
      throw new Error('Photo file is too large (max 25 MB).');
    }
    const compressedDataUrl = await compressImageFile(file);
    let storedUrl = await uploadFileToSupabaseStorage({
      fileName: file.name,
      mimeType: 'image/jpeg',
      base64DataUrl: compressedDataUrl,
      folder: 'photos',
    });
    if (storedUrl.startsWith('data:') && storedUrl.length > 650000) {
      storedUrl = await storeLargeMediaInChunks(compressedDataUrl, 'image/jpeg');
    }
    return {
      attachmentType: 'photo',
      attachmentName: file.name,
      attachmentSize: file.size,
      attachmentMime: 'image/jpeg',
      attachmentDataUrl: storedUrl,
      previewUrl: storedUrl.startsWith('http') ? storedUrl : compressedDataUrl,
    };
  }

  if (attachmentType === 'video') {
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('Video clip is too large (max 20 MB). Please choose a shorter video clip.');
    }
    const dataUrl = await readFileAsDataUrl(file, normalizedMime);
    const blobPreviewUrl = dataUrlToBlobUrl(dataUrl, normalizedMime);
    let storedUrl = await uploadFileToSupabaseStorage({
      fileName: file.name,
      mimeType: normalizedMime,
      base64DataUrl: dataUrl,
      folder: 'videos',
    });
    if (storedUrl.startsWith('data:') && storedUrl.length > 620000) {
      storedUrl = await storeLargeMediaInChunks(dataUrl, normalizedMime);
    }
    return {
      attachmentType: 'video',
      attachmentName: file.name,
      attachmentSize: file.size,
      attachmentMime: normalizedMime,
      attachmentDataUrl: storedUrl,
      previewUrl: storedUrl.startsWith('http') ? storedUrl : blobPreviewUrl,
    };
  }

  // PDF, Word, Excel, PowerPoint
  if (file.size > 15 * 1024 * 1024) {
    throw new Error(
      `This ${attachmentType.toUpperCase()} document is over 15 MB. Please upload a file under 15 MB.`
    );
  }

  const dataUrl = await readFileAsDataUrl(file, normalizedMime);
  let storedUrl = await uploadFileToSupabaseStorage({
    fileName: file.name,
    mimeType: normalizedMime,
    base64DataUrl: dataUrl,
    folder: 'documents',
  });
  if (storedUrl.startsWith('data:') && storedUrl.length > 620000) {
    storedUrl = await storeLargeMediaInChunks(dataUrl, normalizedMime);
  }

  return {
    attachmentType,
    attachmentName: file.name,
    attachmentSize: file.size,
    attachmentMime: normalizedMime,
    attachmentDataUrl: storedUrl,
    previewUrl: storedUrl.startsWith('http') ? storedUrl : dataUrl,
  };
}

export async function processUploadedFile(
  file: File,
  forcedType?: AttachmentType
): Promise<ProcessedAttachment> {
  return processFileForFirestore(file, forcedType);
}

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function getAttachmentMeta(type: AttachmentType): {
  label: string;
  extBadge: string;
  acceptAttr: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
} {
  switch (type) {
    case 'photo':
      return {
        label: 'Photo Image',
        extBadge: 'IMG',
        acceptAttr: 'image/*,.jpg,.jpeg,.png,.gif,.webp,.avif,.heic,.heif,.bmp',
        accentBg: 'bg-amber-50',
        accentText: 'text-amber-900',
        accentBorder: 'border-amber-200',
      };
    case 'video':
      return {
        label: 'Video Clip',
        extBadge: 'VID',
        acceptAttr: 'video/*,.mp4,.webm,.mov,.ogg,.m4v,.mkv,.3gp,.avi',
        accentBg: 'bg-purple-50',
        accentText: 'text-purple-900',
        accentBorder: 'border-purple-200',
      };
    case 'pdf':
      return {
        label: 'PDF Document',
        extBadge: 'PDF',
        acceptAttr: 'application/pdf,.pdf',
        accentBg: 'bg-red-50',
        accentText: 'text-red-900',
        accentBorder: 'border-red-200',
      };
    case 'word':
      return {
        label: 'Microsoft Word',
        extBadge: 'DOCX',
        acceptAttr:
          '.doc,.docx,.rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        accentBg: 'bg-blue-50',
        accentText: 'text-blue-900',
        accentBorder: 'border-blue-200',
      };
    case 'excel':
      return {
        label: 'Microsoft Excel',
        extBadge: 'XLSX',
        acceptAttr:
          '.xls,.xlsx,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        accentBg: 'bg-emerald-50',
        accentText: 'text-emerald-900',
        accentBorder: 'border-emerald-200',
      };
    case 'ppt':
      return {
        label: 'Microsoft PowerPoint',
        extBadge: 'PPTX',
        acceptAttr:
          '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
        accentBg: 'bg-orange-50',
        accentText: 'text-orange-900',
        accentBorder: 'border-orange-200',
      };
    default:
      return {
        label: 'Attachment',
        extBadge: 'FILE',
        acceptAttr: '*/*',
        accentBg: 'bg-stone-50',
        accentText: 'text-stone-800',
        accentBorder: 'border-stone-200',
      };
  }
}

export async function triggerAttachmentDownload(dataUrl: string, fileName: string) {
  if (!dataUrl) return;
  let resolved = dataUrl;
  if (dataUrl.startsWith('idb://') || dataUrl.startsWith('firestore-chunked://')) {
    resolved = await resolveMediaAttachmentUrl(dataUrl);
  }
  if (!resolved) return;

  if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
    try {
      const response = await fetch(resolved);
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        return;
      }
    } catch {
      // Fallback to direct anchor below
    }
  }

  const link = document.createElement('a');
  link.href = resolved;
  link.download = fileName || 'download';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Decodes a base64 DataURL into readable text if the document contains plain text/XML/CSV previewable content.
 */
export function decodeDocumentPreviewText(dataUrl: string): string | null {
  try {
    if (!dataUrl || !dataUrl.startsWith('data:')) return null;
    const base64Part = dataUrl.split(',')[1];
    if (!base64Part) return null;
    const binary = atob(base64Part);
    let rawText = '';
    try {
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      rawText = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      rawText = binary;
    }

    if (rawText.startsWith('%PDF-')) {
      const extractedPages = extractPdfPagesSync(rawText);
      if (extractedPages.length > 0) {
        return extractedPages.map((lines, idx) => `--- Page ${idx + 1} ---\n${lines.join('\n')}`).join('\n\n');
      }
      return null;
    }

    const xmlMatches = rawText.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (xmlMatches && xmlMatches.length > 0) {
      return xmlMatches
        .map((m) => m.replace(/<[^>]+>/g, ''))
        .join(' ')
        .slice(0, 4000);
    }

    const printable = rawText.replace(/[^\x20-\x7E\n\r\t]/g, '');
    if (printable.trim().length > 24 && printable.length / Math.max(1, rawText.length) > 0.65) {
      return printable.trim().slice(0, 4000);
    }

    return null;
  } catch {
    return null;
  }
}

export interface PdfStudyPageInput {
  heading: string;
  subheading?: string;
  lines: string[];
}

function escapePdfLiteral(str: string): string {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = str.charCodeAt(i);
    if (ch === '\\') {
      out += '\\\\';
    } else if (ch === '(') {
      out += '\\(';
    } else if (ch === ')') {
      out += '\\)';
    } else if (code === 0x2022) {
      // WinAnsi bullet character (0o225 = 149)
      out += '\\225';
    } else if (code === 0x00b7) {
      // WinAnsi middle dot character (0o267 = 183)
      out += '\\267';
    } else if (code === 0x2013 || code === 0x2014) {
      out += '-';
    } else if (code === 0x2018 || code === 0x2019) {
      out += "'";
    } else if (code === 0x201c || code === 0x201d) {
      out += '"';
    } else if (code >= 32 && code <= 126) {
      out += ch;
    } else if (code >= 128 && code <= 255) {
      out += `\\${code.toString(8).padStart(3, '0')}`;
    } else {
      out += ' ';
    }
  }
  return out;
}

function safeAsciiBtoa(str: string): string {
  try {
    return btoa(str);
  } catch {
    let latin1 = '';
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      latin1 += code <= 255 ? str[i] : ' ';
    }
    return btoa(latin1);
  }
}

/**
 * Generates a 100% standards-compliant multi-page PDF-1.4 Data URL with exact xref byte offsets.
 */
export function buildValidMultiPagePdfDataUrl(pagesInput: PdfStudyPageInput[]): string {
  const objects: string[] = [];
  const pageObjNums: number[] = [];

  // Object 1: Catalog, Object 2: Pages (populated after page objects are numbered)
  objects.push(''); // placeholder for 1 0 obj
  objects.push(''); // placeholder for 2 0 obj

  const fontRegularObjNum = 3;
  const fontBoldObjNum = 4;
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

  for (let pIdx = 0; pIdx < pagesInput.length; pIdx++) {
    const page = pagesInput[pIdx];
    const pageObjNum = objects.length + 1;
    const contentObjNum = objects.length + 2;
    pageObjNums.push(pageObjNum);

    const streamOps: string[] = ['BT'];
    // Header banner text
    streamOps.push('/F2 14 Tf');
    streamOps.push('48 736 Td');
    streamOps.push(`(${escapePdfLiteral(page.heading)}) Tj`);

    if (page.subheading) {
      streamOps.push('/F1 10 Tf');
      streamOps.push('0 -18 Td');
      streamOps.push(`(${escapePdfLiteral(page.subheading)}) Tj`);
    }

    streamOps.push('0 -24 Td');
    for (const rawLine of page.lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        streamOps.push('0 -10 Td');
        continue;
      }
      const isSectionHeader =
        /^[0-9]+\.\s+[A-Z]/.test(trimmed) ||
        (trimmed === trimmed.toUpperCase() && trimmed.length > 6 && /[A-Z]/.test(trimmed));

      if (isSectionHeader) {
        streamOps.push('/F2 11 Tf');
        streamOps.push('0 -18 Td');
        streamOps.push(`(${escapePdfLiteral(trimmed)}) Tj`);
      } else {
        streamOps.push('/F1 10 Tf');
        streamOps.push('0 -15 Td');
        streamOps.push(`(${escapePdfLiteral(rawLine)}) Tj`);
      }
    }

    // Page footer
    streamOps.push('/F1 9 Tf');
    streamOps.push('0 -26 Td');
    streamOps.push(
      `(${escapePdfLiteral(`Page ${pIdx + 1} of ${pagesInput.length} · ONE Student Wall · Mindanao State University`)}) Tj`
    );
    streamOps.push('ET');

    const streamBody = streamOps.join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${fontRegularObjNum} 0 R /F2 ${fontBoldObjNum} 0 R >> >> >>`
    );
    objects.push(`<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream`);
  }

  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[1] = `<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pageObjNums.length} >>`;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    const offStr = String(offsets[i]).padStart(10, '0');
    pdf += `${offStr} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return `data:application/pdf;base64,${safeAsciiBtoa(pdf)}`;
}

export const MSU_CALCULUS_GEC_REVIEWER_PDF_DATA_URL = buildValidMultiPagePdfDataUrl([
  {
    heading: 'ONE MSUan · Calculus I & GEC Midterm Study Reviewer',
    subheading: 'Compiled by MSU Study Group · MAT 101 & General Education Core (Page 1 of 3)',
    lines: [
      '1. LIMITS AND CONTINUITY (MAT 101 - CALCULUS I)',
      '• Formal Limit Concept: lim (x -> a) f(x) = L means f(x) can be made arbitrarily close',
      '  to L by taking x sufficiently close to a (from both left and right sides).',
      '• Existence of a Two-Sided Limit:',
      '  lim (x -> a) f(x) = L if and only if Left-Hand Limit (x -> a-) = Right-Hand Limit (x -> a+).',
      '• Essential Trigonometric & Exponential Limits to Memorize:',
      '  - lim (x -> 0) [sin(x) / x] = 1',
      '  - lim (x -> 0) [(1 - cos(x)) / x] = 0',
      '  - lim (x -> 0) [(e^x - 1) / x] = 1',
      '  - lim (x -> infinity) [(1 + 1/x)^x] = e',
      '2. CONTINUITY AT A POINT AND ASYMPTOTES',
      '• Three Conditions for Continuity of f(x) at x = c:',
      '  (1) f(c) is defined (c is in the domain of f)',
      '  (2) lim (x -> c) f(x) exists',
      '  (3) lim (x -> c) f(x) = f(c)',
      '• Types of Discontinuities:',
      '  - Removable Discontinuity: Limit exists, but f(c) is undefined or not equal to the limit.',
      '  - Jump Discontinuity: Left-hand limit and right-hand limit exist but are unequal.',
      '  - Infinite Discontinuity: One or both one-sided limits approach +infinity or -infinity.',
      '• Intermediate Value Theorem (IVT):',
      '  If f is continuous on closed interval [a, b] and N is between f(a) and f(b),',
      '  then there exists at least one c in (a, b) such that f(c) = N.',
    ],
  },
  {
    heading: 'Part II · Derivatives, Chain Rule & Optimization (MAT 101)',
    subheading: 'Differentiation Rules, Implicit Differentiation & Related Rates (Page 2 of 3)',
    lines: [
      '3. CORE DIFFERENTIATION FORMULAS',
      '• Limit Definition of the Derivative: f\'(x) = lim (h -> 0) [f(x + h) - f(x)] / h',
      '• Power Rule: d/dx [x^n] = n * x^(n - 1)',
      '• Product Rule: d/dx [f(x) * g(x)] = f\'(x)g(x) + f(x)g\'(x)',
      '• Quotient Rule: d/dx [f(x) / g(x)] = [f\'(x)g(x) - f(x)g\'(x)] / [g(x)]^2',
      '• Chain Rule (Composite Functions): d/dx [f(g(x))] = f\'(g(x)) * g\'(x)',
      '4. TRIGONOMETRIC, LOGARITHMIC & EXPONENTIAL DERIVATIVES',
      '• d/dx [sin(u)] = cos(u) * du/dx      |   d/dx [cos(u)] = -sin(u) * du/dx',
      '• d/dx [tan(u)] = sec^2(u) * du/dx    |   d/dx [sec(u)] = sec(u)tan(u) * du/dx',
      '• d/dx [e^u] = e^u * du/dx            |   d/dx [a^u] = a^u * ln(a) * du/dx',
      '• d/dx [ln(u)] = (1 / u) * du/dx      |   d/dx [arctan(u)] = (1 / (1 + u^2)) * du/dx',
      '5. CRITICAL POINTS, EXTREMA & CONCAVITY TESTS',
      '• Critical Numbers: Values c in domain of f where f\'(c) = 0 or f\'(c) does not exist.',
      '• First Derivative Test:',
      '  - f\' changes from (+) to (-) at c  =>  Local Maximum at x = c',
      '  - f\' changes from (-) to (+) at c  =>  Local Minimum at x = c',
      '• Second Derivative & Concavity:',
      '  - f\'\'(x) > 0 on interval I  =>  Concave Upward (f\'\'(c) > 0 implies Local Minimum)',
      '  - f\'\'(x) < 0 on interval I  =>  Concave Downward (f\'\'(c) < 0 implies Local Maximum)',
    ],
  },
  {
    heading: 'Part III · GEC Core & MinSuPala History Midterm Notes',
    subheading: 'Readings in Philippine History (GEC 102) & History of MinSuPala (HIS 003) (Page 3 of 3)',
    lines: [
      '6. HISTORICAL METHOD: PRIMARY VS. SECONDARY SOURCES (GEC 102)',
      '• Primary Sources: Eyewitness accounts, treaties, diaries, artifacts, official records',
      '  produced during the historical period under study.',
      '• External Criticism (Test of Authenticity):',
      '  Verifies provenance, date, paper/ink, handwriting, and anachronisms to prevent forgery.',
      '• Internal Criticism (Test of Credibility):',
      '  Evaluates the author\'s reliability, perspective, intent, and corroboration of facts.',
      '7. HISTORY OF MINDANAO, SULU & PALAWAN (HIS 003 - MINSUPALA)',
      '• Tri-People of Mindanao: Moro (13 Islamized ethnolinguistic groups), Lumad (Indigenous',
      '  non-Islamized groups of Mindanao), and Migrant Settler communities.',
      '• Traditional Political Institutions:',
      '  - Sultanate of Sulu (founded c. 1450 by Sharif ul-Hashim / Abu Bakr)',
      '  - Sultanate of Maguindanao (consolidated under Sharif Kabungsuwan & Sultan Kudarat)',
      '  - Pat a Pangampong ko Ranao (Four Lake Lanao Principalities: Bayabao, Masiu, Unayan, Baloi)',
      '• Mindanao State University Charter:',
      '  Created under Republic Act No. 1387 (authored by Sen. Domocao Alonto),',
      '  formally established in Marawi City on September 1, 1961 under Pres. Antonio Isidro.',
      '8. MIDTERM EXAM DAY CHECKLIST FOR MSUANS',
      '• Bring validated MSU Student ID, official exam permit, blue book, and scientific calculator.',
      '• Arrive 15 minutes before your scheduled departmental exam block.',
    ],
  },
]);

function unescapePdfString(raw: string): string {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === 'n') {
        out += '\n';
        i++;
      } else if (next === 'r') {
        out += '\r';
        i++;
      } else if (next === 't') {
        out += '\t';
        i++;
      } else if (next === '(' || next === ')' || next === '\\') {
        out += next;
        i++;
      } else if (/[0-7]/.test(next)) {
        const oct = raw.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] || next;
        const code = parseInt(oct, 8);
        if (code === 0o225) {
          out += '•';
        } else if (code === 0o267) {
          out += '·';
        } else {
          out += String.fromCharCode(code);
        }
        i += oct.length;
      } else {
        out += next;
        i++;
      }
    } else {
      out += ch;
    }
  }
  return out;
}

function parsePdfTextOperatorsFromStream(streamContent: string): string[] {
  const lines: string[] = [];
  const btBlocks = streamContent.match(/BT[\s\S]*?ET/g) || [streamContent];

  for (const block of btBlocks) {
    let currentLine = '';
    const tokenRegex =
      /\((?:\\.|[^\\()])*\)\s*(?:Tj|')|\[(?:\\.|[^[\]])*\]\s*TJ|(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+T[dD]|T\*/g;
    let match: RegExpExecArray | null;
    while ((match = tokenRegex.exec(block)) !== null) {
      const token = match[0];
      if (token === 'T*' || /\s+T[dD]$/.test(token)) {
        if (currentLine.trim()) {
          lines.push(currentLine.trim());
          currentLine = '';
        }
      } else if (token.endsWith('TJ')) {
        const strMatches = token.match(/\((?:\\.|[^\\()])*\)|-?\d+(?:\.\d+)?/g) || [];
        let piece = '';
        for (const item of strMatches) {
          if (item.startsWith('(') && item.endsWith(')')) {
            piece += unescapePdfString(item.slice(1, -1));
          } else {
            const kern = parseFloat(item);
            if (!Number.isNaN(kern) && kern < -120 && !piece.endsWith(' ')) {
              piece += ' ';
            }
          }
        }
        currentLine += piece;
      } else {
        const openIdx = token.indexOf('(');
        const closeIdx = token.lastIndexOf(')');
        if (openIdx !== -1 && closeIdx > openIdx) {
          const decoded = unescapePdfString(token.slice(openIdx + 1, closeIdx));
          currentLine += decoded;
        }
      }
    }
    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }
  }

  return lines.filter((line) => {
    const clean = line.replace(/\s+/g, ' ').trim();
    if (!clean) return false;
    // Ignore page footer line duplicated by our own generator when rendering Study Reader
    if (/^Page \d+ of \d+ · ONE Student Wall/.test(clean)) return false;
    return true;
  });
}

function extractPdfPagesSync(latin1Pdf: string): string[][] {
  const pages: string[][] = [];
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(latin1Pdf)) !== null) {
    const body = match[1];
    if (body.includes('BT') && (body.includes('Tj') || body.includes('TJ'))) {
      const lines = parsePdfTextOperatorsFromStream(body);
      if (lines.length > 0) {
        pages.push(lines);
      }
    }
  }
  return pages;
}

async function tryDecompressFlateBytes(rawBytes: Uint8Array): Promise<string | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  for (const format of ['deflate', 'deflate-raw'] as const) {
    try {
      const inputBlob = new Blob([rawBytes as unknown as BlobPart]);
      const decompressedStream = inputBlob.stream().pipeThrough(new DecompressionStream(format));
      const resp = new Response(decompressedStream);
      const buf = await Promise.race([
        resp.arrayBuffer().catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 300)),
      ]);
      if (buf && buf.byteLength > 0) {
        return new TextDecoder('latin1').decode(new Uint8Array(buf));
      }
    } catch {
      // try next format
    }
  }
  return null;
}

export interface ResolvedPdfDocument {
  blobUrl: string;
  pages: string[][];
  totalPages: number;
  hasExtractableText: boolean;
}

const resolvedPdfDocCache = new Map<string, ResolvedPdfDocument>();

/**
 * Resolves any PDF source (base64 DataURL, IndexedDB, Firestore chunks, or HTTP URL)
 * into a local `blob:` URL (with `application/pdf` MIME type) AND extracts readable text pages
 * for the interactive in-modal PDF Study Reviewer Reader.
 */
export async function resolvePdfDocumentData(
  rawUrl?: string,
  resolvedUrl?: string
): Promise<ResolvedPdfDocument> {
  const sourceKey = (rawUrl || resolvedUrl || '').trim();
  if (!sourceKey) {
    return { blobUrl: '', pages: [], totalPages: 1, hasExtractableText: false };
  }

  const cacheHit = resolvedPdfDocCache.get(sourceKey);
  if (cacheHit) return cacheHit;

  try {
    let effectiveUrl = sourceKey;
    if (effectiveUrl.startsWith('idb://') || effectiveUrl.startsWith('firestore-chunked://')) {
      effectiveUrl = await resolveMediaAttachmentUrl(effectiveUrl, 'pdf', 'application/pdf');
    }

    let bytes: Uint8Array | null = null;
    let blobUrl = '';

    if (effectiveUrl.startsWith('data:')) {
      blobUrl = dataUrlToBlobUrl(effectiveUrl, 'application/pdf');
      const commaIdx = effectiveUrl.indexOf(',');
      if (commaIdx !== -1) {
        const binary = atob(effectiveUrl.slice(commaIdx + 1));
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
      }
    } else if (
      effectiveUrl.startsWith('blob:') ||
      effectiveUrl.startsWith('http://') ||
      effectiveUrl.startsWith('https://')
    ) {
      try {
        const resp = await fetch(effectiveUrl);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          bytes = new Uint8Array(buf);
          const pdfBlob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
          blobUrl = URL.createObjectURL(pdfBlob);
        } else {
          blobUrl = effectiveUrl;
        }
      } catch {
        blobUrl = effectiveUrl;
      }
    }

    if (!bytes || bytes.length === 0) {
      const fallback: ResolvedPdfDocument = {
        blobUrl: blobUrl || resolvedUrl || effectiveUrl,
        pages: [],
        totalPages: 1,
        hasExtractableText: false,
      };
      return fallback;
    }

    const latin1 = new TextDecoder('latin1').decode(bytes);
    const pageMatches = latin1.match(/\/Type\s*\/Page\b(?!s)/g);
    const declaredPageCount = pageMatches ? pageMatches.length : 0;

    const extractedPages: string[][] = [];
    const streamHeaderRegex = /(<<[\s\S]{1,420}?>>)\s*stream\r?\n/g;
    let headerMatch: RegExpExecArray | null;

    while ((headerMatch = streamHeaderRegex.exec(latin1)) !== null) {
      const dict = headerMatch[1];
      if (
        /\/Subtype\s*\/Image|\/Type\s*\/XRef|\/Type\s*\/ObjStm|\/Subtype\s*\/XML|\/Length1\b/.test(
          dict
        )
      ) {
        continue;
      }
      const streamStartOffset = headerMatch.index + headerMatch[0].length;
      const endStreamIdx = latin1.indexOf('endstream', streamStartOffset);
      if (endStreamIdx === -1) continue;

      let streamEndOffset = endStreamIdx;
      if (latin1[streamEndOffset - 1] === '\n') streamEndOffset--;
      if (latin1[streamEndOffset - 1] === '\r') streamEndOffset--;

      let decodedStreamText: string | null = null;
      if (/\/FlateDecode\b/.test(dict)) {
        const rawSlice = bytes.subarray(streamStartOffset, streamEndOffset);
        decodedStreamText = await tryDecompressFlateBytes(rawSlice);
      } else {
        decodedStreamText = latin1.slice(streamStartOffset, streamEndOffset);
      }

      if (
        decodedStreamText &&
        decodedStreamText.includes('BT') &&
        (decodedStreamText.includes('Tj') || decodedStreamText.includes('TJ'))
      ) {
        const pageLines = parsePdfTextOperatorsFromStream(decodedStreamText);
        if (pageLines.length > 0) {
          extractedPages.push(pageLines);
        }
      }
    }

    const totalPages = Math.max(1, declaredPageCount, extractedPages.length);
    const result: ResolvedPdfDocument = {
      blobUrl,
      pages: extractedPages,
      totalPages,
      hasExtractableText: extractedPages.some((p) => p.length > 0),
    };
    resolvedPdfDocCache.set(sourceKey, result);
    return result;
  } catch {
    return {
      blobUrl: resolvedUrl || rawUrl || '',
      pages: [],
      totalPages: 1,
      hasExtractableText: false,
    };
  }
}

