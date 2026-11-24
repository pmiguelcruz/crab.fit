'use client'

import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Button from '/src/components/Button/Button'
import Error from '/src/components/Error/Error'
import TextField from '/src/components/TextField/TextField'
import { signInAdmin } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

import styles from './About.module.scss'

const About = ({ title, children }: { title: string; children: ReactNode }) => {
  const { t } = useTranslation('admin')
  const router = useRouter()
  const details = useRef<HTMLDetailsElement>(null)
  const [showPin, setShowPin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const openSignIn = () => {
      if (location.hash === '#admin-sign-in' && details.current) {
        details.current.open = true
        setShowPin(true)
      }
    }
    openSignIn()
    window.addEventListener('hashchange', openSignIn)
    return () => window.removeEventListener('hashchange', openSignIn)
  }, [])

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    const pin = String(new FormData(form).get('pin') ?? '')
    setBusy(true)
    setError('')
    try {
      const { token } = await signInAdmin(pin)
      sessionStorage.setItem('crab-fit-admin', token)
      form.reset()
      router.push('/admin')
    } catch (e) {
      setError(e instanceof Response && e.status === 401 ? t('pin_invalid')
        : e instanceof Response && e.status === 429 ? t('pin_limit')
          : t('pin_error'))
    } finally {
      setBusy(false)
    }
  }

  return <details ref={details}>
    <summary className={styles.summary}><h2>{title}</h2></summary>
    <p><a href="#admin-sign-in" aria-expanded={showPin} onClick={e => {
      e.preventDefault()
      setShowPin(value => !value)
      setError('')
    }}>{t('link')}</a></p>
    {showPin && <form id="admin-sign-in" className={styles.form} onSubmit={submit}>
      <TextField
        label={t('pin')}
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        pattern="[0-9]{4}"
        maxLength={4}
        isInline
        autoFocus
        required
      />
      <Button type="submit" isSmall isLoading={busy} disabled={busy}>{t('sign_in')}</Button>
    </form>}
    <Error onClose={() => setError('')}>{error}</Error>
    {children}
  </details>
}

export default About
