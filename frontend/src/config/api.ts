// TODO: Potentially write a simple rust crate that generates these from the OpenAPI spec

import { z } from 'zod'

import { slotSizes } from '/src/utils/slotSize'

if (process.env.NEXT_PUBLIC_API_URL === undefined) {
  throw new Error('Expected API url environment variable')
}

const API_BASE = new URL(process.env.NEXT_PUBLIC_API_URL)

const GroupEdit = z.object({ name: z.string(), id: z.string().optional() })
export type GroupEdit = z.infer<typeof GroupEdit>
const EventGroup = GroupEdit.required()
export type EventGroup = z.infer<typeof EventGroup>

export const EventInput = z.object({
  name: z.string().optional(),
  times: z.string().array(),
  timezone: z.string(),
  slot_size: z.enum(slotSizes).optional(),
  groups: GroupEdit.array().optional(),
})
export type EventInput = z.infer<typeof EventInput>

export const EventResponse = z.object({
  id: z.string(),
  name: z.string(),
  times: z.string().array(),
  timezone: z.string(),
  slot_size: z.enum(slotSizes).optional(),
  created_at: z.number(),
  groups: EventGroup.array().optional(),
  notifications_available: z.boolean().optional(),
  shared_availability_available: z.boolean().optional(),
  final_choice: z.string().optional(),
})
export type EventResponse = z.infer<typeof EventResponse>

const ProfileAction = z.object({
  action: z.enum(['create', 'link', 'unlink']),
  key: z.string(),
})
export type ProfileAction = z.infer<typeof ProfileAction>

export const PersonInput = z.object({
  availability: z.string().array(),
  tentative: z.string().array().optional(),
  group_id: z.string().nullable().optional(),
  shared_email: z.string().nullable().optional(),
  profile: ProfileAction.optional(),
})
export type PersonInput = z.infer<typeof PersonInput>

export const PersonResponse = z.object({
  name: z.string(),
  availability: z.string().array(),
  tentative: z.string().array().optional(),
  group_id: z.string().optional(),
  created_at: z.number(),
})
export type PersonResponse = z.infer<typeof PersonResponse>

const apiReadTimeout = 15000

const get = async <S extends z.Schema>(url: string, schema: S, auth?: string): Promise<ReturnType<S['parse']>> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), apiReadTimeout)
  try {
    const res = await fetch(new URL(url, API_BASE), {
      headers: {
        ...auth && { Authorization: `Bearer ${auth}` },
      },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) throw res
    return schema.parse(await res.json())
  } finally {
    clearTimeout(timeout)
  }
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

const PersonLogin = PersonResponse.extend({
  token: z.string(),
  shared_email: z.string().optional(),
  profile_linked: z.boolean().optional(),
})
export type PersonLogin = z.infer<typeof PersonLogin>

const Submission = PersonResponse.extend({ submitted_at: z.number() })
export type Submission = z.infer<typeof Submission>

type EventEdit = { name: string; times?: string[]; groups?: GroupEdit[] }

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
export const setFinalChoice = (id: string, choice: string | null, token: string) =>
  post(`/admin/events/${encodeURIComponent(id)}/final-choice`, EventResponse, { choice }, token)
const adminPeoplePath = (id: string) => `/admin/events/${encodeURIComponent(id)}/people`
export const listParticipants = (id: string, token: string) => get(adminPeoplePath(id), z.string().array(), token)
export const removeParticipant = (id: string, name: string, token: string) =>
  remove(`${adminPeoplePath(id)}/${encodeURIComponent(name)}`, token)
export const removeOwnResponse = (id: string, name: string, token: string) => remove(personPath(id, name), token)
export const deleteEvent = (id: string, token: string) => remove(`/admin/events/${encodeURIComponent(id)}`, token)

// Get
export const getEvent = (eventId: string) => get(eventPath(eventId), EventResponse)
export const getPeople = (eventId: string, token: string) => get(`${eventPath(eventId)}/people`, PersonResponse.array(), token)
export const getSharedEmails = (eventId: string, token: string) => get(`${eventPath(eventId)}/emails`, z.string().array(), token)
export type NotificationMode = 'change' | 'responses' | 'quorum'
type NotificationEnrollment = { mode: NotificationMode; email: string; count?: number }

export const postVoteNotifications = async (
  eventId: string,
  request: NotificationEnrollment | { action: 'confirm' | 'unsubscribe'; token: string },
  token?: string,
) => {
  const suffix = 'action' in request ? `/${request.action}` : ''
  const response = await fetch(new URL(`${eventPath(eventId)}/notifications${suffix}`, API_BASE), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw response
}
export const getPerson = (eventId: string, personName: string, password: string) => get(personPath(eventId, personName), PersonLogin, encodePassword(password))
export const previewProfile = (eventId: string, personName: string, key: string, token: string) =>
  post(`${personPath(eventId, personName)}/profile`, z.object({
    availability: z.string().array(),
    tentative: z.string().array(),
  }), { key }, token)

// Post
export const createEvent = (input: EventInput, token: string) => post('/admin/events', EventResponse, EventInput.parse(input), token)
export const updatePerson = (eventId: string, personName: string, input: PersonInput, token: string) => post(personPath(eventId, personName), Submission, PersonInput.parse(input), token, 'PATCH')
