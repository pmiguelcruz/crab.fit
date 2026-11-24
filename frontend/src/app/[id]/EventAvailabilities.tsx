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
import TextField from '/src/components/TextField/TextField'
import TimeZoneOverlap, { OverlapSettings } from '/src/components/TimeZoneOverlap/TimeZoneOverlap'
import { EventResponse, getPeople, PersonLogin, PersonResponse, type ProfileAction, removeOwnResponse, Submission, updatePerson } from '/src/config/api'
import { useCalendarSettings } from '/src/hooks/useCalendarSettings'
import { useTranslation } from '/src/i18n/client'
import timezones from '/src/res/timezones.json'
import useRecentsStore from '/src/stores/recentsStore'
import { calculateTable, CalculateTableReply, expandTimes, makeClass } from '/src/utils'
import { clockMinutes } from '/src/utils/awakeOverlap'
import { formatPollChoice } from '/src/utils/formatPollChoice'
import { slotMinutes } from '/src/utils/slotSize'

import styles from './page.module.scss'
import SharedAvailability, { rememberProfile } from './SharedAvailability'
import SharedEmails from './SharedEmails'
import SubmissionReceipt from './SubmissionReceipt'
import VoteNotifications from './VoteNotifications'

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
  const [sharedEmail, setSharedEmail] = useState<string>()
  const [profile, setProfile] = useState<ProfileAction>()
  const emailField = useRef<HTMLInputElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmRemoval, setConfirmRemoval] = useState(false)
  const [removed, setRemoved] = useState(false)
  const [receipt, setReceipt] = useState<{ submission: Submission; timezone: string }>()
  const [submitError, setSubmitError] = useState('')

  const [tab, setTab] = useState<'group' | 'you'>('group')
  const [timezone, setTimezone] = useState(event?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

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
    if (tab !== 'group' || !event) return
    let active = true
    const refresh = () => {
      getPeople(event.id)
        .then(responses => { if (active) setPeople(responses) })
        .catch(console.warn)
    }
    refresh()
    const timer = event.shared_availability_available ? window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 12000) : undefined
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [event, tab])

  const submit = async () => {
    if (!event || !user || submitting) return
    if (emailField.current && !emailField.current.reportValidity()) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const submission = await updatePerson(event.id, user.name, {
        availability: draft, tentative, group_id: groupId || null, shared_email: sharedEmail?.trim() ?? null,
        profile,
      }, user.token)
      if (profile && profile.action !== 'unlink') rememberProfile(profile.key)
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
      setSharedEmail(undefined)
      setProfile(undefined)
      setTab('group')
    } catch (e) {
      if (e instanceof Response && e.status === 401) {
        setUser(undefined)
        setTab('group')
        setSubmitError(t('submission.expired'))
      } else if (e instanceof Response && e.status === 403) {
        setSubmitError(t('profiles.key_required'))
      } else if (e instanceof Response && (e.status === 404 || e.status === 422)) {
        const invalidEmail = e.status === 422 && await e.text() === 'invalid_shared_email'
        setSubmitError(t(invalidEmail ? 'email.invalid' : 'submission.schedule_changed'))
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
      setSharedEmail(undefined)
      setProfile(undefined)
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
          setSharedEmail(person?.shared_email)
          setProfile(undefined)
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
      {event?.final_choice && <p className={styles.finalChoice}>
        {t('profiles.final_choice', {
          choice: formatPollChoice(event, event.final_choice, i18n.language, timezone),
        })}
      </p>}
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

    {event?.notifications_available && <VoteNotifications key={event.id} eventId={event.id} />}
    {tab === 'group' ? <>
      {event && <SharedEmails key={`emails-${event.id}`} eventId={event.id} />}
      <AvailabilityViewer
        times={expandedTimes}
        people={people}
        groups={event?.groups}
        datesOnly={datesOnly}
        table={table}
      />
    </> : user && <>
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
      <Content>
        {!!event?.shared_availability_available && <SharedAvailability
          eventId={event.id}
          user={user}
          action={profile}
          disabled={submitting}
          onChange={setProfile}
          onLoad={(availability, tentative) => {
            setDraft(availability)
            setTentative(tentative)
          }}
        />}
        <label className={styles.shareEmailChoice}>
          <input
            name="share-email"
            type="checkbox"
            checked={sharedEmail !== undefined}
            disabled={submitting}
            onChange={e => setSharedEmail(e.currentTarget.checked ? '' : undefined)}
          />
          {t('email.opt_in')}
        </label>
        {sharedEmail !== undefined && <TextField
          name="shared-email"
          label={t('email.address')}
          description={t('email.purpose')}
          type="email"
          autoComplete="email"
          ref={emailField}
          value={sharedEmail}
          disabled={submitting}
          maxLength={254}
          required
          onChange={e => setSharedEmail(e.currentTarget.value)}
        />}
      </Content>
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
