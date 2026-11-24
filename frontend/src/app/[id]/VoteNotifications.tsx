import { type FormEvent, useEffect, useRef, useState } from 'react'

import Button from '/src/components/Button/Button'
import Content from '/src/components/Content/Content'
import SelectField from '/src/components/SelectField/SelectField'
import TextField from '/src/components/TextField/TextField'
import { type NotificationMode, postVoteNotifications } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

import styles from './page.module.scss'

type Action = { action: 'confirm' | 'unsubscribe'; token: string }

const VoteNotifications = ({ eventId }: { eventId: string }) => {
  const { t } = useTranslation('event')
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<NotificationMode>('change')
  const [linkAction, setLinkAction] = useState<Action>()
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const section = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const readLink = () => {
      const match = /^#(confirm|unsubscribe)-notifications=([\w-]{43})$/.exec(window.location.hash)
      if (match) {
        setLinkAction({ action: match[1] === 'confirm' ? 'confirm' : 'unsubscribe', token: match[2] })
        setMessage('')
        setOpen(true)
        section.current?.scrollIntoView({ block: 'center' })
      } else {
        setLinkAction(undefined)
      }
    }
    readLink()
    window.addEventListener('hashchange', readLink)
    return () => window.removeEventListener('hashchange', readLink)
  }, [])

  const enroll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const email = String(data.get('notification-email')).trim()
    setLoading(true)
    setMessage('')
    try {
      await postVoteNotifications(eventId, {
        email,
        mode,
        count: mode === 'change' ? undefined : Number(data.get('notification-count')),
      })
      setMessage(t('notifications.check_email'))
      form.reset()
      setMode('change')
    } catch (error) {
      setMessage(t(error instanceof Response && error.status === 422 ? 'notifications.invalid' : 'notifications.failed'))
    } finally {
      setLoading(false)
    }
  }

  const manage = async (action: Action) => {
    setLoading(true)
    setMessage('')
    try {
      await postVoteNotifications(eventId, action)
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
      setLinkAction(undefined)
      setMessage(t(action.action === 'confirm' ? 'notifications.active' : 'notifications.stopped'))
    } catch (error) {
      setMessage(t(error instanceof Response && error.status === 404 ? 'notifications.expired' : 'notifications.failed'))
    } finally {
      setLoading(false)
    }
  }

  return <div className={styles.noPrint}>
    <Content>
      <details ref={section} className={styles.voteNotifications} open={open} onToggle={event => setOpen(event.currentTarget.open)}>
        <summary>{t('notifications.title')}</summary>
        {linkAction ? <>
          <p>{t(linkAction.action === 'confirm' ? 'notifications.confirm_prompt' : 'notifications.stop_prompt')}</p>
          <Button isSmall disabled={loading} isLoading={loading} onClick={() => manage(linkAction)}>
            {t(linkAction.action === 'confirm' ? 'notifications.confirm' : 'notifications.stop')}
          </Button>
        </> : <form onSubmit={enroll}>
          <TextField
            name="notification-email"
            label={t('email.address')}
            type="email"
            autoComplete="email"
            required
            disabled={loading}
            maxLength={254}
          />
          <SelectField
            name="notification-mode"
            label={t('notifications.when')}
            options={{
              change: t('notifications.change'),
              responses: t('notifications.responses'),
              quorum: t('notifications.quorum'),
            }}
            value={mode}
            onChange={event => setMode(event.currentTarget.value as NotificationMode)}
            disabled={loading}
          />
          {mode !== 'change' && <TextField
            name="notification-count"
            label={t('notifications.count')}
            type="number"
            min={1}
            max={65535}
            step={1}
            required
            disabled={loading}
          />}
          <Button type="submit" isSmall isLoading={loading} disabled={loading}>{t('notifications.subscribe')}</Button>
        </form>}
        <p role="status">{message}</p>
      </details>
    </Content>
  </div>
}

export default VoteNotifications
