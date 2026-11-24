import localFont from 'next/font/local'
import Link from 'next/link'
import { type CSSProperties } from 'react'

import logo from '/src/res/logo.svg'
import { makeClass } from '/src/utils'

import styles from './Header.module.scss'
import HeaderPanels from './HeaderPanels'

const molot = localFont({
  src: './molot.woff2',
  fallback: ['sans-serif'],
})

interface HeaderProps {
  /** Show the full header */
  isFull?: boolean
  isSmall?: boolean
}

const logoMask = { '--accent-mask': `url("${logo.src}")` } as CSSProperties

const Header = ({ isFull, isSmall }: HeaderProps) => <HeaderPanels isSmall={isSmall}>
    {isFull ? <>
      {!isSmall && <span className={makeClass('accent-icon', styles.bigLogo)} style={logoMask} aria-hidden="true" />}
      <h1 className={makeClass('accent-text', styles.bigTitle, molot.className)}>CRAB FIT</h1>
    </> : <Link href="/" className={styles.link}>
      <div className={styles.top}>
        <span className={makeClass('accent-icon', styles.logo)} style={logoMask} aria-hidden="true" />
        <span className={makeClass('accent-text', styles.title, molot.className)}>CRAB FIT</span>
      </div>
    </Link>}
  </HeaderPanels>

export default Header
