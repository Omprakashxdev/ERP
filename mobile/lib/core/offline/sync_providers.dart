import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/activities/activity_providers.dart';
import '../../features/hierarchy/hierarchy_providers.dart';
import '../../features/photos/photo_providers.dart';
import '../../features/reports/reports_screen.dart' show summaryProvider;
import '../../features/sites/site_providers.dart';
import '../api/api_client.dart';
import '../auth/auth_controller.dart';
import '../models/models.dart';
import 'cache_db.dart';
import 'offline_state.dart';
import 'photo_files.dart';
import 'photo_sync.dart' as ps;
import 'sync_engine.dart' as se;

/// All non-synced ops for the signed-in user — drives pending/conflict
/// indicators. Invalidated on every queue mutation.
final pendingOpsProvider =
    FutureProvider.autoDispose<List<PendingOp>>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (auth is! AuthSignedIn) return const [];
  final store = await ref.watch(cacheStoreProvider.future);
  return store.outstandingOps(auth.user.id);
});

/// Ops for one activity — pending/conflict badges on detail screens.
final activityOpsProvider = FutureProvider.autoDispose
    .family<List<PendingOp>, String>((ref, activityId) async {
  final auth = ref.watch(authControllerProvider);
  if (auth is! AuthSignedIn) return const [];
  final store = await ref.watch(cacheStoreProvider.future);
  return store.opsForActivity(auth.user.id, activityId);
});

/// Total unsynced work (activity ops + photo ops) — drives the
/// sign-out warning so pending evidence is never silently stranded.
final unsyncedCountProvider = FutureProvider.autoDispose<int>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (auth is! AuthSignedIn) return 0;
  final store = await ref.watch(cacheStoreProvider.future);
  final ops = await store.outstandingOps(auth.user.id);
  final photos = await store.outstandingPhotoOps(auth.user.id);
  final unresolvedOps = ops
      .where((o) => o.state == OpState.pending || o.state == OpState.syncing)
      .length;
  final unresolvedPhotos = photos
      .where((o) =>
          o.state == PhotoOpState.pending ||
          o.state == PhotoOpState.uploading)
      .length;
  return unresolvedOps + unresolvedPhotos;
});

/// Result of the most recent drain — drives "Synced"/offline banners.
final lastSyncReportProvider = StateProvider<se.SyncReport?>((ref) => null);

/// Queued photo ops for one gallery target — pending/uploading/failed/
/// blocked cards live next to the confirmed photos.
final photoOpsProvider = FutureProvider.autoDispose
    .family<List<PhotoOp>, PhotoRef>((ref, key) async {
  final auth = ref.watch(authControllerProvider);
  if (auth is! AuthSignedIn) return const [];
  final store = await ref.watch(cacheStoreProvider.future);
  return store.photoOpsForTarget(
      auth.user.id, key.target, key.targetId);
});

/// All unresolved photo ops for the signed-in user — the dashboard
/// pending banner counts these alongside activity ops.
final outstandingPhotoOpsProvider =
    FutureProvider.autoDispose<List<PhotoOp>>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (auth is! AuthSignedIn) return const [];
  final store = await ref.watch(cacheStoreProvider.future);
  return store.outstandingPhotoOps(auth.user.id);
});

/// Durable file staging — singleton per app run.
final photoFileStoreProvider =
    Provider<PhotoFileStore>((ref) => PhotoFileStore());

/// Queue + drain orchestration. Created per auth session; the engine
/// itself is stateless apart from its in-flight guard.
final syncServiceProvider = Provider<SyncService>((ref) {
  final submitter = _buildSubmitter(ref);
  return SyncService(ref, submitter);
});

se.StatusSubmitter _buildSubmitter(Ref ref) {
  final updater = ref.read(activityUpdaterProvider);
  return (op) async {
    final res = await updater.updateStatus(
      activityId: op.activityId,
      status: op.status,
      expectedRevision: op.expectedRevision,
      eventId: op.eventId,
      note: op.note,
    );
    return se.StatusUpdateResult(
      status: res.status,
      revision: res.revision,
      alreadyApplied: res.alreadyApplied,
    );
  };
}

class SyncService {
  SyncService(this._ref, this._submitter);
  final Ref _ref;
  final se.StatusSubmitter _submitter;

  bool _draining = false;
  ps.PhotoSyncEngine? _photoEngine;

