fastlane documentation
----

# Installation

Make sure you have the latest version of the Xcode command line tools installed:

```sh
xcode-select --install
```

For _fastlane_ installation instructions, see [Installing _fastlane_](https://docs.fastlane.tools/#installing-fastlane)

# Available Actions

## iOS

### ios doctor

```sh
[bundle exec] fastlane ios doctor
```

Validate local Xcode/Fastlane/version/signing prerequisites without contacting Apple

### ios sync_versions

```sh
[bundle exec] fastlane ios sync_versions
```

Synchronize Expo app.json version/build number into Xcode

### ios next_build

```sh
[bundle exec] fastlane ios next_build
```

Synchronize the next available TestFlight build locally; safe to run repeatedly (no upload)

### ios testflight_status

```sh
[bundle exec] fastlane ios testflight_status
```

Show local, remote, and planned TestFlight versions without changing files

### ios review_ready

```sh
[bundle exec] fastlane ios review_ready
```

Validate missing TestFlight/App Review values without uploading or submitting

### ios archive_testflight

```sh
[bundle exec] fastlane ios archive_testflight
```

Create a staging/TestFlight IPA locally; does not upload

### ios testflight_upload

```sh
[bundle exec] fastlane ios testflight_upload
```

Build and upload to TestFlight without external distribution or Beta Review (guarded)

### ios testflight_upload_archive

```sh
[bundle exec] fastlane ios testflight_upload_archive
```

Export and upload an existing TestFlight archive without changing its build number (guarded)

### ios testflight_qa

```sh
[bundle exec] fastlane ios testflight_qa
```

Build and distribute to the external TestFlight group Shoply Beta (guarded)

### ios archive_production

```sh
[bundle exec] fastlane ios archive_production
```

Create a production/App Store IPA locally; does not upload

### ios app_store_upload

```sh
[bundle exec] fastlane ios app_store_upload
```

Build and upload an App Store release candidate; does not submit review (guarded)

### ios submit_review

```sh
[bundle exec] fastlane ios submit_review
```

Submit an already uploaded build for App Review without automatic release (guarded)

----

This README.md is auto-generated and will be re-generated every time [_fastlane_](https://fastlane.tools) is run.

More information about _fastlane_ can be found on [fastlane.tools](https://fastlane.tools).

The documentation of _fastlane_ can be found on [docs.fastlane.tools](https://docs.fastlane.tools).
