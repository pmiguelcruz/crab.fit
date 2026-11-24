# Crab Fit Companion for Android

Tap the website address to configure a self-hosted Crab Fit frontend. Paste a
poll link or share it to Crab Fit Companion from another app to save it. Open
saved polls and create new ones in your default browser. The address and saved
links stay on the device. The companion has no runtime library dependencies,
network permission, or analytics.

This fork builds package `io.github.pmiguelcruz.crabfit` for Android 7.0 and
later. Android installs it separately from the original `fit.crab` package.

## Build

Use JDK 17 and an Android SDK with Platform 36 and Build Tools 35.0.0. Set
`ANDROID_HOME` to that SDK or create a local `local.properties` file with
`sdk.dir`. From this directory, run the checked-in Gradle wrapper.

```shell
./gradlew assembleDebug assembleRelease lintDebug
```

The debug APK is at `app/build/outputs/apk/debug/app-debug.apk`. The release
APK at `app/build/outputs/apk/release/app-release-unsigned.apk` is unsigned.

## F-Droid packaging

The project includes English Fastlane listing text in `fastlane/metadata`. An
F-Droid build recipe can use `subdir: android`, `gradle: yes` and a published
git revision for the version in `app/build.gradle`. The repository uses
GPL-3.0. F-Droid inclusion requires its separate submission and review.
[Inclusion policy](https://f-droid.org/docs/Inclusion_Policy/)
[Build metadata reference](https://f-droid.org/docs/Build_Metadata_Reference/)
