import { useState } from 'react'

import Button from '/src/components/Button/Button'
import Content from '/src/components/Content/Content'
import TextField from '/src/components/TextField/TextField'
import { getSharedEmails } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

import styles from './page.module.scss'

const SharedEmails = ({ eventId }: { eventId: string }) => {
  const { t } = useTranslation('event')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [manual, setManual] = useState('')

  const copy = async () => {
    setLoading(true)
    setMessage('')
    setManual('')
    try {
      const addresses = await getSharedEmails(eventId)
      if (!addresses.length) {
        setMessage(t('email.empty'))
        return
      }

      const text = addresses.join(', ')
      try {
        await navigator.clipboard.writeText(text)
        setMessage(t('email.copied', { count: addresses.length }))
      } catch {
        setManual(text)
        setMessage(t('email.manual'))
      }
    } catch {
      setMessage(t('email.failed'))
    } finally {
      setLoading(false)
    }
  }

  return <div className={styles.noPrint}>
    <Content>
      <div className={styles.shareEmails}>
        <Button isSmall isSecondary isLoading={loading} disabled={loading} onClick={copy}>
          {t('email.copy')}
        </Button>
        <span role="status">{message}</span>
      </div>
      {manual && <TextField
        label={t('email.list')}
        name="poll-email-list"
        value={manual}
        readOnly
        onFocus={e => e.currentTarget.select()}
      />}
    </Content>
  </div>
}

export default SharedEmails
