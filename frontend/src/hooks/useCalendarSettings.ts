import { languageDetails, languages } from '/src/i18n/options'
import { useStore } from '/src/stores'
import useSettingsStore from '/src/stores/settingsStore'

export const useCalendarSettings = (locale: string) => {
  const language = languages.find(language => language === locale)
    ?? languages.find(language => language === locale?.split('-')[0])
    ?? 'en'
  const defaults = languageDetails[language]
  return {
    weekStart: useStore(useSettingsStore, state => state.weekStart) ?? defaults.weekStart,
    timeFormat: useStore(useSettingsStore, state => state.timeFormat) ?? defaults.timeFormat,
  }
}
