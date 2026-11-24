'use client'

import { type FormEvent, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import Button from '/src/components/Button/Button'
import Content from '/src/components/Content/Content'
import Error from '/src/components/Error/Error'
import TextField from '/src/components/TextField/TextField'
import { signInAdmin } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

import styles from './Footer.module.scss'

const Footer = () => {
  const { t } = useTranslation(['home', 'admin'])
  const router = useRouter()
  const pathname = usePathname()
  const [panel, setPanel] = useState<'about' | 'admin' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const openFromHash = () => {
      const hash = location.hash
      setPanel(hash === '#admin-sign-in' ? 'admin' : hash === '#about' ? 'about' : null)
      setError('')
    }
    openFromHash()
    window.addEventListener('hashchange', openFromHash)
    return () => window.removeEventListener('hashchange', openFromHash)
  }, [pathname])

  const toggle = (next: 'about' | 'admin') => {
    setPanel(current => current === next ? null : next)
    setError('')
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const pin = String(new FormData(form).get('pin') ?? '')
    setBusy(true)
    setError('')
    try {
      const { token } = await signInAdmin(pin)
      sessionStorage.setItem('crab-fit-admin', token)
      form.reset()
      setPanel(null)
      router.push('/admin')
    } catch (error) {
      setError(t(error instanceof Response && error.status === 401 ? 'admin:pin_invalid'
        : error instanceof Response && error.status === 429 ? 'admin:pin_limit'
          : 'admin:pin_error'))
    } finally {
      setBusy(false)
    }
  }

  return <footer className={styles.footer}>
    <Content>
      <div className={styles.actions}>
        <Button isSmall isSecondary aria-controls="about" aria-expanded={panel === 'about'} onClick={() => toggle('about')}>
          {t('home:footer.about')}
        </Button>
        <Button isSmall isSecondary aria-controls="admin-sign-in" aria-expanded={panel === 'admin'} onClick={() => toggle('admin')}>
          {t('home:footer.admin')}
        </Button>
      </div>
      <div id="about" className={styles.panel} hidden={panel !== 'about'}>
        <p>Created by <a href="https://bengrant.dev" rel="author">Ben Grant</a>. Modified by <a href="https://github.com/pmiguelcruz/crab.fit">Pedro Cruz</a>.</p>
        <h2>Data privacy</h2>
        <p>Event details, names, notes and availability are stored on Pedro’s home server in Providence, Rhode Island, a repurposed A95X F2 TV box running Debian.</p>
        <p>Anyone with the event link can view the event and submit their own availability. A cookie remembers the links you have opened. This browser also saves access to your own entries.</p>
        <p>Events are kept until someone manually deletes them.</p>
      </div>
      <div id="admin-sign-in" className={styles.panel} hidden={panel !== 'admin'}>
        {panel === 'admin' && <form className={styles.form} onSubmit={submit}>
          <TextField
            label={t('admin:pin')}
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
          <Button type="submit" isSmall isLoading={busy} disabled={busy}>{t('admin:sign_in')}</Button>
        </form>}
        <Error onClose={() => setError('')}>{error}</Error>
      </div>
    </Content>
  </footer>
}

export default Footer
