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
import TimeZoneOverlap, { OverlapSettings } from '/src/components/TimeZoneOverlap/TimeZoneOverlap'
import { EventResponse, getPeople, PersonLogin, PersonResponse, removeOwnResponse, Submission, updatePerson } from '/src/config/api'
import { useCalendarSettings } from '/src/hooks/useCalendarSettings'
import { useTranslation } from '/src/i18n/client'
import timezones from '/src/res/timezones.json'
import useRecentsStore from '/src/stores/recentsStore'
import { calculateTable, CalculateTableReply, expandTimes, makeClass } from '/src/utils'
import { clockMinutes } from '/src/utils/awakeOverlap'
import { slotMinutes } from '/src/utils/slotSize'

import styles from './page.module.scss'
import SubmissionReceipt from './SubmissionReceipt'

interface EventAvailabilitiesProps {
  event?: EventResponse
}

const EventAvailabilities = ({ event }: EventAvailabilitiesProps) => {
  const { t, i18n } = useTranslation('event')

  const { weekStart, timeFormat } = useCalendarSettings(i18n.language)

  const [people, setPeople] = useState<PersonResponse[]>([])
  const size = event?.slot_size
  const datesOnly = size === 'day'
  const interval = datesOnly ? undefined : slotMinutes(size)
  const expandedTimes = useMemo(() => size ? event?.times ?? [] : expandTimes(event?.times ?? []), [event?.times, size])

  const [user, setUser] = useState<PersonLogin>()
  const [draft, setDraft] = useState<string[]>([])
  const [tentative, setTentative] = useState<string[]>([])
  const [groupId, setGroupId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [receipt, setReceipt] = useState<{ submission: Submission; timezone: string }>()
  const [submitError, setSubmitError] = useState('')

  const [tab, setTab] = useState<'group' | 'you'>('group')
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone)

  const [overlap, setOverlap] = useState<OverlapSettings>({ zones: [], from: '08:00', to: '22:00' })
  const wakeStart = clockMinutes(overlap.from)
  const wakeEnd = clockMinutes(overlap.to)
  const invalidWindow = wakeStart === undefined || wakeEnd === undefined || wakeStart === wakeEnd
  const comparison = useMemo(() => {
    const zones = overlap.zones.filter(zone => zone !== timezone)
    if (!zones.length || wakeStart === undefined || wakeEnd === undefined || wakeStart === wakeEnd) return
    return { zones: [timezone, ...zones], start: wakeStart, end: wakeEnd }
  }, [overlap.zones, timezone, wakeStart, wakeEnd])

  const changeTimezone = (zone: string) => {
    setTimezone(zone)
    setOverlap(current => ({ ...current, zones: current.zones.filter(candidate => candidate !== zone) }))
  }

  const tableWorker = useRef<Worker>()
  const tableRevision = useRef(0)
  const [table, setTable] = useState<ReturnType<typeof calculateTable>>()

  useEffect(() => () => {
    tableWorker.current?.terminate()
    tableWorker.current = undefined
  }, [])

  useEffect(() => {
    if (!event || datesOnly || !expandedTimes.length) return
    if (!tableWorker.current && window.Worker) {
      tableWorker.current = new Worker(new URL('/src/workers/calculateTable', import.meta.url))
    }

    const args = { times: expandedTimes, locale: i18n.language, timeFormat, timezone, weekStart, interval, overlay: comparison }
    const revision = ++tableRevision.current
    if (tableWorker.current) {
      tableWorker.current.onmessage = (message: MessageEvent<CalculateTableReply>) => {
        if (message.data.revision === tableRevision.current) setTable(message.data.table)
      }
      tableWorker.current.postMessage({ args, revision })
      setTable(undefined)
    } else {
      setTable(calculateTable(args))
    }
  }, [comparison, datesOnly, event, expandedTimes, i18n.language, interval, timeFormat, timezone, weekStart])

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
      const submission = await updatePerson(event.id, user.name, {
        availability: draft, tentative, group_id: groupId || null,
      }, user.token)
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
      setTentative([])
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

  const removeResponse = async () => {
    if (!event || !user || submitting) return
    setSubmitting(true)
    setSubmitError('')
    try {
      await removeOwnResponse(event.id, user.name, user.token)
      addRecent({ id: event.id, name: event.name, created_at: event.created_at, user: undefined })
      setUser(undefined)
      setDraft([])
      setTentative([])
      setReceipt(undefined)
      setRemoved(true)
      setTab('group')
    } catch (e) {
      if (e instanceof Response && e.status === 401) {
        setUser(undefined)
        setTab('group')
        setSubmitError(t('submission.expired'))
      } else {
        setSubmitError(t('submission.remove_failed'))
      }
    } finally {
      setConfirmRemoval(false)
      setSubmitting(false)
    }
  }

  return <>
    <Section id="login">
      <Content>
        <Login eventId={event?.id} user={user} disabled={submitting} onChange={person => {
          setUser(person)
          setDraft(person?.availability ?? [])
          setTentative(person?.tentative ?? [])
          setGroupId(person?.group_id ?? '')
          setSubmitError('')
          setConfirmRemoval(false)
          setRemoved(false)
          setTab(person ? 'you' : 'group')
          if (person) setReceipt(undefined)
        }} />

        {!datesOnly && <>
          <SelectField
            label={t('form.timezone')}
            name="timezone"
            id="timezone"
            isInline
            value={timezone}
            onChange={event => changeTimezone(event.currentTarget.value)}
            options={timezones}
          />

          {event?.timezone && event.timezone !== timezone && <p>
            <Trans i18nKey="form.created_in_timezone" t={t} i18n={i18n}>
              {/* eslint-disable-next-line */}
              {/* @ts-ignore */}
              _<strong>{{timezone: event.timezone}}</strong>
              _<a href="#" onClick={e => {
                e.preventDefault()
                changeTimezone(event.timezone)
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
                  changeTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
                }}>_</a>_
              </Trans>
            </p>
          )}
          {event && <TimeZoneOverlap
            timezone={timezone}
            settings={overlap}
            onChange={setOverlap}
            count={comparison ? table?.overlapCount : 0}
            invalid={invalidWindow}
          />}
        </>}
      </Content>
    </Section>

    <Content>
      <Error onClose={() => setSubmitError('')}>{submitError}</Error>
      {removed && <p role="status">{t('submission.removed')}</p>}
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
      groups={event?.groups}
      datesOnly={datesOnly}
      table={table}
    /> : user && <>
      {!!event?.groups?.length && <Content>
        <SelectField
          label={t('teams.your_group')}
          name="respondent-group"
          defaultOption={t('teams.unassigned')}
          options={Object.fromEntries(event.groups.map(group => [group.id, group.name]))}
          value={groupId}
          disabled={submitting}
          onChange={e => setGroupId(e.currentTarget.value)}
        />
      </Content>}
      <AvailabilityEditor
        eventId={event?.id}
        times={expandedTimes}
        timezone={timezone}
        datesOnly={datesOnly}
        interval={interval}
        value={draft}
        onChange={value => {
          if (submitting) return
          const available = new Set(value)
          setDraft(value)
          setTentative(previous => previous.filter(slot => !available.has(slot)))
        }}
        tentative={tentative}
        onChangeTentative={value => {
          if (submitting) return
          const possible = new Set(value)
          setTentative(value)
          setDraft(previous => previous.filter(slot => !possible.has(slot)))
        }}
        table={table}
      />
      <Content isCentered>
        <div className={styles.submission}>
          {confirmRemoval ? <>
            <p>{t('submission.remove_confirm')}</p>
            <Button isLoading={submitting} disabled={submitting} onClick={removeResponse}>{t('submission.remove')}</Button>
            <Button isSecondary disabled={submitting} onClick={() => setConfirmRemoval(false)}>{t('submission.cancel')}</Button>
          </> : <>
            <Button isLoading={submitting} disabled={submitting || (!datesOnly && !table)} onClick={submit}>
              {t('submission.submit')}
            </Button>
            <Button isSecondary disabled={submitting} onClick={() => setConfirmRemoval(true)}>{t('submission.remove_self')}</Button>
          </>}
        </div>
      </Content>
    </>}
  </>
}

export default EventAvailabilities
