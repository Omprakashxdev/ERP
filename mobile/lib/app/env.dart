/// Environment configuration.
///
/// The API base URL is selected at build time with --dart-define so the same
/// binary structure works against the local disposable ERP backend (dev) or a
/// production deployment later:
///
///   flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3100/api/mobile/v1
///
/// Default (debug builds): the Android emulator loopback 10.0.2.2 maps to the
/// host machine's localhost.
class Env {
  Env._();

  /// Dev default — host machine localhost as seen from the emulator.
  static const String devApiBaseUrl = 'http://10.0.2.2:3100/api/mobile/v1';

  /// Production deployments pass their own URL via --dart-define; the app
  /// never hardcodes production credentials or endpoints.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: devApiBaseUrl,
  );

  static bool get isDev => apiBaseUrl == devApiBaseUrl;
}
