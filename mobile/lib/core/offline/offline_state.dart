import 'dart:async';
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import 'cache_db.dart';

/// Whether the app currently believes the ERP is reachable. Server
/// responses are authoritative — [connectivity_plus] is only a hint,
/// since "has Wi-Fi" does not mean "can reach the ERP".
enum NetStatus { online, offline }

/// The cache database, opened lazily per app run. Overridable in tests.
final cacheDbProvider = FutureProvider<CacheDb>((ref) => CacheDb.open());

/// CRUD facade — one instance per app run.
final cacheStoreProvider = FutureProvider<CacheStore>(
    (ref) async => CacheStore(await ref.watch(cacheDbProvider.future)));

/// Probes the OS connectivity state and merges it with request
/// outcomes: a NETWORK ApiException flips us offline; any successful
/// cachedFetch (or explicit markOnline) flips back. Screen UI reads
/// [netStatusProvider] for the offline banner.
final netStatusProvider = NotifierProvider<NetStatusNotifier, NetStatus>(
    NetStatusNotifier.new);

class NetStatusNotifier extends Notifier<NetStatus> {
  StreamSubscription<List<ConnectivityResult>>? _sub;

  @override
  NetStatus build() {
    _sub?.cancel();
    _sub = Connectivity()
        .onConnectivityChanged
        .listen((results) => _onHint(results));
    ref.onDispose(() => _sub?.cancel());
    Connectivity().checkConnectivity().then(_onHint).ignore();
    return NetStatus.online;
  }

  void _onHint(List<ConnectivityResult> results) {
    if (results.every((r) => r == ConnectivityResult.none)) {
      state = NetStatus.offline;
    } else if (state == NetStatus.offline) {
      // Optimistic probe: an interface came back — let a real request
      // confirm reachability; a failure flips this back to offline.
      state = NetStatus.online;
    }
  }

  void markOffline() {
    if (state != NetStatus.offline) state = NetStatus.offline;
  }

  void markOnline() {
    if (state != NetStatus.online) state = NetStatus.online;
  }
}

/// Per cache-key provenance for the last serve — lets screens say
/// "showing cached data from <time>" instead of silently presenting
/// stale information as live.
class ServeInfo {
  const ServeInfo({required this.fromCache, required this.cachedAt});
  final bool fromCache;
  final DateTime? cachedAt;
}

final serveInfoProvider =
    NotifierProvider<ServeInfoNotifier, Map<String, ServeInfo>>(
        ServeInfoNotifier.new);

class ServeInfoNotifier extends Notifier<Map<String, ServeInfo>> {
  @override
  Map<String, ServeInfo> build() => {};

  void mark(String key, {required bool fromCache, DateTime? cachedAt}) {
    // Provider bodies run mid-build; defer to avoid Riverpod's
    // "modify during build" assertion.
    Future.microtask(() {
      state = {...state, key: ServeInfo(fromCache: fromCache, cachedAt: cachedAt)};
    });
  }
}

/// Last confirmed ERP contact / successful sync run per user.
final lastSyncedAtProvider =
    FutureProvider.autoDispose.family<DateTime?, String>((ref, userId) async {
  final store = await ref.watch(cacheStoreProvider.future);
  final raw = await store.getMeta(userId, 'lastSyncedAt');
  return raw == null ? null : DateTime.tryParse(raw);
});

Future<void> recordServerContact(Ref ref, String userId) async {
  ref.read(netStatusProvider.notifier).markOnline();
  final now = DateTime.now();
  final store = await ref.read(cacheStoreProvider.future);
  await store.setMeta(userId, 'lastSyncedAt', now.toIso8601String());
  ref.invalidate(lastSyncedAtProvider(userId));
}

/// Dedupes concurrent fetches for the same cache key — a pull-refresh
/// landing on top of an app-resume or post-navigation invalidation
/// shares one network request instead of firing duplicates. Entries
/// are removed as soon as the request settles; sequential refreshes
/// always hit the network again.
final _inflightFetches = <String, Future<dynamic>>{};

/// Fetch-through-cache helper used by every read provider.
///
/// - Online: runs [fetch], stores the raw JSON response under
///   (userId, cacheKey), returns parsed data.
/// - NETWORK failure: falls back to the cached snapshot if one exists
///   and records provenance in [serveInfoProvider].
/// - Non-network API errors propagate unchanged — a 403/404 is a
///   real answer, not a reason to show cached data.
///
/// Cached assignment data is treated as stale until the next
/// successful fetch; callers never mutate it.
Future<T> cachedFetch<T>({
  required Ref ref,
  required String cacheKey,
  required Future<dynamic> Function() fetch,
  required T Function(dynamic data) parse,
  void Function()? onData,
}) async {
  final auth = ref.watch(authControllerProvider);
  final userId = auth is AuthSignedIn ? auth.user.id : null;
  final store = await ref.watch(cacheStoreProvider.future);
  final flightKey = '$userId|$cacheKey';
  final inflight = _inflightFetches.putIfAbsent(flightKey, () => fetch());
  try {
    final data = await inflight;
    if (userId != null) {
      await store.putEntry(
          userId, cacheKey, jsonEncode(data), DateTime.now());
      unawaited(recordServerContact(ref, userId));
    }
    ref
        .read(serveInfoProvider.notifier)
        .mark(cacheKey, fromCache: false);
    return parse(data);
  } on DioException catch (e) {
    final api = ApiException.fromDio(e);
    if (api.code == 'NETWORK') {
      ref.read(netStatusProvider.notifier).markOffline();
      if (userId != null) {
        final cached = await store.getEntry(userId, cacheKey);
        if (cached != null) {
          ref.read(serveInfoProvider.notifier).mark(cacheKey,
              fromCache: true, cachedAt: cached.cachedAt);
          return parse(jsonDecode(cached.payload));
        }
      }
    }
    throw api;
  } finally {
    if (identical(_inflightFetches[flightKey], inflight)) {
      _inflightFetches.remove(flightKey);
    }
  }
}
