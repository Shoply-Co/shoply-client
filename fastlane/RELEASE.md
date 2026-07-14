# Shoply iOS Fastlane release

이 설정은 Expo/EAS 빌드 대신 `apps/mobile/ios/Shoply.xcworkspace`를 Xcode로 archive하고 Fastlane으로 App Store Connect를 제어합니다. 로컬 archive lane은 업로드하지 않으며, TestFlight/App Store/App Review lane은 각각 별도의 `CONFIRM_*=YES` 안전장치가 있습니다.

## 고정된 프로젝트 값

- Bundle ID: `com.shply.app`
- Apple Developer Team ID: `XSGLM3JWK9`
- App Store Connect App ID: `6754759017`
- API Key ID: `HP4FPUF9XJ`
- Issuer ID: `e7b8e10d-4fe3-4265-9580-59b786c3cbaf`
- 외부 TestFlight 그룹: `Shoply Beta`
- Xcode workspace / scheme: `apps/mobile/ios/Shoply.xcworkspace` / `Shoply`

`.p8` 원문은 저장소에 넣지 않습니다. 기본 로컬 경로는 `~/Downloads/AuthKey_HP4FPUF9XJ.p8`이며 `ASC_KEY_PATH`로 변경할 수 있습니다.

## 최초 1회 로컬 준비

```bash
chmod 600 ~/Downloads/AuthKey_HP4FPUF9XJ.p8
cp fastlane/.env.example fastlane/.env
pnpm ios:release:install
pnpm ios:release:doctor
```

`fastlane/.env`에는 Beta Review와 App Review 담당자/데모 계정 값을 채웁니다. 이 파일과 모든 `.p8`, `.p12`, provisioning profile은 Git에서 제외됩니다.

## 버전과 빌드 번호

단일 기준은 `apps/mobile/app.json`입니다.

- `expo.version` → Xcode `MARKETING_VERSION` → `CFBundleShortVersionString`
- `expo.ios.buildNumber` → Xcode `CURRENT_PROJECT_VERSION` → `CFBundleVersion`
- 문자열형 `expo.runtimeVersion`과 네이티브 `EXUpdatesRuntimeVersion`은 `expo.version`과 함께 갱신
- `eas.json`도 `appVersionSource: local`로 맞춰 두었습니다.

Expo가 네이티브 plist에 버전 값을 직접 기록한 프로젝트와 Xcode 변수 참조를 유지한 프로젝트를 모두 지원합니다. Fastlane 동기화는 직접 기록된 값을 자동으로 갱신하고, doctor는 Expo·Xcode·Info.plist·Expo Updates runtime의 불일치를 차단합니다.

직접 동기화:

```bash
# 버전만 바꾸면 새 버전의 로컬 빌드 번호를 1로 초기화
APP_VERSION=0.3.0 pnpm ios:release:sync

# 버전과 빌드 번호를 모두 정확히 지정
APP_VERSION=0.2.1 BUILD_NUMBER=1 pnpm ios:release:sync
```

원격 TestFlight 값을 읽어 다음 번호를 로컬에 반영:

```bash
pnpm ios:release:next-build
```

로컬 Expo/Xcode 번호와 원격 TestFlight 최신 번호를 변경 없이 비교:

```bash
pnpm ios:release:testflight:status

# 새 버전의 실제 다음 계획도 파일 변경 없이 확인
APP_VERSION=0.3.0 pnpm ios:release:testflight:status
```

빌드 번호 선택 규칙은 다음과 같습니다.

- Expo에서 새 버전을 `0.3.0 (1)`로 설정했고 TestFlight에 `0.3.0`이 없으면 `(1)`을 그대로 사용합니다.
- 같은 버전의 TestFlight 최신 빌드가 `(1)`이면 다음 자동 빌드는 `(2)`입니다.
- Fastlane에서 `APP_VERSION=0.3.0`만 지정하면 이전 버전의 빌드 번호를 이어받지 않고 `(1)`부터 시작합니다.
- `BUILD_NUMBER`를 지정하면 실제 업로드할 번호로 취급합니다. 원격 최신 번호 이하이면 중복 업로드 전에 명확한 오류로 중단합니다.
- `BUILD_NUMBER`를 생략하면 `max(로컬 후보 번호, TestFlight 최신 번호 + 1)`을 사용합니다.
- 선택한 버전/빌드 번호는 항상 Expo `app.json`과 Xcode에 함께 기록합니다.
- `next-build`는 같은 원격 상태에서 여러 번 실행해도 번호가 계속 증가하지 않습니다.

따라서 `next-build`, TestFlight 업로드, App Store 업로드는 Expo에서 버전을 바꾸든 Fastlane의 `APP_VERSION`으로 바꾸든 같은 규칙을 사용합니다. `next-build` 자체는 App Store Connect에 쓰지 않습니다.

규칙 테스트:

```bash
pnpm ios:release:test-versioning
```

## 업로드 없이 준비/검증

```bash
pnpm ios:release:doctor
REVIEW_TARGET=testflight pnpm ios:release:review-ready
REVIEW_TARGET=app_store pnpm ios:release:review-ready
pnpm ios:release:archive:testflight
pnpm ios:release:archive:production
```

TestFlight archive에는 다음 값이 빌드 프로세스 환경변수로 강제 주입됩니다.

