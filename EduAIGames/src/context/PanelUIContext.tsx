import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import '../components/App_CSS/PanelUI_CSS.css'

export type ToastVariant = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface PromptOptions {
  title?: string
  message?: string
  label?: string
  defaultValue?: string
  placeholder?: string
}

interface PanelUIContextValue {
  toast: (message: string, variant?: ToastVariant) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
  alert: (message: string, title?: string) => Promise<void>
  prompt: (options: PromptOptions) => Promise<string | null>
}

const PanelUIContext = createContext<PanelUIContextValue | null>(null)

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; message: string; title?: string; resolve: () => void }
  | {
      kind: 'prompt'
      options: PromptOptions
      value: string
      resolve: (v: string | null) => void
    }
  | null

export function PanelUIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [dialog, setDialog] = useState<DialogState>(null)
  const toastId = useRef(0)

  const toast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = ++toastId.current
    setToasts((prev) => [...prev, { id, message, variant }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4200)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ kind: 'confirm', options, resolve })
    })
  }, [])

  const alert = useCallback((message: string, title?: string) => {
    return new Promise<void>((resolve) => {
      setDialog({ kind: 'alert', message, title, resolve })
    })
  }, [])

  const prompt = useCallback((options: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setDialog({
        kind: 'prompt',
        options,
        value: options.defaultValue ?? '',
        resolve,
      })
    })
  }, [])

  const closeDialog = useCallback(() => setDialog(null), [])

  const value = useMemo(
    () => ({ toast, confirm, alert, prompt }),
    [toast, confirm, alert, prompt]
  )

  return (
    <PanelUIContext.Provider value={value}>
      {children}

      <div className="panel-toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`panel-toast panel-toast--${t.variant}`} role="status">
            <span className="panel-toast-icon" aria-hidden>
              {t.variant === 'success' ? '✓' : t.variant === 'error' ? '!' : 'i'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {dialog?.kind === 'confirm' && (
        <div className="panel-modal-overlay" role="presentation" onClick={closeDialog}>
          <div
            className="panel-modal"
            role="alertdialog"
            aria-labelledby="panel-modal-title"
            aria-describedby="panel-modal-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="panel-modal-title" className="panel-modal-title">
              {dialog.options.title ?? 'Confirm'}
            </h2>
            <p id="panel-modal-desc" className="panel-modal-message">
              {dialog.options.message}
            </p>
            <div className="panel-modal-actions">
              <button
                type="button"
                className="panel-btn panel-btn-secondary"
                onClick={() => {
                  dialog.resolve(false)
                  closeDialog()
                }}
              >
                {dialog.options.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={`panel-btn ${dialog.options.danger ? 'panel-btn-danger' : 'panel-btn-primary'}`}
                onClick={() => {
                  dialog.resolve(true)
                  closeDialog()
                }}
              >
                {dialog.options.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'alert' && (
        <div className="panel-modal-overlay" role="presentation" onClick={closeDialog}>
          <div
            className="panel-modal"
            role="alertdialog"
            aria-labelledby="panel-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="panel-modal-title" className="panel-modal-title">
              {dialog.title ?? 'Notice'}
            </h2>
            <p className="panel-modal-message">{dialog.message}</p>
            <div className="panel-modal-actions panel-modal-actions--single">
              <button
                type="button"
                className="panel-btn panel-btn-primary"
                onClick={() => {
                  dialog.resolve()
                  closeDialog()
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.kind === 'prompt' && (
        <div className="panel-modal-overlay" role="presentation" onClick={closeDialog}>
          <div
            className="panel-modal"
            role="dialog"
            aria-labelledby="panel-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="panel-modal-title" className="panel-modal-title">
              {dialog.options.title ?? 'Input'}
            </h2>
            {dialog.options.message && (
              <p className="panel-modal-message">{dialog.options.message}</p>
            )}
            <div className="panel-form-group">
              {dialog.options.label && (
                <label className="panel-label" htmlFor="panel-prompt-input">
                  {dialog.options.label}
                </label>
              )}
              <input
                id="panel-prompt-input"
                className="panel-input"
                type="text"
                autoFocus
                value={dialog.value}
                placeholder={dialog.options.placeholder}
                onChange={(e) =>
                  setDialog((d) =>
                    d?.kind === 'prompt' ? { ...d, value: e.target.value } : d
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    dialog.resolve(dialog.value.trim() || null)
                    closeDialog()
                  }
                }}
              />
            </div>
            <div className="panel-modal-actions">
              <button
                type="button"
                className="panel-btn panel-btn-secondary"
                onClick={() => {
                  dialog.resolve(null)
                  closeDialog()
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="panel-btn panel-btn-primary"
                onClick={() => {
                  dialog.resolve(dialog.value.trim() || null)
                  closeDialog()
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </PanelUIContext.Provider>
  )
}

export function usePanelUI(): PanelUIContextValue {
  const ctx = useContext(PanelUIContext)
  if (!ctx) {
    throw new Error('usePanelUI must be used within PanelUIProvider')
  }
  return ctx
}

/** Safe hook for admin/public pages — falls back to native dialogs if provider missing. */
export function usePanelUIOptional(): PanelUIContextValue {
  const ctx = useContext(PanelUIContext)
  if (ctx) return ctx
  return {
    toast: (message, variant) => {
      if (variant === 'error') window.alert(message)
      else console.info(message)
    },
    confirm: async (options) => window.confirm(options.message),
    alert: async (message) => {
      window.alert(message)
    },
    prompt: async (options) => window.prompt(options.message ?? options.label ?? '', options.defaultValue ?? ''),
  }
}
