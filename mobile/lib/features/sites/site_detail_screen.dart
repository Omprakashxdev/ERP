import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/offline/offline_widgets.dart';
import '../../core/offline/sync_providers.dart';
import '../../core/routing/router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../photos/photo_providers.dart';
import '../photos/photo_widgets.dart';
import 'site_providers.dart';

/// Site detail — the "Select a block" screen from the reference design.
/// Lists wings (blocks) with live progress; floors land in the next brick.
class SiteDetailScreen extends ConsumerWidget {
  const SiteDetailScreen({super.key, required this.siteId});
  final String siteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detail = ref.watch(siteDetailProvider(siteId));
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: detail.maybeWhen(
          data: (b) => Text(b.site.siteName,
              style:
                  const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          orElse: () => const Text('Site'),
        ),
      ),
      body: Column(children: [
        OfflineBanner(cacheKey: siteDetailKey(siteId)),
        Expanded(
          child: detail.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text(
            e is ApiException ? e.message : 'Failed to load site.',
            style: const TextStyle(color: AppColors.muted),
          ),
        ),
        data: (b) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(siteDetailProvider(siteId));
            ref.invalidate(siteCoverBytesProvider(siteId));
            ref.invalidate(photosProvider(
                (target: PhotoTarget.site, targetId: siteId)));
            ref.invalidate(photoOpsProvider(
                (target: PhotoTarget.site, targetId: siteId)));
          },
          child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (b.site.coverUrl != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: _CoverBanner(siteId: siteId),
              ),
            AppCard(
              child: Row(
                children: [
                  ProgressRing(percent: b.site.progress.percent, size: 64),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('${b.site.wingsCount} blocks',
                            style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: AppColors.ink)),
                        const SizedBox(height: 2),
                        Text(
                          b.site.progress.configured
                              ? '${b.site.progress.completedActivities} of ${b.site.progress.totalActivities} activities completed'
                              : 'Progress not configured',
                          style: const TextStyle(
                              fontSize: 12, color: AppColors.muted),
                        ),
                        if (b.site.progress.unconfiguredRooms > 0)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text(
                              '${b.site.progress.unconfiguredRooms} rooms have no checklist',
                              style: const TextStyle(
                                  fontSize: 11,
                                  color: AppColors.amberText),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 20),
            const Text('Blocks',
                style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink)),
            const SizedBox(height: 12),
            if (b.wings.isEmpty)
              const AppCard(
                child: Text('No blocks configured in ERP yet.',
                    style: TextStyle(color: AppColors.muted)),
              )
            else
              for (final w in b.wings) ...[
                _WingCard(
                    wing: w,
                    siteName: b.site.siteName,
                    siteId: siteId,
                    canUpdate: b.canUpdate),
                const SizedBox(height: 12),
              ],
            PhotoSection(
              target: PhotoTarget.site,
              targetId: siteId,
              canUpdate: b.canUpdate,
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

/// Full-width cover banner above the site summary — hides itself when
/// the cover bytes are unavailable rather than showing a broken frame.
class _CoverBanner extends ConsumerWidget {
  const _CoverBanner({required this.siteId});
  final String siteId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bytes = ref.watch(siteCoverBytesProvider(siteId));
    return bytes.maybeWhen(
      data: (b) => b == null
          ? const SizedBox.shrink()
          : ClipRRect(
              borderRadius: BorderRadius.circular(16),
              child: AspectRatio(
                aspectRatio: 16 / 9,
                child: Image.memory(b, fit: BoxFit.cover),
              ),
            ),
      orElse: () => const SizedBox.shrink(),
    );
  }
}

class _WingCard extends StatelessWidget {
  const _WingCard({
    required this.wing,
    required this.siteName,
    required this.siteId,
    required this.canUpdate,
  });
  final Wing wing;
  final String siteName;
  final String siteId;
  final bool canUpdate;

  @override
  Widget build(BuildContext context) {
    final p = wing.progress;
    final label = wing.name.isEmpty ? 'Block ${wing.code}' : wing.name;
    return AppCard(
      onTap: () => context.push(
        Routes.floors(wing.id),
        extra: HierarchyContext(
            siteId: siteId,
            siteName: siteName,
            wingName: label,
            canUpdate: canUpdate),
      ),
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            children: [
              const ImageThumb(size: 64),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: AppColors.ink),
                    ),
                    Text('${wing.floorsCount} floors',
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
              if (p?.percent != null)
                ProgressRing(percent: p!.percent, size: 40),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              _mini('${p?.totalActivities ?? 0}', 'Activities'),
              _mini('${p?.completedActivities ?? 0}', 'Done'),
              _mini('${p?.totalRooms ?? 0}', 'Rooms'),
              if (!wing.isActive)
                const StatusChip(kind: StatusKind.neutral, label: 'Inactive'),
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
                style:
                    const TextStyle(fontSize: 10, color: AppColors.muted)),
          ],
        ),
      );
}