```text
EXPO_PUBLIC_APP_ENV=staging
EXPO_PUBLIC_RELEASE_PROFILE=testflight
EXPO_PUBLIC_API_BASE_URL=https://staging-api.shopplyapp.com/v1
EXPO_PUBLIC_OAUTH_REDIRECT_URI=shoply://auth/callback
```

Production archive는 `production`, `https://api.shopplyapp.com/v1`, `shoply://auth/callback`을 사용합니다. 이 프로세스 환경값이 로컬 `apps/mobile/.env.local`보다 우선합니다.

archive lane은 TestFlight/App Store에 바이너리를 올리지는 않지만 Xcode 자동 서명을 위해 Developer Portal에서 인증서나 provisioning profile을 생성/갱신할 수 있습니다.
또한 업로드 가능한 번호를 고르기 위해 같은 앱 버전의 TestFlight 최신 빌드 번호를 읽습니다.

네이티브 `ios` 프로젝트를 커밋하는 workflow이므로 Expo Doctor의 `appConfigFieldsNotSyncedCheck`는 공식 설정으로 껐습니다. 앞으로 아이콘, 권한, plugin 같은 native app config를 바꿀 때는 `app.json`만 수정하지 말고 iOS 네이티브 결과도 함께 갱신해야 합니다. 릴리스 버전과 빌드 번호는 Fastlane 동기화가 담당합니다.

## 실제 배포 명령

아래 명령은 외부 상태를 변경하므로 의도적으로 `YES`를 넣어야 합니다.

```bash
# 빌드 → 업로드 → Beta Review → 외부 그룹 Shoply Beta 배포
CONFIRM_TESTFLIGHT_UPLOAD=YES pnpm ios:release:testflight

# 빌드 → TestFlight 바이너리 업로드만 수행, 외부 배포/Beta Review는 하지 않음
CONFIRM_TESTFLIGHT_UPLOAD=YES pnpm ios:release:testflight:upload

# Fastlane에서 새 앱 버전을 시작: 원격 0.3.0이 없으면 0.3.0 (1)
APP_VERSION=0.3.0 CONFIRM_TESTFLIGHT_UPLOAD=YES pnpm ios:release:testflight:upload

# 빌드 번호를 정확히 지정: 원격 최신 번호보다 커야 함
APP_VERSION=0.3.0 BUILD_NUMBER=20 CONFIRM_TESTFLIGHT_UPLOAD=YES pnpm ios:release:testflight:upload

# 성공한 기존 Xcode archive를 번호 변경/재빌드 없이 다시 내보내 업로드
ARCHIVE_PATH='/absolute/path/Shoply.xcarchive' CONFIRM_TESTFLIGHT_UPLOAD=YES pnpm ios:release:testflight:upload-archive

# production 빌드 → App Store Connect 업로드, 심사 제출은 하지 않음
CONFIRM_APP_STORE_UPLOAD=YES pnpm ios:release:upload

# 이미 업로드되고 processing이 끝난 현재 버전을 심사 제출, 승인 후 자동 출시는 끔
CONFIRM_APP_REVIEW_SUBMIT=YES pnpm ios:release:submit

# 특정 업로드 빌드를 심사 제출할 때
APP_VERSION=0.2.0 BUILD_NUMBER=2 CONFIRM_APP_REVIEW_SUBMIT=YES pnpm ios:release:submit
```

## 아직 입력해야 하는 심사 값

`fastlane/.env.example`의 빈 값을 실제 값으로 채워야 합니다.

- TestFlight: 담당자 이름/이메일/전화, Beta 앱 설명, 피드백 이메일, Beta Review 메모, What to Test, 로그인 필요 시 데모 계정
- App Review: 담당자 이름/이메일/전화, 심사 메모, 로그인 필요 시 데모 계정
- API Key 권한: 외부 테스터 빌드 정보를 갱신하려면 App Store Connect의 `App Manager` 또는 `Admin` 역할이 필요합니다.

App Store 심사 제출 전에는 App Store Connect 화면에서 스크린샷, 설명/키워드/지원 URL/개인정보처리방침 URL, App Privacy, 연령 등급, 가격/배포 지역, 계약/세금/은행 상태도 완료되어 있어야 합니다. Fastlane submit lane은 기존 App Store Connect 메타데이터를 사용하고 review 정보와 빌드 선택만 자동화합니다.

## GitHub Actions

`.github/workflows/ios-release.yml`은 자동 실행되지 않고 `workflow_dispatch`로만 실행됩니다. GitHub의 `ios-release` Environment에 보호 규칙을 설정하고 다음 secret을 등록합니다.

`.p8`를 base64로 복사하는 macOS 예시:

```bash
base64 < ~/Downloads/AuthKey_HP4FPUF9XJ.p8 | pbcopy
```

필수 secret:

- `ASC_KEY_CONTENT_BASE64`
- TestFlight 실행 시 `TESTFLIGHT_BETA_*`, `TESTFLIGHT_WHATS_NEW`, 필요하면 `TESTFLIGHT_DEMO_*`
- 심사 실행 시 `APP_REVIEW_CONTACT_*`, `APP_REVIEW_NOTES`, 필요하면 `APP_REVIEW_DEMO_*`

Environment variable `TESTFLIGHT_DEMO_REQUIRED`, `APP_REVIEW_DEMO_REQUIRED`는 기본 `true`이며 로그인 없이 심사가 가능할 때만 `false`로 설정합니다.
