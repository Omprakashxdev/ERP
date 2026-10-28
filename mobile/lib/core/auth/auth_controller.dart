import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/env.dart';
import '../../features/sites/current_site.dart';
import '../api/api_client.dart';
import '../models/models.dart';
import 'token_store.dart';

sealed class AuthState {
  const AuthState();
}

/// Tokens still being restored from secure storage.
class AuthUnknown extends AuthState {
  const AuthUnknown();
}

class AuthSignedOut extends AuthState {
  const AuthSignedOut();
}

class AuthSignedIn extends AuthState {
  const AuthSignedIn(this.user);
  final MobileUser user;
}

final tokenStoreProvider = Provider<TokenStore>((ref) => TokenStore());

final authControllerProvider =
    NotifierProvider<AuthController, AuthState>(AuthController.new);

class AuthController extends Notifier<AuthState> {
  late final TokenStore _store = ref.read(tokenStoreProvider);
  late final Dio _plainDio = Dio(BaseOptions(baseUrl: Env.apiBaseUrl));

  @override
  AuthState build() {
    Future.microtask(_restore);
    return const AuthUnknown();
  }

  Future<void> _restore() async {
    final user = await _store.user;
    final has = await _store.hasSession;
    if (user != null && has) {
      state = AuthSignedIn(user);
    } else {
      await _store.clear();
      state = const AuthSignedOut();
    }
  }

  /// POST /auth/login — returns error message or null on success.
  Future<String?> login(String email, String password) async {
    try {
      final res = await _plainDio.post('/auth/login', data: {
        'email': email.trim(),
        'password': password,
      });
      final data = res.data as Map<String, dynamic>;
      final user = MobileUser.fromJson(data['user'] as Map<String, dynamic>);
      await _store.save(
        accessToken: data['accessToken'] as String,
        accessTokenExpiresAt: data['accessTokenExpiresAt'] as String,
        refreshToken: data['refreshToken'] as String,
        user: user,
      );
      ref.invalidate(currentSiteIdProvider);
      state = AuthSignedIn(user);
      return null;
    } on DioException catch (e) {
      return ApiException.fromDio(e).message;
    }
  }

  /// Rotates the refresh token. `expired` only when the server rejected
  /// the token — network failures are `transient` and keep the session.
  Future<RefreshOutcome> refresh() async {
    final token = await _store.refreshToken;
    if (token == null) return RefreshOutcome.expired;
    try {
      final res = await _plainDio.post('/auth/refresh', data: {
        'refreshToken': token,
      });
      final data = res.data as Map<String, dynamic>;
      final user =
          data['user'] is Map ? MobileUser.fromJson(data['user']) : null;
      await _store.save(
        accessToken: data['accessToken'] as String,
        accessTokenExpiresAt: data['accessTokenExpiresAt'] as String,
        refreshToken: data['refreshToken'] as String,
        user: user ?? (await _store.user)!,
      );
      if (user != null) state = AuthSignedIn(user);
      return RefreshOutcome.ok;
    } on DioException catch (e) {
      return e.response != null
          ? RefreshOutcome.expired
          : RefreshOutcome.transient;
    }
  }

  /// Revokes the refresh token server-side, then clears local storage.
  Future<void> logout() async {
    final token = await _store.refreshToken;
    if (token != null) {
      try {
        await _plainDio.post('/auth/logout', data: {'refreshToken': token});
      } on DioException {
        // Local sign-out must succeed even if the server is unreachable.
      }
    }
    await _store.clear();
    ref.invalidate(currentSiteIdProvider);
    state = const AuthSignedOut();
  }

  /// Forced sign-out after a failed token refresh.
  Future<void> sessionExpired() async {
    await _store.clear();
    ref.invalidate(currentSiteIdProvider);
    state = const AuthSignedOut();
  }
}

/// Dio instance wired with the bearer + refresh interceptor.
final dioProvider = Provider<Dio>((ref) {
  final store = ref.read(tokenStoreProvider);
  final interceptor = AuthInterceptor(
    accessToken: () => store.accessToken,
    onRefresh: () => ref.read(authControllerProvider.notifier).refresh(),
    onSessionExpired: () =>
        ref.read(authControllerProvider.notifier).sessionExpired(),
  );
  return buildDio(interceptor);
});
