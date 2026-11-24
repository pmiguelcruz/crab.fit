'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

import Content from '/src/components/Content/Content'
import Section from '/src/components/Section/Section'
import { EventResponse, getEvent } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import useRecentsStore from '/src/stores/recentsStore'
import { forgetVisitedEvents, readVisitedEvents, saveVisitedEvents } from '/src/stores/visitedEvents'

import styles from './Recents.module.scss'

const Recents = () => {
  const { t } = useTranslation('home')
  const [events, setEvents] = useState<EventResponse[]>()
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let active = true
    let running = false
    const refresh = async () => {
      if (running) return
      running = true
      const ids = readVisitedEvents() ?? saveVisitedEvents(useRecentsStore.getState().recents.map(event => event.id))
      const available: EventResponse[] = []
      let failed = false
      // Leave space in the API's 20-request burst for opening an event.
      const pageSize = 12
      for (let offset = 0; active && offset < ids.length; offset += pageSize) {
        const batch = ids.slice(offset, offset + pageSize)
        const matches = await Promise.allSettled(batch.map(getEvent))
        if (!active) return
        const missing: string[] = []
        matches.forEach((match, index) => {
          if (match.status === 'fulfilled') available.push(match.value)
          else if (match.reason instanceof Response && match.reason.status === 404) missing.push(batch[index])
          else failed = true
        })
        if (missing.length) {
          forgetVisitedEvents(missing)
          missing.forEach(useRecentsStore.getState().removeRecent)
        }
        if (available.length) setEvents([...available])
        if (offset + pageSize < ids.length) {
          await new Promise(resolve => window.setTimeout(resolve, pageSize * 500))
        }
      }
      if (active) {
        setEvents(available)
        setUnavailable(failed)
      }
      running = false
    }
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener('focus', refresh)
    }
  }, [])

  return <Section id="recents">
    <Content>
      {!events ? <p role="status">{t('event_history.loading')}</p> : <>
        {events.length > 0 && <>
          <h2>{t('event_history.title')}</h2>
          {events.map(event => <Link className={styles.recent} href={`/${encodeURIComponent(event.id)}`} key={event.id} prefetch={false}>
            {event.name}
          </Link>)}
        </>}
        {!events.length && !unavailable && <p>{t('event_history.empty')}</p>}
        {unavailable && <p role="status">{t('event_history.unavailable')}</p>}
      </>}
    </Content>
  </Section>
}

export default Recents
