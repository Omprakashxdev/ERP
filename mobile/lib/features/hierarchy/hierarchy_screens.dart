import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/offline/cache_db.dart';
import '../../core/offline/offline_widgets.dart';
import '../../core/offline/sync_providers.dart';
import '../../core/routing/router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../photos/photo_providers.dart';
import '../photos/photo_widgets.dart';
import 'hierarchy_providers.dart';

/// "Site › Wing A › Floor 2" — built from the HierarchyContext `extra`
/// carried by push navigation; empty when deep-linked.
class HierarchyCrumbs extends StatelessWidget {
  const HierarchyCrumbs({super.key, required this.context_, required this.current});
  final HierarchyContext context_;
  final String current;

  @override
  Widget build(BuildContext context) {
    final parts = [...context_.crumbs, current];
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        for (var i = 0; i < parts.length; i++) ...[
          if (i > 0)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 4),
              child: Icon(Icons.chevron_right, size: 14, color: AppColors.faint),
            ),
          Text(
            parts[i],
            style: TextStyle(
              fontSize: 12,
              fontWeight:
                  i == parts.length - 1 ? FontWeight.w700 : FontWeight.w500,
              color:
                  i == parts.length - 1 ? AppColors.ink : AppColors.muted,
            ),
          ),
        ],
      ],
    );
  }
}

/// Error + retry panel shared by hierarchy screens.
class HierarchyError extends StatelessWidget {
  const HierarchyError({super.key, required this.error, required this.onRetry});
  final Object error;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final msg = error is ApiException
        ? (error as ApiException).message
        : 'Failed to load. Check your connection.';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off_outlined,
                size: 56, color: AppColors.faint),
            const SizedBox(height: 14),
            Text(msg,
                textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.muted)),
            const SizedBox(height: 14),
            PrimaryButton(
                label: 'Retry', icon: Icons.refresh, onPressed: onRetry),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  const _Empty({required this.what});
  final String what;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text('No $what configured in ERP yet.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted)),
        ),
      );
}

/// Summary header: ring + child count + completed/total line.
class _ProgressHeader extends StatelessWidget {
  const _ProgressHeader({
    required this.countLabel,
    required this.progress,
  });
  final String countLabel;
  final SiteProgress? progress;

  @override
  Widget build(BuildContext context) {
    final p = progress;
    return AppCard(
      child: Row(
        children: [
          ProgressRing(percent: p?.percent, size: 60),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(countLabel,
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink)),
                const SizedBox(height: 2),
                Text(
                  p == null || !p.configured
                      ? 'Progress not configured'
                      : '${p.completedActivities} of ${p.totalActivities} activities completed',
                  style:
                      const TextStyle(fontSize: 12, color: AppColors.muted),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Generic child card — icon tile, title, subtitle, progress, stats,
/// inactive badge. Matches the block/flat card language in the reference.
class _ChildCard extends StatelessWidget {
  const _ChildCard({
    required this.title,
    required this.subtitle,
    required this.progress,
    required this.isActive,
    required this.onTap,
    this.thirdStatLabel = 'Rooms',
    this.thirdStatValue,
  });

  final String title;
  final String subtitle;
  final SiteProgress? progress;
  final bool isActive;
  final VoidCallback onTap;
  final String? thirdStatLabel;
  final String? thirdStatValue;

  @override
  Widget build(BuildContext context) {
    final p = progress;
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            children: [
              ImageThumb(size: 56),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                            color: AppColors.ink)),
                    Text(subtitle,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.muted)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                            child: AppProgressBar(percent: p?.percent)),
                        const SizedBox(width: 10),
                        Text(
                          p?.percent == null
                              ? '—'
                              : '${p!.percent!.round()}%',
                          style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w800,
                              color: AppColors.ink),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              if (p?.percent != null)
                ProgressRing(percent: p!.percent, size: 40),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _mini('${p?.totalActivities ?? 0}', 'Activities'),
              _mini('${p?.completedActivities ?? 0}', 'Done'),
              if (thirdStatLabel != null)
                _mini(
                    thirdStatValue ?? '${p?.totalRooms ?? 0}',
                    thirdStatLabel!),
              if (!isActive)
                const StatusChip(
                    kind: StatusKind.neutral, label: 'Inactive'),
            ],
          ),
        ],
      ),
    );
  }

  Widget _mini(String v, String l) => Expanded(
        child: Column(
          children: [
            Text(v,
                style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink)),
            Text(l,
                style: const TextStyle(
                    fontSize: 10, color: AppColors.muted)),
          ],
        ),
      );
}

