import { useEffect, useState } from 'react'

import Button from '/src/components/Button/Button'
import TextField from '/src/components/TextField/TextField'
import { type PersonLogin, previewProfile, type ProfileAction } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

import styles from './page.module.scss'

const profileStorage = 'crabfit-shared-availability-key'
const validKey = /^[A-Za-z0-9_-]{43}$/

const readKey = () => {
  try {
    return localStorage.getItem(profileStorage) ?? ''
  } catch {
    return ''
  }
}

export const rememberProfile = (key: string) => {
  try {
    localStorage.setItem(profileStorage, key)
  } catch {
    // The key can still be copied from the profile settings.
  }
}

const newKey = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

interface Props {
  eventId: string
  user: PersonLogin
  action?: ProfileAction
  disabled: boolean
  onChange: (value?: ProfileAction) => void
  onLoad: (availability: string[], tentative: string[]) => void
}

const SharedAvailability = ({ eventId, user, action, disabled, onChange, onLoad }: Props) => {
  const { t } = useTranslation('event')
  const [key, setKey] = useState('')
  const [shown, setShown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const current = readKey()
    setKey(current)
    if (user.profile_linked && validKey.test(current)) onChange({ action: 'link', key: current })
  }, [onChange, user.profile_linked])

  const importProfile = async () => {
    setLoading(true)
    setMessage('')
    try {
      const preview = await previewProfile(eventId, user.name, key.trim(), user.token)
      onLoad(preview.availability, preview.tentative)
      onChange({ action: 'link', key: key.trim() })
      setMessage(t('profiles.loaded'))
    } catch (error) {
      setMessage(t(error instanceof Response && error.status === 403 ? 'profiles.key_required' : 'profiles.load_error'))
    } finally {
      setLoading(false)
    }
  }

  return <details className={styles.sharedAvailability} open={user.profile_linked && !key ? true : undefined}>
    <summary>{t('profiles.title')}</summary>
    <p>{t('profiles.description')}</p>
    <TextField
      label={t('profiles.key')}
      name="shared-profile-key"
      type={shown ? 'text' : 'password'}
      autoComplete="off"
      spellCheck={false}
      disabled={disabled || loading}
      readOnly={action?.action === 'create'}
      value={key}
      onChange={event => {
        const current = event.currentTarget.value.trim()
        setKey(current)
        setMessage('')
        onChange(user.profile_linked && validKey.test(current) ? { action: 'link', key: current } : undefined)
      }}
    />
    <div className={styles.shareEmails}>
      {key && <Button isSmall isSecondary onClick={() => setShown(value => !value)}>
        {t(shown ? 'profiles.hide_key' : 'profiles.show_key')}
      </Button>}
      {!user.profile_linked && !key && <Button isSmall isSecondary disabled={disabled || loading} onClick={() => {
        const created = newKey()
        onChange({ action: 'create', key: created })
        setKey(created)
        setShown(true)
      }}>{t('profiles.create')}</Button>}
      {action?.action !== 'create' && <Button
        isSmall isSecondary isLoading={loading}
        disabled={!validKey.test(key) || disabled || loading}
        onClick={importProfile}
      >{t('profiles.load')}</Button>}
      {action && <Button isSmall isSecondary disabled={disabled || loading} onClick={() => {
        const unlink = user.profile_linked && action.action !== 'unlink'
        if (unlink) {
          onChange({ action: 'unlink', key })
        } else if (user.profile_linked) {
          onChange({ action: 'link', key })
        } else {
          onChange(undefined)
          if (action.action === 'create') setKey(readKey())
        }
        setMessage('')
      }}>{t(user.profile_linked && action.action !== 'unlink' ? 'profiles.unlink' : 'profiles.cancel')}</Button>}
    </div>
    <p role="status">{message || (action && t(action.action === 'unlink' ? 'profiles.pending_unlink' : 'profiles.pending_link'))}</p>
  </details>
}

export default SharedAvailability
