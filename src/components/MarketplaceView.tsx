import React, { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Check,
  CheckCircle2,
  Clock,
  DollarSign,
  Edit3,
  Eye,
  Filter,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Package,
  Plus,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import {
  ChatPeerTarget,
  MARKETPLACE_CATEGORIES,
  MARKETPLACE_CONDITIONS,
  MSU_CAMPUSES,
  MarketplaceCategory,
  MarketplaceCondition,
  MarketplaceListing,
  MarketplaceListingType,
  MarketplaceStatus,
  UserPresence,
  UserPublicProfile,
} from '../types';
import { UserBadgeTag } from './UserBadgeTag';
import { uploadFileToSupabaseStorage } from '../supabaseClient';

interface MarketplaceViewProps {
  listings: MarketplaceListing[];
  currentUserUid: string;
  userProfile: UserPublicProfile;
  presenceList: UserPresence[];
  darkMode?: boolean;
  isModeratorOrDev?: boolean;
  onCreateOrUpdateListing: (listing: MarketplaceListing, isEdit: boolean) => Promise<void>;
  onUpdateListingStatus: (listingId: string, status: MarketplaceStatus) => Promise<void>;
  onDeleteListing: (listingId: string) => Promise<void>;
  onSendMarketplaceInquiry: (
    listing: MarketplaceListing,
    inquiryText: string,
    openChatAfter: boolean
  ) => Promise<void>;
  onStartDirectChatWithPeer: (peer: ChatPeerTarget) => void;
}

function formatRelativeTime(ts: Timestamp | null | undefined): string {
  if (!ts) return 'Just now';
  const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : (ts.seconds || 0) * 1000;
  if (!ms) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(ms).toLocaleDateString();
}

function formatPhpPrice(price: number): string {
  if (!price || price <= 0) return 'Free / Swap';
  return `₱${price.toLocaleString('en-PH')}`;
}

async function compressMarketplaceImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1100;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = () => resolve(String(reader.result || ''));
      img.src = String(reader.result || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  listings,
  currentUserUid,
  userProfile,
  presenceList,
  darkMode = false,
  isModeratorOrDev = false,
  onCreateOrUpdateListing,
  onUpdateListingStatus,
  onDeleteListing,
  onSendMarketplaceInquiry,
  onStartDirectChatWithPeer,
}) => {
  const [activeTypeFilter, setActiveTypeFilter] = useState<'all' | 'sell' | 'buy' | 'mine'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedCampus, setSelectedCampus] = useState<string>('All Campuses');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'popular'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [hideSold, setHideSold] = useState(false);

  // Create / Edit Modal state
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<MarketplaceListing | null>(null);
  const [listingType, setListingType] = useState<MarketplaceListingType>('sell');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<MarketplaceCategory>('Textbooks & Reviewers');
  const [condition, setCondition] = useState<MarketplaceCondition>('Like New');
  const [priceInput, setPriceInput] = useState('');
  const [isNegotiable, setIsNegotiable] = useState(true);
  const [campus, setCampus] = useState(userProfile.campus || 'MSU Main Campus - Marawi');
  const [meetupLocation, setMeetupLocation] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageName, setImageName] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Detail & Contact Seller/Buyer Modal state
  const [selectedListing, setSelectedListing] = useState<MarketplaceListing | null>(null);
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [isSendingInquiry, setIsSendingInquiry] = useState(false);
  const [inquirySentSuccess, setInquirySentSuccess] = useState(false);

  const onlineMap = useMemo(() => {
    const map = new Map<string, boolean>();
    presenceList.forEach((p) => {
      const fresh = Date.now() - (p.lastSeenMs || 0) < 15 * 60 * 1000;
      if (p.isOnline && fresh) {
        map.set(p.uid, true);
      }
    });
    return map;
  }, [presenceList]);

  const stats = useMemo(() => {
    const active = listings.filter((l) => l.status !== 'sold' && l.status !== 'fulfilled');
    const forSaleCount = active.filter((l) => l.listingType === 'sell').length;
    const lookingToBuyCount = active.filter((l) => l.listingType === 'buy').length;
    const myCount = listings.filter((l) => l.authorId === currentUserUid).length;
    return { forSaleCount, lookingToBuyCount, myCount, total: listings.length };
  }, [listings, currentUserUid]);

  const filteredListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return listings
      .filter((item) => {
        if (activeTypeFilter === 'sell' && item.listingType !== 'sell') return false;
        if (activeTypeFilter === 'buy' && item.listingType !== 'buy') return false;
        if (activeTypeFilter === 'mine' && item.authorId !== currentUserUid) return false;
        if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
        if (selectedCampus !== 'All Campuses' && item.campus !== selectedCampus) return false;
        if (hideSold && (item.status === 'sold' || item.status === 'fulfilled')) return false;
        if (q) {
          const hay = `${item.title} ${item.description} ${item.category} ${item.authorNickname} ${item.authorDisplayName} ${item.campus} ${item.meetupLocation}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'price_asc') return (a.price || 0) - (b.price || 0);
        if (sortBy === 'price_desc') return (b.price || 0) - (a.price || 0);
        if (sortBy === 'popular') return (b.inquiriesCount || 0) - (a.inquiriesCount || 0);
        const aMs =
          typeof a.createdAt?.toMillis === 'function'
            ? a.createdAt.toMillis()
            : (a.createdAt?.seconds || 0) * 1000;
        const bMs =
          typeof b.createdAt?.toMillis === 'function'
            ? b.createdAt.toMillis()
            : (b.createdAt?.seconds || 0) * 1000;
        return bMs - aMs;
      });
  }, [
    listings,
    activeTypeFilter,
    selectedCategory,
    selectedCampus,
    sortBy,
    searchQuery,
    hideSold,
    currentUserUid,
  ]);

  const openCreateModal = (initialType: MarketplaceListingType = 'sell') => {
    setEditingListing(null);
    setListingType(initialType);
    setTitle('');
    setCategory(initialType === 'buy' ? 'Textbooks & Reviewers' : 'Electronics & Calculators');
    setCondition(initialType === 'buy' ? 'Good' : 'Like New');
    setPriceInput('');
    setIsNegotiable(true);
    setCampus(userProfile.campus || 'MSU Main Campus - Marawi');
    setMeetupLocation('');
    setDescription('');
    setImageUrl('');
    setImageName('');
    setComposerError(null);
    setComposerOpen(true);
  };

  const openEditModal = (item: MarketplaceListing) => {
    setEditingListing(item);
    setListingType(item.listingType);
    setTitle(item.title);
    setCategory(item.category);
    setCondition(item.condition);
    setPriceInput(String(item.price || 0));
    setIsNegotiable(Boolean(item.isNegotiable));
    setCampus(item.campus || userProfile.campus || 'MSU Main Campus - Marawi');
    setMeetupLocation(item.meetupLocation || '');
    setDescription(item.description);
    setImageUrl(item.imageUrl || '');
    setImageName(item.imageName || '');
    setComposerError(null);
    setComposerOpen(true);
  };

  const openListingDetail = (item: MarketplaceListing) => {
    setSelectedListing(item);
    setInquirySentSuccess(false);
    const defaultMsg =
      item.listingType === 'sell'
        ? `Hi @${item.authorNickname}! Is your "${item.title}" (${formatPhpPrice(item.price)}) still available?`
        : `Hi @${item.authorNickname}! I saw your post looking for "${item.title}". I have one available!`;
    setInquiryMessage(defaultMsg);
  };

  React.useEffect(() => {
    if (!selectedListing) return;
    const updated = listings.find((l) => l.id === selectedListing.id);
    if (!updated) {
      setSelectedListing(null);
    } else if (updated !== selectedListing) {
      setSelectedListing(updated);
    }
  }, [listings, selectedListing]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setComposerError('Please select a valid image file (JPG, PNG, WEBP).');
      return;
    }
    setComposerError(null);
    setIsUploadingImage(true);
    try {
      const compressedDataUrl = await compressMarketplaceImage(file);
      const uploadedUrl = await uploadFileToSupabaseStorage({
        fileName: file.name || 'marketplace_item.jpg',
        mimeType: 'image/jpeg',
        base64DataUrl: compressedDataUrl,
        folder: 'marketplace',
      });
      setImageUrl(uploadedUrl || compressedDataUrl);
      setImageName(file.name);
    } catch {
      setComposerError('Could not process image. Please try another photo.');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmitListing = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanDesc = description.trim();
    const cleanMeetup = meetupLocation.trim() || 'Campus Meetup / Direct Chat';
    const parsedPrice = Math.max(0, Number(priceInput.replace(/[^0-9.]/g, '')) || 0);

    if (cleanTitle.length < 4) {
      setComposerError('Please enter a clear item title (at least 4 characters).');
      return;
    }
    if (cleanDesc.length < 8) {
      setComposerError('Please provide details about the item or what you are looking for.');
      return;
    }

    setIsSubmitting(true);
    setComposerError(null);
    try {
      const now = Timestamp.now();
      const newListing: MarketplaceListing = {
        id: editingListing ? editingListing.id : `mkt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        authorId: currentUserUid,
        authorNickname: userProfile.nickname,
        authorDisplayName: userProfile.googleDisplayName || userProfile.nickname,
        authorPhotoURL: userProfile.photoURL || '',
        authorDomain: userProfile.emailDomain || 'msumain.edu.ph',
        authorBadge: userProfile.badge || 'verified',
        listingType,
        category,
        title: cleanTitle,
        description: cleanDesc,
        price: parsedPrice,
        isNegotiable,
        condition,
        campus: campus || userProfile.campus || 'MSU Main Campus - Marawi',
        meetupLocation: cleanMeetup,
        imageUrl,
        imageName,
        status: editingListing ? editingListing.status : 'available',
        inquiriesCount: editingListing ? editingListing.inquiriesCount || 0 : 0,
        visibility: 'edu_verified',
        createdAt: editingListing?.createdAt || now,
        updatedAt: now,
      };

      await onCreateOrUpdateListing(newListing, Boolean(editingListing));
      setComposerOpen(false);
      setEditingListing(null);
    } catch (err: any) {
      setComposerError(err?.message || 'Failed to publish listing.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendInquirySubmit = async (openChatAfter: boolean) => {
    if (!selectedListing) return;
    const cleanMsg = inquiryMessage.trim();
    if (!cleanMsg) return;
    setIsSendingInquiry(true);
    try {
      await onSendMarketplaceInquiry(selectedListing, cleanMsg, openChatAfter);
      setInquirySentSuccess(true);
      setSelectedListing((prev) =>
        prev ? { ...prev, inquiriesCount: (prev.inquiriesCount || 0) + 1 } : null
      );
      if (openChatAfter) {
        setSelectedListing(null);
      }
    } finally {
      setIsSendingInquiry(false);
    }
  };

  return (
    <div className="space-y-5 dashboard-enter-anim">
      {/* Top Hero Banner & Action Controls */}
      <div
        className={`rounded-2xl border p-5 sm:p-6 transition-colors ${
          darkMode
            ? 'bg-gradient-to-br from-[#231517] via-[#18181B] to-[#141417] border-zinc-800 text-zinc-100'
            : 'bg-gradient-to-br from-[#FFF9F5] via-white to-[#FDF8EE] border-stone-200/90 text-stone-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#7B1113] dark:text-amber-400">
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Verified MSUan Student Exchange</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Campus Marketplace · Buy &amp; Sell
            </h1>
            <p className={`text-xs sm:text-sm max-w-2xl ${darkMode ? 'text-zinc-400' : 'text-stone-600'}`}>
              Post pre-loved textbooks, scientific calculators, dorm essentials, or uniforms you want to sell—or post a buy request and message verified fellow MSUans directly for safe campus meetups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => openCreateModal('sell')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#7B1113] hover:bg-[#620d0f] text-white shadow-sm transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Sell an Item</span>
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('buy')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition cursor-pointer ${
                darkMode
                  ? 'bg-zinc-900/90 border-amber-500/40 text-amber-300 hover:bg-zinc-800'
                  : 'bg-amber-50/90 border-amber-300 text-amber-950 hover:bg-amber-100/80'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Post Buy Request</span>
            </button>
          </div>
        </div>

        {/* Quick Marketplace Metrics Bar */}
        <div
          className={`mt-5 pt-4 border-t grid grid-cols-2 sm:grid-cols-4 gap-3 ${
            darkMode ? 'border-zinc-800/80' : 'border-stone-200/70'
          }`}
        >
          <button
            type="button"
            onClick={() => setActiveTypeFilter('all')}
            className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
              activeTypeFilter === 'all'
                ? darkMode
                  ? 'bg-zinc-800/90 border-zinc-700'
                  : 'bg-stone-100/90 border-stone-300'
                : darkMode
                ? 'border-zinc-800/50 hover:bg-zinc-900'
                : 'border-stone-200/60 hover:bg-stone-50'
            }`}
          >
            <div className={`text-[11px] font-medium ${darkMode ? 'text-zinc-400' : 'text-stone-500'}`}>
              Total Active Listings
            </div>
            <div className="text-lg font-bold tabular-nums mt-0.5">{stats.total}</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTypeFilter('sell')}
            className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
              activeTypeFilter === 'sell'
                ? darkMode
                  ? 'bg-emerald-950/40 border-emerald-700/60'
                  : 'bg-emerald-50 border-emerald-300'
                : darkMode
                ? 'border-zinc-800/50 hover:bg-zinc-900'
                : 'border-stone-200/60 hover:bg-stone-50'
            }`}
          >
            <div className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              Items For Sale
            </div>
            <div className="text-lg font-bold tabular-nums mt-0.5">{stats.forSaleCount}</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTypeFilter('buy')}
            className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
              activeTypeFilter === 'buy'
                ? darkMode
                  ? 'bg-amber-950/40 border-amber-700/60'
                  : 'bg-amber-50 border-amber-300'
                : darkMode
                ? 'border-zinc-800/50 hover:bg-zinc-900'
                : 'border-stone-200/60 hover:bg-stone-50'
            }`}
          >
            <div className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
              Looking to Buy (WTB)
            </div>
            <div className="text-lg font-bold tabular-nums mt-0.5">{stats.lookingToBuyCount}</div>
          </button>

          <button
            type="button"
            onClick={() => setActiveTypeFilter('mine')}
            className={`text-left p-2.5 rounded-xl border transition cursor-pointer ${
              activeTypeFilter === 'mine'
                ? darkMode
                  ? 'bg-rose-950/40 border-rose-700/60'
                  : 'bg-rose-50 border-rose-300'
                : darkMode
                ? 'border-zinc-800/50 hover:bg-zinc-900'
                : 'border-stone-200/60 hover:bg-stone-50'
            }`}
          >
            <div className={`text-[11px] font-medium ${darkMode ? 'text-zinc-400' : 'text-stone-500'}`}>
              My Posted Listings
            </div>
            <div className="text-lg font-bold tabular-nums mt-0.5">{stats.myCount}</div>
          </button>
        </div>
      </div>

      {/* Search, Campus, Sort & Category Controls */}
      <div
        className={`rounded-2xl border p-4 space-y-3.5 ${
          darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-stone-200/90 shadow-xs'
        }`}
      >
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search
              className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${
                darkMode ? 'text-zinc-500' : 'text-stone-400'
              }`}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search calculators, books, @seller, or meetup spot..."
              className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs sm:text-sm border outline-none transition ${
                darkMode
                  ? 'bg-zinc-950 border-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500/60'
                  : 'bg-stone-50 border-stone-200 text-stone-900 placeholder:text-stone-400 focus:border-[#7B1113]'
              }`}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-stone-200 dark:hover:bg-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Campus Selector */}
          <div className="md:col-span-4">
            <select
              value={selectedCampus}
              onChange={(e) => setSelectedCampus(e.target.value)}
              className={`w-full px-3 py-2 rounded-xl text-xs sm:text-sm border outline-none transition ${
                darkMode
                  ? 'bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-amber-500/60'
                  : 'bg-stone-50 border-stone-200 text-stone-800 focus:border-[#7B1113]'
              }`}
            >
              <option value="All Campuses">All MSU Campuses</option>
              {MSU_CAMPUSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Selector */}
          <div className="md:col-span-3">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={`w-full px-3 py-2 rounded-xl text-xs sm:text-sm border outline-none transition ${
                darkMode
                  ? 'bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-amber-500/60'
                  : 'bg-stone-50 border-stone-200 text-stone-800 focus:border-[#7B1113]'
              }`}
            >
              <option value="newest">Sort: Newest First</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="popular">Most Inquiries</option>
            </select>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {['All', ...MARKETPLACE_CATEGORIES].map((cat) => {
              const active = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition cursor-pointer ${
                    active
                      ? 'bg-[#7B1113] text-white shadow-xs'
                      : darkMode
                      ? 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-800'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200/70'
                  }`}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none shrink-0">
            <input
              type="checkbox"
              checked={hideSold}
              onChange={(e) => setHideSold(e.target.checked)}
              className="rounded border-stone-300 text-[#7B1113] focus:ring-[#7B1113]"
            />
            <span className={darkMode ? 'text-zinc-400' : 'text-stone-600'}>
              Hide sold/fulfilled
            </span>
          </label>
        </div>
      </div>

      {/* Listings Grid */}
      {filteredListings.length === 0 ? (
        <div
          className={`rounded-2xl border p-10 text-center space-y-3 ${
            darkMode ? 'bg-zinc-900/60 border-zinc-800 text-zinc-300' : 'bg-white border-stone-200 text-stone-700'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-[#7B1113]/10 text-[#7B1113] dark:bg-amber-500/10 dark:text-amber-400 flex items-center justify-center mx-auto">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div className="text-base font-semibold">No marketplace listings match your filter</div>
          <p className={`text-xs max-w-md mx-auto ${darkMode ? 'text-zinc-400' : 'text-stone-500'}`}>
            Be the first to list an item for sale or post a buy request for fellow MSUans on campus!
          </p>
          <div className="flex items-center justify-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => openCreateModal('sell')}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-[#7B1113] text-white hover:bg-[#620d0f] transition cursor-pointer"
            >
              + Sell an Item
            </button>
            <button
              type="button"
              onClick={() => openCreateModal('buy')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                darkMode
                  ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                  : 'border-stone-300 text-stone-800 hover:bg-stone-100'
              }`}
            >
              + Post Buy Request
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredListings.map((item) => {
            const isOwner = item.authorId === currentUserUid;
            const isOnline = onlineMap.get(item.authorId) || item.authorId === currentUserUid;
            const isSoldOrFulfilled = item.status === 'sold' || item.status === 'fulfilled';
            const isReserved = item.status === 'reserved';

            return (
              <div
                key={item.id}
                onClick={() => openListingDetail(item)}
                className={`group rounded-2xl border overflow-hidden flex flex-col justify-between transition duration-200 cursor-pointer ${
                  darkMode
                    ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                    : 'bg-white border-stone-200/90 hover:border-stone-300 shadow-xs hover:shadow-md'
                } ${isSoldOrFulfilled ? 'opacity-75' : ''}`}
              >
                <div>
                  {/* 4:3 Image / Visual Header */}
                  <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100 dark:bg-zinc-950">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-103 transition duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div
                        className={`w-full h-full flex flex-col items-center justify-center p-6 text-center ${
                          item.listingType === 'buy'
                            ? darkMode
                              ? 'bg-gradient-to-br from-amber-950/50 via-zinc-900 to-zinc-950'
                              : 'bg-gradient-to-br from-amber-50 via-orange-50/40 to-stone-100'
                            : darkMode
                            ? 'bg-gradient-to-br from-rose-950/50 via-zinc-900 to-zinc-950'
                            : 'bg-gradient-to-br from-rose-50 via-stone-50 to-stone-100'
                        }`}
                      >
                        <Package
                          className={`w-10 h-10 mb-2 ${
                            item.listingType === 'buy'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-[#7B1113] dark:text-rose-400'
                          }`}
                        />
                        <span className="text-xs font-semibold uppercase tracking-wider opacity-75">
                          {item.category}
                        </span>
                        <span className="text-[11px] opacity-60 mt-0.5">{item.campus}</span>
                      </div>
                    )}

                    {/* Top-Left Listing Type Badge */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider shadow-xs ${
                          item.listingType === 'sell'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-500 text-stone-950'
                        }`}
                      >
                        {item.listingType === 'sell' ? 'For Sale' : 'Looking to Buy'}
                      </span>
                      {item.status !== 'available' && (
                        <span
                          className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider shadow-xs ${
                            item.status === 'reserved'
                              ? 'bg-amber-600 text-white'
                              : 'bg-stone-800 text-white'
                          }`}
                        >
                          {item.status === 'reserved'
                            ? 'Reserved'
                            : item.listingType === 'sell'
                            ? 'Sold'
                            : 'Fulfilled'}
                        </span>
                      )}
                    </div>

                    {/* Bottom Price Tag Overlay */}
                    <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                      <div className="px-3 py-1.5 rounded-xl bg-stone-950/85 backdrop-blur-md text-white shadow-sm">
                        <div className="text-[10px] uppercase tracking-wider text-stone-300">
                          {item.listingType === 'sell' ? 'Asking Price' : 'Target Budget'}
                        </div>
                        <div className="text-base sm:text-lg font-extrabold tabular-nums text-amber-300 leading-tight">
                          {formatPhpPrice(item.price)}
                          {item.isNegotiable && item.price > 0 && (
                            <span className="ml-1.5 text-[10px] font-medium text-stone-200">
                              • Negotiable
                            </span>
                          )}
                        </div>
                      </div>

                      <span className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-stone-950/75 text-stone-100 backdrop-blur-md">
                        {item.condition}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-zinc-400">
                      <span className="font-medium truncate">{item.category}</span>
                      <span className="shrink-0">{formatRelativeTime(item.createdAt)}</span>
                    </div>

                    <h3 className="font-bold text-sm sm:text-base line-clamp-1 group-hover:text-[#7B1113] dark:group-hover:text-amber-400 transition">
                      {item.title}
                    </h3>

                    <p
                      className={`text-xs line-clamp-2 leading-relaxed ${
                        darkMode ? 'text-zinc-400' : 'text-stone-600'
                      }`}
                    >
                      {item.description}
                    </p>

                    <div
                      className={`flex items-center gap-3 pt-1 text-[11px] ${
                        darkMode ? 'text-zinc-400' : 'text-stone-500'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1 truncate">
                        <MapPin className="w-3.5 h-3.5 text-[#7B1113] dark:text-amber-400 shrink-0" />
                        <span className="truncate">
                          {item.meetupLocation || item.campus}
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Seller/Buyer Identity + Action Button */}
                <div
                  className={`px-4 py-3 border-t flex items-center justify-between gap-2 ${
                    darkMode ? 'border-zinc-800/80 bg-zinc-950/40' : 'border-stone-100 bg-stone-50/70'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative shrink-0">
                      {item.authorPhotoURL ? (
                        <img
                          src={item.authorPhotoURL}
                          alt={item.authorNickname}
                          className="w-7 h-7 rounded-full object-cover border border-stone-200 dark:border-zinc-700"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-[#7B1113] text-white text-xs font-bold flex items-center justify-center">
                          {(item.authorNickname || 'M')[0].toUpperCase()}
                        </div>
                      )}
                      {isOnline && (
                        <span
                          title="Online now"
                          className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-900 absolute -bottom-0.5 -right-0.5"
                        />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-xs font-semibold truncate">
                        <span className="truncate">@{item.authorNickname}</span>
                        <UserBadgeTag badge={item.authorBadge} size="sm" />
                      </div>
                      <div className="text-[10px] text-stone-500 dark:text-zinc-400 truncate">
                        {item.campus}
                      </div>
                    </div>
                  </div>

                  {!isOwner ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openListingDetail(item)}
                        disabled={isSoldOrFulfilled}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 ${
                          isSoldOrFulfilled
                            ? 'bg-stone-200 text-stone-500 dark:bg-zinc-800 dark:text-zinc-500 cursor-not-allowed'
                            : item.listingType === 'sell'
                            ? 'bg-[#7B1113] hover:bg-[#620d0f] text-white shadow-xs'
                            : 'bg-amber-500 hover:bg-amber-600 text-stone-950 shadow-xs'
                        }`}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>
                          {item.listingType === 'sell' ? 'Contact Seller' : 'Contact Buyer'}
                        </span>
                      </button>
                      {isModeratorOrDev && (
                        <button
                          type="button"
                          onClick={() => onDeleteListing(item.id)}
                          title="Admin/Moderator: Delete listing for all users"
                          className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateListingStatus(
                            item.id,
                            isSoldOrFulfilled
                              ? 'available'
                              : item.listingType === 'sell'
                              ? 'sold'
                              : 'fulfilled'
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition cursor-pointer ${
                          isSoldOrFulfilled
                            ? darkMode
                              ? 'border-emerald-700 text-emerald-400 hover:bg-emerald-950/40'
                              : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                            : darkMode
                            ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                            : 'border-stone-300 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {isSoldOrFulfilled
                          ? 'Relist'
                          : item.listingType === 'sell'
                          ? 'Mark Sold'
                          : 'Mark Found'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        title="Edit listing"
                        className="p-1.5 rounded-lg hover:bg-stone-200/70 dark:hover:bg-zinc-800 text-stone-600 dark:text-zinc-300 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteListing(item.id)}
                        title="Delete listing"
                        className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* =====================================================================
          LISTING DETAIL & CONTACT SELLER / BUYER MODAL
         ===================================================================== */}
      {selectedListing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-fadeIn"
          onClick={() => setSelectedListing(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${
              darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-stone-200 text-stone-900'
            }`}
          >
            {/* Modal Header */}
            <div
              className={`sticky top-0 z-10 px-5 py-3.5 border-b flex items-center justify-between backdrop-blur-md ${
                darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/90 border-stone-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                    selectedListing.listingType === 'sell'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 text-stone-950'
                  }`}
                >
                  {selectedListing.listingType === 'sell' ? 'For Sale' : 'Looking to Buy'}
                </span>
                <span className="text-xs text-stone-500 dark:text-zinc-400">
                  {selectedListing.category}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelectedListing(null)}
                className="p-1.5 rounded-full hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {/* Listing Photo if present */}
              {selectedListing.imageUrl && (
                <div className="rounded-xl overflow-hidden border border-stone-200 dark:border-zinc-800 bg-stone-950 max-h-80 flex items-center justify-center">
                  <img
                    src={selectedListing.imageUrl}
                    alt={selectedListing.title}
                    className="max-h-80 w-auto object-contain"
                  />
                </div>
              )}

              {/* Title, Price & Status */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-bold leading-snug">
                    {selectedListing.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-zinc-400">
                    <span>Posted {formatRelativeTime(selectedListing.createdAt)}</span>
                    <span>•</span>
                    <span>Condition: {selectedListing.condition}</span>
                    <span>•</span>
                    <span>{selectedListing.inquiriesCount || 0} inquiries</span>
                  </div>
                </div>

                <div className="shrink-0 sm:text-right">
                  <div className="text-xl sm:text-2xl font-extrabold tabular-nums text-[#7B1113] dark:text-amber-400">
                    {formatPhpPrice(selectedListing.price)}
                  </div>
                  <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                    {selectedListing.isNegotiable ? 'Negotiable / Open to Offers' : 'Fixed Price'}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div
                className={`p-4 rounded-xl border text-xs sm:text-sm whitespace-pre-wrap leading-relaxed ${
                  darkMode ? 'bg-zinc-950/60 border-zinc-800 text-zinc-200' : 'bg-stone-50 border-stone-200/80 text-stone-700'
                }`}
              >
                {selectedListing.description}
              </div>

              {/* Campus & Meetup Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                    darkMode ? 'border-zinc-800 bg-zinc-950/40' : 'border-stone-200 bg-stone-50/60'
                  }`}
                >
                  <MapPin className="w-4 h-4 text-[#7B1113] dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-[11px] font-medium text-stone-500 dark:text-zinc-400">
                      Campus &amp; Meetup Spot
                    </div>
                    <div className="text-xs font-semibold mt-0.5">
                      {selectedListing.meetupLocation || 'Campus Meetup'}
                    </div>
                    <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                      {selectedListing.campus}
                    </div>
                  </div>
                </div>

                {/* Seller / Buyer Profile Card */}
                <div
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                    darkMode ? 'border-zinc-800 bg-zinc-950/40' : 'border-stone-200 bg-stone-50/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {selectedListing.authorPhotoURL ? (
                      <img
                        src={selectedListing.authorPhotoURL}
                        alt={selectedListing.authorNickname}
                        className="w-9 h-9 rounded-full object-cover border border-stone-300 dark:border-zinc-700"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#7B1113] text-white font-bold text-sm flex items-center justify-center">
                        {(selectedListing.authorNickname || 'M')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-[11px] text-stone-500 dark:text-zinc-400">
                        {selectedListing.listingType === 'sell' ? 'Listed by Seller' : 'Posted by Buyer'}
                      </div>
                      <div className="flex items-center gap-1 text-xs font-bold truncate">
                        <span className="truncate">@{selectedListing.authorNickname}</span>
                        <UserBadgeTag badge={selectedListing.authorBadge} size="sm" />
                      </div>
                    </div>
                  </div>

                  {selectedListing.authorId !== currentUserUid && (
                    <button
                      type="button"
                      onClick={() => {
                        const peer: ChatPeerTarget = {
                          uid: selectedListing.authorId,
                          nickname: selectedListing.authorNickname,
                          photoURL: selectedListing.authorPhotoURL || '',
                          badge: selectedListing.authorBadge || 'verified',
                        };
                        setSelectedListing(null);
                        onStartDirectChatWithPeer(peer);
                      }}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer shrink-0 ${
                        darkMode
                          ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                          : 'border-stone-300 hover:bg-stone-100 text-stone-800'
                      }`}
                    >
                      Open Chat
                    </button>
                  )}
                </div>
              </div>

              {/* Direct Contact Seller / Buyer Box */}
              {selectedListing.authorId !== currentUserUid ? (
                <div
                  className={`p-4 rounded-2xl border space-y-3 ${
                    darkMode
                      ? 'bg-zinc-950/90 border-amber-500/30'
                      : 'bg-amber-50/50 border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold uppercase tracking-wider text-[#7B1113] dark:text-amber-400 flex items-center gap-1.5">
                      <MessageCircle className="w-4 h-4" />
                      <span>
                        {selectedListing.listingType === 'sell'
                          ? `Contact Seller (@${selectedListing.authorNickname})`
                          : `Contact Buyer (@${selectedListing.authorNickname})`}
                      </span>
                    </div>
                    <span className="text-[11px] text-stone-500 dark:text-zinc-400">
                      Delivers directly to their ONE Chat &amp; Notifications
                    </span>
                  </div>

                  {/* Quick Preset Message Chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedListing.listingType === 'sell'
                      ? [
                          `Hi @${selectedListing.authorNickname}! Is this still available?`,
                          `Can we meet up at ${selectedListing.meetupLocation || 'campus'} to check this?`,
                          `Is the price (${formatPhpPrice(selectedListing.price)}) still negotiable?`,
                        ]
                      : [
                          `Hi @${selectedListing.authorNickname}! I have what you're looking to buy!`,
                          `Are you still looking for "${selectedListing.title}"?`,
                          `Let's meet up at ${selectedListing.meetupLocation || 'campus'} so you can check mine.`,
                        ]
                    ).map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setInquiryMessage(preset)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer ${
                          inquiryMessage === preset
                            ? 'bg-[#7B1113] text-white border-[#7B1113]'
                            : darkMode
                            ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                            : 'bg-white border-stone-200 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={3}
                    value={inquiryMessage}
                    onChange={(e) => setInquiryMessage(e.target.value)}
                    placeholder={`Write your message to @${selectedListing.authorNickname}...`}
                    className={`w-full p-3 rounded-xl text-xs sm:text-sm border outline-none transition ${
                      darkMode
                        ? 'bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-amber-500'
                        : 'bg-white border-stone-300 text-stone-900 focus:border-[#7B1113]'
                    }`}
                  />

                  {inquirySentSuccess && (
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-2 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>
                        Inquiry sent to @{selectedListing.authorNickname}! You can continue chatting in Direct Messages.
                      </span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      disabled={isSendingInquiry || !inquiryMessage.trim()}
                      onClick={() => handleSendInquirySubmit(false)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        darkMode
                          ? 'border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                          : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
                      }`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{isSendingInquiry ? 'Sending...' : 'Send Quick Inquiry'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSendingInquiry || !inquiryMessage.trim()}
                      onClick={() => handleSendInquirySubmit(true)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#7B1113] hover:bg-[#620d0f] text-white shadow-sm transition cursor-pointer"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Send &amp; Open Chat Conversation</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Owner Controls in Detail Modal */
                <div
                  className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
                    darkMode ? 'bg-zinc-950/60 border-zinc-800' : 'bg-stone-50 border-stone-200'
                  }`}
                >
                  <div className="text-xs font-semibold">
                    Manage Your Listing Status:
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        { id: 'available', label: 'Available' },
                        { id: 'reserved', label: 'Reserved' },
                        {
                          id: selectedListing.listingType === 'sell' ? 'sold' : 'fulfilled',
                          label: selectedListing.listingType === 'sell' ? 'Sold' : 'Fulfilled',
                        },
                      ] as { id: MarketplaceStatus; label: string }[]
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={async () => {
                          await onUpdateListingStatus(selectedListing.id, st.id);
                          setSelectedListing((prev) => (prev ? { ...prev, status: st.id } : null));
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          selectedListing.status === st.id
                            ? 'bg-[#7B1113] text-white'
                            : darkMode
                            ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            : 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-100'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const target = selectedListing;
                        setSelectedListing(null);
                        openEditModal(target);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition cursor-pointer ${
                        darkMode
                          ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                          : 'bg-white border border-stone-300 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const idToDel = selectedListing.id;
                        setSelectedListing(null);
                        await onDeleteListing(idToDel);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Moderator / Developer Delete Option */}
              {isModeratorOrDev && selectedListing.authorId !== currentUserUid && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await onDeleteListing(selectedListing.id);
                      setSelectedListing(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-xs text-rose-600 hover:underline cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Moderator: Remove Listing</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          CREATE / EDIT MARKETPLACE LISTING MODAL
         ===================================================================== */}
      {composerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs animate-fadeIn"
          onClick={() => setComposerOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl ${
              darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-stone-200 text-stone-900'
            }`}
          >
            <div
              className={`sticky top-0 z-10 px-5 py-4 border-b flex items-center justify-between backdrop-blur-md ${
                darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white/90 border-stone-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#7B1113] dark:text-amber-400" />
                <h2 className="text-base font-bold">
                  {editingListing ? 'Edit Marketplace Listing' : 'Post to MSUan Marketplace'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="p-1.5 rounded-full hover:bg-stone-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitListing} className="relative p-5 space-y-4">
              {/* Animated Overlay when uploading photo or publishing listing */}
              <AnimatePresence>
                {(isUploadingImage || isSubmitting) && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-20 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center rounded-b-2xl"
                  >
                    <div className="relative w-14 h-14 flex items-center justify-center mb-3">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
                        className="absolute inset-0 rounded-full border-3 border-[#7B1113]/20 border-t-[#7B1113] border-r-[#D4AF37]"
                      />
                      <motion.div
                        animate={{ y: [2, -3, 2] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-9 h-9 rounded-full bg-[#7B1113] text-[#D4AF37] flex items-center justify-center shadow-sm"
                      >
                        <Upload className="w-4 h-4" />
                      </motion.div>
                    </div>
                    <p className="text-sm font-bold text-[#7B1113] dark:text-amber-400">
                      {isUploadingImage
                        ? 'Uploading & optimizing item photo...'
                        : 'Publishing to Campus Marketplace...'}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-zinc-400 mt-1 mb-3">
                      {isUploadingImage
                        ? 'Compressing image for fast campus browsing'
                        : 'Sharing your listing with all verified MSUans'}
                    </p>
                    <div className="w-48 h-1.5 bg-stone-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ x: '-100%' }}
                        animate={{ x: '100%' }}
                        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-full h-full bg-gradient-to-r from-[#7B1113] via-[#D4AF37] to-[#7B1113]"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Listing Type Toggle: Sell vs Buy */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setListingType('sell')}
                  className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    listingType === 'sell'
                      ? 'bg-[#7B1113] border-[#7B1113] text-white shadow-xs'
                      : darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Tag className="w-4 h-4" />
                  <span>I Want to Sell</span>
                </button>

                <button
                  type="button"
                  onClick={() => setListingType('buy')}
                  className={`py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                    listingType === 'buy'
                      ? 'bg-amber-500 border-amber-500 text-stone-950 shadow-xs'
                      : darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      : 'bg-stone-50 border-stone-200 text-stone-600 hover:text-stone-900'
                  }`}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>I Want to Buy (WTB)</span>
                </button>
              </div>

              {composerError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-medium">
                  {composerError}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold mb-1">
                  {listingType === 'sell' ? 'Item Title *' : 'What are you looking to buy? *'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    listingType === 'sell'
                      ? 'e.g., Casio fx-991EX Scientific Calculator or Engineering Calculus Book'
                      : 'e.g., Looking to Buy: Second-hand Calculus Book or Dorm Electric Fan'
                  }
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm border outline-none ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-amber-500'
                      : 'bg-stone-50 border-stone-200 text-stone-900 focus:border-[#7B1113]'
                  }`}
                />
              </div>

              {/* Price & Category Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    {listingType === 'sell' ? 'Price in PHP (₱) *' : 'Target Budget in PHP (₱) *'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400">
                      ₱
                    </span>
                    <input
                      type="number"
                      min="0"
                      max="500000"
                      value={priceInput}
                      onChange={(e) => setPriceInput(e.target.value)}
                      placeholder="0 for Free / Swap"
                      className={`w-full pl-8 pr-3.5 py-2.5 rounded-xl text-xs sm:text-sm border outline-none tabular-nums ${
                        darkMode
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-amber-500'
                          : 'bg-stone-50 border-stone-200 text-stone-900 focus:border-[#7B1113]'
                      }`}
                    />
                  </div>
                  <label className="inline-flex items-center gap-2 mt-1.5 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isNegotiable}
                      onChange={(e) => setIsNegotiable(e.target.checked)}
                      className="rounded border-stone-300 text-[#7B1113]"
                    />
                    <span className={darkMode ? 'text-zinc-400' : 'text-stone-600'}>
                      Negotiable / Open to offers
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as MarketplaceCategory)}
                    className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-stone-50 border-stone-200 text-stone-900'
                    }`}
                  >
                    {MARKETPLACE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Condition & Campus Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">
                    {listingType === 'sell' ? 'Item Condition' : 'Preferred Condition'}
                  </label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value as MarketplaceCondition)}
                    className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-stone-50 border-stone-200 text-stone-900'
                    }`}
                  >
                    {MARKETPLACE_CONDITIONS.map((cond) => (
                      <option key={cond} value={cond}>
                        {cond}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1">MSU Campus *</label>
                  <select
                    value={campus}
                    onChange={(e) => setCampus(e.target.value)}
                    className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-stone-50 border-stone-200 text-stone-900'
                    }`}
                  >
                    {MSU_CAMPUSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preferred Meetup Spot */}
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Preferred Campus Meetup Spot
                </label>
                <input
                  type="text"
                  maxLength={90}
                  value={meetupLocation}
                  onChange={(e) => setMeetupLocation(e.target.value)}
                  placeholder="e.g., Main Library Steps, University Student Center, Gate 1..."
                  className={`w-full px-3.5 py-2.5 rounded-xl text-xs sm:text-sm border outline-none ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-amber-500'
                      : 'bg-stone-50 border-stone-200 text-stone-900 focus:border-[#7B1113]'
                  }`}
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Details &amp; Description *
                </label>
                <textarea
                  rows={3}
                  required
                  maxLength={1200}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={
                    listingType === 'sell'
                      ? 'Describe the item condition, inclusions, reason for selling, or meetup availability...'
                      : 'Describe the exact book edition, calculator model, or item specs you want to buy...'
                  }
                  className={`w-full p-3.5 rounded-xl text-xs sm:text-sm border outline-none ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-amber-500'
                      : 'bg-stone-50 border-stone-200 text-stone-900 focus:border-[#7B1113]'
                  }`}
                />
              </div>

              {/* Photo Upload */}
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Item Photo {listingType === 'buy' ? '(Optional reference photo)' : '(Recommended)'}
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImagePick}
                  className="hidden"
                />

                {imageUrl ? (
                  <div className="relative rounded-xl overflow-hidden border border-stone-200 dark:border-zinc-800 bg-stone-950 h-44 flex items-center justify-center">
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="max-h-44 w-auto object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImageUrl('');
                        setImageName('');
                      }}
                      className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/75 text-white hover:bg-black cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isUploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full py-6 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50 text-zinc-400'
                        : 'border-stone-300 hover:border-[#7B1113] bg-stone-50 text-stone-600'
                    }`}
                  >
                    <Upload className="w-5 h-5 text-[#7B1113] dark:text-amber-400" />
                    <span className="text-xs font-semibold">
                      {isUploadingImage ? 'Uploading photo...' : 'Click to upload item photo'}
                    </span>
                    <span className="text-[11px] opacity-70">JPG, PNG, WEBP</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                    darkMode
                      ? 'border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                      : 'border-stone-200 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || isUploadingImage}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#7B1113] hover:bg-[#620d0f] text-white shadow-sm transition cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting
                    ? 'Publishing...'
                    : editingListing
                    ? 'Save Changes'
                    : listingType === 'sell'
                    ? 'Publish Item for Sale'
                    : 'Publish Buy Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
