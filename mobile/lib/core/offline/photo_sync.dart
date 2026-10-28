import 'dart:io';
import 'dart:math';

import '../api/api_client.dart';
import 'cache_db.dart';
import 'photo_files.dart';

/// How one queued photo is submitted. Production wires the real
/// PhotoUploader; tests inject fakes — the engine never touches Dio.
typedef PhotoSubmitter = Future<PhotoSubmitResult> Function(
    PhotoOp op,
    void Function(int sent, int total)? onProgress);

class PhotoSubmitResult {
  const PhotoSubmitResult(
      {required this.serverPhotoId, required this.alreadyUploaded});
  final String serverPhotoId;
  final bool alreadyUploaded;
}

/// Called after an op reaches a terminal state so providers can
/// refresh the affected gallery — injected to keep the engine pure.
typedef PhotoOpListener = void Function(PhotoOp op);

/// Deterministic offline→online photo synchronizer.
///
/// Failure semantics (aligned with [SyncEngine]):
/// - transient (network/5xx/timeout): PENDING, attempts++, bounded
///   exponential backoff with jitter — never lost.
/// - 403/404: BLOCKED — a revoked assignment (404 by design — the
///   backend hides site existence), forbidden write, inactive chain or
///   vanished target. Evidence may still matter; the file is preserved,
///   the op waits for a deliberate user decision, and the rest of the
///   site's queue is blocked too.
/// - other 4xx (400/409 validation or event-conflict): FAILED
///   permanently — the server has spoken; the file stays on the
///   device for review.
/// - missing/corrupt local file: FAILED — never uploads as valid.
/// - attempts exhausted: FAILED.
///
/// Successful confirmation is persisted (state + serverPhotoId) inside
/// the store update *before* the staged file is deleted — a crash in
/// between can never lose evidence of a confirmed upload.
class PhotoSyncEngine {
  PhotoSyncEngine({
    required CacheStore store,
    required PhotoFileStore files,
    required PhotoSubmitter submit,
    PhotoOpListener? onSettled,
    Random? random,
    this.maxAttempts = 8,
  })  : _store = store,
        _files = files,
        _submit = submit,
        _onSettled = onSettled,
        _rand = random ?? Random();

  final CacheStore _store;
  final PhotoFileStore _files;
  final PhotoSubmitter _submit;
  final PhotoOpListener? _onSettled;
  final Random _rand;
  final int maxAttempts;

  static const _baseDelay = Duration(seconds: 2);
  static const _maxDelay = Duration(minutes: 5);

  bool _running = false;

  /// Live upload progress per opId (0.0–1.0) for the gallery UI.
  final Map<String, double> progress = {};

  Duration _backoff(int attempts) {
    final shift = (attempts - 1).clamp(0, 30);
    var ms = _baseDelay.inMilliseconds * (1 << shift);
    if (ms > _maxDelay.inMilliseconds) ms = _maxDelay.inMilliseconds;
    final jitter = (ms * 0.3 * (_rand.nextDouble() * 2 - 1)).round();
    return Duration(milliseconds: ms + jitter);
  }

  /// Drains the photo queue for [userId]. Concurrent invocations
  /// collapse — a second caller while running is a no-op.
  Future<void> drain(String userId) async {
    if (_running) return;
    _running = true;
    try {
      await _store.resetInterruptedUploads(userId);
      await _files.sweepTempFiles(userId);
      // Crash window: a staged file whose queue row never committed is an
      // orphan — sweep it once the grace period has passed so storage does
      // not leak, while never touching files rows still reference.
      final keep = (await _store.outstandingPhotoOps(userId))
          .map((o) => File(o.filePath).absolute.path)
          .toSet();
      await _files.sweepOrphans(userId, keep);
      while (true) {
        final due = await _nextDue(userId);
        if (due == null) break;
        await _process(due);
      }
    } on _PhotoSyncOffline {
      // Link died mid-drain — remaining ops retry on the next trigger.
    } finally {
      _running = false;
    }
  }

  /// Uploads one specific op immediately (user-triggered retry or a
  /// fresh enqueue while online). Still runs the full claim/verify/
  /// submit flow — the single-engine lock prevents double submission.
  /// A dead link leaves the op PENDING with backoff rather than
  /// throwing — callers inspect the resulting state.
  Future<void> uploadNow(
      PhotoOp op, void Function(int sent, int total)? onProgress) async {
    if (op.state != PhotoOpState.pending &&
        op.state != PhotoOpState.failed &&
        op.state != PhotoOpState.blocked) {
      return;
    }
    try {
      await _process(op, onProgress: onProgress);
    } on _PhotoSyncOffline {
      // Persisted as PENDING with backoff — nothing to surface.
    }
  }

