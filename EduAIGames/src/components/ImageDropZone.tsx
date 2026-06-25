import { useRef, useState, type DragEvent } from 'react'
import './App_CSS/ImageDropZone_CSS.css'

interface ImageDropZoneProps {
  preview: string | null
  onFile: (file: File) => void
  onRemove: () => void
  label?: string
  hint?: string
  aspectClass?: string
  accept?: string
}

// Drag-and-drop + click image upload zone with live preview.
export default function ImageDropZone({
  preview,
  onFile,
  onRemove,
  label = 'Drag & drop an image here, or click to browse',
  hint = 'JPG, PNG, GIF supported',
  aspectClass = '',
  accept = 'image/*',
}: ImageDropZoneProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) onFile(file)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = () => setDragging(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    e.target.value = ''
  }

  return (
    <div className={`idz ${aspectClass}`}>
      {preview ? (
        <div className="idz__preview-wrap">
          <img src={preview} alt="Preview" className="idz__preview-img" />
          <div className="idz__preview-actions">
            <button
              type="button"
              className="idz__btn idz__btn--change"
              onClick={() => fileRef.current?.click()}
            >
              Change image
            </button>
            <button
              type="button"
              className="idz__btn idz__btn--remove"
              onClick={onRemove}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`idz__dropzone${dragging ? ' idz__dropzone--over' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label={label}
          onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
        >
          <div className="idz__icon" aria-hidden>
            {dragging ? '📂' : '🖼️'}
          </div>
          <p className="idz__label">{dragging ? 'Drop to upload' : label}</p>
          <p className="idz__hint">{hint}</p>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="idz__hidden-input"
        onChange={handleFileChange}
      />
    </div>
  )
}
