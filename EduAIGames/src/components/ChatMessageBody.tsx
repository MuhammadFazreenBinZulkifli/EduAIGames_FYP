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

  // Emits a completed bullet/numbered list before switching to paragraphs.
  const flushList = () => {
    if (listItems.length === 0 || !listType) return
    const Tag = listType
    blocks.push(
      <Tag key={`list-${blocks.length}`} className="aichat-msg-list">
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </Tag>
    )
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
