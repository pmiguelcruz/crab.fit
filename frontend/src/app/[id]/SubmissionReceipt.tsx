import { Temporal } from '@js-temporal/polyfill'

import Button from '/src/components/Button/Button'
import { EventResponse, Submission } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import { convertTimesToDates, getWeekdayNames } from '/src/utils'
import { slotMinutes } from '/src/utils/slotSize'

import styles from './page.module.scss'

interface Props {
  event: EventResponse
  submission: Submission
  timezone: string
}

const SubmissionReceipt = ({ event, submission, timezone }: Props) => {
  const { t, i18n } = useTranslation('event')

  const download = () => {
    const weekly = event.times[0]?.length === 6
    const submitted = new Date(submission.submitted_at * 1000)
    const time = submitted.toLocaleString(i18n.language, {
      dateStyle: 'long',
      timeStyle: 'long',
      timeZone: timezone,
    })
    const weekdays = getWeekdayNames(i18n.language)
    const size = event.slot_size
    const weeksOrDates: Intl.DateTimeFormatOptions = weekly ? { weekday: 'long' } : { dateStyle: 'long' }
    const slots = size === 'day'
      ? [...submission.availability].sort().map(day => day.length === 1
        ? weekdays[Number(day) - 1]
        : Temporal.PlainDate.from(day).toLocaleString(i18n.language, { dateStyle: 'full' }))
      : convertTimesToDates(submission.availability, timezone)
        .sort(Temporal.ZonedDateTime.compare)
        .map(date => {
          const end = date.add({ minutes: slotMinutes(size) })
          const zone = Temporal.TimeZone.from(timezone)
          const ambiguous = zone.getPossibleInstantsFor(date.toPlainDateTime()).length > 1
            || zone.getPossibleInstantsFor(end.toPlainDateTime()).length > 1
            || date.offset !== end.offset
          const format = (time: Temporal.ZonedDateTime) => (
            time.toLocaleString(i18n.language, { timeStyle: 'short' }) + (ambiguous ? ` (UTC${time.offset})` : '')
          )
          return `${date.toLocaleString(i18n.language, weeksOrDates)} · ${format(date)}–${format(end)}`
        })
    const receipt = [
      t('submission.receipt_title'),
      t('submission.receipt_event', { name: event.name }),
      new URL(`/${encodeURIComponent(event.id)}`, location.origin).href,
      t('submission.receipt_participant', { name: submission.name }),
      t('submission.receipt_time', { time, timezone }),
      '',
      ...(slots.length ? slots : [t('submission.receipt_empty')]),
      '',
    ].join('\n')

    const url = URL.createObjectURL(new Blob([receipt], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `crab-fit-${event.id}-receipt.txt`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <div className={styles.receipt}>
    <span role="status">{t('submission.saved')}</span>
    <Button isSmall isSecondary onClick={download}>{t('submission.download')}</Button>
  </div>
}

export default SubmissionReceipt
