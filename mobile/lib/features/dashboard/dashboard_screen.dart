import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/models/models.dart';
import '../../core/offline/offline_widgets.dart';
import '../../core/routing/router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../sites/current_site.dart';
import '../sites/site_providers.dart';

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final user = auth is AuthSignedIn ? auth.user : null;
    final sites = ref.watch(assignedSitesProvider);
    final selectedId = ref.watch(currentSiteIdProvider);

    return Scaffold(
      body: sites.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorState(
          message: e is ApiException ? e.message : 'Failed to load sites.',
          onRetry: () => ref.invalidate(assignedSitesProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const _NoAssignments();
          }
          final site = list.firstWhere(
            (s) => s.id == selectedId,
            orElse: () => list.first,
          );
          return RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(assignedSitesProvider);
              ref.invalidate(siteDetailProvider(site.id));
            },
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                _Hero(user: user, onMore: () => context.go(Routes.more)),
                Transform.translate(
                  offset: const Offset(0, -28),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Column(
                      children: [
                        const OfflineBanner(),
                        const SizedBox(height: 10),
                        const PendingOpsBanner(),
                        const SizedBox(height: 10),
                        _CurrentSiteCard(
                          site: site,
                          all: list,
                          onSelect: (id) => ref
                              .read(currentSiteIdProvider.notifier)
                              .state = id,
                        ),
                        const SizedBox(height: 14),
                        _StatsRow(siteId: site.id),
                        const SizedBox(height: 20),
                        _ProgressOverview(site: site),
                        const SizedBox(height: 20),
                        _QuickTiles(siteId: site.id),
                        const SizedBox(height: 20),
                        _BlocksOverview(siteId: site.id),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.user, required this.onMore});
  final MobileUser? user;
  final VoidCallback onMore;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 210,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF1B3A4E), Color(0xFF2E5A75), Color(0xFF3E7291)],
        ),
      ),
      child: Stack(
        children: [
          Positioned(
            right: -30,
            top: 10,
            child: Icon(Icons.apartment,
                size: 200, color: Colors.white.withValues(alpha: 0.08)),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('Welcome',
                                style: TextStyle(
                                    color: Colors.white70, fontSize: 14)),
                            const SizedBox(height: 2),
                            Text(
                              user?.displayName ?? 'Site Staff',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 26,
                                  fontWeight: FontWeight.w800),
                            ),
                            const Text('Track progress. Build better.',
                                style: TextStyle(
                                    color: Colors.white70, fontSize: 13)),
                          ],
                        ),
                      ),
                      IconButton(
                        onPressed: onMore,
                        icon: const Icon(Icons.notifications_outlined,
                            color: Colors.white),
                      ),
                      InitialsAvatar(initials: user?.initials ?? '?'),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CurrentSiteCard extends StatelessWidget {
  const _CurrentSiteCard({
    required this.site,
    required this.all,
    required this.onSelect,
  });
  final AssignedSite site;
  final List<AssignedSite> all;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: all.length > 1 ? () => _showPicker(context) : null,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.blueBg,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.apartment, color: AppColors.blue, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Current Site',
                    style: TextStyle(fontSize: 12, color: AppColors.muted)),
                Text(
                  site.siteName,
                  style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink),
                ),
                if (site.locationLabel.isNotEmpty)
                  Text(
                    site.locationLabel,
                    style:
                        const TextStyle(fontSize: 12, color: AppColors.muted),
                  ),
              ],
            ),
          ),
          if (all.length > 1)
            const Icon(Icons.keyboard_arrow_down, color: AppColors.faint),
        ],
      ),
    );
  }

  void _showPicker(BuildContext context) {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(12),
              child: Text('Switch site',
                  style:
                      TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            ),
            for (final s in all)
              ListTile(
                leading: const Icon(Icons.apartment_outlined),
                title: Text(s.siteName),
                subtitle:
                    s.locationLabel.isEmpty ? null : Text(s.locationLabel),
                trailing: s.id == site.id
                    ? const Icon(Icons.check, color: AppColors.green)
                    : null,
                onTap: () {
                  onSelect(s.id);
                  Navigator.pop(ctx);
                },
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _StatsRow extends ConsumerWidget {
  const _StatsRow({required this.siteId});
  final String siteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(siteDetailProvider(siteId));
    return detail.when(
      loading: () => const Row(children: [
        Expanded(child: _SkeletonTile()),
        SizedBox(width: 10),
        Expanded(child: _SkeletonTile()),
        SizedBox(width: 10),
        Expanded(child: _SkeletonTile()),
      ]),
      error: (_, __) => const SizedBox.shrink(),
      data: (b) => Row(
        children: [
          Expanded(
            child: StatTile(
              icon: Icons.apartment,
              iconColor: AppColors.blue,
              bg: AppColors.blueBg,
              value: '${b.site.wingsCount}',
              label: 'Blocks',
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: StatTile(
              icon: Icons.home_outlined,
              iconColor: AppColors.greenText,
              bg: AppColors.greenBg,
              value: '${b.site.progress.totalRooms}',
              label: 'Rooms',
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: StatTile(
              icon: Icons.leaderboard_outlined,
              iconColor: AppColors.amber,
              bg: AppColors.amberBg,
              value: b.site.progress.percent == null
                  ? '—'
                  : '${b.site.progress.percent!.round()}%',
              label: 'Progress',
            ),
          ),
        ],
      ),
    );
  }
}

class _SkeletonTile extends StatelessWidget {
  const _SkeletonTile();
  @override
  Widget build(BuildContext context) =>
      const AppCard(child: SizedBox(height: 36));
}

class _ProgressOverview extends StatelessWidget {
  const _ProgressOverview({required this.site});
  final AssignedSite site;

  @override
  Widget build(BuildContext context) {
    final p = site.progress;
    final remaining = p.totalActivities - p.completedActivities;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text('Progress Overview',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink)),
            ),
            GestureDetector(
              onTap: () => context.push(Routes.site(site.id)),
              child: const Text('View Details →',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.blue)),
            ),
          ],
        ),
        const SizedBox(height: 12),
        AppCard(
          child: p.configured
              ? SegmentedStatusBar(slices: p.statusCounts != null
                  ? [
                      StatusSlice(
                          label: statusThemeOf(
                                  ActivityStatus.completed)
                              .label,
                          count: p.statusCounts!.completed,
                          color: statusThemeOf(
                                  ActivityStatus.completed)
                              .solid),
                      StatusSlice(
                          label: statusThemeOf(
                                  ActivityStatus.inProgress)
                              .label,
                          count: p.statusCounts!.inProgress,
                          color: statusThemeOf(
                                  ActivityStatus.inProgress)
                              .solid),
                      StatusSlice(
                          label: statusThemeOf(
                                  ActivityStatus.notStarted)
                              .label,
                          count: p.statusCounts!.notStarted,
                          color: statusThemeOf(
                                  ActivityStatus.notStarted)
                              .solid),
                      StatusSlice(
                          label:
                              statusThemeOf(ActivityStatus.onHold)
                                  .label,
                          count: p.statusCounts!.onHold,
                          color: statusThemeOf(
                                  ActivityStatus.onHold)
                              .solid),
                    ]
                  : [
                      StatusSlice(
                          label: 'Completed',
                          count: p.completedActivities,
                          color: AppColors.green),
                      StatusSlice(
                          label: 'Remaining',
                          count: remaining,
                          color: AppColors.faint),
                    ])
              : const Row(
                  children: [
                    Icon(Icons.info_outline,
                        size: 18, color: AppColors.faint),
                    SizedBox(width: 8),
                    Expanded(
                      child: Text('Progress not configured for this site.',
                          style: TextStyle(
                              fontSize: 13, color: AppColors.muted)),
                    ),
                  ],
                ),
        ),
      ],
    );
  }
}

