import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import SidebarIcon, { type IconName } from './SidebarIcons'
import './App_CSS/QuizSearchSelect_CSS.css'

export interface SearchOption {
  id: number
  title: string
  /** Optional per-option icon (e.g. a game-type emoji). Falls back to optionIcon. */
  icon?: ReactNode
}

interface QuizSearchSelectProps {
  options: SearchOption[]
  /** Currently selected option id as a string, or '' when nothing is picked. */
  value: string
  /** Called with the selected id (as a string) or '' when cleared. */
  onChange: (idString: string) => void
  placeholder?: string
  emptyText?: string
  ariaLabel?: string
  /** Professional icon shown beside each option (e.g. 'quiz' or 'game'). */
  optionIcon?: IconName
}

// Scores how well an option title matches the query. Higher = better match.
// Returns null when the option doesn't match at all. The tiers give a
// "search engine" feel: exact > prefix > word-start > substring > fuzzy.
function scoreMatch(title: string, query: string): number | null {
  const t = title.toLowerCase()
  const q = query.toLowerCase()
  if (!q) return 0
  if (t === q) return 1000
  if (t.startsWith(q)) return 900
  if (t.split(/\s+/).some((word) => word.startsWith(q))) return 800
  const idx = t.indexOf(q)
  if (idx >= 0) return 600 - idx // earlier matches rank higher
  // Fuzzy fallback: every query character appears in order somewhere in the title.
  let i = 0
  for (const ch of t) {
    if (ch === q[i]) i++
    if (i === q.length) break
  }
  return i === q.length ? 200 : null
}

// Splits a title around the matched substring so it can be highlighted.
function highlightParts(title: string, query: string): Array<{ text: string; match: boolean }> {
  const q = query.trim()
  if (!q) return [{ text: title, match: false }]
  const idx = title.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return [{ text: title, match: false }]
  return [
    { text: title.slice(0, idx), match: false },
    { text: title.slice(idx, idx + q.length), match: true },
    { text: title.slice(idx + q.length), match: false },
  ].filter((part) => part.text.length > 0)
}

// A search-as-you-type combobox: the instructor types a quiz name and the
// closest matches appear ranked, with keyboard navigation and match highlighting.
export default function QuizSearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Type to search…',
  emptyText = 'No matches found',
  ariaLabel = 'Search',
  optionIcon = 'quiz',
}: QuizSearchSelectProps) {
  // Title of the currently-selected option (for displaying in the input).
  const selectedTitle = useMemo(
    () => options.find((o) => String(o.id) === value)?.title ?? '',
    [options, value]
  )

  const [query, setQuery] = useState(selectedTitle)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  // Fixed-position coordinates for the portal-rendered dropdown.
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 })

  const containerRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const activeRef = useRef<HTMLLIElement>(null)

  // Reflect external selection changes in the input, but only while closed so we
  // never overwrite what the user is actively typing.
  useEffect(() => {
    if (!open) setQuery(selectedTitle)
  }, [selectedTitle, open])

  const trimmed = query.trim()
  // True when the input still shows the committed selection (so we list everything).
  const showingSelected = selectedTitle !== '' && query === selectedTitle

  // The visible, ranked list of options.
  const filtered = useMemo(() => {
    if (!trimmed || showingSelected) {
      return [...options].sort((a, b) => a.title.localeCompare(b.title))
    }
    return options
      .map((o) => ({ o, score: scoreMatch(o.title, trimmed) }))
      .filter((x): x is { o: SearchOption; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score || a.o.title.localeCompare(b.o.title))
      .map((x) => x.o)
  }, [options, trimmed, showingSelected])

  // Close the dropdown when clicking outside the field AND the portal list.
  useEffect(() => {
    const onDocPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [])

  // Anchor the fixed dropdown under the field, keeping it aligned on scroll/resize
  // (the list is portaled to <body> so parent overflow can never clip it).
  useLayoutEffect(() => {
    if (!open) return
    const reposition = () => {
      const el = fieldRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      setMenuPos({ top: r.bottom + 6, left: r.left, width: r.width })
    }
    reposition()
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  // Keep the highlighted row valid as the list changes.
  useEffect(() => {
    setActiveIndex(0)
  }, [trimmed, open])

  // Scroll the highlighted row into view during keyboard navigation.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, open])

  // Selects an option and closes the dropdown.
  const commit = (opt: SearchOption) => {
    onChange(String(opt.id))
    setQuery(opt.title)
    setOpen(false)
    inputRef.current?.blur()
  }

  // Clears the current selection and reopens for a fresh search.
  const clear = () => {
    onChange('')
    setQuery('')
    setOpen(true)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && filtered[activeIndex]) {
        e.preventDefault()
        commit(filtered[activeIndex])
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="quiz-search" ref={containerRef}>
      <div ref={fieldRef} className={`quiz-search__field${open ? ' quiz-search__field--open' : ''}`}>
        <span className="quiz-search__icon" aria-hidden="true">
          <SidebarIcon name="search" size={16} />
        </span>
        <input
          ref={inputRef}
          type="text"
          className="quiz-search__input"
          role="combobox"
          aria-expanded={open}
          aria-controls="quiz-search-list"
          aria-autocomplete="list"
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            const next = e.target.value
            setQuery(next)
            setOpen(true)
            // Editing away from the committed selection clears it until they pick again.
            if (value && next !== selectedTitle) onChange('')
          }}
          onKeyDown={onKeyDown}
        />
        {query.length > 0 && (
          <button
            type="button"
            className="quiz-search__clear"
            aria-label="Clear search"
            onClick={clear}
          >
            ×
          </button>
        )}
      </div>

      {open && createPortal(
        <ul
          ref={listRef}
          className="quiz-search__list"
          id="quiz-search-list"
          role="listbox"
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        >
          {filtered.length === 0 ? (
            <li className="quiz-search__empty">{emptyText}</li>
          ) : (
            filtered.map((o, i) => {
              const isSelected = String(o.id) === value
              return (
                <li
                  key={o.id}
                  ref={i === activeIndex ? activeRef : undefined}
                  role="option"
                  aria-selected={isSelected}
                  className={`quiz-search__option${i === activeIndex ? ' quiz-search__option--active' : ''}${isSelected ? ' quiz-search__option--selected' : ''}`}
                  // mousedown (not click) so selection happens before the input blurs.
                  onMouseDown={(e) => { e.preventDefault(); commit(o) }}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  {o.icon ? (
                    <span className="quiz-search__option-icon quiz-search__option-icon--custom" aria-hidden="true">
                      {o.icon}
                    </span>
                  ) : (
                    <span className="quiz-search__option-icon" aria-hidden="true">
                      <SidebarIcon name={optionIcon} size={16} />
                    </span>
                  )}
                  <span className="quiz-search__option-text">
                    {highlightParts(o.title, showingSelected ? '' : trimmed).map((part, idx) =>
                      part.match ? (
                        <mark key={idx} className="quiz-search__hl">{part.text}</mark>
                      ) : (
                        <span key={idx}>{part.text}</span>
                      )
                    )}
                  </span>
                  {isSelected && (
                    <span className="quiz-search__check" aria-hidden="true">
                      <SidebarIcon name="check" size={15} />
                    </span>
                  )}
                </li>
              )
            })
          )}
        </ul>,
        document.body
      )}
    </div>
  )
}
