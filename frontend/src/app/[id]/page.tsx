import { cache } from 'react'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'

import Content from '/src/components/Content/Content'
import { getEvent } from '/src/config/api'
import { useTranslation } from '/src/i18n/server'

import EventAvailabilities from './EventAvailabilities'
import styles from './page.module.scss'

interface PageProps {
  params: { id: string }
}

// The title and page share one deadline and the same event response.
const readEvent = cache(getEvent)

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const privacy = { robots: { index: false, follow: false }, referrer: 'no-referrer' } as const
  try {
    return { ...privacy, title: (await readEvent(params.id)).name }
  } catch (error) {
    const { t } = await useTranslation('event')
    return { ...privacy, title: error instanceof Response && error.status === 404 ? t('error.title') : t('error.unavailable_title') }
  }
}

const Page = async ({ params }: PageProps) => {
  const event = await readEvent(params.id).catch(error => {
    if (error instanceof Response && error.status === 404) return null
    throw error ?? new Error('Crab Fit API unavailable')
  })
  if (!event) notFound()

  return <>
    <Content>
      <h1 className={styles.name}>{event.name}</h1>
    </Content>

    <EventAvailabilities event={event} />
  </>
}

export default Page
