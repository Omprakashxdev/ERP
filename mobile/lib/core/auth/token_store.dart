import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/models.dart';

/// Persists the mobile session in the platform keystore (Android Keystore /
/// iOS Keychain). Tokens never touch SharedPreferences or logs.
///
/// Keystore resilience: after an APK reinstall or key invalidation the
/// platform may throw [PlatformException] ("Could not decrypt key") on any
/// operation. A single failure wipes the unusable entries once and the
/// store then reports "no session" so the app can request reauthentication
/// instead of staying stuck or crashing. Plaintext fallback is never used.
class TokenStore {
  TokenStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _kAccess = 'saec.access_token';
  static const _kAccessExp = 'saec.access_expires_at';
  static const _kRefresh = 'saec.refresh_token';
  static const _kUser = 'saec.user';

  /// Set after the first keystore failure so the wipe happens once and
  /// later calls fail fast instead of hammering a dead keystore.
  var _wiped = false;

  Future<String?> _read(String key) async {
    try {
      return await _storage.read(key: key);
    } catch (_) {
      await _wipeOnce();
      return null;
    }
  }

  Future<void> _wipeOnce() async {
    if (_wiped) return;
    _wiped = true;
    try {
      await _storage.deleteAll();
    } catch (_) {/* keystore already unusable */}
  }

  Future<void> save({
    required String accessToken,
    required String accessTokenExpiresAt,
    required String refreshToken,
    required MobileUser user,
  }) async {
    try {
      await _storage.write(key: _kAccess, value: accessToken);
      await _storage.write(key: _kAccessExp, value: accessTokenExpiresAt);
      await _storage.write(key: _kRefresh, value: refreshToken);
      await _storage.write(key: _kUser, value: jsonEncode(user.toJson()));
    } catch (_) {
      // Wipe corrupted entries so the next attempt starts clean, then
      // surface the failure — callers treat it as "sign in again".
      await _wipeOnce();
      rethrow;
    }
  }

  Future<String?> get accessToken => _read(_kAccess);
  Future<String?> get refreshToken => _read(_kRefresh);

  Future<MobileUser?> get user async {
    final raw = await _read(_kUser);
    if (raw == null) return null;
    try {
      return MobileUser.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<bool> get hasSession async =>
      (await _read(_kAccess)) != null && (await _read(_kRefresh)) != null;

  Future<void> clear() async {
    for (final key in [_kAccess, _kAccessExp, _kRefresh, _kUser]) {
      try {
        await _storage.delete(key: key);
      } catch (_) {/* unusable keystore — treated as already cleared */}
    }
  }
}
