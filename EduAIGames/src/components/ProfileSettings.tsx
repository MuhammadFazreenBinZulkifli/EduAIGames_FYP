import { useEffect, useState } from 'react'
import { API_BASE_URL } from '../config'
import { useAuth } from '../context/AuthContext'
import { usePanelUI } from '../context/PanelUIContext'
import { fetchPreferences, updatePreferences } from '../hooks/useUserPreferences'
import UserAvatar from './UserAvatar'
import ImageDropZone from './ImageDropZone'
import ChangePasswordModal from './ChangePasswordModal'
import PanelBreadcrumbs from './PanelBreadcrumbs'
import PanelIcon from './PanelIcon'
import { instructorDashboardCrumb, studentDashboardCrumb } from '../utils/panelBreadcrumbHelpers'
import './App_CSS/ProfileSettings_CSS.css'
import './App_CSS/PanelPages_CSS.css'

const MAX_DIMENSION = 512
const JPEG_QUALITY = 0.82

// Games that show a "How to Play" guide before they start.
const HOWTO_GAMES: { key: string; name: string; icon: string }[] = [
  { key: 'snake', name: 'Snake Quest', icon: '🐍' },
  { key: 'maze', name: 'Maze Quest', icon: '🧩' },
  { key: 'breakout', name: 'Brick Breaker', icon: '🧱' },
  { key: 'trivia', name: 'Trivia Race', icon: '🏃' },
]

// Compress & resize an image file to a base64 data URL.
function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
      }
      img.src = ev.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

