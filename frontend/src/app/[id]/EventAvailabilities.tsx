'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Trans } from 'react-i18next/TransWithoutContext'

import AvailabilityEditor from '/src/components/AvailabilityEditor/AvailabilityEditor'
import AvailabilityViewer from '/src/components/AvailabilityViewer/AvailabilityViewer'
import Button from '/src/components/Button/Button'
import Content from '/src/components/Content/Content'
import Error from '/src/components/Error/Error'
import Login from '/src/components/Login/Login'
import Section from '/src/components/Section/Section'
import SelectField from '/src/components/SelectField/SelectField'
import { EventResponse, getPeople, PersonLogin, PersonResponse, Submission, updatePerson } from '/src/config/api'
import { useCalendarSettings } from '/src/hooks/useCalendarSettings'
import { useTranslation } from '/src/i18n/client'
import timezones from '/src/res/timezones.json'
import useRecentsStore from '/src/stores/recentsStore'
import { calculateTable, expandTimes, makeClass } from '/src/utils'

import styles from './page.module.scss'
import SubmissionReceipt from './SubmissionReceipt'

interface EventAvailabilitiesProps {
  event?: EventResponse
}

const EventAvailabilities = ({ event }: EventAvailabilitiesProps) => {
  const { t, i18n } = useTranslation('event')

  const { weekStart, timeFormat } = useCalendarSettings(i18n.language)

  const [people, setPeople] = useState<PersonResponse[]>([])
  const expandedTimes = useMemo(() => expandTimes(event?.times ?? []), [event?.times])

  const [user, setUser] = useState<PersonLogin>()
  const [draft, setDraft] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [receipt, setReceipt] = useState<{ submission: Submission; timezone: string }>()
  const [submitError, setSubmitError] = useState('')

  const [tab, setTab] = useState<'group' | 'you'>('group')
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)

  // Web worker for calculating the heatmap table
  const tableWorker = useRef<Worker>()

  // Calculate table (using a web worker if available)
  const [table, setTable] = useState<ReturnType<typeof calculateTable>>()

  useEffect(() => {
    if (event && expandedTimes.length > 0) {
      if (!tableWorker.current) {
        tableWorker.current = window.Worker ? new Worker(new URL('/src/workers/calculateTable', import.meta.url)) : undefined
      }
      const args = { times: expandedTimes, locale: i18n.language, timeFormat, timezone, weekStart }
      if (tableWorker.current) {
        tableWorker.current.onmessage = (e: MessageEvent<ReturnType<typeof calculateTable>>) => setTable(e.data)
        tableWorker.current.postMessage(args)
        setTable(undefined)
      } else {
        setTable(calculateTable(args))
      }
    }
  }, [event, expandedTimes, i18n.language, timeFormat, timezone, weekStart])

  // Add this event to recents
  const addRecent = useRecentsStore(state => state.addRecent)
  useEffect(() => {
    if (event) {
      addRecent({
        id: event.id,
        name: event.name,
        created_at: event.created_at,
      })
    }
  }, [addRecent])

  // Refetch availabilities
  useEffect(() => {
    if (tab === 'group' && event) {
      getPeople(event.id)
        .then(setPeople)
        .catch(console.warn)
    }
  }, [tab])

  const submit = async () => {
    if (!event || !user || submitting) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const submission = await updatePerson(event.id, user.name, { availability: draft }, user.token)
      setReceipt({ submission, timezone })
      addRecent({
        id: event.id,
        name: event.name,
        created_at: event.created_at,
        user: submission.availability.length ? {
          name: submission.name,
          availability: submission.availability,
        } : undefined,
      })
      setUser(undefined)
      setDraft([])
      setTab('group')
    } catch (e) {
      if (e instanceof Response && e.status === 401) {
        setUser(undefined)
        setTab('group')
        setSubmitError(t('submission.expired'))
      } else if (e instanceof Response && (e.status === 404 || e.status === 422)) {
        setSubmitError(t('submission.schedule_changed'))
      } else {
        setSubmitError(t('submission.failed'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  return <>
    <Section id="login">
      <Content>
        <Login eventId={event?.id} user={user} disabled={submitting} onChange={person => {
          setUser(person)
          setDraft(person?.availability ?? [])
          setSubmitError('')
          setTab(person ? 'you' : 'group')
          if (person) setReceipt(undefined)
        }} />

        <SelectField
          label={t('form.timezone')}
          name="timezone"
          id="timezone"
          isInline
          value={timezone}
          onChange={event => setTimezone(event.currentTarget.value)}
          options={timezones}
        />

        {event?.timezone && event.timezone !== timezone && <p>
          <Trans i18nKey="form.created_in_timezone" t={t} i18n={i18n}>
            {/* eslint-disable-next-line */}
            {/* @ts-ignore */}
            _<strong>{{timezone: event.timezone}}</strong>
            _<a href="#" onClick={e => {
              e.preventDefault()
              setTimezone(event.timezone)
            }}>_</a>_
          </Trans>
        </p>}

        {((
          Intl.DateTimeFormat().resolvedOptions().timeZone !== timezone
          && (event?.timezone && event.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone)
        ) || (
          event?.timezone === undefined
          && Intl.DateTimeFormat().resolvedOptions().timeZone !== timezone
        )) && (
          <p>
            <Trans i18nKey="form.local_timezone" t={t} i18n={i18n}>
              {/* eslint-disable-next-line */}
              {/* @ts-ignore */}
              _<strong>{{timezone: Intl.DateTimeFormat().resolvedOptions().timeZone}}</strong>
              _<a href="#" onClick={e => {
                e.preventDefault()
                setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
              }}>_</a>_
            </Trans>
          </p>
        )}
      </Content>
    </Section>

    <Content>
      <Error onClose={() => setSubmitError('')}>{submitError}</Error>
      {event && receipt && <SubmissionReceipt event={event} {...receipt} />}
      <div className={styles.tabs}>
        <button
          className={makeClass(
            styles.tab,
            tab === 'you' && styles.tabSelected,
            !user && styles.tabDisabled,
          )}
          type="button"
          onClick={() => {
            if (user) {
              setTab('you')
            } else {
              document.dispatchEvent(new CustomEvent('focusName'))
            }
          }}
          title={user ? '' : t('tabs.you_tooltip')}
        >{t('tabs.you')}</button>
        <button
          className={makeClass(
            styles.tab,
            tab === 'group' && styles.tabSelected,
          )}
          type="button"
          onClick={() => setTab('group')}
        >{t('tabs.group')}</button>
      </div>
    </Content>

    {tab === 'group' ? <AvailabilityViewer
      times={expandedTimes}
      people={people}
      table={table}
    /> : user && <>
      <AvailabilityEditor
        eventId={event?.id}
        times={expandedTimes}
        timezone={timezone}
        value={draft}
        onChange={value => { if (!submitting) setDraft(value) }}
        table={table}
      />
      <Content isCentered>
        <div className={styles.submission}>
          <Button isLoading={submitting} disabled={submitting || !table} onClick={submit}>
            {t('submission.submit')}
          </Button>
        </div>
      </Content>
    </>}
  </>
}

export default EventAvailabilities
