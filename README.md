# Crab Fit <img width="100" align="right" src="frontend/src/res/logo.svg" alt="avatar">

[![Frontend Checks](https://github.com/GRA0007/crab.fit/actions/workflows/check_frontend.yml/badge.svg)](https://github.com/GRA0007/crab.fit/actions/workflows/check_frontend.yml)
[![API Checks](https://github.com/GRA0007/crab.fit/actions/workflows/check_api.yml/badge.svg)](https://github.com/GRA0007/crab.fit/actions/workflows/check_api.yml)

[Open Crab Fit](https://crab.fit/) to align your schedules and find a time that works for everyone.
Open-source and licensed under the [GNU GPLv3](./LICENSE).

### ⭐️ Bugs or feature requests

If you find any bugs or have a feature request, please [create an issue](https://github.com/GRA0007/crab.fit/issues/new/choose).

### 🌐 Translations

https://explore.transifex.com/crab-fit/crab-fit/

If you speak a language other than English and you want to help translate Crab Fit, visit Transifex using the link above and click "Join this project".

For more information on how to translate, visit the [translating wiki page](https://github.com/GRA0007/crab.fit/wiki/Translating).

---

### Self-hosting

Crab Fit is fully open-source, and you can get your own version running by following the [self-hosting guide](https://github.com/GRA0007/crab.fit/wiki/Self%E2%80%90hosting).

### Browser extension

The toolbar popup keeps a local list of saved poll links. You can save a poll
from the active tab or paste its link, then open, copy, or remove it from the
list. Create a poll opens the Crab Fit form in a browser tab.

It uses `https://crab.fit` by default. To use your own instance, open
**Settings** and save its frontend origin, such as `https://meet.example.org`.

- Chrome and Chromium accept the folder through **Load unpacked** on
  `chrome://extensions` with Developer mode enabled.
- Firefox accepts its `manifest.json` through **Load Temporary Add-on**
  under **This Firefox** on `about:debugging`. Firefox keeps the temporary
  installation until it restarts.

### Android companion

The [Android companion](./android/README.md) saves and shares poll links, supports
self-hosted instances, and opens the full Crab Fit app in the default browser.

### Contributing

Visit the [contributing guide](./CONTRIBUTING.md) for info on running locally and submitting pull requests.
