'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import Button from '/src/components/Button/Button'
import Content from '/src/components/Content/Content'
import CreateForm from '/src/components/CreateForm/CreateForm'
import Error from '/src/components/Error/Error'
import Section from '/src/components/Section/Section'
import { deleteEvent, EventResponse, listEvents, signOutAdmin } from '/src/config/api'
import { useTranslation } from '/src/i18n/client'

import styles from './admin.module.scss'
import EventEditor from './EventEditor'

const EventManager = () => {
  const { t, i18n } = useTranslation('admin')
  const [token, setToken] = useState<string | null>()
  const [events, setEvents] = useState<EventResponse[]>()
  const [creating, setCreating] = useState(false)
  const [editId, setEditId] = useState('')
  const [deleteId, setDeleteId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const clearSession = () => {
    sessionStorage.removeItem('crab-fit-admin')
    setToken(null)
    setEvents(undefined)
  }

  useEffect(() => {
    const stored = sessionStorage.getItem('crab-fit-admin')
    setToken(stored)
    if (!stored) return

    let active = true
    listEvents(stored).then(events => {
      if (active) setEvents(events)
    }).catch(e => {
      if (!active) return
      if (e instanceof Response && e.status === 401) clearSession()
      else setError(t('list_error'))
    })
    return () => { active = false }
  }, [t])

  if (token === null) return <Content>
    <h1>{t('heading')}</h1>
    <p>{t('locked')}</p>
    <Button href="/#admin-sign-in">{t('open_about')}</Button>
  </Content>

  const remove = async (event: EventResponse) => {
    if (!token) return
    setBusy(true)
    setError('')
    try {
      await deleteEvent(event.id, token)
      setEvents(events => events?.filter(row => row.id !== event.id))
      setDeleteId('')
      setMessage(t('deleted', { name: event.name }))
    } catch (e) {
      if (e instanceof Response && e.status === 401) clearSession()
      else if (e instanceof Response && e.status === 404) {
        setEvents(events => events?.filter(row => row.id !== event.id))
        setDeleteId('')
        setMessage(t('deleted', { name: event.name }))
      } else setError(t('delete_error'))
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (!token) return
    setBusy(true)
    try {
      await signOutAdmin(token)
      clearSession()
    } catch (e) {
      if (e instanceof Response && e.status === 401) clearSession()
      else setError(t('sign_out_error'))
    } finally {
      setBusy(false)
    }
  }

  return <>
    <Section>
      <Content>
        <div className={styles.heading}>
          <h1>{t('heading')}</h1>
          {token && <Button isSmall isSecondary disabled={busy} onClick={logout}>{t('sign_out')}</Button>}
        </div>
        {events && <Button onClick={() => setCreating(value => !value)}>
          {t(creating ? 'cancel' : 'create')}
        </Button>}
        {creating && <CreateForm noRedirect onCreated={event => {
          setEvents(events => [event, ...(events ?? [])])
          setCreating(false)
          setMessage(t('created', { name: event.name }))
        }} />}
      </Content>
    </Section>
    <Content>
      <p role="status">{message}</p>
      <Error onClose={() => setError('')}>{error}</Error>
      {!events && !error && <p>{t('loading')}</p>}
      {events?.length === 0 && <p>{t('empty')}</p>}
      {events?.map(event => {
        const path = `/${encodeURIComponent(event.id)}`
        return <article key={event.id} className={styles.event}>
          <div className={styles.heading}>
            <div>
              <h2><Link href={path} prefetch={false}>{event.name}</Link></h2>
              <time dateTime={new Date(event.created_at * 1000).toISOString()}>
                {new Date(event.created_at * 1000).toLocaleDateString(i18n.language)}
              </time>
            </div>
            <div className={styles.actions}>
              <Button isSmall isSecondary onClick={async () => {
                setError('')
                try {
                  await navigator.clipboard.writeText(new URL(path, location.origin).href)
                  setMessage(t('copied', { name: event.name }))
                } catch {
                  setError(t('copy_error'))
                }
              }}>{t('copy')}</Button>
              <Button isSmall isSecondary disabled={busy || editId === event.id} onClick={() => {
                setDeleteId('')
                setEditId(event.id)
              }}>{t('edit')}</Button>
              <Button isSmall isSecondary disabled={busy || deleteId === event.id} onClick={() => {
                setEditId('')
                setDeleteId(event.id)
              }}>{t('delete')}</Button>
            </div>
          </div>
          {token && editId === event.id && <EventEditor
            event={event}
            token={token}
            onExpired={clearSession}
            onCancel={() => setEditId('')}
            onSaved={updated => {
              setEvents(events => events?.map(row => row.id === updated.id ? updated : row))
              setEditId('')
              setMessage(t('saved', { name: updated.name }))
            }}
          />}
          {deleteId === event.id && <div className={styles.confirm}>
            <p>{t('delete_confirm', { name: event.name })}</p>
            <div className={styles.actions}>
              <Button isSmall isLoading={busy} disabled={busy} onClick={() => remove(event)}>{t('delete_permanently')}</Button>
              <Button isSmall isSecondary disabled={busy} onClick={() => setDeleteId('')}>{t('cancel')}</Button>
            </div>
          </div>}
        </article>
      })}
    </Content>
  </>
}

export default EventManager
