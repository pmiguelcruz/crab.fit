// TODO: Potentially write a simple rust crate that generates these from the OpenAPI spec

import { z } from 'zod'

if (process.env.NEXT_PUBLIC_API_URL === undefined) {
  throw new Error('Expected API url environment variable')
}

const API_BASE = new URL(process.env.NEXT_PUBLIC_API_URL)

export const EventInput = z.object({
  name: z.string().optional(),
  times: z.string().array(),
  timezone: z.string(),
})
export type EventInput = z.infer<typeof EventInput>

export const EventResponse = z.object({
  id: z.string(),
  name: z.string(),
  times: z.string().array(),
  timezone: z.string(),
  created_at: z.number(),
})
export type EventResponse = z.infer<typeof EventResponse>

export const PersonInput = z.object({
  availability: z.string().array(),
})
export type PersonInput = z.infer<typeof PersonInput>

export const PersonResponse = z.object({
  name: z.string(),
  availability: z.string().array(),
  created_at: z.number(),
})
export type PersonResponse = z.infer<typeof PersonResponse>

export const StatsResponse = z.object({
  event_count: z.number(),
  person_count: z.number(),
  version: z.string(),
})
export type StatsResponse = z.infer<typeof StatsResponse>

const get = async <S extends z.Schema>(url: string, schema: S, auth?: string, nextOptions?: NextFetchRequestConfig): Promise<ReturnType<S['parse']>> => {
  const res = await fetch(new URL(url, API_BASE), {
    headers: {
      ...auth && { Authorization: `Bearer ${auth}` },
    },
    cache: nextOptions ? undefined : 'no-store',
    next: nextOptions,
  })
  if (!res.ok) throw res
  return schema.parse(await res.json())
}

const post = async <S extends z.Schema>(url: string, schema: S, input: unknown, auth?: string, method = 'POST'): Promise<ReturnType<S['parse']>> => {
  const res = await fetch(new URL(url, API_BASE), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...auth && { Authorization: `Bearer ${auth}` },
    },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw res
  return schema.parse(await res.json())
}

const PersonLogin = PersonResponse.extend({ token: z.string() })
export type PersonLogin = z.infer<typeof PersonLogin>

const Submission = PersonResponse.extend({ submitted_at: z.number() })
export type Submission = z.infer<typeof Submission>

type EventEdit = { name: string; times?: string[] }

const remove = async (url: string, token: string) => {
  const res = await fetch(new URL(url, API_BASE), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw res
}

const eventPath = (id: string) => `/event/${encodeURIComponent(id)}`
const personPath = (id: string, name: string) => `${eventPath(id)}/people/${encodeURIComponent(name)}`
const encodePassword = (password: string) => btoa(String.fromCharCode(...new TextEncoder().encode(password)))

export const signInAdmin = (pin: string) => post('/admin/session', z.object({ token: z.string() }), { pin })
export const signOutAdmin = (token: string) => remove('/admin/session', token)
export const listEvents = (token: string) => get('/admin/events', EventResponse.array(), token)
export const editEvent = (id: string, input: EventEdit, token: string) =>
  post(`/admin/events/${encodeURIComponent(id)}`, EventResponse, input, token, 'PATCH')
const adminPeoplePath = (id: string) => `/admin/events/${encodeURIComponent(id)}/people`
export const listParticipants = (id: string, token: string) => get(adminPeoplePath(id), z.string().array(), token)
export const removeParticipant = (id: string, name: string, token: string) =>
  remove(`${adminPeoplePath(id)}/${encodeURIComponent(name)}`, token)
export const removeOwnResponse = (id: string, name: string, token: string) => remove(personPath(id, name), token)
export const deleteEvent = (id: string, token: string) => remove(`/admin/events/${encodeURIComponent(id)}`, token)

// Get
export const getStats = () => get('/stats', StatsResponse, undefined, { revalidate: 60 })
export const getEvent = (eventId: string) => get(eventPath(eventId), EventResponse)
export const getPeople = (eventId: string) => get(`${eventPath(eventId)}/people`, PersonResponse.array())
export const getPerson = (eventId: string, personName: string, password?: string) => get(personPath(eventId, personName), PersonLogin, password && encodePassword(password))

// Post
export const createEvent = (input: EventInput) => post('/event', EventResponse, EventInput.parse(input))
export const updatePerson = (eventId: string, personName: string, input: PersonInput, token: string) => post(personPath(eventId, personName), Submission, PersonInput.parse(input), token, 'PATCH')
