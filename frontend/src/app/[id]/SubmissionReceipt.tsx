import { Temporal } from '@js-temporal/polyfill'

import Button from '/src/components/Button/Button'
import { EventResponse, Submission } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import { convertTimesToDates } from '/src/utils'

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
    const dates = convertTimesToDates(submission.availability, timezone)
      .sort(Temporal.ZonedDateTime.compare)
    const weeksOrDates: Intl.DateTimeFormatOptions = weekly ? { weekday: 'long' } : { dateStyle: 'long' }
    const slots = dates.map(date => `${date.toLocaleString(i18n.language, weeksOrDates)} · ${
      date.toLocaleString(i18n.language, { timeStyle: 'short' })
    }–${date.add({ minutes: 15 }).toLocaleString(i18n.language, { timeStyle: 'short' })}`)
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
