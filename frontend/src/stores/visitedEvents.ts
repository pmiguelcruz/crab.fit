const cookieName = 'crab-fit-visited'
const eventId = /^[A-Za-z0-9_-]{1,255}$/

export const readVisitedEvents = () => {
  const prefix = `${cookieName}=`
  const cookie = document.cookie.split('; ').find(item => item.startsWith(prefix))
  return cookie?.slice(prefix.length).split('.').filter(id => eventId.test(id))
}

export const saveVisitedEvents = (ids: string[]) => {
  const history = [...new Set(ids.filter(id => eventId.test(id)))]
  while (history.join('.').length > 3700) history.pop()
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${cookieName}=${history.join('.')}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`
  return history
}

export const forgetVisitedEvents = (ids: string[]) => {
  const current = readVisitedEvents()
  if (current) saveVisitedEvents(current.filter(id => !ids.includes(id)))
}
