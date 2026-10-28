import 'dart:async';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:saec_progress/core/api/api_client.dart';

/// Scriptable HTTP adapter — inspects the bearer header and serves the
/// canned response the test specifies.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.serve);

  final Future<ResponseBody> Function(RequestOptions options) serve;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    await requestStream?.drain<void>();
    return serve(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Map<String, dynamic> body, int status) =>
    ResponseBody.fromString(
      '{"ok":true}',
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

ResponseBody _unauthorized() => ResponseBody.fromString(
      '{"error":{"code":"UNAUTHORIZED","message":"expired"}}',
      401,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  group('AuthInterceptor', () {
    test('concurrent 401s share a single refresh and retry with the new token',
        () async {
      var token = 'old-token';
      var refreshCalls = 0;
      final seenTokens = <String>[];

      final api = Dio(BaseOptions(baseUrl: 'http://test'));
      final retryDio = Dio(BaseOptions(baseUrl: 'http://test'));
      for (final d in [api, retryDio]) {
        d.httpClientAdapter = _FakeAdapter((opts) async {
          final auth = '${opts.headers['Authorization']}';
          seenTokens.add(auth);
          if (auth == 'Bearer new-token') return _json({}, 200);
          return _unauthorized();
        });
      }
      api.interceptors.add(AuthInterceptor(
        accessToken: () async => token,
        onRefresh: () async {
          refreshCalls++;
          await Future<void>.delayed(const Duration(milliseconds: 30));
          token = 'new-token';
          return RefreshOutcome.ok;
        },
        onSessionExpired: () async => fail('session must not expire'),
        retryDio: retryDio,
      ));

      final results = await Future.wait([
        for (var i = 0; i < 5; i++) api.get('/sites'),
      ]);

      expect(refreshCalls, 1);
      for (final r in results) {
        expect(r.statusCode, 200);
      }
      expect(seenTokens.where((t) => t == 'Bearer new-token').length, 5);
    });

    test('expired refresh terminates the session without retry', () async {
      var token = 'old-token';
      var expired = 0;

      final api = Dio(BaseOptions(baseUrl: 'http://test'));
      api.httpClientAdapter = _FakeAdapter((_) async => _unauthorized());
      api.interceptors.add(AuthInterceptor(
        accessToken: () async => token,
        onRefresh: () async => RefreshOutcome.expired,
        onSessionExpired: () async => expired++,
      ));

      await expectLater(
        api.get('/sites'),
        throwsA(isA<DioException>()
            .having((e) => e.response?.statusCode, 'status', 401)),
      );
      expect(expired, 1);
      expect(token, 'old-token');
    });

    test('transient refresh failure keeps the session and propagates',
        () async {
      var expired = 0;
      var refreshCalls = 0;

      final api = Dio(BaseOptions(baseUrl: 'http://test'));
      api.httpClientAdapter = _FakeAdapter((_) async => _unauthorized());
      api.interceptors.add(AuthInterceptor(
        accessToken: () async => 'old-token',
        onRefresh: () async {
          refreshCalls++;
          return RefreshOutcome.transient;
        },
        onSessionExpired: () async => expired++,
      ));

      await expectLater(api.get('/sites'), throwsA(isA<DioException>()));
      expect(refreshCalls, 1);
      expect(expired, 0);
    });

    test('a retried request that still gets 401 does not re-enter refresh',
        () async {
      var refreshCalls = 0;

      final api = Dio(BaseOptions(baseUrl: 'http://test'));
      final retryDio = Dio(BaseOptions(baseUrl: 'http://test'));
      for (final d in [api, retryDio]) {
        d.httpClientAdapter = _FakeAdapter((_) async => _unauthorized());
      }
      api.interceptors.add(AuthInterceptor(
        accessToken: () async => 'still-bad',
        onRefresh: () async {
          refreshCalls++;
          return RefreshOutcome.ok;
        },
        onSessionExpired: () async {},
        retryDio: retryDio,
      ));

      await expectLater(api.get('/sites'), throwsA(isA<DioException>()));
      expect(refreshCalls, 1);
    });

    test('auth endpoints never trigger refresh', () async {
      var refreshCalls = 0;
      final api = Dio(BaseOptions(baseUrl: 'http://test'));
      api.httpClientAdapter = _FakeAdapter((_) async => _unauthorized());
      api.interceptors.add(AuthInterceptor(
        accessToken: () async => 'token',
        onRefresh: () async {
          refreshCalls++;
          return RefreshOutcome.ok;
        },
        onSessionExpired: () async {},
      ));

      await expectLater(
          api.post('/auth/refresh', data: {}), throwsA(isA<DioException>()));
      expect(refreshCalls, 0);
    });
  });
}
