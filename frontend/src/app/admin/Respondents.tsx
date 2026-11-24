import { useEffect, useState } from 'react'

import Button from '/src/components/Button/Button'
import Error from '/src/components/Error/Error'
import { listParticipants, removeParticipant } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

import styles from './admin.module.scss'

const Respondents = ({ id, token, onExpired }: { id: string; token: string; onExpired: () => void }) => {
  const { t } = useTranslation('admin')
  const [names, setNames] = useState<string[]>()
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [removed, setRemoved] = useState('')

  useEffect(() => {
    let active = true
    listParticipants(id, token).then(names => {
      if (active) setNames(names)
    }).catch(e => {
      if (!active) return
      if (e instanceof Response && e.status === 401) onExpired()
      else setError(t('respondents_error'))
    })
    return () => { active = false }
  }, [id, token, t])

  const remove = async (name: string) => {
    setBusy(true)
    setError('')
    try {
      await removeParticipant(id, name, token)
      setNames(current => current?.filter(person => person !== name))
      setConfirm('')
      setRemoved(name)
    } catch (e) {
      if (e instanceof Response && e.status === 401) onExpired()
      else setError(t('remove_respondent_error'))
    } finally {
      setBusy(false)
    }
  }

  return <div className={styles.confirm}>
    <Error onClose={() => setError('')}>{error}</Error>
    {removed && <p role="status">{t('removed_respondent', { name: removed })}</p>}
    {!names && !error && <p>{t('loading')}</p>}
    {names?.length === 0 && <p>{t('no_respondents')}</p>}
    {names?.map(name => <div className={styles.dateRow} key={name}>
      {confirm === name ? <>
        <span>{t('remove_respondent', { name })}</span>
        <Button isSmall isLoading={busy} disabled={busy} onClick={() => remove(name)}>{t('remove')}</Button>
        <Button isSmall isSecondary disabled={busy} onClick={() => setConfirm('')}>{t('cancel')}</Button>
      </> : <>
        <span>{name}</span>
        <Button isSmall isSecondary disabled={busy} onClick={() => setConfirm(name)}>{t('remove')}</Button>
      </>}
    </div>)}
  </div>
}

export default Respondents
