import 'dart:math';

import '../api/api_client.dart';
import '../models/models.dart';
import 'cache_db.dart';

/// Result of one queue drain — surfaced to banners/dashboard.
class SyncReport {
  const SyncReport({
    required this.ran,
    required this.synced,
    required this.pending,
    required this.conflicts,
    required this.failed,
    required this.offline,
    required this.unauthenticated,
    required this.lastSyncedAt,
  });

  const SyncReport.idle({
    required this.pending,
    required this.conflicts,
    required this.failed,
  })  : ran = false,
        synced = 0,
        offline = false,
        unauthenticated = false,
        lastSyncedAt = null;

  final bool ran;
  final int synced;
  final int pending;
  final int conflicts;
  final int failed;
  final bool offline;
  final bool unauthenticated;
  final DateTime? lastSyncedAt;
}

/// How one op is submitted. Production wires ActivityUpdater; tests
/// inject fakes so the engine is verifiable without a server.
typedef StatusSubmitter = Future<StatusUpdateResult> Function(PendingOp op);

/// Mirrors the fields ActivityUpdater exposes — defined here to keep
/// the engine free of a feature-layer import.
class StatusUpdateResult {
  const StatusUpdateResult({
    required this.status,
    required this.revision,
    required this.alreadyApplied,
  });
  final ActivityStatus status;
  final int revision;
  final bool alreadyApplied;
}

/// Deterministic offline→online synchronizer.
///
/// Policy — *validated ordered operation chain*: queued ops for one
/// activity replay oldest-first. After each confirmed write, the next
/// queued op for that activity is rebased to the server-confirmed
/// revision, so intent order is preserved and a foreign write still
/// 409s instead of being blindly replayed over.
///
/// Failure semantics:
/// - transient (network/5xx/timeout): PENDING, attempts++, bounded
///   exponential backoff with jitter — never lost.
/// - 409 STALE/EVENT_CONFLICT: CONFLICT + server `current` payload
///   kept; later queued ops for the same activity are parked as
///   CONFLICT(blocked) — user must Review/Retry/Discard.
/// - 403/404/other 4xx: FAILED permanently; same-activity followers
///   FAILED too. A 403 also fails that site's remaining queued ops —
///   a revoked assignment must not keep submitting.
/// - attempts exhausted: FAILED.
class SyncEngine {
  SyncEngine({
    required CacheStore store,
    required StatusSubmitter submit,
    Random? random,
    this.maxAttempts = 8,
  })  : _store = store,
        _submit = submit,
        _rand = random ?? Random();

  final CacheStore _store;
  final StatusSubmitter _submit;
  final Random _rand;
  final int maxAttempts;

  static const _baseDelay = Duration(seconds: 2);
  static const _maxDelay = Duration(minutes: 5);

  bool _running = false;

  Duration _backoff(int attempts) {
    final shift = (attempts - 1).clamp(0, 30);
    var ms = _baseDelay.inMilliseconds * (1 << shift);
    if (ms > _maxDelay.inMilliseconds) ms = _maxDelay.inMilliseconds;
    final jitter = (ms * 0.3 * (_rand.nextDouble() * 2 - 1)).round();
    return Duration(milliseconds: ms + jitter);
  }

  /// Runs one drain for [userId]. Safe to call concurrently — a second
  /// invocation while a drain is running is a no-op.
  Future<SyncReport> syncNow(String userId) async {
    if (_running) {
      return _report(userId, ran: false);
    }
    _running = true;
    try {
      await _store.resetInterrupted(userId);
      var synced = 0;
      while (true) {
        final due = await _nextDue(userId);
        if (due == null) break;
        if (await _processOp(due, userId) == _OpOutcome.synced) synced++;
        // Loop re-reads the queue each round so parked/failed
        // followers and rebased revisions are always honoured.
      }
      await _store.setMeta(
          userId, 'lastSyncedAt', DateTime.now().toIso8601String());
      return await _report(userId, ran: true, synced: synced);
    } on _SyncOffline {
      return await _report(userId, ran: true, offline: true, synced: 0);
    } finally {
      _running = false;
    }
  }

  Future<SyncReport> _report(String userId,
      {required bool ran, int synced = 0, bool offline = false}) async {
    final ops = await _store.outstandingOps(userId);
    final pending = ops.where((o) =>
        o.state == OpState.pending || o.state == OpState.syncing).length;
    final conflicts =
        ops.where((o) => o.state == OpState.conflict).length;
    final failed = ops.where((o) => o.state == OpState.failed).length;
    final raw = await _store.getMeta(userId, 'lastSyncedAt');
    return SyncReport(
      ran: ran,
      synced: synced,
      pending: pending,
      conflicts: conflicts,
      failed: failed,
      offline: offline,
      unauthenticated: false,
      lastSyncedAt: raw == null ? null : DateTime.tryParse(raw),
    );
  }

