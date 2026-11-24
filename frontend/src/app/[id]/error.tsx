'use client'

import Button from '/src/components/Button/Button'
import Content from '/src/components/Content/Content'
import { useTranslation } from '/src/i18n/client'

const EventError = () => {
  const { t } = useTranslation('event')
  return <Content>
    <h1>{t('error.unavailable_title')}</h1>
    <p>{t('error.unavailable_body')}</p>
    <Button onClick={() => window.location.reload()}>{t('error.retry')}</Button>
  </Content>
}

export default EventError