  /// One photo engine per service — its internal lock prevents two
  /// workers from uploading the same operation simultaneously.
  Future<ps.PhotoSyncEngine> _photos() async {
    final existing = _photoEngine;
    if (existing != null) return existing;
    final store = await _ref.read(cacheStoreProvider.future);
    final engine = ps.PhotoSyncEngine(
      store: store,
      files: _ref.read(photoFileStoreProvider),
      submit: (op, onProgress) async {
        final res = await _ref.read(photoUploaderProvider).upload(
              target: op.targetType,
              targetId: op.targetId,
              filePath: op.filePath,
              clientEventId: op.clientEventId,
              caption: op.caption,
              fileName: op.fileName,
              mimeType: op.mimeType,
              onProgress: onProgress,
            );
        return ps.PhotoSubmitResult(
            serverPhotoId: res.photo.id,
            alreadyUploaded: res.alreadyUploaded);
      },
      onSettled: (op) {
        _ref.invalidate(photosProvider(
            (target: op.targetType, targetId: op.targetId)));
        _ref.invalidate(photoOpsProvider(
            (target: op.targetType, targetId: op.targetId)));
        _ref.invalidate(outstandingPhotoOpsProvider);
        _ref.invalidate(unsyncedCountProvider);
      },
    );
    _photoEngine = engine;
    return engine;
  }

  String? get _userId {
    final auth = _ref.read(authControllerProvider);
    return auth is AuthSignedIn ? auth.user.id : null;
  }

  /// Persists the intended update transactionally — callers may show
  /// "Saved on device" only after this resolves.
  Future<PendingOp> enqueue({
    required String activityId,
    required ActivityStatus status,
    required int expectedRevision,
    String? note,
    String? roomId,
    String? siteId,
    String? eventId,
  }) async {
    final userId = _userId;
    if (userId == null) {
      throw const ApiException('UNAUTHORIZED', 'Sign in to save progress.');
    }
    final store = await _ref.read(cacheStoreProvider.future);
    final now = DateTime.now();
    final op = PendingOp(
      eventId: eventId ?? newClientEventId(),
      userId: userId,
      activityId: activityId,
      roomId: roomId,
      siteId: siteId,
      status: status,
      note: note,
      expectedRevision: expectedRevision,
      createdAt: now,
      updatedAt: now,
    );
    await store.enqueue(op); // durable first — then UI may confirm
    _ref.invalidate(pendingOpsProvider);
    _ref.invalidate(activityOpsProvider(activityId));
    return op;
  }

  /// Stages picker bytes into durable app-private storage, then writes
  /// the queue row — "Saved on device" is only truthful after this
  /// resolves. [sourcePath] is the picker's temp file; it is never
  /// trusted to survive.
  Future<PhotoOp> enqueuePhoto({
    required String sourcePath,
    required String originalName,
    required PhotoTarget target,
    required String targetId,
    String? siteId,
    String? caption,
  }) async {
    final userId = _userId;
    if (userId == null) {
      throw const ApiException('UNAUTHORIZED', 'Sign in to add photos.');
    }
    final files = _ref.read(photoFileStoreProvider);
    final store = await _ref.read(cacheStoreProvider.future);
    final opId = newClientEventId();
    final staged = await files.stage(
      sourcePath: sourcePath,
      userId: userId,
      opId: opId,
      originalName: originalName,
    );
    final now = DateTime.now();
    final op = PhotoOp(
      opId: opId,
      clientEventId: newClientEventId(),
      userId: userId,
      siteId: siteId,
      targetType: target,
      targetId: targetId,
      filePath: staged.filePath,
      contentHash: staged.contentHash,
      fileName: staged.fileName,
      mimeType: staged.mimeType,
      fileSize: staged.fileSize,
      caption: caption,
      createdAt: now,
      updatedAt: now,
    );
    await store.enqueuePhotoOp(op);
    _ref.invalidate(
        photoOpsProvider((target: target, targetId: targetId)));
    _ref.invalidate(pendingOpsProvider);
    _ref.invalidate(unsyncedCountProvider);
    _ref.invalidate(outstandingPhotoOpsProvider);
    return op;
  }

  /// Attempts one queued photo upload right now (foreground retry or
  /// fresh enqueue while online). Goes through the engine so state
  /// transitions, verification and idempotency rules all apply.
  Future<void> uploadPhotoNow(PhotoOp op,
      {void Function(int sent, int total)? onProgress}) async {
    final engine = await _photos();
    await engine.uploadNow(op, onProgress);
    _ref.invalidate(photoOpsProvider(
        (target: op.targetType, targetId: op.targetId)));
    _ref.invalidate(pendingOpsProvider);
    _ref.invalidate(unsyncedCountProvider);
    _ref.invalidate(outstandingPhotoOpsProvider);
  }

  /// User-approved retry of a failed/blocked photo op — resets state
  /// and drains immediately.
  Future<void> retryPhoto(PhotoOp op) async {
    final store = await _ref.read(cacheStoreProvider.future);
    await store.updatePhotoOp(op.copy(
        state: PhotoOpState.pending,
        updatedAt: DateTime.now(),
        clearNextAttempt: true,
        clearError: true));
    await uploadPhotoNow(op.copy(state: PhotoOpState.pending));
  }

  /// Deliberate discard — removes the queue row AND the staged file.
  /// Only the user may do this; automatic cleanup never touches
  /// unresolved evidence.
  Future<void> discardPhoto(PhotoOp op) async {
    final store = await _ref.read(cacheStoreProvider.future);
    await store.deletePhotoOp(op.opId);
    await _ref.read(photoFileStoreProvider).delete(op.filePath, op.userId);
    _ref.invalidate(photoOpsProvider(
        (target: op.targetType, targetId: op.targetId)));
    _ref.invalidate(pendingOpsProvider);
    _ref.invalidate(unsyncedCountProvider);
    _ref.invalidate(outstandingPhotoOpsProvider);
  }