/// Wing detail → floors list.
class FloorsScreen extends ConsumerWidget {
  const FloorsScreen({super.key, required this.wingId, this.context_});
  final String wingId;
  final HierarchyContext? context_;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ctx = context_ ?? const HierarchyContext();
    final floors = ref.watch(wingFloorsProvider(wingId));
    final title = ctx.wingName ?? 'Wing';
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: Text(title,
            style:
                const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
      ),
      body: Column(children: [
        OfflineBanner(cacheKey: wingFloorsKey(wingId)),
        Expanded(
          child: floors.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => HierarchyError(
            error: e,
            onRetry: () => ref.invalidate(wingFloorsProvider(wingId))),
        data: (list) => RefreshIndicator(
          onRefresh: () async =>
              ref.invalidate(wingFloorsProvider(wingId)),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (ctx.crumbs.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: HierarchyCrumbs(
                      context_: ctx, current: 'Floors'),
                ),
              _ProgressHeader(
                countLabel: '${list.length} floors',
                progress: _aggregate(list.map((f) => f.progress)),
              ),
              const SizedBox(height: 20),
              const Text('Floors',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink)),
              const SizedBox(height: 12),
              if (list.isEmpty)
                const _Empty(what: 'floors')
              else
                for (final f in list) ...[
                  _ChildCard(
                    title: f.label,
                    subtitle: '${f.flatsCount} flats',
                    progress: f.progress,
                    isActive: f.isActive,
                    onTap: () => context
                        .push(
                          Routes.flats(f.id),
                          extra: ctx.withFloor(f.label),
                        )
                        .then((_) {
                      if (context.mounted) {
                        ref.invalidate(wingFloorsProvider(wingId));
                      }
                    }),
                  ),
                  const SizedBox(height: 12),
                ],
            ],
          ),
        ),
          ),
        ),
      ]),
    );
  }
}

/// Floor detail → flats list.
class FlatsScreen extends ConsumerWidget {
  const FlatsScreen({super.key, required this.floorId, this.context_});
  final String floorId;
  final HierarchyContext? context_;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ctx = context_ ?? const HierarchyContext();
    final flats = ref.watch(floorFlatsProvider(floorId));
    final title = ctx.floorName ?? 'Floor';
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: Text(title,
            style:
                const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
      ),
      body: Column(children: [
        OfflineBanner(cacheKey: floorFlatsKey(floorId)),
        Expanded(
          child: flats.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => HierarchyError(
            error: e,
            onRetry: () => ref.invalidate(floorFlatsProvider(floorId))),
        data: (list) => RefreshIndicator(
          onRefresh: () async =>
              ref.invalidate(floorFlatsProvider(floorId)),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (ctx.crumbs.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child:
                      HierarchyCrumbs(context_: ctx, current: 'Flats'),
                ),
              _ProgressHeader(
                countLabel: '${list.length} flats',
                progress: _aggregate(list.map((f) => f.progress)),
              ),
              const SizedBox(height: 20),
              const Text('Flats',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink)),
              const SizedBox(height: 12),
              if (list.isEmpty)
                const _Empty(what: 'flats')
              else
                for (final f in list) ...[
                  _ChildCard(
                    title: 'Flat ${f.flatNumber}',
                    subtitle:
                        '${f.roomsCount} rooms${f.flatType != null ? ' · ${f.flatType}' : ''}',
                    progress: f.progress,
                    isActive: f.isActive,
                    onTap: () => context
                        .push(
                          Routes.rooms(f.id),
                          extra: ctx.withFlat('Flat ${f.flatNumber}'),
                        )
                        .then((_) {
                      if (context.mounted) {
                        ref.invalidate(floorFlatsProvider(floorId));
                      }
                    }),
                  ),
                  const SizedBox(height: 12),
                ],
            ],
          ),
        ),
          ),
        ),
      ]),
    );
  }
}

