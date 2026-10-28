import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:saec_progress/core/api/api_client.dart';
import 'package:saec_progress/core/models/models.dart';
import 'package:saec_progress/features/activities/activity_providers.dart';
import 'package:saec_progress/features/photos/photo_providers.dart';

/// Scriptable HTTP adapter — records the request and returns a canned
/// response.
class _FakeAdapter implements HttpClientAdapter {
  _FakeAdapter(this.serve);

  final Future<ResponseBody> Function(RequestOptions options) serve;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    // Drain so FormData fully materializes before we inspect it.
    final chunks = <int>[];
    if (requestStream != null) {
      await for (final c in requestStream) {
        chunks.addAll(c);
      }
    }
    options.extra['_bodyBytes'] = chunks;
    return serve(options);
  }

  @override
  void close({bool force = false}) {}
}

Dio _dio(
    Future<ResponseBody> Function(RequestOptions) serve) =>
    Dio(BaseOptions(baseUrl: 'http://test'))
      ..httpClientAdapter = _FakeAdapter(serve);

ResponseBody _json(Map<String, dynamic> body, int status) =>
    ResponseBody.fromString(
      _encode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

String _encode(Map<String, dynamic> j) {
  String esc(Object? v) => v is String
      ? '"${v.replaceAll('"', '\\"')}"'
      : v == null
          ? 'null'
          : v is num || v is bool
              ? '$v'
              : v is Map
                  ? '{${v.entries.map((e) => '${esc(e.key)}:${esc(e.value)}').join(',')}}'
                  : v is List
                      ? '[${v.map(esc).join(',')}]'
                      : '"$v"';
  return esc(j);
}

void main() {
  group('ActivityUpdater', () {
    test('PATCH sends status, expectedRevision, eventId and note', () async {
      Map<String, dynamic>? body;
      String? path;
      final dio = _dio((opts) async {
        path = opts.path;
        body = opts.data as Map<String, dynamic>;
        return _json({
          'id': 'act1',
          'status': 'IN_PROGRESS',
          'revision': 4,
          'eventId': 'evt-123',
          'alreadyApplied': false,
          'roomProgress': {
            'totalActivities': 3,
            'completedActivities': 1,
            'configuredRooms': 1,
            'unconfiguredRooms': 0,
            'percent': 33.33,
            'statusCounts': {
              'notStarted': 1,
              'inProgress': 1,
              'onHold': 0,
              'completed': 1,
            },
          },
        }, 200);
      });

      final res = await ActivityUpdater(dio).updateStatus(
        activityId: 'act1',
        status: ActivityStatus.inProgress,
        expectedRevision: 3,
        eventId: 'evt-123',
        note: 'Started wiring',
      );

      expect(path, '/activities/act1/status');
      expect(body, {
        'status': 'IN_PROGRESS',
        'expectedRevision': 3,
        'eventId': 'evt-123',
        'note': 'Started wiring',
      });
      expect(res.status, ActivityStatus.inProgress);
      expect(res.revision, 4);
      expect(res.alreadyApplied, isFalse);
      expect(res.roomProgress!.percent, closeTo(33.33, 0.01));
      expect(res.roomProgress!.statusCounts!.inProgress, 1);
    });

    test('409 STALE surfaces the server-side current state', () async {
      final dio = _dio((_) async => _json({
            'error': {
              'code': 'STALE',
              'message': 'Stale revision',
              'current': {
                'currentRevision': 7,
                'currentStatus': 'COMPLETED',
              },
            },
          }, 409));

      try {
        await ActivityUpdater(dio).updateStatus(
          activityId: 'act1',
          status: ActivityStatus.inProgress,
          expectedRevision: 3,
          eventId: 'evt-abc',
        );
        fail('expected ApiException');
      } on ApiException catch (e) {
        expect(e.status, 409);
        expect(e.code, 'STALE');
        expect(e.details?['currentStatus'], 'COMPLETED');
        expect(e.details?['currentRevision'], 7);
      }
    });

    test('403 FORBIDDEN surfaces without pretending to succeed', () async {
      final dio = _dio((_) async => _json({
            'error': {
              'code': 'FORBIDDEN',
              'message': 'You do not have update permission on this site.',
            },
          }, 403));

      await expectLater(
        ActivityUpdater(dio).updateStatus(
          activityId: 'act1',
          status: ActivityStatus.completed,
          expectedRevision: 0,
          eventId: 'evt-xyz',
        ),
        throwsA(isA<ApiException>()
            .having((e) => e.status, 'status', 403)
            .having((e) => e.code, 'code', 'FORBIDDEN')),
      );
    });

    test('eventIds are caller-controlled so retries reuse the same key',
        () async {
      final seen = <String>[];
      final dio = _dio((opts) async {
        seen.add((opts.data as Map<String, dynamic>)['eventId'] as String);
        return _json({
          'id': 'a',
          'status': 'COMPLETED',
          'revision': 2,
          'eventId': seen.last,
          'alreadyApplied': seen.length > 1,
        }, 200);
      });
      final updater = ActivityUpdater(dio);
      const eventId = 'stable-evt-0001';
      await updater.updateStatus(
          activityId: 'a',
          status: ActivityStatus.completed,
          expectedRevision: 1,
          eventId: eventId);
      // Simulated retry of the SAME operation — same eventId.
      final replay = await updater.updateStatus(
          activityId: 'a',
          status: ActivityStatus.completed,
          expectedRevision: 1,
          eventId: eventId);
      expect(seen, [eventId, eventId]);
      expect(replay.alreadyApplied, isTrue);
    });
  });

  group('PhotoUploader', () {
    test('multipart POST carries file, target, caption and clientEventId',
        () async {
      final tmp = await File(
              '${Directory.systemTemp.path}/p-${DateTime.now().microsecondsSinceEpoch}.jpg')
          .writeAsBytes([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]); // jpeg magic
      addTearDown(tmp.delete);

      String? path;
      RequestOptions? captured;
      final dio = _dio((opts) async {
        path = opts.path;
        captured = opts;
        return _json({
          'photo': {
            'id': 'ph1',
            'targetType': 'ROOM',
            'siteId': 's1',
            'flatId': null,
            'roomId': 'r1',
            'roomActivityId': null,
            'mimeType': 'image/jpeg',
            'fileSize': 6,
            'caption': 'wall crack',
            'uploadedAt': '2026-10-28T00:00:00.000Z',
            'uploadedById': 'u1',
            'contentUrl': '/api/mobile/v1/photos/ph1/content',
          },
          'alreadyUploaded': false,
        }, 201);
      });

      final photo = await PhotoUploader(dio).upload(
        target: PhotoTarget.room,
        targetId: 'r1',
        filePath: tmp.path,
        clientEventId: 'cevt-00000001',
        caption: 'wall crack',
      );

      expect(path, '/photos');
      final form = captured!.data as FormData;
      final fields = {
        for (final f in form.fields) f.key: f.value,
      };
      expect(fields['targetType'], 'ROOM');
      expect(fields['targetId'], 'r1');
      expect(fields['clientEventId'], 'cevt-00000001');
      expect(fields['caption'], 'wall crack');
      expect(form.files.single.key, 'file');
      expect(photo.photo.id, 'ph1');
      expect(photo.photo.contentUrl, '/api/mobile/v1/photos/ph1/content');
      expect(photo.photo.caption, 'wall crack');
    });
  });

  group('StatusCounts parsing', () {
    test('statusCounts parses when present, absent on older responses',
        () {
      final withCounts = SiteProgress.fromJson({
        'totalActivities': 10,
        'completedActivities': 4,
        'configuredRooms': 2,
        'unconfiguredRooms': 0,
        'percent': 40.0,
        'statusCounts': {
          'notStarted': 2,
          'inProgress': 3,
          'onHold': 1,
          'completed': 4,
        },
      });
      expect(withCounts.statusCounts!.inProgress, 3);
      expect(withCounts.statusCounts!.onHold, 1);
      expect(withCounts.statusCounts!.total, 10);

      final without = SiteProgress.fromJson({
        'totalActivities': 3,
        'completedActivities': 1,
        'configuredRooms': 1,
        'unconfiguredRooms': 0,
        'percent': 33.3,
      });
      expect(without.statusCounts, isNull);
    });
  });
}