  /// Oldest PENDING op whose backoff has elapsed. Backoff-deferred
  /// ops stay queued for the next trigger — honouring the delay is
  /// the point of the backoff.
  Future<PendingOp?> _nextDue(String userId) async {
    final ops = await _store.outstandingOps(userId);
    final now = DateTime.now();
    for (final o in ops) {
      if (o.state != OpState.pending) continue;
      final at = o.nextAttemptAt;
      if (at == null || !at.isAfter(now)) return o;
    }
    return null;
  }

  Future<_OpOutcome> _processOp(PendingOp op, String userId) async {
    if (op.attempts >= maxAttempts) {
      await _mark(op.copy(
          state: OpState.failed,
          updatedAt: DateTime.now(),
          lastError: 'Retry limit reached — please review.'));
      await _blockFollowers(op, 'Queued behind a failed update.');
      return _OpOutcome.failed;
    }
    await _mark(op.copy(
        state: OpState.syncing,
        updatedAt: DateTime.now(),
        clearError: true));
    try {
      final res = await _submit(op);
      await _mark(op.copy(
          state: OpState.synced,
          updatedAt: DateTime.now(),
          clearNextAttempt: true,
          clearError: true,
          detail: {
            'confirmedStatus': activityStatusToApi(res.status),
            'confirmedRevision': res.revision,
            'alreadyApplied': res.alreadyApplied,
          }));
      await _rebaseFollowers(op, res.revision);
      return _OpOutcome.synced;
    } on ApiException catch (e) {
      final now = DateTime.now();
      if (e.code == 'NETWORK' || (e.status ?? 0) >= 500) {
        // Transient — keep durable, back off, try later.
        await _mark(op.copy(
            state: OpState.pending,
            attempts: op.attempts + 1,
            updatedAt: now,
            nextAttemptAt: now.add(_backoff(op.attempts + 1)),
            lastError: e.message));
        // A dead link stalls the whole drain — abort this run; the
        // next connectivity event re-triggers it.
        if (e.code == 'NETWORK') throw const _SyncOffline();
        return _OpOutcome.deferred;
      }
      if (e.status == 409) {
        await _mark(op.copy(
            state: OpState.conflict,
            attempts: op.attempts + 1,
            updatedAt: now,
            lastError: e.message,
            detail: e.details));
        await _parkFollowers(op);
        return _OpOutcome.conflict;
      }
      // Permanent client error — never blindly retry. 403 covers a
      // revoked assignment: block the rest of this site's queue too.
      await _mark(op.copy(
          state: OpState.failed,
          attempts: op.attempts + 1,
          updatedAt: now,
          lastError: e.message));
      await _blockFollowers(op, 'Queued behind a failed update.');
      if (e.status == 403) await _failSiteQueue(op);
      return _OpOutcome.failed;
    }
  }

  /// Bumps the expected revision of later queued ops for the same
  /// activity so the ordered chain stays valid after a confirmed write.
  Future<void> _rebaseFollowers(PendingOp op, int confirmedRevision) async {
    final followers = await _followersOf(op);
    final now = DateTime.now();
    for (final f in followers) {
      if (f.state == OpState.pending &&
          f.expectedRevision < confirmedRevision) {
        await _mark(f.copy(
            expectedRevision: confirmedRevision, updatedAt: now));
      }
    }
  }

  Future<void> _parkFollowers(PendingOp op) async {
    final followers = await _followersOf(op);
    final now = DateTime.now();
    for (final f in followers) {
      if (f.state == OpState.pending) {
        await _mark(f.copy(
            state: OpState.conflict,
            updatedAt: now,
            lastError: 'Queued behind a conflicted update.'));
      }
    }
  }

  Future<void> _blockFollowers(PendingOp op, String why) async {
    final followers = await _followersOf(op);
    final now = DateTime.now();
    for (final f in followers) {
      if (f.state == OpState.pending) {
        await _mark(f.copy(
            state: OpState.failed, updatedAt: now, lastError: why));
      }
    }
  }

  /// Revoked permission: remaining queued work for the same site can
  /// only fail the same way — fail it now instead of submitting.
  Future<void> _failSiteQueue(PendingOp op) async {
    if (op.siteId == null) return;
    final ops = await _store.outstandingOps(op.userId);
    final now = DateTime.now();
    for (final f in ops) {
      if (f.siteId == op.siteId && f.state == OpState.pending) {
        await _mark(f.copy(
            state: OpState.failed,
            updatedAt: now,
            lastError: 'Site access revoked.'));
      }
    }
  }

  Future<List<PendingOp>> _followersOf(PendingOp op) =>
      _store.opsForActivity(op.userId, op.activityId);

  Future<void> _mark(PendingOp op) => _store.updateOp(op);
}

enum _OpOutcome { synced, deferred, conflict, failed }

class _SyncOffline implements Exception {
  const _SyncOffline();
}
