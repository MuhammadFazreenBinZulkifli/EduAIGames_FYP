import { Fragment, type ReactNode } from 'react'

interface ChatMessageBodyProps {
  content: string
}

// Turns **bold** markers in a single line into <strong> elements.
function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

// Splits assistant markdown-ish text into paragraphs and bullet/numbered lists.
export default function ChatMessageBody({ content }: ChatMessageBodyProps) {
  const lines = content.split('\n')
  const blocks: ReactNode[] = []
  let listItems: string[] = []
  let listType: 'ul' | 'ol' | null = null
  // Running counter so numbered steps keep counting up (1, 2, 3, …) even when
  // sub-bullets interrupt them and force the list to be split into multiple
  // <ol> blocks — otherwise every step restarts at "1".
  let olNext = 1

  // Emits a completed bullet/numbered list before switching to paragraphs.
  const flushList = () => {
    if (listItems.length === 0 || !listType) return
    if (listType === 'ol') {
      blocks.push(
        <ol key={`list-${blocks.length}`} className="aichat-msg-list" start={olNext}>
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ol>
      )
      olNext += listItems.length
    } else {
      blocks.push(
        <ul key={`list-${blocks.length}`} className="aichat-msg-list">
          {listItems.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      )
    }
    listItems = []
    listType = null
  }

  for (const line of lines) {
    const trimmed = line.trim()
    const bullet = trimmed.match(/^[-*•]\s+(.+)$/)
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/)

    if (bullet) {
      if (listType !== 'ul') {
        flushList()
        listType = 'ul'
      }
      listItems.push(bullet[1])
      continue
    }
    if (numbered) {
      if (listType !== 'ol') {
        flushList()
        listType = 'ol'
      }
      listItems.push(numbered[1])
      continue
    }

    // Blank lines between list items should NOT end the list — otherwise each
    // numbered item becomes its own <ol> and restarts the count at 1. Skip blank
    // lines while a list is open so the items stay in one continuous list.
    if (trimmed === '' && listType) {
      continue
    }

    flushList()
    if (trimmed === '') {
      blocks.push(<br key={`br-${blocks.length}`} />)
    } else {
      // A real paragraph ends the current numbered sequence, so the next list
      // starts fresh at 1.
      olNext = 1
      blocks.push(
        <p key={`p-${blocks.length}`} className="aichat-msg-para">
          {renderInline(line)}
        </p>
      )
    }
  }
  flushList()

  return <div className="aichat-msg-body">{blocks}</div>
}
