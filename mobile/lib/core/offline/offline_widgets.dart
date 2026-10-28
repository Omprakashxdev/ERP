import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_controller.dart';
import '../models/models.dart';
import '../theme/app_theme.dart';
import '../widgets/app_widgets.dart';
import 'cache_db.dart';
import 'offline_state.dart';
import 'sync_providers.dart';

/// Sync-state indicators deliberately use blue/neutral — never the
/// activity-status palette — so a queued change can never be mistaken
/// for confirmed ERP progress.
///
/// Slim offline strip: sits at the top of a screen's body whenever the
/// server was unreachable. [cachedAt] adds "from <time>" when a cached
/// snapshot is being displayed.
class OfflineBanner extends ConsumerWidget {
  const OfflineBanner({super.key, this.cacheKey});

  /// Optional cache key — when provided the banner shows the age of
  /// the snapshot actually being displayed on this screen.
  final String? cacheKey;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final net = ref.watch(netStatusProvider);
    final serves = ref.watch(serveInfoProvider);
    final info = cacheKey == null ? null : serves[cacheKey];
    final servingCache = info?.fromCache == true ||
        serves.values.any((s) => s.fromCache);
    if (net == NetStatus.online && !servingCache) {
      return const SizedBox.shrink();
    }
    final when = info?.cachedAt;
    final label = net == NetStatus.offline
        ? (servingCache
            ? 'Offline — showing cached data${when != null ? ' from ${_ago(when)}' : ''}'
            : 'Offline — changes will be queued')
        : 'Showing cached data from ${_ago(when ?? DateTime.now())}';
    return Container(
      width: double.infinity,
      color: AppColors.blueBg,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_outlined,
              size: 16, color: AppColors.blue),
          const SizedBox(width: 8),
          Expanded(
            child: Text(label,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppColors.ink)),
          ),
        ],
      ),
    );
  }
}

/// Chip rendered next to the server-confirmed status on activity rows
/// — queued work is labelled, never silently applied.
class PendingSyncChip extends StatelessWidget {
  const PendingSyncChip({super.key, required this.op});
  final PendingOp op;

  @override
  Widget build(BuildContext context) {
    final (icon, label) = switch (op.state) {
      OpState.pending || OpState.syncing => (
          Icons.schedule,
          'Pending sync: ${activityStatusLabel(op.status)}'
        ),
      OpState.conflict => (Icons.warning_amber_rounded, 'Sync conflict'),
      OpState.failed => (Icons.error_outline, 'Sync failed'),
      OpState.synced => (Icons.cloud_done_outlined, 'Synced'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.blueBg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: AppColors.blue),
          const SizedBox(width: 4),
          Text(label,
              style: const TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: AppColors.blue)),
        ],
      ),
    );
  }
}

/// Dashboard strip — count of queued ops + last confirmed sync, and a
/// tap target to retry manually. Server progress figures stay
/// untouched; this only reports queue health.
class PendingOpsBanner extends ConsumerWidget {
  const PendingOpsBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ops = ref.watch(pendingOpsProvider).valueOrNull ?? const [];
    final photos =
        ref.watch(outstandingPhotoOpsProvider).valueOrNull ?? const [];
    final auth = ref.watch(authControllerProvider);
    final userId = auth is AuthSignedIn ? auth.user.id : null;
    final lastSync = userId == null
        ? null
        : ref.watch(lastSyncedAtProvider(userId)).valueOrNull;
    final pending =
        ops.where((o) => o.state == OpState.pending || o.state == OpState.syncing).length;
    final conflicts = ops.where((o) => o.state == OpState.conflict).length;
    final failed = ops.where((o) => o.state == OpState.failed).length;
    final photosPending = photos
        .where((o) =>
            o.state == PhotoOpState.pending ||
            o.state == PhotoOpState.uploading)
        .length;
    final photosBlocked = photos
        .where((o) =>
            o.state == PhotoOpState.blocked ||
            o.state == PhotoOpState.failed)
        .length;
    if (pending == 0 &&
        conflicts == 0 &&
        failed == 0 &&
        photosPending == 0 &&
        photosBlocked == 0 &&
        lastSync == null) {
      return const SizedBox.shrink();
    }
    final parts = <String>[
      if (pending > 0) '$pending update${pending == 1 ? '' : 's'} pending sync',
      if (photosPending > 0)
        '$photosPending photo${photosPending == 1 ? '' : 's'} pending upload',
      if (conflicts > 0) '$conflicts conflict${conflicts == 1 ? '' : 's'} to review',
      if (failed > 0) '$failed failed',
      if (photosBlocked > 0)
        '$photosBlocked photo${photosBlocked == 1 ? '' : 's'} blocked/failed',
    ];
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                  conflicts > 0 || failed > 0 || photosBlocked > 0
                      ? Icons.warning_amber_rounded
                      : Icons.cloud_upload_outlined,
                  size: 18,
                  color: conflicts > 0 || failed > 0 || photosBlocked > 0
                      ? AppColors.amberText
                      : AppColors.blue),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  parts.isEmpty
                      ? 'All updates synced'
                      : parts.join(' · '),
                  style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink),
                ),
              ),
            ],
          ),
          if (lastSync != null)
            Padding(
              padding: const EdgeInsets.only(top: 4, left: 26),
              child: Text('Last synced ${_ago(lastSync)}',
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.muted)),
            ),
        ],
      ),
    );
  }
}

/// Conflict card for the activity screen — ERP-confirmed status vs the
/// locally requested one, the preserved note, and explicit
/// Review / Retry / Discard actions. Nothing auto-overwrites.
class ConflictCard extends ConsumerWidget {
  const ConflictCard({super.key, required this.op});
  final PendingOp op;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final serverStatus = activityStatusFrom(
        op.detail?['currentStatus'] as String? ??
            op.detail?['status'] as String?);
    final serverRevision =
        (op.detail?['currentRevision'] as num?)?.toInt();
    final service = ref.read(syncServiceProvider);
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.amberBg,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.amber.withValues(alpha: 0.4)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.warning_amber_rounded,
                  size: 18, color: AppColors.amberText),
              SizedBox(width: 8),
              Expanded(
                child: Text('Sync conflict — review before saving again',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: AppColors.ink)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            'ERP now shows: '
            '${serverStatus == ActivityStatus.unknown ? 'updated' : activityStatusLabel(serverStatus)}'
            '${serverRevision != null ? ' (rev $serverRevision)' : ''}\n'
            'Your queued change: ${activityStatusLabel(op.status)}'
            '${(op.note ?? '').isNotEmpty ? '\nNote: ${op.note}' : ''}',
            style: const TextStyle(
                fontSize: 12, color: AppColors.ink, height: 1.4),
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton(
                onPressed: () => service.reviewLatest(op),
                child: const Text('Review latest'),
              ),
              if (serverRevision != null)
                FilledButton(
                  onPressed: () => service.retryWithLatestRevision(op,
                      currentRevision: serverRevision),
                  child: const Text('Retry with latest'),
                ),
              TextButton(
                onPressed: () => service.discard(op),
                child: const Text('Discard'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Small chip for a failed op — tap offers retry/discard via a sheet.
String _ago(DateTime t) {
  final d = DateTime.now().difference(t.toLocal());
  if (d.inMinutes < 1) return 'just now';
  if (d.inHours < 1) return '${d.inMinutes}m ago';
  if (d.inDays < 1) return '${d.inHours}h ago';
  if (d.inDays < 30) return '${d.inDays}d ago';
  return 'on ${t.toLocal().toString().split(' ').first}';
}
