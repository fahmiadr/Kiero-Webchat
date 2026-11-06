import data from '@emoji-mart/data';
import { Debouncer } from '@tanstack/pacer';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Car, Clock, Coffee, Flag, Heart, Leaf, Lightbulb, Search, Smile, Zap } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { emojiKeywordsID } from './emojiDataID';

const CATEGORY_ICONS = {
  frequent: Clock,
  people: Smile,
  nature: Leaf,
  foods: Coffee,
  activity: Zap,
  places: Car,
  objects: Lightbulb,
  symbols: Heart,
  flags: Flag,
};

const EMOJIS_PER_ROW = 8;
const ROW_HEIGHT = 40; // 36px button + 4px gap
const HEADER_HEIGHT = 36; // 32px height + margins

// --- STATIC DATA PRE-CALCULATION ---
// We pre-calculate these structures ONCE outside the component
// so that opening the emoji picker has zero data-processing overhead.
let STATIC_CATEGORIES = [];
let STATIC_FLAG_SET = new Set();
const STATIC_FLAT_ITEMS = [];

if (data?.categories) {
  const flags = new Set();
  const flagCategory = data.categories.find((c) => c.id === 'flags');
  if (flagCategory?.emojis) {
    flagCategory.emojis.forEach((id) => {
      flags.add(id);
    });
  }
  STATIC_FLAG_SET = flags;

  STATIC_CATEGORIES = data.categories.map((cat) => ({
    id: cat.id,
    name: cat.name || cat.id,
    emojis: cat.emojis || [],
  }));

  STATIC_CATEGORIES.forEach((cat) => {
    STATIC_FLAT_ITEMS.push({ type: 'header', id: cat.id });
    for (let i = 0; i < cat.emojis.length; i += EMOJIS_PER_ROW) {
      STATIC_FLAT_ITEMS.push({
        type: 'row',
        categoryId: cat.id,
        emojis: cat.emojis.slice(i, i + EMOJIS_PER_ROW),
      });
    }
  });
}

