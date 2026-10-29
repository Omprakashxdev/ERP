import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:saec_progress/core/auth/auth_controller.dart';
import 'package:saec_progress/core/models/models.dart';
import 'package:saec_progress/core/offline/cache_db.dart';
import 'package:saec_progress/core/offline/offline_state.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

/// Signed-in auth without touching secure storage or the network.
class _FakeAuth extends AuthController {
  _FakeAuth(this._user);
  final MobileUser? _user;

  @override
  AuthState build() {
    final u = _user;
    return u == null ? const AuthSignedOut() : AuthSignedIn(u);
  }
}

/// NetStatus without the connectivity_plus platform channel.
class _FakeNet extends NetStatusNotifier {
  @override
  NetStatus build() => NetStatus.online;
}

const _user1 =
    MobileUser(id: 'u1', email: 'u1@qa.local', name: 'U1', role: 'STAFF');
const _user2 =
    MobileUser(id: 'u2', email: 'u2@qa.local', name: 'U2', role: 'STAFF');

int _dbCounter = 0;

ProviderContainer _container({MobileUser? user}) => ProviderContainer(
      overrides: [
        authControllerProvider.overrideWith(() => _FakeAuth(user)),
        netStatusProvider.overrideWith(() => _FakeNet()),
        cacheStoreProvider.overrideWith((ref) async => CacheStore(
            await CacheDb.open(
                factory: databaseFactoryFfi,
                path:
                    '${Directory.systemTemp.path}/cf_${_dbCounter++}.db'))),
      ],
    );

/// Two separate providers hitting the same cache key — the only way two
/// cachedFetch calls race on one flight key.
AutoDisposeFutureProvider<dynamic> _probe(
        String key, Future<dynamic> Function() fetch) =>
    FutureProvider.autoDispose((ref) => cachedFetch(
          ref: ref,
          cacheKey: key,
          fetch: fetch,
          parse: (d) => d,
        ));

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  sqfliteFfiInit();

  test('two identical concurrent fetches share one request', () async {
    final c = _container();
    addTearDown(c.dispose);
    var calls = 0;
    Future<dynamic> fetch() async {
      calls++;
      await Future<void>.delayed(const Duration(milliseconds: 30));
      return {'items': [1, 2]};
    }

    final a = _probe('sites', fetch);
    final b = _probe('sites', fetch);

    final results = await Future.wait([
      c.read(a.future),
      c.read(b.future),
    ]);

    expect(calls, 1);
    expect(results[0], results[1]);
  });

  test('a failed fetch does not poison the map; the next call refetches',
      () async {
    final c = _container();
    addTearDown(c.dispose);
    var calls = 0;
    Future<dynamic> fetch() async {
      calls++;
      if (calls == 1) {
        throw DioException(
          requestOptions: RequestOptions(path: '/sites'),
          response: Response(
              requestOptions: RequestOptions(path: '/sites'),
              statusCode: 500),
          type: DioExceptionType.badResponse,
        );
      }
      return {'items': 'ok'};
    }

    final p = _probe('sites', fetch);

    await expectLater(c.read(p.future), throwsA(isA<Exception>()));

    final data = await c.read(p.future);
    expect(calls, 2);
    expect(data, {'items': 'ok'});
  });

  test('different cache keys fetch independently', () async {
    final c = _container();
    addTearDown(c.dispose);
    var calls = 0;
    Future<dynamic> fetch() async {
      calls++;
      return {'n': calls};
    }

    final a = _probe('key-a', fetch);
    final b = _probe('key-b', fetch);

    await Future.wait([c.read(a.future), c.read(b.future)]);
    expect(calls, 2);
  });

  test('same cache key is isolated per signed-in user', () async {
    final c1 = _container(user: _user1);
    final c2 = _container(user: _user2);
    addTearDown(c1.dispose);
    addTearDown(c2.dispose);
    var calls = 0;
    Future<dynamic> fetch() async {
      calls++;
      return {'items': calls};
    }

    final a = _probe('sites', fetch);
    final b = _probe('sites', fetch);

    await Future.wait([c1.read(a.future), c2.read(b.future)]);
    expect(calls, 2);
  });

  test('signed-in fetch resolves and repeated refresh does not hang',
      () async {
    final c = _container(user: _user1);
    addTearDown(c.dispose);
    var calls = 0;
    Future<dynamic> fetch() async {
      calls++;
      return {'items': calls};
    }

    final p = _probe('sites', fetch);

    final first = await c.read(p.future);
    expect(first, {'items': 1});

    // A manual refresh re-runs the provider — the cleaned in-flight map
    // must let it fetch again instead of joining a stale future.
    c.invalidate(p);
    final second = await c.read(p.future);
    expect(second, {'items': 2});
    expect(calls, 2);
  });
}
