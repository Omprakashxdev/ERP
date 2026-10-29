import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/models/models.dart';
import '../../core/motion/app_motion.dart';
import '../../core/offline/offline_widgets.dart';
import '../../core/routing/router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../reports/reports_screen.dart' show summaryProvider;
import '../sites/current_site.dart';
import '../sites/site_cover.dart';
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
            onRefresh: () => _refresh(ref, site.id),
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                _Hero(
                  user: user,
                  site: site,
                  onMore: () => context.go(Routes.more),
                  onRefresh: () {
                    _refresh(ref, site.id);
                  },
                ),
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

  /// Refreshes every read surface the dashboard draws from — sites,
  /// detail, covers and the reports rollup — so ERP-side edits show up
  /// on one explicit refresh without reinstall/restart. Returns a
  /// future that completes when the site's own reads settle, so the
  /// RefreshIndicator can show an honest duration instead of vanishing
  /// while the network is still working.
  static Future<void> _refresh(WidgetRef ref, String siteId) async {
    ref.invalidate(siteCoverBytesProvider);
    await Future.wait([
      ref.refresh(assignedSitesProvider.future),
      ref.refresh(siteDetailProvider(siteId).future),
      ref.refresh(summaryProvider.future),
    ]);
  }
}

class _Hero extends ConsumerWidget {
  const _Hero({
    required this.user,
    required this.site,
    required this.onMore,
    required this.onRefresh,
  });
  final MobileUser? user;
  final AssignedSite site;
  final VoidCallback onMore;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cover = site.coverImagePath == null
        ? null
        : ref.watch(siteCoverBytesProvider(
            (siteId: site.id, coverKey: site.coverImagePath!)));
    final bytes = cover?.value;
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
        fit: StackFit.expand,
        children: [
          // Current-site cover as the hero background; the navy/teal
          // overlay keeps header text readable over any photo.
          // CoverImage retains + crossfades the last decoded frame, so
          // site switches and cover replacements never blank the hero.
          if (site.coverImagePath != null) ...[
            CoverImage(
              bytes: bytes,
              fit: BoxFit.cover,
              resetKey: site.id,
              placeholder: Align(
                alignment: const Alignment(1.35, -0.85),
                child: Icon(Icons.apartment,
                    size: 200,
                    color: Colors.white.withValues(alpha: 0.08)),
              ),
            ),
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    Color(0xE61B3A4E),
                    Color(0xB32E5A75),
                    Color(0x8C3E7291),
                  ],
                ),
              ),
            ),
          ] else
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
                        onPressed: onRefresh,
                        tooltip: 'Refresh',
                        icon: const Icon(Icons.refresh,
                            color: Colors.white),
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
          SiteCover(
              siteId: site.id, coverKey: site.coverImagePath, size: 44),
          const SizedBox(width: 12),
          Expanded(
            child: AnimatedSwitcher(
              duration: AppMotion.reduced(context)
                  ? Duration.zero
                  : AppMotion.med,
              child: Column(
                key: ValueKey(site.id),
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Current Site',
                      style:
                          TextStyle(fontSize: 12, color: AppColors.muted)),
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
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.muted),
                    ),
                ],
              ),
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
      data: (b) => AnimatedSwitcher(
        duration:
            AppMotion.reduced(context) ? Duration.zero : AppMotion.med,
        child: Row(
          key: ValueKey(siteId),
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
      ),
    );
  }
}

class _SkeletonTile extends StatelessWidget {
  const _SkeletonTile();
  @override
  Widget build(BuildContext context) =>
      const AppCardShell(child: SkeletonBox(height: 36, radius: 10));
}

class _ProgressOverview extends ConsumerWidget {
  const _ProgressOverview({required this.site});
  final AssignedSite site;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
              behavior: HitTestBehavior.opaque,
              onTap: () => context.push(Routes.site(site.id)).then((_) {
                if (context.mounted) {
                  DashboardScreen._refresh(ref, site.id);
                }
              }),
              child: const Padding(
                padding:
                    EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                child: Text('View Details →',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.blue)),
              ),
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

class _QuickTiles extends ConsumerWidget {
  const _QuickTiles({required this.siteId});
  final String siteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    void openSite() {
      context.push(Routes.site(siteId)).then((_) {
        if (context.mounted) DashboardScreen._refresh(ref, siteId);
      });
    }

    final tiles = [
      (Icons.apartment, 'Blocks', AppColors.blueBg, AppColors.blue,
          openSite),
      (Icons.home_outlined, 'Flats', AppColors.greenBg, AppColors.greenText,
          openSite),
      (Icons.checklist, 'Activities', AppColors.amberBg, AppColors.amberText,
          openSite),
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
              behavior: HitTestBehavior.opaque,
              onTap: () => context.push(Routes.site(siteId)).then((_) {
                if (context.mounted) {
                  DashboardScreen._refresh(ref, siteId);
                }
              }),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 8, vertical: 10),
                child: Text('View All →',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: AppColors.blue)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        detail.when(
          loading: () => const SkeletonCard(lines: 2),
          error: (_, __) => const AppCard(
              child: Text('Could not load blocks.',
                  style: TextStyle(color: AppColors.muted))),
          data: (b) => b.wings.isEmpty
              ? const AppCard(
                  child: Text('No blocks configured in ERP yet.',
                      style: TextStyle(color: AppColors.muted)))
              : AnimatedSwitcher(
                  duration: AppMotion.reduced(context)
                      ? Duration.zero
                      : AppMotion.med,
                  child: Column(
                    key: ValueKey(siteId),
                    children: [
                      for (final w in b.wings.take(4)) ...[
                        _WingRow(wing: w, siteId: siteId),
                        const SizedBox(height: 10),
                      ],
                    ],
                  ),
                ),
        ),
      ],
    );
  }
}

class _WingRow extends ConsumerWidget {
  const _WingRow({required this.wing, required this.siteId});
  final Wing wing;
  final String siteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return AppCard(
      onTap: () => context
          .push(
            Routes.floors(wing.id),
            extra: HierarchyContext(
              siteId: siteId,
              wingName:
                  wing.name.isEmpty ? 'Block ${wing.code}' : wing.name,
            ),
          )
          .then((_) {
        if (context.mounted) {
          DashboardScreen._refresh(ref, siteId);
        }
      }),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      child: Row(
        children: [
          SiteCoverById(siteId: siteId, size: 52),
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