// Memoized Row Component (Handling Headers & Rows)
const VirtualRow = memo(({ item, activeCategory, onSelect, flagSet }) => {
  if (item.type === 'header') {
    // Hide the virtual header physically behind the floating sticky header
    // to prevent visual duplication (ghosting)
    const isGhosting = item.id === activeCategory;

    return (
      <div
        className={`flex h-[36px] w-full items-center border-gray-50/50 border-b bg-white/95 px-3 font-bold text-gray-500 text-xs uppercase transition-opacity duration-100 ${isGhosting ? 'opacity-0' : 'opacity-100'}`}
      >
        {item.id}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-8 justify-items-center gap-1 px-2 py-1">
      {item.emojis.map((emojiId) => {
        const emojiData = data.emojis[emojiId];
        if (!emojiData) return null;

        const hasFlag = flagSet.has(emojiId);
        const name = emojiData.name;
        const native = emojiData.skins[0]?.native || '';

        return (
          <button
            key={emojiId}
            type="button"
            onClick={() => onSelect({ native })}
            onMouseDown={(e) => e.preventDefault()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-transparent text-slate-900 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title={name}
          >
            {hasFlag ? (
              <img
                src={`https://cdn.jsdelivr.net/npm/emoji-datasource-apple@14.0.0/img/apple/64/${emojiData.skins[0].unified}.png`}
                alt={name}
                className="pointer-events-none h-8 w-8 object-contain"
                loading="lazy"
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            ) : (
              <span className="pointer-events-none text-2xl">{native}</span>
            )}
          </button>
        );
      })}
    </div>
  );
});
VirtualRow.displayName = 'VirtualRow';

const CategoryButton = memo(({ catId, isActive, onSelect }) => {
  const Icon = CATEGORY_ICONS[catId] || Smile;
  const handleClick = useCallback(() => onSelect(catId), [catId, onSelect]);
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg p-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'
      }`}
      title={catId}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
});
CategoryButton.displayName = 'CategoryButton';

const EmojiSearchBar = memo(({ onSearchChange }) => {
  const [localSearch, setLocalSearch] = useState('');
  const searchDebouncer = useRef(null);

  // Initialize Debouncer
  useEffect(() => {
    searchDebouncer.current = new Debouncer(
      (val) => {
        onSearchChange(val);
      },
      { wait: 300 },
    );

    return () => {
      searchDebouncer.current?.cancel();
    };
  }, [onSearchChange]);

  const handleChange = (e) => {
    const val = e.target.value;
    setLocalSearch(val);
    searchDebouncer.current?.maybeExecute(val);
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-gray-100 border-b p-2">
      <Search className="h-4 w-4 shrink-0 text-gray-400" />
      <Input
        type="text"
        placeholder="Cari emoji..."
        className="h-8 border-none bg-transparent px-0 shadow-none placeholder:text-gray-400 focus-visible:ring-0"
        value={localSearch}
        onChange={handleChange}
      />
    </div>
  );
});
EmojiSearchBar.displayName = 'EmojiSearchBar';

const CustomEmojiPicker = memo(({ onSelect }) => {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('people');
  const parentRef = useRef(null);
  const isScrollingRef = useRef(false);

  // --- STABLE CALLBACK ---
  // Protects the deeply nested VirtualRows and EmojiButtons from losing their memoization
  // if the parent component passes a new onSelect arrow function every render.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const stableOnSelect = useCallback((emoji) => {
    if (onSelectRef.current) {
      onSelectRef.current(emoji);
    }
  }, []);

  // Filter Logic
  const filteredCategories = useMemo(() => {
    if (!search) return STATIC_CATEGORIES;

    const term = search.toLowerCase();
    const mappedTerm = emojiKeywordsID[term] || term;
    const searchTerms = [term];
    if (mappedTerm !== term) searchTerms.push(mappedTerm);

    const searchEmojis = Object.keys(data.emojis).filter((id) => {
      const emoji = data.emojis[id];
      const emojiName = emoji.name.toLowerCase();
      const emojiKeywords = emoji.keywords || [];

      return searchTerms.some(
        (s) => emojiName.includes(s) || emojiKeywords.some((k) => k.includes(s)),
      );
    });

    if (searchEmojis.length === 0) return [];

    return [
      {
        id: 'search',
        name: 'Search Results',
        emojis: searchEmojis,
      },
    ];
  }, [search]);

  // Flatten Data for Virtualizer
  const flatItems = useMemo(() => {
    // Optimization: if no search, use the precalculated STATIC_FLAT_ITEMS
    if (!search) return STATIC_FLAT_ITEMS;

    const items = [];
    filteredCategories.forEach((cat) => {
      items.push({ type: 'header', id: cat.id });
      for (let i = 0; i < cat.emojis.length; i += EMOJIS_PER_ROW) {
        items.push({
          type: 'row',
          categoryId: cat.id,
          emojis: cat.emojis.slice(i, i + EMOJIS_PER_ROW),
        });
      }
    });
    return items;
  }, [filteredCategories, search]);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (flatItems[i].type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 2,
  });

  // ScrollSpy: Update active category based on scroll position
  useEffect(() => {
    if (search || isScrollingRef.current) return; // Disable spy on search or strict scrolling

    const virtualItems = rowVirtualizer.getVirtualItems();
    if (virtualItems.length > 0) {
      const scrollOffset = rowVirtualizer.scrollOffset || 0;
      const visibleItem = virtualItems.find((item) => item.end > scrollOffset + 10);

      if (visibleItem) {
        const item = flatItems[visibleItem.index];
        if (item) {
          const categoryId = item.type === 'header' ? item.id : item.categoryId;
          setActiveCategory((prev) => (prev !== categoryId ? categoryId : prev));
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowVirtualizer.getVirtualItems(), rowVirtualizer.scrollOffset, flatItems, search]);

  // Handle Tab Scroll
  const scrollToCategory = useCallback(
    (categoryId) => {
      const index = flatItems.findIndex((item) => item.type === 'header' && item.id === categoryId);
      if (index !== -1) {
        isScrollingRef.current = true; // Lock spy
        setActiveCategory(categoryId); // Optimistic update

        rowVirtualizer.scrollToIndex(index, { align: 'start' });

        // Re-enable spy after scroll animation
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 150); // Small delay to let scroll finish
      }
    },
    [flatItems, rowVirtualizer],
  );

  return (
    <div className="relative flex h-full flex-col bg-white">
      {/* Search Bar */}
      <EmojiSearchBar search={search} onSearchChange={setSearch} />

      {/* Category Tabs */}
      {!search && (
        <div className="no-scrollbar flex shrink-0 items-center gap-1 overflow-x-auto border-gray-50 border-b p-2">
          {STATIC_CATEGORIES.map((cat) => (
            <CategoryButton
              key={cat.id}
              catId={cat.id}
              isActive={activeCategory === cat.id}
              onSelect={scrollToCategory}
            />
          ))}
        </div>
      )}

      {/* Virtualized List Container */}
      <div className="relative flex-1 overflow-hidden">
        {/* Main Floating Sticky Header Overlay */}
        {!search && (
          <div className="pointer-events-none absolute top-0 right-1.5 left-0 z-20 flex h-[36px] items-center border-gray-50/50 border-b bg-white/95 px-3 font-bold text-gray-500 text-xs uppercase backdrop-blur-md">
            {activeCategory}
          </div>
        )}

        <ScrollArea viewportRef={parentRef} className="h-full w-full">
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const item = flatItems[virtualRow.index];
              return (
                <div
                  key={virtualRow.key}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <VirtualRow
                    item={item}
                    activeCategory={activeCategory}
                    onSelect={stableOnSelect}
                    flagSet={STATIC_FLAG_SET}
                  />
                </div>
              );
            })}
          </div>

          {flatItems.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
              No emojis found 😢
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
});

export default CustomEmojiPicker;