/// Flat detail → rooms list.
class RoomsScreen extends ConsumerWidget {
  const RoomsScreen({super.key, required this.flatId, this.context_});
  final String flatId;
  final HierarchyContext? context_;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ctx = context_ ?? const HierarchyContext();
    final rooms = ref.watch(flatRoomsProvider(flatId));
    final title = ctx.flatName ?? 'Flat';
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: Text(title,
            style:
                const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
      ),
      body: Column(children: [
        OfflineBanner(cacheKey: flatRoomsKey(flatId)),
        Expanded(
          child: rooms.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => HierarchyError(
            error: e,
            onRetry: () => ref.invalidate(flatRoomsProvider(flatId))),
        data: (bundle) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(flatRoomsProvider(flatId));
            ref.invalidate(photosProvider(
                (target: PhotoTarget.flat, targetId: flatId)));
            ref.invalidate(photoOpsProvider(
                (target: PhotoTarget.flat, targetId: flatId)));
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (ctx.crumbs.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child:
                      HierarchyCrumbs(context_: ctx, current: 'Rooms'),
                ),
              _ProgressHeader(
                countLabel: '${bundle.rooms.length} rooms',
                progress:
                    _aggregate(bundle.rooms.map((r) => r.progress)),
              ),
              const SizedBox(height: 20),
              const Text('Rooms',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink)),
              const SizedBox(height: 12),
              if (bundle.rooms.isEmpty)
                const _Empty(what: 'rooms')
              else
                for (final r in bundle.rooms) ...[
                  _ChildCard(
                    title: r.roomName,
                    subtitle: r.roomType ?? 'Room',
                    progress: r.progress,
                    isActive: r.isActive,
                    thirdStatLabel:
                        r.progress?.configured == true ? 'Checklist' : null,
                    thirdStatValue:
                        r.progress?.configured == true ? 'Yes' : null,
                    onTap: () => context
                        .push(
                          Routes.activities(r.id),
                          extra: ctx.withCanUpdate(bundle.canUpdate),
                        )
                        .then((_) {
                      if (context.mounted) {
                        ref.invalidate(flatRoomsProvider(flatId));
                      }
                    }),
                  ),
                  const SizedBox(height: 12),
                ],
              PhotoSection(
                target: PhotoTarget.flat,
                targetId: flatId,
                canUpdate: bundle.canUpdate,
              ),
            ],
          ),
        ),
          ),
        ),
      ]),
    );
  }
}

