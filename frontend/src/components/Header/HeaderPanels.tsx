'use client'

import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'

import Button from '/src/components/Button/Button'
import Error from '/src/components/Error/Error'
import TextField from '/src/components/TextField/TextField'
import { signInAdmin } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

import headerStyles from './Header.module.scss'
import styles from './HeaderPanels.module.scss'

const HeaderPanels = ({ children, isSmall }: { children: ReactNode; isSmall?: boolean }) => {
  const { t } = useTranslation(['home', 'admin'])
  const router = useRouter()
  const pathname = usePathname()
  const [panel, setPanel] = useState<'about' | 'admin' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const aboutOpen = panel === 'about'
  const aboutLinkTabIndex = aboutOpen ? undefined : -1

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

  return <header className={headerStyles.header} data-small={isSmall}>
    {children}
    <div className={styles.controls}>
      <div className={styles.actions}>
        <Button isSmall isSecondary aria-controls="about" aria-expanded={panel === 'about'} onClick={() => toggle('about')}>
          {t('home:footer.about')}
        </Button>
        <Button isSmall isSecondary aria-controls="admin-sign-in" aria-expanded={panel === 'admin'} onClick={() => toggle('admin')}>
          {t('home:footer.admin')}
        </Button>
      </div>
      <div id="about" className={styles.reveal} aria-hidden={!aboutOpen}>
        <div className={styles.revealInner}>
          <p className={styles.about}>
            <span className={`accent-icon ${styles.inlineIcon} ${styles.calendar}`} aria-hidden="true" />
            Find a day everyone can make. Open an event link, sign in with a name and password, and mark when you’re free. No site-wide account is needed.
            {' '}<span className={`accent-icon ${styles.inlineIcon} ${styles.shield}`} aria-hidden="true" />
            <span className={styles.screenReader}>Data privacy. </span>
            Event details, names, notes, and availability are stored on Pedro’s home server in Providence, Rhode Island, on a repurposed A95X F2 TV box running Debian. Anyone with the link can view the event and submit their own availability. A cookie remembers the links you’ve opened, and this browser keeps track of your entries. Events stay on the server until an admin deletes them.
            {' '}<span className={`accent-icon ${styles.inlineIcon} ${styles.code}`} aria-hidden="true" />
            <span className={styles.screenReader}>Source code. </span>
            See <a href="https://github.com/pmiguelcruz/crab.fit" tabIndex={aboutLinkTabIndex}>Pedro’s fork</a>, the <a href="https://github.com/GRA0007/crab.fit" tabIndex={aboutLinkTabIndex}>original project</a>, or <a href="https://crab.fit/" tabIndex={aboutLinkTabIndex}>Crab Fit</a>. Created by <a href="https://bengrant.dev" rel="author" tabIndex={aboutLinkTabIndex}>Ben Grant</a>. Modified by <a href="https://pmcruz.com" tabIndex={aboutLinkTabIndex}>Pedro Cruz</a>.
          </p>
        </div>
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
    </div>
  </header>
}

export default HeaderPanels
