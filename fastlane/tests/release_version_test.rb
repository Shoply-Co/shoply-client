require_relative "../lib/shoply_release_version"

def assert_equal(expected, actual, name)
  return if expected == actual

  raise "#{name}: expected #{expected.inspect}, got #{actual.inspect}"
end

def assert_build_conflict(name)
  yield
  raise "#{name}: expected ShoplyReleaseVersion::BuildNumberConflict"
rescue ShoplyReleaseVersion::BuildNumberConflict
  nil
end

def requested(current_version:, current_build:, version: nil, build: nil)
  ShoplyReleaseVersion.requested_state(
    current_version: current_version,
    current_build_number: current_build,
    requested_version: version,
    requested_build_number: build
  )
end

def resolved(request, remote:)
  ShoplyReleaseVersion.resolve_build_number(
    version: request.fetch(:version),
    candidate_build_number: request.fetch(:build_number),
    latest_remote_build_number: remote,
    explicit_build_number: request.fetch(:explicit_build_number)
  )
end

cases = {
  "Expo new version starts at build 1" => [
    requested(current_version: "0.3.0", current_build: "1"),
    0,
    1
  ],
  "same version advances after upload" => [
    requested(current_version: "0.3.0", current_build: "1"),
    1,
    2
  ],
  "remote build ahead selects remote plus one" => [
    requested(current_version: "0.3.0", current_build: "1"),
    5,
    6
  ],
  "manually raised Expo build is used exactly" => [
    requested(current_version: "0.3.0", current_build: "7"),
    5,
    7
  ],
  "next-build is idempotent before upload" => [
    requested(current_version: "0.3.0", current_build: "6"),
    5,
    6
  ],
  "Fastlane version change resets build to 1" => [
    requested(current_version: "0.2.0", current_build: "15", version: "0.3.0"),
    0,
    1
  ],
  "Fastlane version change continues existing remote version" => [
    requested(current_version: "0.2.0", current_build: "15", version: "0.3.0"),
    3,
    4
  ],
  "explicit first build 1 is honored" => [
    requested(current_version: "0.2.0", current_build: "15", version: "0.3.0", build: "1"),
    0,
    1
  ],
  "explicit build gap is honored" => [
    requested(current_version: "0.3.0", current_build: "3", build: "20"),
    3,
    20
  ]
}

cases.each do |name, (request, remote, expected)|
  assert_equal(expected, resolved(request, remote: remote), name)
end

version_change = requested(current_version: "0.2.0", current_build: "15", version: "0.3.0")
assert_equal("1", version_change.fetch(:build_number), "version change baseline")
assert_equal(true, version_change.fetch(:version_changed), "version change flag")
assert_equal(false, version_change.fetch(:explicit_build_number), "automatic build flag")

explicit = requested(current_version: "0.2.0", current_build: "15", version: "0.3.0", build: "1")
assert_equal(true, explicit.fetch(:explicit_build_number), "explicit build flag")

assert_build_conflict("explicit duplicate build is rejected") do
  resolved(requested(current_version: "0.3.0", current_build: "1", build: "1"), remote: 1)
end

assert_build_conflict("explicit lower build is rejected") do
  resolved(requested(current_version: "0.3.0", current_build: "1", build: "2"), remote: 3)
end

puts "release version scenarios passed: #{cases.length + 6}"
