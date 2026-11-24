import localFont from 'next/font/local'
import Link from 'next/link'

import logo from '/src/res/logo.svg'
import { makeClass } from '/src/utils'

import styles from './Header.module.scss'

const molot = localFont({
  src: './molot.woff2',
  fallback: ['sans-serif'],
})

interface HeaderProps {
  /** Show the full header */
  isFull?: boolean
  isSmall?: boolean
}

const Header = ({ isFull, isSmall }: HeaderProps) => <header className={styles.header} data-small={isSmall}>
    {isFull ? <>
      {!isSmall && <img className={styles.bigLogo} src={logo.src} height={512} width={512} alt="" />}
      <h1 className={makeClass(styles.bigTitle, molot.className)}>CRAB FIT</h1>
    </> : <Link href="/" className={styles.link}>
      <div className={styles.top}>
        <img className={styles.logo} src={logo.src} height={512} width={512} alt="" />
        <span className={makeClass(styles.title, molot.className)}>CRAB FIT</span>
      </div>
    </Link>}
  </header>

export default Header
