'use client'

import { useEffect, useState } from 'react'
import { Trans } from 'react-i18next/TransWithoutContext'

import Copyable from '/src/components/Copyable/Copyable'
import { EventResponse } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

interface Props {
  event: EventResponse
  className?: string
  helpClassName?: string
  alternateHelp?: boolean
}

const EventShare = ({ event, className, helpClassName, alternateHelp }: Props) => {
  const { t, i18n } = useTranslation('event')
  const [origin, setOrigin] = useState('')
  useEffect(() => setOrigin(window.location.origin), [])

  if (!origin) return null
  const url = new URL(`/${encodeURIComponent(event.id)}`, origin).href
  const subject = encodeURIComponent(t('nav.email_subject', { event_name: event.name }))
  const body = encodeURIComponent(`${t('nav.email_body')} ${url}`)
  return <>
    <Copyable className={className}>{url}</Copyable>
    <p className={helpClassName ?? className}>
      <Trans i18nKey={alternateHelp ? 'nav.shareinfo_alt' : 'nav.shareinfo'} t={t} i18n={i18n}>
        _<a href={`mailto:?subject=${subject}&body=${body}`}>_</a>_
      </Trans>
    </p>
  </>
}

export default EventShare