class _QuickTiles extends StatelessWidget {
  const _QuickTiles({required this.siteId});
  final String siteId;

  @override
  Widget build(BuildContext context) {
    final tiles = [
      (Icons.apartment, 'Blocks', AppColors.blueBg, AppColors.blue,
          () => context.push(Routes.site(siteId))),
      (Icons.home_outlined, 'Flats', AppColors.greenBg, AppColors.greenText,
          () => context.push(Routes.site(siteId))),
      (Icons.checklist, 'Activities', AppColors.amberBg, AppColors.amberText,
          () => context.push(Routes.site(siteId))),
      (Icons.leaderboard_outlined, 'Reports', AppColors.purpleBg,
          AppColors.purple, () => context.go(Routes.reports)),
    ];
    return Row(
      children: [
        for (var i = 0; i < tiles.length; i++) ...[
          if (i > 0) const SizedBox(width: 10),
          Expanded(
            child: AppCard(
              onTap: tiles[i].$5,
              padding: const EdgeInsets.symmetric(vertical: 14),
              child: Column(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                        color: tiles[i].$3,
                        borderRadius: BorderRadius.circular(12)),
                    child: Icon(tiles[i].$1, color: tiles[i].$4, size: 20),
                  ),
                  const SizedBox(height: 8),
                  Text(tiles[i].$2,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: AppColors.ink)),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _BlocksOverview extends ConsumerWidget {
  const _BlocksOverview({required this.siteId});
  final String siteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(siteDetailProvider(siteId));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text('Blocks Overview',
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink)),
            ),
            GestureDetector(
              onTap: () => context.push(Routes.site(siteId)),
              child: const Text('View All →',
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: AppColors.blue)),
            ),
          ],
        ),
        const SizedBox(height: 12),
        detail.when(
          loading: () =>
              const AppCard(child: Center(child: CircularProgressIndicator())),
          error: (_, __) => const AppCard(
              child: Text('Could not load blocks.',
                  style: TextStyle(color: AppColors.muted))),
          data: (b) => b.wings.isEmpty
              ? const AppCard(
                  child: Text('No blocks configured in ERP yet.',
                      style: TextStyle(color: AppColors.muted)))
              : Column(
                  children: [
                    for (final w in b.wings.take(4)) ...[
                      _WingRow(wing: w, siteId: siteId),
                      const SizedBox(height: 10),
                    ],
                  ],
                ),
        ),
      ],
    );
  }
}

