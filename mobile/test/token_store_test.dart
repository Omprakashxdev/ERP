import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:saec_progress/core/auth/token_store.dart';
import 'package:saec_progress/core/models/models.dart';

/// In-memory secure-storage double. When [dead] is set every operation
/// throws a [PlatformException] — exactly what Android does after an APK
/// reinstall invalidates the Keystore entry.
class FakeSecureStorage implements FlutterSecureStorage {
  final Map<String, String?> data = {};
  bool dead = false;
  int deleteAllCalls = 0;

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (dead) {
      throw PlatformException(code: 'DECRYPT', message: 'Could not decrypt key');
    }
    return data[key];
  }

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (dead) {
      throw PlatformException(code: 'DECRYPT', message: 'Could not decrypt key');
    }
    data[key] = value;
  }

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    if (dead) {
      throw PlatformException(code: 'DECRYPT', message: 'Could not decrypt key');
    }
    data.remove(key);
  }

  @override
  Future<void> deleteAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    deleteAllCalls++;
    data.clear();
  }

  @override
  Future<bool> containsKey({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async =>
      data.containsKey(key);

  @override
  Future<Map<String, String>> readAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async =>
      Map.fromEntries(
          data.entries.where((e) => e.value != null).map((e) => MapEntry(e.key, e.value!)));

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

const _user =
    MobileUser(id: 'u1', email: 'qa@saec.test', name: 'QA', role: 'STAFF');

void main() {
  test('read failure reports no session and wipes entries once', () async {
    final fake = FakeSecureStorage()..dead = true;
    final store = TokenStore(fake);
    expect(await store.hasSession, isFalse);
    expect(await store.accessToken, isNull);
    expect(await store.user, isNull);
    expect(fake.deleteAllCalls, 1);
  });

  test('invalidated keystore values are treated as signed out', () async {
    final fake = FakeSecureStorage();
    await fake.write(key: 'saec.access_token', value: 'stale');
    await fake.write(key: 'saec.refresh_token', value: 'stale');
    await fake.write(key: 'saec.user', value: jsonEncode(_user.toJson()));
    fake.dead = true;
    final store = TokenStore(fake);
    expect(await store.user, isNull);
    expect(await store.hasSession, isFalse);
  });

  test('clear() never throws on a dead keystore', () async {
    final fake = FakeSecureStorage()..dead = true;
    await TokenStore(fake).clear();
  });

  test('save() failure surfaces and wipes corrupted entries', () async {
    final fake = FakeSecureStorage()..dead = true;
    final store = TokenStore(fake);
    await expectLater(
      store.save(
        accessToken: 'a',
        accessTokenExpiresAt: '2099-01-01T00:00:00Z',
        refreshToken: 'r',
        user: _user,
      ),
      throwsA(isA<PlatformException>()),
    );
    expect(fake.deleteAllCalls, 1);
  });

  test('corrupt stored user JSON decodes to no session', () async {
    final fake = FakeSecureStorage();
    await fake.write(key: 'saec.user', value: '{not json');
    final store = TokenStore(fake);
    expect(await store.user, isNull);
  });
}