  Future<PhotoOp?> _nextDue(String userId) async {
    final ops = await _store.outstandingPhotoOps(userId);
    final now = DateTime.now();
    for (final o in ops) {
      if (o.state != PhotoOpState.pending) continue;
      final at = o.nextAttemptAt;
      if (at == null || !at.isAfter(now)) return o;
    }
    return null;
  }

  Future<void> _process(PhotoOp op,
      {void Function(int sent, int total)? onProgress}) async {
    if (op.attempts >= maxAttempts) {
      await _mark(op.copy(
          state: PhotoOpState.failed,
          updatedAt: DateTime.now(),
          lastError: 'Retry limit reached — please review.'));
      return;
    }

    // Staged under an older, larger cap: a file that can never satisfy
    // the server's limit is a permanent failure — do not burn an upload
    // attempt, and keep the evidence on the device for review.
    if (op.fileSize > PhotoFileStore.maxFileBytes) {
      await _mark(op.copy(
          state: PhotoOpState.failed,
          updatedAt: DateTime.now(),
          lastError: 'Photo is larger than '
              '${PhotoFileStore.maxFileBytes ~/ (1024 * 1024)} MB — '
              'the server cannot accept it. Remove or replace it.'));
      return;
    }

    // Verify bytes before claiming UPLOADING — a missing or changed
    // file is a permanent failure, not a retryable upload.
    final bad = await _files.verify(
        op.filePath, op.contentHash, op.fileSize, op.userId);
    if (bad != null) {
      await _mark(op.copy(
          state: PhotoOpState.failed,
          updatedAt: DateTime.now(),
          lastError: bad));
      return;
    }

    await _mark(op.copy(
        state: PhotoOpState.uploading,
        updatedAt: DateTime.now(),
        clearError: true));
    try {
      final res = await _submit(op, (sent, total) {
        if (total > 0) {
          progress[op.opId] = sent / total;
          onProgress?.call(sent, total);
        }
      });
      // Persist the server confirmation FIRST — only then release the
      // staged file. Order matters: a crash between the two steps can
      // never strand an unconfirmed photo.
      await _mark(op.copy(
          state: PhotoOpState.synced,
          updatedAt: DateTime.now(),
          clearNextAttempt: true,
          clearError: true,
          serverPhotoId: res.serverPhotoId));
      await _files.delete(op.filePath, op.userId);
      progress.remove(op.opId);
      _onSettled?.call(op.copy(state: PhotoOpState.synced));
    } on ApiException catch (e) {
      progress.remove(op.opId);
      final now = DateTime.now();
      if (e.code == 'NETWORK') {
        await _mark(op.copy(
            state: PhotoOpState.pending,
            attempts: op.attempts + 1,
            updatedAt: now,
            nextAttemptAt: now.add(_backoff(op.attempts + 1)),
            lastError: e.message));
        throw const _PhotoSyncOffline();
      }
      if ((e.status ?? 0) >= 500) {
        await _mark(op.copy(
            state: PhotoOpState.pending,
            attempts: op.attempts + 1,
            updatedAt: now,
            nextAttemptAt: now.add(_backoff(op.attempts + 1)),
            lastError: e.message));
        return;
      }
      if (e.status == 403 || e.status == 404) {
        // 403 FORBIDDEN/INACTIVE: permission or chain lost. 404
        // NOT_FOUND: the backend hides site existence from users
        // whose assignment was revoked (and reports deleted targets
        // the same way). Either way the server can never authorize
        // this upload now — park as BLOCKED, keep the evidence, and
        // block the rest of the site's queue until a user decision.
        await _mark(op.copy(
            state: PhotoOpState.blocked,
            attempts: op.attempts + 1,
            updatedAt: now,
            lastError: 'Upload blocked — the location is unavailable or '
                'you no longer have access.'));
        await _blockSiteQueue(op);
        return;
      }
      // Permanent client error (400/404/409 validation or event
      // conflict) — keep the file, surface the reason, stop retrying.
      await _mark(op.copy(
          state: PhotoOpState.failed,
          attempts: op.attempts + 1,
          updatedAt: now,
          lastError: e.message));
    }
  }

  /// Revoked permission: other queued uploads for the same site can
  /// only fail the same way — park them as BLOCKED (evidence kept).
  Future<void> _blockSiteQueue(PhotoOp op) async {
    if (op.siteId == null) return;
    final ops = await _store.outstandingPhotoOps(op.userId);
    final now = DateTime.now();
    for (final f in ops) {
      if (f.siteId == op.siteId && f.state == PhotoOpState.pending) {
        await _mark(f.copy(
            state: PhotoOpState.blocked,
            updatedAt: now,
            lastError: 'Upload blocked — the location is unavailable or '
                'you no longer have access.'));
      }
    }
  }

  Future<void> _mark(PhotoOp op) => _store.updatePhotoOp(op);
}

class _PhotoSyncOffline implements Exception {
  const _PhotoSyncOffline();
}
