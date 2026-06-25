import { useMemo } from 'react'
import {
  DUE_DATE_PRESETS,
  getDueDatePreview,
  getPresetDatetimeLocal,
  isEndOfDayTime,
  joinDatetimeLocal,
  splitDatetimeLocal,
  type DueDatePresetId,
} from '../utils/quizDueDateUtils'
import './App_CSS/QuizDueDatePicker_CSS.css'

interface QuizDueDatePickerProps {
  value: string
  onChange: (value: string) => void
  id?: string
}

// Friendly due-date control: quick presets, date/time split, live preview, clear.
export default function QuizDueDatePicker({ value, onChange, id = 'quiz-due-date' }: QuizDueDatePickerProps) {
  const { date, time } = splitDatetimeLocal(value)
  const endOfDay = !value || isEndOfDayTime(time)
  const preview = useMemo(() => getDueDatePreview(value), [value])

  const applyPreset = (presetId: DueDatePresetId) => {
    onChange(getPresetDatetimeLocal(presetId))
  }

  const handleDateChange = (nextDate: string) => {
    if (!nextDate) {
      onChange('')
      return
    }
    onChange(joinDatetimeLocal(nextDate, endOfDay ? '23:59' : time || '23:59'))
  }

  const handleTimeChange = (nextTime: string) => {
    if (!date) return
    onChange(joinDatetimeLocal(date, nextTime))
  }

  const toggleEndOfDay = () => {
    if (!date) return
    if (endOfDay) {
      onChange(joinDatetimeLocal(date, '17:00'))
    } else {
      onChange(joinDatetimeLocal(date, '23:59'))
    }
  }

  return (
    <div className="quiz-due-picker">
      <div className="quiz-due-picker__presets">
        {DUE_DATE_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="quiz-due-picker__preset-btn"
            onClick={() => applyPreset(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="quiz-due-picker__fields">
        <div className="quiz-due-picker__field">
          <label className="quiz-due-picker__field-label" htmlFor={`${id}-date`}>Date</label>
          <input
            id={`${id}-date`}
            type="date"
            className="panel-input quiz-due-picker__input"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
          />
        </div>
        <div className="quiz-due-picker__field">
          <label className="quiz-due-picker__field-label" htmlFor={`${id}-time`}>Time</label>
          <input
            id={`${id}-time`}
            type="time"
            className="panel-input quiz-due-picker__input"
            value={endOfDay ? '23:59' : time}
            disabled={!date || endOfDay}
            onChange={(e) => handleTimeChange(e.target.value)}
          />
        </div>
      </div>

      <label className="quiz-due-picker__eod">
        <input
          type="checkbox"
          checked={endOfDay}
          disabled={!date}
          onChange={toggleEndOfDay}
        />
        <span>Due at end of day (11:59 PM)</span>
      </label>

      {value && (
        <button
          type="button"
          className="quiz-due-picker__remove-btn"
          onClick={() => onChange('')}
        >
          Remove due date
        </button>
      )}

      {preview ? (
        <div className={`quiz-due-picker__preview${preview.isPast ? ' quiz-due-picker__preview--past' : ''}`}>
          <span className="quiz-due-picker__preview-icon" aria-hidden="true">📅</span>
          <div>
            <p className="quiz-due-picker__preview-main">{preview.formatted}</p>
            <p className="quiz-due-picker__preview-sub">{preview.relative}</p>
          </div>
          <button
            type="button"
            className="quiz-due-picker__clear"
            onClick={() => onChange('')}
            aria-label="Remove deadline"
          >
            Clear
          </button>
        </div>
      ) : (
        <p className="quiz-due-picker__hint">No deadline — students can take this quiz anytime.</p>
      )}

      {preview?.isPast && (
        <p className="quiz-due-picker__warn" role="status">
          This date is in the past. Students will see it as overdue.
        </p>
      )}

      <p className="quiz-due-picker__tz">Times shown in your local timezone.</p>
    </div>
  )
}

/** Compact one-line due date for sticky panels / save bars. */
export function QuizDueDateSummary({ value }: { value: string }) {
  const preview = useMemo(() => getDueDatePreview(value), [value])
  if (!preview) return null
  return (
    <div className={`quiz-due-picker__summary${preview.isPast ? ' quiz-due-picker__summary--past' : ''}`}>
      <span className="quiz-due-picker__summary-label">Due:</span>
      <span>{preview.formatted}</span>
      <span>· {preview.relative}</span>
    </div>
  )
}
