import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/models/models.dart';
import '../../core/offline/offline_state.dart';

/// GET /sites — assigned sites only (server-enforced scope). Watches
/// auth so sign-out/account-switch recomputes instead of leaking the
/// previous session's list. Offline falls back to the user's own
/// cached snapshot.
final assignedSitesProvider =
    FutureProvider.autoDispose<List<AssignedSite>>((ref) async {
  if (ref.watch(authControllerProvider) is! AuthSignedIn) return const [];
  final dio = ref.watch(dioProvider);
  return cachedFetch(
    ref: ref,
    cacheKey: 'sites',
    fetch: () => dio
        .get('/sites', queryParameters: {'pageSize': 100})
        .then((r) => r.data),
    parse: (data) => ((data['items'] as List?) ?? const [])
        .map((e) => AssignedSite.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
});

/// Family argument for cover bytes. [coverKey] is the server storage
/// key (`coverImagePath`) — unique on every upload — so replacing a
/// cover in ERP produces a new provider instance that fetches fresh
/// bytes instead of serving the previous image.
typedef CoverRef = ({String siteId, String coverKey});

/// GET /sites/:id/cover — authenticated cover bytes; null when the file
/// is unavailable (icon fallback is rendered).
final siteCoverBytesProvider = FutureProvider.autoDispose
    .family<Uint8List?, CoverRef>((ref, arg) async {
  if (ref.watch(authControllerProvider) is! AuthSignedIn) return null;
  final dio = ref.watch(dioProvider);
  try {
    final res = await dio.get<List<int>>(
      '/sites/${arg.siteId}/cover',
      options: Options(responseType: ResponseType.bytes),
    );
    if (res.statusCode != 200 || res.data == null) return null;
    return Uint8List.fromList(res.data!);
  } on DioException catch (e) {
    if (e.response?.statusCode == 404) return null;
    throw ApiException.fromDio(e);
  }
});

class SiteDetailBundle {
  const SiteDetailBundle({
    required this.site,
    required this.wings,
    this.canUpdate = false,
  });
  final SiteDetail site;
  final List<Wing> wings;
  final bool canUpdate;
}

String siteDetailKey(String siteId) => 'site:$siteId';
String siteWingsKey(String siteId) => 'site:$siteId:wings';

/// GET /sites/:id + /sites/:id/wings — detail and block list for one
/// site. Both responses are cached so the whole level renders offline.
final siteDetailProvider = FutureProvider.autoDispose
    .family<SiteDetailBundle, String>((ref, siteId) async {
  if (ref.watch(authControllerProvider) is! AuthSignedIn) {
    throw const ApiException('UNAUTHORIZED', 'Session ended.');
  }
  final dio = ref.watch(dioProvider);
  final detail = await cachedFetch(
    ref: ref,
    cacheKey: siteDetailKey(siteId),
    fetch: () => dio.get('/sites/$siteId').then((r) => r.data),
    parse: (data) => data as Map<String, dynamic>,
  );
  final wings = await cachedFetch(
    ref: ref,
    cacheKey: siteWingsKey(siteId),
    fetch: () => dio.get('/sites/$siteId/wings').then((r) => r.data),
    parse: (data) => data as Map<String, dynamic>,
  );
  final site = SiteDetail.fromJson(
    detail['site'] as Map<String, dynamic>,
    SiteProgress.fromJson(detail['progress'] as Map<String, dynamic>?),
  );
  final items = (wings['items'] as List?) ?? const [];
  return SiteDetailBundle(
    site: site,
    wings:
        items.map((e) => Wing.fromJson(e as Map<String, dynamic>)).toList(),
    canUpdate:
        (detail['permissions'] as Map<String, dynamic>?)?['canUpdate']
                as bool? ??
            false,
  );
});
