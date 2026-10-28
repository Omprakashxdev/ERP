import 'package:dio/dio.dart';

import '../../app/env.dart';

/// Normalised API error surface — mirrors the ERP {error:{code,message}}
/// contract used by every /api/mobile/v1 route.
class ApiException implements Exception {
  const ApiException(this.code, this.message, {this.status, this.details});

  final String code;
  final String message;
  final int? status;

  /// Extra payload from `{error: {...}}` — e.g. 409 `current` state.
  final Map<String, dynamic>? details;

  factory ApiException.fromDio(DioException e) {
    final data = e.response?.data;
    if (data is Map<String, dynamic> && data['error'] is Map) {
      final err = data['error'] as Map;
      return ApiException(
        '${err['code'] ?? 'ERROR'}',
        '${err['message'] ?? 'Request failed.'}',
        status: e.response?.statusCode,
        details: (err['current'] as Map?)?.cast<String, dynamic>(),
      );
    }
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return const ApiException('NETWORK', 'Cannot reach the ERP server.');
    }
    return ApiException('ERROR', e.message ?? 'Request failed.',
        status: e.response?.statusCode);
  }

  @override
  String toString() => message;
}

/// Refresh result — distinguishes a dead session (server rejected the
/// refresh token) from a transient network failure (session kept).
enum RefreshOutcome { ok, expired, transient }

/// Attaches the bearer token on every request. On a 401 it performs a
/// single in-flight refresh that all concurrent 401s share (rotating
/// refresh tokens make a second refresh attempt fail), then retries the
/// request once with the new token.
///
/// - [RefreshOutcome.expired] → [onSessionExpired] then propagate.
/// - [RefreshOutcome.transient] → propagate the original error and keep
///   the session (network failures must not log the user out).
/// - Retries are marked in `extra` so they can never re-enter this path,
///   and the refresh call itself runs on a bare Dio without this
///   interceptor — no recursive loops.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.accessToken,
    required this.onRefresh,
    required this.onSessionExpired,
    Dio? retryDio,
  }) : _retryDio = retryDio ??
            Dio(BaseOptions(baseUrl: Env.apiBaseUrl));

  final Future<String?> Function() accessToken;
  final Future<RefreshOutcome> Function() onRefresh;
  final Future<void> Function() onSessionExpired;
  final Dio _retryDio;

  /// One refresh future shared by every request that hits a 401 while a
  /// refresh is in flight.
  Future<RefreshOutcome>? _inflightRefresh;

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await accessToken();
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    final req = err.requestOptions;
    final isAuthEndpoint = req.path.contains('/auth/');
    final alreadyRetried = req.extra['retriedAfterRefresh'] == true;
    if (err.response?.statusCode != 401 || isAuthEndpoint || alreadyRetried) {
      return handler.next(err);
    }

    final refresh =
        _inflightRefresh ??= onRefresh().whenComplete(() {
          _inflightRefresh = null;
        });
    final outcome = await refresh;

    switch (outcome) {
      case RefreshOutcome.ok:
        try {
          final token = await accessToken();
          req.headers['Authorization'] = 'Bearer $token';
          req.extra['retriedAfterRefresh'] = true;
          final res = await _retryDio.fetch(req);
          return handler.resolve(res);
        } on DioException catch (e) {
          return handler.next(e);
        }
      case RefreshOutcome.expired:
        await onSessionExpired();
        return handler.next(err);
      case RefreshOutcome.transient:
        return handler.next(err);
    }
  }
}

Dio buildDio(AuthInterceptor auth) => Dio(
      BaseOptions(
        baseUrl: Env.apiBaseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Accept': 'application/json'},
      ),
    )..interceptors.add(auth);
