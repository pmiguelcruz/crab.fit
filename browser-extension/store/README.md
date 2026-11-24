# Chrome Web Store listing

## Description

Keep your Crab Fit scheduling polls within reach. Save the active poll from
the toolbar or paste a poll link. Open saved polls, copy a link to send to
the group, or remove a poll when you are done with it. Create new polls on
crab.fit or the Crab Fit website you configure in Settings.

The popup stores your poll titles and links in your browser profile.

## Package and assets

Run this command from `browser-extension` to package the extension at the
current Git revision.

```sh
git -C .. archive --format=zip --output="$PWD/crab-fit-1.4.zip" HEAD:browser-extension \
  manifest.json options.html options.js origin.js popup.css popup.html popup.js res
```

The archive includes the 128-pixel icon at `res/icon128.png`.
[Saved polls screenshot](./saved-polls.jpg)

## Permission disclosures

- The extension's single purpose is to save, open, and share Crab Fit poll
  links.
- `activeTab` reads a poll's address and title when the user opens the
  toolbar popup on their Crab Fit website.
- `storage` keeps the chosen website and saved polls in the browser profile.
- The popup runs packaged code. Creation and saved links open the configured
  website in a regular tab.

[Privacy policy](../PRIVACY.md) ·
[Chrome Web Store submission guide](https://developer.chrome.com/docs/webstore/publish/)
