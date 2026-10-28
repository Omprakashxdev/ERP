import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/models/models.dart';
import '../../core/offline/offline_state.dart';
import '../photos/photo_providers.dart' show newClientEventId;

/// GET /activities/:id/history — immutable transitions + notes.
final activityHistoryProvider = FutureProvider.autoDispose
    .family<List<ActivityHistoryEntry>, String>((ref, activityId) async {
  if (ref.watch(authControllerProvider) is! AuthSignedIn) return const [];
  final dio = ref.watch(dioProvider);
  return cachedFetch(
    ref: ref,
    cacheKey: 'activity:$activityId:history',
    fetch: () =>
        dio.get('/activities/$activityId/history').then((r) => r.data),
    parse: (data) => ((data['items'] as List?) ?? const [])
        .map((e) =>
            ActivityHistoryEntry.fromJson(e as Map<String, dynamic>))
        .toList(),
  );
});

/// Confirmed result of PATCH /activities/:activityId/status.
class StatusUpdateResult {
  const StatusUpdateResult({
    required this.status,
    required this.revision,
    required this.alreadyApplied,
    required this.roomProgress,
  });

  final ActivityStatus status;
  final int revision;
  final bool alreadyApplied;
  final SiteProgress? roomProgress;

  factory StatusUpdateResult.fromJson(Map<String, dynamic> j) =>
      StatusUpdateResult(
        status: activityStatusFrom(j['status'] as String?),
        revision: (j['revision'] as num?)?.toInt() ?? 0,
        alreadyApplied: j['alreadyApplied'] as bool? ?? false,
        roomProgress:
            SiteProgress.fromJson(j['roomProgress'] as Map<String, dynamic>?),
      );
}

/// PATCH /api/mobile/v1/activities/:activityId/status.
///
/// [eventId] must be stable per *intended* operation — regenerate only
/// when the user picks a different target status, never on retry —
/// so a timed-out write that lands late is idempotent on the server.
class ActivityUpdater {
  const ActivityUpdater(this._dio);
  final Dio _dio;

  String newEventId() => newClientEventId();

  Future<StatusUpdateResult> updateStatus({
    required String activityId,
    required ActivityStatus status,
    required int expectedRevision,
    required String eventId,
    String? note,
  }) async {
    final wire = activityStatusToApi(status);
    if (wire == null) {
      throw const ApiException('BAD_STATUS', 'Unknown status cannot be saved.');
    }
    try {
      final res = await _dio.patch(
        '/activities/$activityId/status',
        data: {
          'status': wire,
          'expectedRevision': expectedRevision,
          'eventId': eventId,
          if (note != null && note.isNotEmpty) 'note': note,
        },
      );
      return StatusUpdateResult.fromJson(res.data as Map<String, dynamic>);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }
}

final activityUpdaterProvider =
    Provider<ActivityUpdater>((ref) => ActivityUpdater(ref.watch(dioProvider)));
