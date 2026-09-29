import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Layers,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  formatFileSize,
  ResolvedPdfDocument,
  resolvePdfDocumentData,
} from '../utils/fileHelpers';

interface PdfReviewerViewerProps {
  rawUrl: string;
  resolvedUrl?: string;
  fileName: string;
  fileSize?: number;
  onDownload?: () => void;
}

function highlightSearchText(text: string, query: string): React.ReactNode {
  const trimmed = query.trim();
  if (!trimmed) return text;
  try {
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, idx) =>
      part.toLowerCase() === trimmed.toLowerCase() ? (
        <mark
          key={idx}
          className="bg-[#D4AF37]/40 text-[#1F1617] font-semibold px-0.5 rounded"
        >
          {part}
        </mark>
      ) : (
        <React.Fragment key={idx}>{part}</React.Fragment>
      )
    );
  } catch {
    return text;
  }
}

export const PdfReviewerViewer: React.FC<PdfReviewerViewerProps> = ({
  rawUrl,
  resolvedUrl,
  fileName,
  fileSize,
  onDownload,
}) => {
  const [pdfDoc, setPdfDoc] = useState<ResolvedPdfDocument | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'reader' | 'all_pages' | 'native'>('reader');
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    resolvePdfDocumentData(rawUrl, resolvedUrl)
      .then((docData) => {
        if (!active) return;
        setPdfDoc(docData);
        setCurrentPage(1);
        if (!docData.hasExtractableText && docData.blobUrl) {
          setViewMode('native');
        } else {
          setViewMode('reader');
        }
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [rawUrl, resolvedUrl]);

  const pages = pdfDoc?.pages || [];
  const totalPages = Math.max(1, pages.length || pdfDoc?.totalPages || 1);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (viewMode === 'reader' && pages.length > 1) {
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          setCurrentPage((prev) => Math.min(pages.length, prev + 1));
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          setCurrentPage((prev) => Math.max(1, prev - 1));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, pages.length]);

  const matchingPageIndices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || pages.length === 0) return [];
    const matches: number[] = [];
    pages.forEach((lines, idx) => {
      if (lines.some((l) => l.toLowerCase().includes(q))) {
        matches.push(idx + 1);
      }
    });
    return matches;
  }, [pages, searchQuery]);

  const fontSizeStyle = useMemo(() => {
    if (zoomPercent <= 85) return 'text-xs leading-relaxed';
    if (zoomPercent === 100) return 'text-sm leading-relaxed';
    if (zoomPercent === 115) return 'text-base leading-relaxed';
    return 'text-lg leading-relaxed';
  }, [zoomPercent]);

  const renderStudyPageSheet = (pageLines: string[], pageNumber: number) => {
    const titleLine = pageLines[0] || fileName;
    const subtitleLine =
      pageLines.length > 1 &&
      (pageLines[1].includes('Page ') ||
        pageLines[1].includes('Compiled') ||
        pageLines[1].includes('Shared via') ||
        pageLines[1].includes('Rules') ||
        pageLines[1].includes('Readings'))
        ? pageLines[1]
        : null;
    const bodyLines = subtitleLine ? pageLines.slice(2) : pageLines.slice(1);

    return (
      <div
        key={`pdf-sheet-${pageNumber}`}
        className="bg-white border border-[#E8DFDC] rounded-xl shadow-xs overflow-hidden max-w-3xl mx-auto"
      >
        {/* Top Academic Page Header */}
        <div className="px-5 sm:px-7 py-4 bg-[#FAF8F5] border-b border-[#E8DFDC] flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[11px] font-mono text-[#6E5D5F]">
              <span className="font-semibold text-[#7B1113]">
                PAGE {pageNumber} OF {Math.max(pages.length, totalPages)}
              </span>
              <span aria-hidden="true">·</span>
              <span className="truncate">{fileName}</span>
            </div>
            <h5 className="font-display text-base sm:text-lg font-bold text-[#1F1617] mt-1 break-words">
              {highlightSearchText(titleLine, searchQuery)}
            </h5>
            {subtitleLine && (
              <p className="text-xs text-[#6E5D5F] mt-0.5 break-words">
                {highlightSearchText(subtitleLine, searchQuery)}
              </p>
            )}
          </div>
        </div>

        {/* Page Study Notes Body */}
        <div className={`p-5 sm:p-7 space-y-2.5 text-[#1F1617] ${fontSizeStyle}`}>
          {bodyLines.length === 0 ? (
            <p className="text-[#1F1617] whitespace-pre-wrap break-words">
              {highlightSearchText(titleLine, searchQuery)}
            </p>
          ) : (
            bodyLines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) {
                return <div key={lIdx} className="h-2" />;
              }

              const isNumberedSection =
                /^[0-9]+\.\s+[A-Z]/.test(trimmed) ||
                (trimmed === trimmed.toUpperCase() &&
                  trimmed.length > 6 &&
                  /[A-Z]/.test(trimmed) &&
                  !trimmed.startsWith('•') &&
                  !trimmed.startsWith('-'));

              const isPrimaryBullet = trimmed.startsWith('•') || /^\([0-9]+\)/.test(trimmed);
              const isSubBullet =
                trimmed.startsWith('- ') ||
                trimmed.startsWith('– ') ||
                (line.startsWith('  ') && !isPrimaryBullet);

              if (isNumberedSection) {
                return (
                  <div
                    key={lIdx}
                    className="pt-3 first:pt-0 pb-1 border-b border-[#F2ECE9] flex items-center gap-2"
                  >
                    <span className="w-1.5 h-4 rounded-full bg-[#7B1113] shrink-0" />
                    <h6 className="font-bold text-[#7B1113] tracking-tight break-words">
                      {highlightSearchText(trimmed, searchQuery)}
                    </h6>
                  </div>
                );
              }

              if (isPrimaryBullet) {
                return (
                  <div key={lIdx} className="pl-2 sm:pl-3 flex items-start gap-2">
                    <span className="text-[#7B1113] font-bold shrink-0 select-none">•</span>
                    <p className="flex-1 break-words">
                      {highlightSearchText(trimmed.replace(/^•\s*/, ''), searchQuery)}
                    </p>
                  </div>
                );
              }

              if (isSubBullet) {
                const formulaLike =
                  trimmed.includes('lim ') ||
                  trimmed.includes('d/dx') ||
                  trimmed.includes("f'(x)") ||
                  trimmed.includes("f''(x)") ||
                  trimmed.includes('=>');
                return (
                  <div
                    key={lIdx}
                    className={`ml-5 sm:ml-7 pl-3 border-l-2 ${
                      formulaLike
                        ? 'border-[#D4AF37] bg-[#FAF8F5] py-1 px-2.5 rounded-r-lg font-mono text-[0.92em]'
                        : 'border-[#E8DFDC]'
                    }`}
                  >
                    <p className="break-words">
                      {highlightSearchText(trimmed, searchQuery)}
                    </p>
                  </div>
                );
              }

              return (
                <p key={lIdx} className="pl-2 sm:pl-3 text-[#1F1617]/90 break-words">
                  {highlightSearchText(trimmed, searchQuery)}
                </p>
              );
            })
          )}
        </div>

        {/* Bottom Page Footer */}
        <div className="px-5 sm:px-7 py-3 bg-[#FAF8F5] border-t border-[#E8DFDC] flex items-center justify-between text-xs text-[#6E5D5F]">
          <span>ONE Student Wall · Verified Study Reviewer</span>
          <span className="font-mono tabular-nums">
            Page {pageNumber} / {Math.max(pages.length, totalPages)}
          </span>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="w-10 h-10 rounded-xl bg-white border border-[#E8DFDC] flex items-center justify-center mx-auto animate-pulse">
          <BookOpen className="w-5 h-5 text-[#7B1113]" />
        </div>
        <p className="text-xs font-medium text-[#6E5D5F]">
          Loading PDF study reviewer pages...
        </p>
      </div>
    );
  }

  const effectiveBlobUrl = pdfDoc?.blobUrl || resolvedUrl || rawUrl;

  return (
    <div className="flex flex-col h-full space-y-3">
      {/* Interactive Reviewer Control Bar */}
      <div className="bg-white border border-[#E8DFDC] rounded-xl p-2.5 sm:p-3 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        {/* Mode Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[#FAF8F5] border border-[#E8DFDC] rounded-lg">
          {pages.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setViewMode('reader')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'reader'
                    ? 'bg-[#7B1113] text-white shadow-2xs'
                    : 'text-[#6E5D5F] hover:text-[#1F1617]'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Study Reader</span>
              </button>
              {pages.length > 1 && (
                <button
                  type="button"
                  onClick={() => setViewMode('all_pages')}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
                    viewMode === 'all_pages'
                      ? 'bg-[#7B1113] text-white shadow-2xs'
                      : 'text-[#6E5D5F] hover:text-[#1F1617]'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>All Pages ({pages.length})</span>
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={() => setViewMode('native')}
            className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'native'
                ? 'bg-[#7B1113] text-white shadow-2xs'
                : 'text-[#6E5D5F] hover:text-[#1F1617]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Original PDF</span>
          </button>
        </div>

        {/* Page Turners (when in single-page Study Reader mode) */}
        {viewMode === 'reader' && pages.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-2.5 py-1.5 rounded-lg border border-[#E8DFDC] bg-[#FAF8F5] hover:bg-[#F2ECE9] disabled:opacity-40 text-xs font-medium text-[#1F1617] flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
              title="Previous Page (Left Arrow)"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Prev</span>
            </button>

            <div className="flex items-center gap-1 px-1">
              {pages.map((_, idx) => {
                const pageNum = idx + 1;
                const isCurrent = currentPage === pageNum;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-lg text-xs font-mono font-semibold transition-colors cursor-pointer ${
                      isCurrent
                        ? 'bg-[#7B1113] text-[#D4AF37]'
                        : 'bg-[#FAF8F5] text-[#6E5D5F] hover:text-[#1F1617] border border-[#E8DFDC]'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={currentPage >= pages.length}
              onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
              className="px-2.5 py-1.5 rounded-lg border border-[#E8DFDC] bg-[#FAF8F5] hover:bg-[#F2ECE9] disabled:opacity-40 text-xs font-medium text-[#1F1617] flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed"
              title="Next Page (Right Arrow)"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Search & Zoom Controls (for Reader & All Pages modes) */}
        {viewMode !== 'native' && pages.length > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#6E5D5F] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchQuery(val);
                  if (val.trim()) {
                    const q = val.trim().toLowerCase();
                    const firstMatchIdx = pages.findIndex((lines) =>
                      lines.some((l) => l.toLowerCase().includes(q))
                    );
                    if (firstMatchIdx !== -1) {
                      setCurrentPage(firstMatchIdx + 1);
                    }
                  }
                }}
                placeholder="Find in reviewer..."
                className="pl-8 pr-7 py-1.5 text-xs bg-[#FAF8F5] border border-[#E8DFDC] rounded-lg focus:outline-none focus:border-[#7B1113] w-36 sm:w-44"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6E5D5F] hover:text-[#1F1617] cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-1 border border-[#E8DFDC] rounded-lg p-0.5 bg-[#FAF8F5]">
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.max(85, z - 15))}
                disabled={zoomPercent <= 85}
                className="p-1 text-[#6E5D5F] hover:text-[#1F1617] disabled:opacity-40 cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-[11px] font-mono text-[#1F1617] px-1 tabular-nums">
                {zoomPercent}%
              </span>
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.min(130, z + 15))}
                disabled={zoomPercent >= 130}
                className="p-1 text-[#6E5D5F] hover:text-[#1F1617] disabled:opacity-40 cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Search Matches Bar */}
      {searchQuery.trim() && viewMode !== 'native' && (
        <div className="px-3.5 py-2 rounded-xl bg-white border border-[#E8DFDC] flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[#6E5D5F]">
            {matchingPageIndices.length > 0 ? (
              <>
                Found matches for <strong className="text-[#1F1617]">"{searchQuery}"</strong> on{' '}
                {matchingPageIndices.length === 1 ? 'Page' : 'Pages'}{' '}
                {matchingPageIndices.join(', ')}
              </>
            ) : (
              <>
                No matches found for <strong className="text-[#1F1617]">"{searchQuery}"</strong>
              </>
            )}
          </span>
          {matchingPageIndices.length > 1 && viewMode === 'reader' && (
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-[#6E5D5F]">Jump to:</span>
              {matchingPageIndices.map((pNum) => (
                <button
                  key={pNum}
                  type="button"
                  onClick={() => setCurrentPage(pNum)}
                  className={`px-2 py-0.5 rounded text-xs font-mono font-semibold cursor-pointer ${
                    currentPage === pNum
                      ? 'bg-[#7B1113] text-[#D4AF37]'
                      : 'bg-[#FAF8F5] text-[#7B1113] border border-[#E8DFDC]'
                  }`}
                >
                  Page {pNum}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {viewMode === 'reader' && pages.length > 0 ? (
        <div className="space-y-3">
          {renderStudyPageSheet(
            pages[Math.min(pages.length - 1, Math.max(0, currentPage - 1))],
            currentPage
          )}

          {pages.length > 1 && (
            <div className="flex items-center justify-between max-w-3xl mx-auto pt-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3.5 py-2 rounded-xl bg-white border border-[#E8DFDC] hover:bg-[#F2ECE9] disabled:opacity-40 text-xs font-semibold text-[#1F1617] flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4 text-[#7B1113]" />
                <span>Previous Page</span>
              </button>
              <span className="text-xs font-mono text-[#6E5D5F]">
                Page {currentPage} of {pages.length}
              </span>
              <button
                type="button"
                disabled={currentPage >= pages.length}
                onClick={() => setCurrentPage((p) => Math.min(pages.length, p + 1))}
                className="px-3.5 py-2 rounded-xl bg-[#7B1113] hover:bg-[#580B0C] disabled:opacity-40 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
              >
                <span>Next Page</span>
                <ChevronRight className="w-4 h-4 text-[#D4AF37]" />
              </button>
            </div>
          )}
        </div>
      ) : viewMode === 'all_pages' && pages.length > 0 ? (
        <div className="space-y-4">
          {pages.map((pageLines, idx) => renderStudyPageSheet(pageLines, idx + 1))}
        </div>
      ) : (
        <div className="bg-white border border-[#E8DFDC] rounded-xl overflow-hidden flex flex-col">
          {effectiveBlobUrl ? (
            <>
              <object
                data={`${effectiveBlobUrl}#toolbar=1&navpanes=0&view=FitH`}
                type="application/pdf"
                className="w-full h-[62vh] min-h-[420px] bg-stone-100"
              >
                <iframe
                  src={`${effectiveBlobUrl}#toolbar=1&navpanes=0&view=FitH`}
                  title={fileName}
                  className="w-full h-[62vh] min-h-[420px] border-0"
                />
              </object>
              <div className="px-4 py-2.5 bg-[#FAF8F5] border-t border-[#E8DFDC] flex flex-wrap items-center justify-between gap-2 text-xs text-[#6E5D5F]">
                <span>
                  {fileName}
                  {fileSize ? ` · ${formatFileSize(fileSize)}` : ''}
                </span>
                <div className="flex items-center gap-2">
                  {pages.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setViewMode('reader')}
                      className="text-[#7B1113] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>Switch to Study Reader</span>
                    </button>
                  )}
                  <a
                    href={effectiveBlobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1F1617] font-medium hover:underline flex items-center gap-1"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open PDF Tab</span>
                  </a>
                  {onDownload && (
                    <button
                      type="button"
                      onClick={onDownload}
                      className="text-[#7B1113] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="py-12 text-center space-y-2">
              <FileText className="w-10 h-10 text-[#7B1113] mx-auto" />
              <p className="text-sm font-semibold text-[#1F1617]">{fileName}</p>
              <p className="text-xs text-[#6E5D5F]">
                Click Download above to save and open this PDF reviewer.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
