import { defaultOrigin, extension, normalizeOrigin, settings } from './origin.js'

const create = document.querySelector('#create')
const saveTab = document.querySelector('#save-tab')
const polls = document.querySelector('#polls')
const empty = document.querySelector('#empty')
const row = document.querySelector('#poll-row')
const form = document.querySelector('form')
const linkInput = document.querySelector('#poll-link')
const titleInput = document.querySelector('#poll-title')
const copyInput = document.querySelector('#copy-link')
const status = document.querySelector('#status')
const pollKeyPrefix = 'savedPoll:'

function pollLink(input, origin) {
  try {
    const url = new URL(input)
    if (url.origin === origin && !url.username && !url.password &&
        /^\/[a-z\d-]+-\d{6}\/?$/i.test(url.pathname)) {
      return new URL(url.pathname.replace(/\/$/, ''), origin)
    }
  } catch {
    // An incomplete or invalid URL is not a poll link.
  }
  return null
}

function setStatus(message) {
  copyInput.hidden = true
  status.textContent = message
}

function renderPolls(items) {
  const savedPolls = Object.entries(items)
    .filter(([key, poll]) => key.startsWith(pollKeyPrefix) && poll?.url && poll?.title)
    .sort(([, a], [, b]) => a.title.localeCompare(b.title))

  const restoreFocus = polls.contains(document.activeElement)
  polls.replaceChildren()
  empty.hidden = savedPolls.length > 0
  for (const [key, poll] of savedPolls) {
    const item = row.content.cloneNode(true)
    const title = item.querySelector('.poll-title')
    title.href = poll.url
    title.textContent = poll.title

    const copy = item.querySelector('.copy')
    copy.setAttribute('aria-label', 'Copy link for ' + poll.title)
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(poll.url)
        setStatus('Link copied.')
      } catch {
        setStatus('Copy the selected link.')
        copyInput.value = poll.url
        copyInput.hidden = false
        copyInput.focus()
        copyInput.select()
      }
    })

    const remove = item.querySelector('.remove')
    remove.setAttribute('aria-label', 'Remove ' + poll.title)
    remove.addEventListener('click', async () => {
      try {
        await settings.remove(key)
        setStatus('Poll removed.')
      } catch {
        setStatus('Could not remove the saved poll.')
      }
    })
    polls.append(item)
  }
  if (restoreFocus) (polls.querySelector('.poll-title') ?? form.closest('details').querySelector('summary')).focus()
}

async function savePoll(url, title) {
  const key = pollKeyPrefix + url.href
  const name = title.trim().slice(0, 255) || url.pathname.slice(1)
  try {
    await settings.set({ [key]: { url: url.href, title: name } })
    setStatus('Poll saved.')
    return true
  } catch {
    setStatus('Could not save the poll.')
    return false
  }
}

function applyOrigin(savedOrigin) {
  try {
    return normalizeOrigin(savedOrigin ?? defaultOrigin)
  } catch {
    return defaultOrigin
  }
}

let origin = defaultOrigin
try {
  const stored = await settings.get(null)
  origin = applyOrigin(stored.origin)
  renderPolls(stored)
} catch {
  setStatus('Could not read the saved settings and polls.')
}
create.href = new URL('/create', origin).href

extension.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !Object.keys(changes).some(key => key.startsWith(pollKeyPrefix))) return
  try {
    renderPolls(await settings.get(null))
  } catch {
    setStatus('Could not read the saved polls.')
  }
})

// activeTab only supplies the tab's URL and title when the toolbar button is used.
extension.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  const currentPoll = tab?.url && pollLink(tab.url, origin)
  if (!currentPoll) return
  saveTab.hidden = false
  saveTab.addEventListener('click', () => savePoll(currentPoll, tab.title?.replace(/ [-|] Crab Fit$/, '') ?? ''))
}).catch(() => {
  // Pasting a link is available whenever the active tab cannot be read.
})

form.addEventListener('submit', async event => {
  event.preventDefault()
  const url = pollLink(linkInput.value, origin)
  if (!url) {
    setStatus('Enter a poll link from ' + new URL(origin).host + '.')
    linkInput.focus()
    return
  }
  if (await savePoll(url, titleInput.value)) form.reset()
})
