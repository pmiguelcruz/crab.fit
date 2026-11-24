import { cache, Suspense } from 'react'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Temporal } from '@js-temporal/polyfill'

import Content from '/src/components/Content/Content'
import EventShare from '/src/components/EventShare/EventShare'
import { getEvent } from '/src/config/api'
import { useTranslation } from '/src/i18n/server'
import { makeClass, relativeTimeFormat } from '/src/utils'

import EventAvailabilities from './EventAvailabilities'
import styles from './page.module.scss'

interface PageProps {
  params: { id: string }
}

// The title and page share one deadline and the same event response.
const readEvent = cache(getEvent)

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  try {
    return { title: (await readEvent(params.id)).name }
  } catch (error) {
    const { t } = await useTranslation('event')
    return { title: error instanceof Response && error.status === 404 ? t('error.title') : t('error.unavailable_title') }
  }
}

const Page = async ({ params }: PageProps) => {
  const event = await readEvent(params.id).catch(error => {
    if (error instanceof Response && error.status === 404) return null
    throw error ?? new Error('Crab Fit API unavailable')
  })
  if (!event) notFound()

  const { t, i18n } = await useTranslation(['common', 'event'])

  return <>
    <Suspense
      fallback={<Content>
        <h1 className={styles.name}><span className={styles.bone} /></h1>
        <div className={styles.date}><span className={styles.bone} /></div>
        <div className={styles.info}><span className={styles.bone} style={{ width: '20em' }} /></div>
        <div className={styles.info}><span className={styles.bone} style={{ width: '20em' }} /></div>
      </Content>}
    >
      <Content>
        <h1 className={styles.name}>{event.name}</h1>
        <span
          className={styles.date}
          title={Temporal.Instant.fromEpochSeconds(event.created_at).toLocaleString(i18n.language, { dateStyle: 'long' })}
        >{t('common:created', { date: relativeTimeFormat(Temporal.Instant.fromEpochSeconds(event.created_at), i18n.language) })}</span>

        <EventShare event={event} className={styles.info} helpClassName={makeClass(styles.info, styles.noPrint)} />
      </Content>
    </Suspense>

    <EventAvailabilities event={event} />
  </>
}

export default Page
