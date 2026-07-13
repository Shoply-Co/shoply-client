module ShoplyReleaseVersion
  class BuildNumberConflict < StandardError
    attr_reader :version, :requested_build_number, :latest_remote_build_number

    def initialize(version:, requested_build_number:, latest_remote_build_number:)
      @version = version
      @requested_build_number = requested_build_number
      @latest_remote_build_number = latest_remote_build_number
      super(
        "BUILD_NUMBER=#{requested_build_number} cannot be uploaded for #{version}; " \
        "TestFlight already has build #{latest_remote_build_number}"
      )
    end
  end

  module_function

  def requested_state(current_version:, current_build_number:, requested_version: nil, requested_build_number: nil)
    version = requested_version || current_version
    version_changed = version != current_version
    explicit_build_number = !requested_build_number.nil?
    build_number = if explicit_build_number
      requested_build_number
    elsif version_changed
      "1"
    else
      current_build_number
    end

    {
      version: version.to_s,
      build_number: build_number.to_s,
      version_changed: version_changed,
      explicit_build_number: explicit_build_number
    }
  end

  def resolve_build_number(version:, candidate_build_number:, latest_remote_build_number:, explicit_build_number:)
    candidate = Integer(candidate_build_number.to_s, 10)
    latest_remote = Integer(latest_remote_build_number.to_s, 10)

    if explicit_build_number && candidate <= latest_remote
      raise BuildNumberConflict.new(
        version: version,
        requested_build_number: candidate,
        latest_remote_build_number: latest_remote
      )
    end

    explicit_build_number ? candidate : [candidate, latest_remote + 1].max
  end
end