/// Room detail → activity checklist (read-only statuses).
class RoomDetailScreen extends ConsumerWidget {
  const RoomDetailScreen({super.key, required this.roomId, this.context_});
  final String roomId;
  final HierarchyContext? context_;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ctx = context_ ?? const HierarchyContext();
    final detail = ref.watch(roomDetailProvider(roomId));
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: detail.maybeWhen(
          data: (d) => Text(d.roomName.isEmpty ? 'Room' : d.roomName,
              style: const TextStyle(
                  fontSize: 18, fontWeight: FontWeight.w800)),
          orElse: () => const Text('Room',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        ),
      ),
      body: Column(children: [
        OfflineBanner(cacheKey: roomDetailKey(roomId)),
        Expanded(
          child: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => HierarchyError(
            error: e,
            onRetry: () => ref.invalidate(roomDetailProvider(roomId))),
        data: (d) {
          final p = d.progress;
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(roomDetailProvider(roomId));
              ref.invalidate(photosProvider(
                  (target: PhotoTarget.room, targetId: roomId)));
              ref.invalidate(photoOpsProvider(
                  (target: PhotoTarget.room, targetId: roomId)));
            },
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (ctx.crumbs.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: HierarchyCrumbs(
                        context_: ctx, current: d.roomName),
                  ),
                AppCard(
                  child: Row(
                    children: [
                      ProgressRing(percent: p.percent, size: 60),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(d.roomName,
                                style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.ink)),
                            if (d.roomType != null)
                              Text(d.roomType!,
                                  style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.muted)),
                            const SizedBox(height: 4),
                            Text(
                              d.hasChecklist
                                  ? '${p.completedActivities} of ${p.totalActivities} activities completed'
                                  : 'Progress not configured',
                              style: const TextStyle(
                                  fontSize: 12, color: AppColors.muted),
                            ),
                            if (d.hasChecklist)
                              Text(
                                'Checklist: ${d.checklistName} (v${d.checklistVersion})',
                                style: const TextStyle(
                                    fontSize: 11, color: AppColors.faint),
                              ),
                            if (!d.isActive)
                              const Padding(
                                padding: EdgeInsets.only(top: 6),
                                child: StatusChip(
                                    kind: StatusKind.neutral,
                                    label: 'Inactive'),
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                const Text('Activities',
                    style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: AppColors.ink)),
                const SizedBox(height: 12),
                if (!d.hasChecklist)
                  const AppCard(
                    child: Text(
                      'No checklist assigned to this room in ERP yet.',
                      style: TextStyle(color: AppColors.muted),
                    ),
                  )
                else
                  for (final a in d.activities) ...[
                    _ActivityRow(
                      activity: a,
                      onTap: () => context
                          .push(
                            Routes.activity(a.id),
                            extra: (
                              activity: a,
                              roomId: roomId,
                              canUpdate: d.canUpdate,
                              context_: ctx.withRoom(d.roomName),
                            ),
                          )
                          .then((_) {
                        if (context.mounted) {
                          ref.invalidate(roomDetailProvider(roomId));
                        }
                      }),
                    ),
                    const SizedBox(height: 10),
                  ],
                PhotoSection(
                  target: PhotoTarget.room,
                  targetId: roomId,
                  canUpdate: d.canUpdate,
                ),
              ],
            ),
          );
        },
          ),
        ),
      ]),
    );
  }
}

/// One activity row — name, status chip, last-updated, and any queued
/// offline work (labelled separately from the confirmed status).
class _ActivityRow extends ConsumerWidget {
  const _ActivityRow({required this.activity, this.onTap});
  final RoomActivity activity;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final kind = statusKindOf(activity.status);
    final ops = ref
            .watch(activityOpsProvider(activity.id))
            .value
            ?.where((o) => o.state != OpState.synced)
            .toList() ??
        const <PendingOp>[];
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(activity.name,
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink)),
                if (activity.description != null &&
                    activity.description!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(activity.description!,
                        style: const TextStyle(
                            fontSize: 12, color: AppColors.muted)),
                  ),
                if (activity.updatedAt != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text('Updated ${_ago(activity.updatedAt!)}',
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.faint)),
                  ),
                if (ops.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        for (final o in ops) PendingSyncChip(op: o),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          StatusChip(
              kind: kind, label: activityStatusLabel(activity.status)),
        ],
      ),
    );
  }
}

String _ago(DateTime t) {
  final d = DateTime.now().difference(t.toLocal());
  if (d.inMinutes < 1) return 'just now';
  if (d.inHours < 1) return '${d.inMinutes}m ago';
  if (d.inDays < 1) return '${d.inHours}h ago';
  if (d.inDays < 30) return '${d.inDays}d ago';
  return 'on ${t.toLocal().toString().split(' ').first}';
}

/// Aggregate child rollups for the level header — sums real counts; the
/// bar/ring still renders only when the backend supplied data.
SiteProgress _aggregate(Iterable<SiteProgress?> items) {
  var total = 0, done = 0, conf = 0, unconf = 0, any = false;
  for (final p in items) {
    if (p == null) continue;
    any = true;
    total += p.totalActivities;
    done += p.completedActivities;
    conf += p.configuredRooms;
    unconf += p.unconfiguredRooms;
  }
  if (!any || total == 0) {
    return const SiteProgress(
      totalActivities: 0,
      completedActivities: 0,
      configuredRooms: 0,
      unconfiguredRooms: 0,
      percent: null,
    );
  }
  return SiteProgress(
    totalActivities: total,
    completedActivities: done,
    configuredRooms: conf,
    unconfiguredRooms: unconf,
    percent: done / total * 100,
  );
}
