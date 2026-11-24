import { useId, useState } from 'react'

import Button from '/src/components/Button/Button'
import SelectField from '/src/components/SelectField/SelectField'
import TextField from '/src/components/TextField/TextField'
import { useTranslation } from '/src/i18n/client'
import timezones from '/src/res/timezones.json'

import styles from './TimeZoneOverlap.module.scss'

export interface OverlapSettings {
  zones: string[]
  from: string
  to: string
}

interface Props {
  timezone: string
  settings: OverlapSettings
  onChange: (settings: OverlapSettings) => void
  count?: number
  invalid: boolean
}

const TimeZoneOverlap = ({ timezone, settings, onChange, count, invalid }: Props) => {
  const { t } = useTranslation('event')
  const id = useId()
  const [zone, setZone] = useState('')
  const options = timezones.filter(candidate => candidate !== timezone && !settings.zones.includes(candidate))
  const zoneToAdd = options.includes(zone) ? zone : ''

  return <details className={styles.panel}>
    <summary>{t('overlap.title')}</summary>
    <p>{t('overlap.instructions', { zone: timezone })}</p>
    <div className={styles.fields}>
      <SelectField
        name={`${id}-zone`}
        label={t('overlap.additional')}
        defaultOption={t('overlap.choose')}
        options={options}
        value={zoneToAdd}
        onChange={event => setZone(event.currentTarget.value)}
        isInline
        isSmall
      />
      <Button isSmall disabled={!zoneToAdd} onClick={() => {
        onChange({ ...settings, zones: [...settings.zones, zoneToAdd] })
        setZone('')
      }}>{t('overlap.add')}</Button>
    </div>
    {settings.zones.length > 0 && <>
      <ul className={styles.zones}>
        {settings.zones.map(candidate => <li key={candidate}>
          <span>{candidate}</span>
          <Button
            isSmall
            isSecondary
            aria-label={t('overlap.remove_zone', { zone: candidate })}
            onClick={() => onChange({ ...settings, zones: settings.zones.filter(item => item !== candidate) })}
          >{t('overlap.remove')}</Button>
        </li>)}
      </ul>
      <div className={styles.fields}>
        <TextField
          type="time"
          name={`${id}-from`}
          label={t('overlap.from')}
          isInline
          value={settings.from}
          onChange={event => onChange({ ...settings, from: event.currentTarget.value })}
        />
        <TextField
          type="time"
          name={`${id}-to`}
          label={t('overlap.to')}
          isInline
          value={settings.to}
          onChange={event => onChange({ ...settings, to: event.currentTarget.value })}
        />
      </div>
      <p role="status">{invalid ? t('overlap.invalid') : count === undefined
        ? t('overlap.calculating')
        : t('overlap.result', { count })}</p>
    </>}
  </details>
}

export default TimeZoneOverlap
