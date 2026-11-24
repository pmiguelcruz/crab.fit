import { type FormEvent, useState } from 'react'

import Button from '/src/components/Button/Button'
import Error from '/src/components/Error/Error'
import SelectField from '/src/components/SelectField/SelectField'
import { type EventResponse, setFinalChoice } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'
import { expandTimes } from '/src/utils'
import { formatPollChoice } from '/src/utils/formatPollChoice'

import styles from './admin.module.scss'

interface Props {
  event: EventResponse
  token: string
  onSaved: (event: EventResponse) => void
  onCancel: () => void
  onExpired: () => void
}

const FinalChoiceEditor = ({ event, token, onSaved, onCancel, onExpired }: Props) => {
  const { t, i18n } = useTranslation('admin')
  const [choice, setChoice] = useState(event.final_choice ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const choices = event.slot_size ? event.times : expandTimes(event.times)

  const save = async (form: FormEvent<HTMLFormElement>) => {
    form.preventDefault()
    setSaving(true)
    setError('')
    try {
      onSaved(await setFinalChoice(event.id, choice || null, token))
    } catch (e) {
      if (e instanceof Response && e.status === 401) onExpired()
      else setError(t('final_choice_error'))
    } finally {
      setSaving(false)
    }
  }

  return <form onSubmit={save}>
    <fieldset className={styles.editor} disabled={saving}>
      <legend>{t('final_choice')}</legend>
      <p>{t('final_choice_help')}</p>
      <SelectField
        label={t('final_choice_label')}
        name={`final-choice-${event.id}`}
        value={choice}
        defaultOption={t('final_choice_none')}
        options={Object.fromEntries(choices.map(time => [time, formatPollChoice(event, time, i18n.language)]))}
        onChange={e => setChoice(e.currentTarget.value)}
      />
      <Error onClose={() => setError('')}>{error}</Error>
      <div className={styles.actions}>
        <Button type="submit" isSmall isLoading={saving}>{t('save')}</Button>
        <Button isSmall isSecondary onClick={onCancel}>{t('cancel')}</Button>
      </div>
    </fieldset>
  </form>
}

export default FinalChoiceEditor