  /// Revalidates the session then drains the queue. Recovers ops left
  /// SYNCING by a killed process before submitting anything.
  Future<se.SyncReport> syncNow() async {
    final userId = _userId;
    if (userId == null || _draining) {
      return const se.SyncReport.idle(pending: 0, conflicts: 0, failed: 0);
    }
    _draining = true;
    try {
      // Session revalidation: a real authenticated call — a 401 flows
      // through the refresh interceptor; only when the session is
      // definitely alive do we submit queued writes.
      try {
        await _ref.read(dioProvider).get('/me');
      } on DioException catch (e) {
        final api = ApiException.fromDio(e);
        if (api.code == 'NETWORK') {
          _ref.read(netStatusProvider.notifier).markOffline();
          return const se.SyncReport(
            ran: true, synced: 0, pending: 0, conflicts: 0, failed: 0,
            offline: true, unauthenticated: false, lastSyncedAt: null);
        }
      }
      // A dead session signs out via the interceptor — ops stay
      // durable under this user's namespace and are never submitted
      // under another account.
      if (_userId == null || _userId != userId) {
        return const se.SyncReport(
          ran: true, synced: 0, pending: 0, conflicts: 0, failed: 0,
          offline: false, unauthenticated: true, lastSyncedAt: null);
      }
      final store = await _ref.read(cacheStoreProvider.future);
      final engine = se.SyncEngine(store: store, submit: _submitter);
      final report = await engine.syncNow(userId);
      // Photo uploads follow activity progress — same session, same
      // user; the engine's own guard keeps overlapping drains safe.
      unawaited((await _photos()).drain(userId).then((_) {
        _ref.invalidate(pendingOpsProvider);
        _ref.invalidate(outstandingPhotoOpsProvider);
        _ref.invalidate(unsyncedCountProvider);
      }));
      _ref.read(lastSyncReportProvider.notifier).state = report;
      _ref.invalidate(pendingOpsProvider);
      _ref.invalidate(activityOpsProvider);
      _ref.invalidate(activityHistoryProvider);
      if (report.synced > 0) {
        // Server-confirmed values changed — refresh every surface
        // that shows progress rather than masking them with cache.
        _ref.invalidate(assignedSitesProvider);
        _ref.invalidate(summaryProvider);
        _ref.invalidate(roomDetailProvider);
      }
      unawaited(recordServerContact(_ref, userId));
      return report;
    } finally {
      _draining = false;
    }
  }

  /// User-approved resolution of a CONFLICT op: keep the intent but
  /// rebase onto the ERP-confirmed revision with a fresh operation id
  /// (a reviewed re-submit is a *new* operation — the original eventId
  /// stays bound to the first attempt and must not be recycled).
  Future<void> retryWithLatestRevision(PendingOp op,
      {required int currentRevision}) async {
    final store = await _ref.read(cacheStoreProvider.future);
    await store.replaceOp(
        op.eventId,
        op.copy(
          eventId: newClientEventId(),
          state: OpState.pending,
          expectedRevision: currentRevision,
          attempts: 0,
          updatedAt: DateTime.now(),
          clearNextAttempt: true,
          clearError: true,
          clearDetail: true,
        ));
    _ref.invalidate(pendingOpsProvider);
    _ref.invalidate(activityOpsProvider(op.activityId));
    await syncNow();
  }

  /// Discard the queued change — the employee reviewed the conflict
  /// and accepts the server state.
  Future<void> discard(PendingOp op) async {
    final store = await _ref.read(cacheStoreProvider.future);
    await store.deleteOp(op.eventId);
    _ref.invalidate(pendingOpsProvider);
    _ref.invalidate(activityOpsProvider(op.activityId));
  }

  /// Review without changing the queue — refetches authoritative data.
  void reviewLatest(PendingOp op) {
    _ref.invalidate(roomDetailProvider);
    _ref.invalidate(assignedSitesProvider);
    _ref.invalidate(summaryProvider);
  }
}

/// Keeps the queue moving for the app lifetime: any rebuild caused by
/// an auth sign-in or an offline→online transition triggers a drain
/// (guarded — concurrent invocations collapse into one).
final syncOrchestratorProvider =
    NotifierProvider<SyncOrchestrator, int>(SyncOrchestrator.new);

class SyncOrchestrator extends Notifier<int> {
  @override
  int build() {
    final net = ref.watch(netStatusProvider);
    final auth = ref.watch(authControllerProvider);
    if (net == NetStatus.online && auth is AuthSignedIn) {
      // Deferred — build() must not start side-effects synchronously.
      Future.microtask(() =>
          unawaited(ref.read(syncServiceProvider).syncNow()));
    }
    return 0;
  }
}