class _WingRow extends StatelessWidget {
  const _WingRow({required this.wing, required this.siteId});
  final Wing wing;
  final String siteId;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: () => context.push(
        Routes.floors(wing.id),
        extra: HierarchyContext(
          wingName: wing.name.isEmpty ? 'Block ${wing.code}' : wing.name,
        ),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          const ImageThumb(size: 52),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(wing.name.isEmpty ? 'Block ${wing.code}' : wing.name,
                    style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppColors.ink)),
                Text('${wing.floorsCount} floors',
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.muted)),
                const SizedBox(height: 6),
                AppProgressBar(percent: wing.progress?.percent),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Text(
            wing.progress?.percent == null
                ? '—'
                : '${wing.progress!.percent!.round()}%',
            style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w800,
                color: AppColors.ink),
          ),
          const Icon(Icons.chevron_right, color: AppColors.faint),
        ],
      ),
    );
  }
}

class _NoAssignments extends StatelessWidget {
  const _NoAssignments();
  @override
  Widget build(BuildContext context) => const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.apartment_outlined,
                  size: 64, color: AppColors.faint),
              SizedBox(height: 16),
              Text('No sites assigned',
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ink)),
              SizedBox(height: 6),
              Text(
                'Ask your ERP administrator to assign you to a site.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 13, color: AppColors.muted),
              ),
            ],
          ),
        ),
      );
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.cloud_off_outlined,
                  size: 64, color: AppColors.faint),
              const SizedBox(height: 16),
              Text(message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: AppColors.muted)),
              const SizedBox(height: 16),
              PrimaryButton(
                  label: 'Retry', icon: Icons.refresh, onPressed: onRetry),
            ],
          ),
        ),
      );
}
