interface QuizDueBadgeProps {
  dueDate: string
}

// Accessible due-date badge for quiz cards (no emoji, semantic CSS classes).
export default function QuizDueBadge({ dueDate }: QuizDueBadgeProps) {
  // Urgency tiers: overdue (muted), due today, due within 7 days, or later.
  const due = new Date(dueDate)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffMs < 0) {
    return <span className="panel-due-badge panel-due-badge--past">Due {due.toLocaleDateString()}</span>
  }
  if (diffDays <= 1) {
    return <span className="panel-due-badge panel-due-badge--urgent">Due today</span>
  }
  if (diffDays <= 7) {
    return (
      <span className="panel-due-badge panel-due-badge--soon">
        Due in {diffDays} day{diffDays !== 1 ? 's' : ''}
      </span>
    )
  }
  return <span className="panel-due-badge panel-due-badge--normal">Due {due.toLocaleDateString()}</span>
}
