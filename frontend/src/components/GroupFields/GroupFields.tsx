import { useId } from 'react'

import Button from '/src/components/Button/Button'
import TextField from '/src/components/TextField/TextField'
import { type GroupEdit } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

import styles from './GroupFields.module.scss'

interface Props {
  value: GroupEdit[]
  onChange: (value: GroupEdit[]) => void
}

export const validGroupNames = (groups: GroupEdit[]) => {
  const names = groups.map(group => group.name.trim().toLowerCase())
  return names.every(Boolean) && new Set(names).size === names.length
}

const GroupFields = ({ value, onChange }: Props) => {
  const { t } = useTranslation('event')
  const prefix = useId()

  return <fieldset className={styles.fields}>
    <legend>{t('teams.optional')}</legend>
    {value.map((group, index) => <div className={styles.row} key={group.id ?? index}>
      <TextField
        name={`${prefix}-group-${index}`}
        label={t('teams.number', { number: index + 1 })}
        isInline
        value={group.name}
        maxLength={64}
        required
        onChange={e => {
          const name = e.currentTarget.value
          onChange(value.map((entry, other) => other === index ? { ...entry, name } : entry))
        }}
      />
      <Button
        isSmall isSecondary
        aria-label={t('teams.remove_number', { number: index + 1 })}
        onClick={() => onChange(value.filter((_, other) => other !== index))}
      >{t('teams.remove')}</Button>
    </div>)}
    <Button isSmall isSecondary disabled={value.length >= 20} onClick={() => onChange([...value, { name: '' }])}>
      {t('teams.add')}
    </Button>
  </fieldset>
}

export default GroupFields
