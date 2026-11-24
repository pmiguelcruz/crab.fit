import { defaultOrigin, normalizeOrigin, settings } from './origin.js'

const form = document.querySelector('form')
const field = document.querySelector('#origin')
const status = document.querySelector('#status')
const submit = document.querySelector('button[type=submit]')

try {
  const saved = await settings.get('origin')
  field.value = saved.origin ?? defaultOrigin
} catch {
  status.textContent = 'Could not read the saved settings.'
}

form.addEventListener('submit', async event => {
  event.preventDefault()
  submit.disabled = true
  status.textContent = ''
  try {
    const origin = field.value.trim() ? normalizeOrigin(field.value) : defaultOrigin
    await settings.set({ origin })
    field.value = origin
    status.textContent = 'Settings saved.'
  } catch (error) {
    status.textContent = error.message || 'Could not save the settings.'
  } finally {
    submit.disabled = false
  }
})
