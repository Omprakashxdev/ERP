import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_common_ffi.dart';

import 'package:saec_progress/core/api/api_client.dart';
import 'package:saec_progress/core/models/models.dart';
import 'package:saec_progress/core/offline/cache_db.dart';
import 'package:saec_progress/core/offline/sync_engine.dart';

PendingOp _op({
  String eventId = 'ev-1',
  String userId = 'u1',
  String activityId = 'act-1',
  String? roomId,
  String? siteId,
  ActivityStatus status = ActivityStatus.inProgress,
  int expectedRevision = 1,
  int attempts = 0,
  DateTime? createdAt,
  String? note,
}) {
  final t = createdAt ?? DateTime.now();
  return PendingOp(
    eventId: eventId,
    userId: userId,
    activityId: activityId,
    roomId: roomId,
    siteId: siteId,
    status: status,
    note: note,
    expectedRevision: expectedRevision,
    createdAt: t,
    updatedAt: t,
    attempts: attempts,
  );
}

void main() {
  setUpAll(sqfliteFfiInit);

  Future<CacheStore> newStore() async =>
      CacheStore(await CacheDb.open(
          factory: databaseFactoryFfi,
          path: '$inMemoryDatabasePath/${DateTime.now().microsecondsSinceEpoch}'
              '${Random().nextInt(1 << 20)}'));

  // sqflite_common_ffi only honours ':memory:' exactly; a unique in-memory
  // name per store keeps tests isolated without touching the disk.

  group('CacheStore — per-user isolation', () {
    test('entries are namespaced by user', () async {
      final s = await newStore();
      await s.putEntry('u1', 'sites', '{"a":1}', DateTime.now());
      await s.putEntry('u2', 'sites', '{"b":2}', DateTime.now());
      expect((await s.getEntry('u1', 'sites'))!.payload, '{"a":1}');
      expect((await s.getEntry('u2', 'sites'))!.payload, '{"b":2}');
      expect(await s.getEntry('u3', 'sites'), isNull);
    });

    test('queued ops are invisible to other users', () async {
      final s = await newStore();
      await s.enqueue(_op(userId: 'u1'));
      expect((await s.outstandingOps('u2')), isEmpty);
      expect((await s.outstandingOps('u1')), hasLength(1));
    });

    test('enqueue persists state + attribution transactionally',
        () async {
      final s = await newStore();
      final op = _op(note: 'half done', siteId: 's1');
      await s.enqueue(op);
      final back = (await s.outstandingOps('u1')).single;
      expect(back.eventId, 'ev-1');
      expect(back.userId, 'u1');
      expect(back.status, ActivityStatus.inProgress);
      expect(back.note, 'half done');
      expect(back.state, OpState.pending);
      expect(back.expectedRevision, 1);
    });

    test('interrupted SYNCING ops revert to PENDING on restart',
        () async {
      final s = await newStore();
      await s.enqueue(_op());
      await s.updateOp(_op().copy(state: OpState.syncing));
      await s.resetInterrupted('u1');
      expect((await s.outstandingOps('u1')).single.state,
          OpState.pending);
    });

    test('replaceOp swaps the rejected op for a fresh eventId '
        'atomically', () async {
      final s = await newStore();
      final orig = _op().copy(state: OpState.conflict);
      await s.enqueue(orig);
      final next = orig.copy(
          eventId: 'ev-retry',
          state: OpState.pending,
          expectedRevision: 7);
      await s.replaceOp(orig.eventId, next);
      final ops = await s.outstandingOps('u1');
      expect(ops, hasLength(1));
      expect(ops.single.eventId, 'ev-retry');
      expect(ops.single.state, OpState.pending);
      expect(ops.single.expectedRevision, 7);
      expect(await s.op(orig.eventId), isNull);
    });
  });

  group('SyncEngine — submission semantics', () {
    test('success marks op SYNCED with confirmed revision', () async {
      final s = await newStore();
      await s.enqueue(_op());
      var calls = 0;
      final engine = SyncEngine(
        store: s,
        submit: (op) async {
          calls++;
          expect(op.eventId, 'ev-1');
          expect(op.status, ActivityStatus.inProgress);
          return const StatusUpdateResult(
              status: ActivityStatus.inProgress,
              revision: 2,
              alreadyApplied: false);
        },
      );
      final report = await engine.syncNow('u1');
      expect(report.synced, 1);
      expect(calls, 1);
      expect(await s.outstandingOps('u1'), isEmpty);
    });

    test('network failure keeps op PENDING with backoff, same eventId '
        'on retry — no duplicate history possible', () async {
      final s = await newStore();
      await s.enqueue(_op());
      final submitted = <String>[];
      var fail = true;
      final engine = SyncEngine(
        store: s,
        random: Random(1),
        submit: (op) async {
          submitted.add(op.eventId);
          if (fail) {
            throw const ApiException('NETWORK', 'down');
          }
          return const StatusUpdateResult(
              status: ActivityStatus.inProgress,
              revision: 2,
              alreadyApplied: false);
        },
      );
      final first = await engine.syncNow('u1');
      expect(first.offline, isTrue);
      final after = (await s.outstandingOps('u1')).single;
      expect(after.state, OpState.pending);
      expect(after.attempts, 1);
      expect(after.nextAttemptAt, isNotNull);

      fail = false;
      // The engine must not resubmit while backoff is still pending.
      await engine.syncNow('u1');
      expect(submitted, hasLength(1));
      // Force the deferred op due and confirm the same eventId retries.
      await s.updateOp(after.copy(nextAttemptAt:
          DateTime.now().subtract(const Duration(seconds: 1))));
      await engine.syncNow('u1');
      expect(submitted, ['ev-1', 'ev-1']);
      expect(await s.outstandingOps('u1'), isEmpty);
    });

    test('409 parks the op as CONFLICT with server state preserved; '
        'later same-activity ops are parked too', () async {
      final s = await newStore();
      await s.enqueue(_op(eventId: 'e1', createdAt: DateTime(2026, 1, 1)));
      await s.enqueue(_op(
          eventId: 'e2',
          status: ActivityStatus.completed,
          createdAt: DateTime(2026, 1, 2)));
      final engine = SyncEngine(
        store: s,
        submit: (op) async => throw ApiException(
          'STALE', 'changed by someone else',
          status: 409,
          details: {'currentStatus': 'COMPLETED', 'currentRevision': 7},
        ),
      );
      final report = await engine.syncNow('u1');
      expect(report.conflicts, 2);
      final ops = await s.outstandingOps('u1');
      final first = ops.firstWhere((o) => o.eventId == 'e1');
      expect(first.state, OpState.conflict);
      expect(first.detail?['currentStatus'], 'COMPLETED');
      expect(first.detail?['currentRevision'], 7);
      final second = ops.firstWhere((o) => o.eventId == 'e2');
      expect(second.state, OpState.conflict);
    });

    test('403 fails the op and the rest of that site\'s queue '
        '(permission revocation)', () async {
      final s = await newStore();
      await s.enqueue(_op(eventId: 'e1', siteId: 's1'));
      await s.enqueue(_op(
          eventId: 'e2',
          activityId: 'act-2',
          siteId: 's1',
          createdAt: DateTime.now().add(const Duration(seconds: 1))));
      await s.enqueue(_op(
          eventId: 'e3',
          activityId: 'act-3',
          siteId: 's2',
          createdAt: DateTime.now().add(const Duration(seconds: 2))));
      var calls = 0;
      final engine = SyncEngine(
        store: s,
        submit: (op) async {
          calls++;
          if (op.activityId == 'act-1') {
            throw const ApiException('FORBIDDEN', 'not assigned',
                status: 403);
          }
          return const StatusUpdateResult(
              status: ActivityStatus.inProgress,
              revision: 2,
              alreadyApplied: false);
        },
      );
      await engine.syncNow('u1');
      final ops = await s.outstandingOps('u1');
      expect(ops.where((o) => o.eventId == 'e1').single.state,
          OpState.failed);
      // Same-site follower was blocked without an extra submission…
      expect(ops.where((o) => o.eventId == 'e2').single.state,
          OpState.failed);
      // …while another site's op still went through (SYNCED rows are
      // resolved — absent from the outstanding set).
      expect(calls, 2);
      expect(ops.any((o) => o.eventId == 'e3'), isFalse);
    });

    test('ordered chain: follower rebases to the confirmed revision',
        () async {
      final s = await newStore();
      await s.enqueue(_op(
          eventId: 'e1',
          expectedRevision: 3,
          createdAt: DateTime(2026, 1, 1)));
      await s.enqueue(_op(
          eventId: 'e2',
          expectedRevision: 3,
          status: ActivityStatus.completed,
          createdAt: DateTime(2026, 1, 2)));
      final seen = <int>[];
      final engine = SyncEngine(
        store: s,
        submit: (op) async {
          seen.add(op.expectedRevision);
          return StatusUpdateResult(
              status: op.status,
              revision: 4,
              alreadyApplied: false);
        },
      );
      await engine.syncNow('u1');
      // e2 must not replay blindly against rev 3 — it was rebased to
      // the server-confirmed revision from e1 before submission.
      expect(seen, [3, 4]);
      expect(await s.outstandingOps('u1'), isEmpty);
    });

    test('alreadyApplied replay counts as success without double '
        'submission', () async {
      final s = await newStore();
      await s.enqueue(_op());
      final engine = SyncEngine(
        store: s,
        submit: (op) async => const StatusUpdateResult(
            status: ActivityStatus.inProgress,
            revision: 2,
            alreadyApplied: true),
      );
      final report = await engine.syncNow('u1');
      expect(report.synced, 1);
    });

    test('permanent 4xx fails without retry; retry cap is honoured',
        () async {
      final s = await newStore();
      await s.enqueue(_op());
      var calls = 0;
      final engine = SyncEngine(
        store: s,
        submit: (op) async {
          calls++;
          throw const ApiException('VALIDATION', 'bad payload',
              status: 422);
        },
      );
      await engine.syncNow('u1');
      expect(calls, 1);
      expect((await s.outstandingOps('u1')).single.state,
          OpState.failed);

      // Attempts at the cap fail closed without another submission.
      await s.deleteOp('ev-1');
      await s.enqueue(_op(attempts: 8));
      await engine.syncNow('u1');
      expect(calls, 1);
      expect((await s.outstandingOps('u1')).single.state,
          OpState.failed);
    });
  });
}