// Profile settings page — update display name and avatar.
export default function ProfileSettings() {
  const { user, updateUser } = useAuth()
  const { toast } = usePanelUI()

  const [username, setUsername] = useState(user?.username ?? '')
  const [preview, setPreview] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showPwdModal, setShowPwdModal] = useState(false)
  const [howToDisabled, setHowToDisabled] = useState<Record<string, boolean>>({})
  const [prefsLoading, setPrefsLoading] = useState(true)

  // Load the saved per-game "How to Play" preferences for this account.
  useEffect(() => {
    if (!user?.id) { setPrefsLoading(false); return }
    let active = true
    fetchPreferences(user.id)
      .then((prefs) => {
        if (active) {
          setHowToDisabled(prefs.gameHowToDisabled || {})
          setPrefsLoading(false)
        }
      })
      .catch(() => { if (active) setPrefsLoading(false) })
    return () => { active = false }
  }, [user?.id])

  if (!user) return null

  // Toggle whether a game shows its "How to Play" guide before starting.
  const toggleHowTo = (key: string, enabled: boolean) => {
    if (!user.id) return
    const disabled = !enabled
    setHowToDisabled((prev) => ({ ...prev, [key]: disabled }))
    void updatePreferences(user.id, { gameHowToDisabled: { [key]: disabled } })
      .then(() => toast(enabled ? 'Guide turned on.' : 'Guide turned off.', 'success'))
      .catch(() => {
        setHowToDisabled((prev) => ({ ...prev, [key]: enabled }))
        toast('Failed to save preference.', 'error')
      })
  }

  const currentAvatar = preview ?? user.avatarUrl ?? null

  const handleAvatarFile = async (file: File) => {
    try {
      const dataUrl = await compressImage(file)
      setPreview(dataUrl)
    } catch {
      toast('Failed to process image.', 'error')
    }
  }

  // Updates display name and optional avatar, then syncs AuthContext for the sidebar.
  const handleSave = async () => {
    if (!user.id) return
    if (!username.trim()) { toast('Display name cannot be empty.', 'error'); return }
    setSaving(true)
    try {
      const body: Record<string, unknown> = { username: username.trim() }
      if (preview !== null) body.avatar_url = preview

      const res = await fetch(`${API_BASE_URL}/api/profile/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to save')
      }
      const { profile } = await res.json()
      updateUser({ username: profile.username, avatarUrl: profile.avatar_url ?? null })
      setPreview(null)
      toast('Profile updated!', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save profile.', 'error')
    } finally {
      setSaving(false)
    }
  }

  // Clears avatar on the server and in local session state.
  const handleRemoveAvatar = async () => {
    if (!user.id) return
    setPreview(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar_url: null }),
      })
      if (!res.ok) throw new Error('Failed to remove avatar')
      updateUser({ avatarUrl: null })
      toast('Avatar removed.', 'info')
    } catch {
      toast('Failed to remove avatar.', 'error')
    }
  }

  const dashboardCrumb = user.role === 'Instructor'
    ? instructorDashboardCrumb()
    : user.role === 'Student'
      ? studentDashboardCrumb()
      : { label: 'Dashboard' }

  return (
    <div className="panel-page prof-settings">
      <PanelBreadcrumbs items={[dashboardCrumb, { label: 'Settings' }]} />
      <div className="panel-hero panel-hero--page">
        <p className="panel-kicker">{user.role} · Account</p>
        <h1>Profile Settings</h1>
        <p className="panel-hero-greeting">Update your display name and profile picture.</p>
      </div>

      <div className="prof-settings__card">
        <div className="prof-settings__avatar-section">
          <div className="prof-settings__avatar-preview">
            <UserAvatar username={username || user.username} avatarUrl={currentAvatar} size="lg" />
          </div>
          <ImageDropZone
            preview={currentAvatar}
            onFile={handleAvatarFile}
            onRemove={() => { setPreview(null); void handleRemoveAvatar() }}
            label="Drag & drop your photo here, or click to browse"
            hint="JPG, PNG, or GIF, resized to 512 px"
            aspectClass="prof-settings__drop-zone"
          />
          <p className="prof-settings__avatar-hint">Max 4 MB. Square images look best.</p>
        </div>

        <div className="prof-settings__form">
          <div className="prof-settings__field">
            <label className="prof-settings__label" htmlFor="prof-username">Display name</label>
            <input
              id="prof-username"
              type="text"
              className="panel-input prof-settings__input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={60}
            />
          </div>

          <div className="prof-settings__field">
            <label className="prof-settings__label">Email</label>
            <input
              type="email"
              className="panel-input prof-settings__input prof-settings__input--readonly"
              value={user.email}
              readOnly
              tabIndex={-1}
            />
            <p className="prof-settings__hint">Email cannot be changed here.</p>
          </div>

          <div className="prof-settings__field">
            <label className="prof-settings__label">Role</label>
            <div className="prof-settings__role-badge">{user.role}</div>
          </div>

          <div className="prof-settings__actions">
            <button
              type="button"
              className="panel-btn panel-btn-primary prof-settings__save-btn"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button
              type="button"
              className="panel-btn panel-btn-secondary prof-settings__pwd-btn panel-btn-with-icon"
              onClick={() => setShowPwdModal(true)}
            >
              <PanelIcon name="lock" variant="inline" /> Change Password
            </button>
          </div>
        </div>
      </div>

      <div className="prof-settings__card howto-pref">
        <div className="howto-pref__head">
          <h2 className="howto-pref__title">Game guides</h2>
          <p className="howto-pref__sub">
            Choose which games show the “How to Play” guide before they start. Turn one back on if
            you previously chose “Don’t show this again”.
          </p>
        </div>
        <ul className="howto-pref__list">
          {HOWTO_GAMES.map((g) => {
            const enabled = !howToDisabled[g.key]
            return (
              <li key={g.key} className="howto-pref__row">
                <span className="howto-pref__icon" aria-hidden="true">{g.icon}</span>
                <div className="howto-pref__info">
                  <p className="howto-pref__name">{g.name}</p>
                  <p className="howto-pref__desc">
                    {enabled ? 'Guide shows before the game starts' : 'Guide is hidden'}
                  </p>
                </div>
                <label className="howto-switch" title={`${enabled ? 'Disable' : 'Enable'} the ${g.name} guide`}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={prefsLoading}
                    onChange={(e) => toggleHowTo(g.key, e.target.checked)}
                  />
                  <span className="howto-switch__slider" aria-hidden="true" />
                  <span className="howto-switch__label">{enabled ? 'On' : 'Off'}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>

      {showPwdModal && user.id && (
        <ChangePasswordModal
          userId={user.id}
          onClose={() => setShowPwdModal(false)}
        />
      )}
    </div>
  )
}
