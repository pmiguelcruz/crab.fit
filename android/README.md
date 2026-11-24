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

The [F-Droid recipe](./fdroid/io.github.pmiguelcruz.crabfit.yml) pins the
source revision for Android release `android-v1.0`. The repository's
[Fastlane metadata](../fastlane/metadata/android/en-US) supplies the English
listing text, icon, and screenshots. For a new Android release, update
`versionName` and increment `versionCode` in `app/build.gradle`, add the
matching Fastlane changelog, and tag the release commit as
`android-v<versionName>` so F-Droid can find it.

Copy the recipe into the `metadata` directory of a local fdroiddata checkout
to run F-Droid's checks.

```shell
fdroid lint -f io.github.pmiguelcruz.crabfit
fdroid build --test --stop --scan-binary io.github.pmiguelcruz.crabfit:1
```

F-Droid inclusion requires submission and review.
[Submission guide](https://f-droid.org/docs/Submitting_to_F-Droid_Quick_Start_Guide/)
