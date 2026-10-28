import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/offline/offline_widgets.dart';
import '../../core/routing/router.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'site_cover.dart';
import 'site_providers.dart';

class SitesScreen extends ConsumerStatefulWidget {
  const SitesScreen({super.key});

  @override
  ConsumerState<SitesScreen> createState() => _SitesScreenState();
}

class _SitesScreenState extends ConsumerState<SitesScreen> {
  String _query = '';
  SiteStatus? _filter;

  @override
  Widget build(BuildContext context) {
    final sites = ref.watch(assignedSitesProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const OfflineBanner(cacheKey: 'sites'),
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 12, 20, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Sites',
                      style: TextStyle(
                          fontSize: 26,
                          fontWeight: FontWeight.w800,
                          color: AppColors.ink)),
                  Text('Select a site to view progress',
                      style:
                          TextStyle(fontSize: 13, color: AppColors.muted)),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: TextField(
                onChanged: (v) => setState(() => _query = v),
                decoration: const InputDecoration(
                  hintText: 'Search site name, location...',
                  prefixIcon:
                      Icon(Icons.search, color: AppColors.faint, size: 20),
                ),
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(
                children: [
                  _FilterChip(
                    label: 'All Sites',
                    icon: Icons.apartment,
                    selected: _filter == null,
                    onTap: () => setState(() => _filter = null),
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Ongoing',
                    dot: AppColors.blue,
                    selected: _filter == SiteStatus.active,
                    onTap: () =>
                        setState(() => _filter = SiteStatus.active),
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'Completed',
                    dot: AppColors.green,
                    selected: _filter == SiteStatus.completed,
                    onTap: () =>
                        setState(() => _filter = SiteStatus.completed),
                  ),
                  const SizedBox(width: 8),
                  _FilterChip(
                    label: 'On Hold',
                    dot: AppColors.amber,
                    selected: _filter == SiteStatus.onHold,
                    onTap: () =>
                        setState(() => _filter = SiteStatus.onHold),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: sites.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      e is ApiException ? e.message : 'Failed to load.',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: AppColors.muted),
                    ),
                  ),
                ),
                data: (list) {
                  final filtered = list.where((s) {
                    final q = _query.trim().toLowerCase();
                    final matchQ = q.isEmpty ||
                        s.siteName.toLowerCase().contains(q) ||
                        s.locationLabel.toLowerCase().contains(q) ||
                        s.siteCode.toLowerCase().contains(q);
                    final matchF = _filter == null || s.status == _filter;
                    return matchQ && matchF;
                  }).toList();
                  if (filtered.isEmpty) {
                    return Center(
                      child: Text(
                        list.isEmpty
                            ? 'No sites assigned yet.'
                            : 'No sites match your search.',
                        style: const TextStyle(color: AppColors.muted),
                      ),
                    );
                  }
                  return RefreshIndicator(
                    onRefresh: () async {
                      ref.invalidate(assignedSitesProvider);
                      for (final s in filtered) {
                        ref.invalidate(siteCoverBytesProvider(s.id));
                      }
                    },
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (_, i) => _SiteCard(site: filtered[i]),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.icon,
    this.dot,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final IconData? icon;
  final Color? dot;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        decoration: BoxDecoration(
          color: selected ? AppColors.navy : Colors.white,
          borderRadius: BorderRadius.circular(99),
          border: Border.all(
              color: selected ? AppColors.navy : AppColors.hairline),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Icon(icon,
                  size: 15,
                  color: selected ? Colors.white : AppColors.muted),
              const SizedBox(width: 6),
            ],
            if (dot != null) ...[
              Container(
                width: 8,
                height: 8,
                decoration:
                    BoxDecoration(color: dot, shape: BoxShape.circle),
              ),
              const SizedBox(width: 6),
            ],
            Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : AppColors.muted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SiteCard extends StatelessWidget {
  const _SiteCard({required this.site});
  final AssignedSite site;

  @override
  Widget build(BuildContext context) {
    final p = site.progress;
    return AppCard(
      onTap: () => context.push(Routes.site(site.id)),
      padding: const EdgeInsets.all(14),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SiteCover(
                  siteId: site.id,
                  hasCover: site.coverUrl != null,
                  size: 76),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            site.siteName,
                            style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: AppColors.ink),
                          ),
                        ),
                        const Icon(Icons.chevron_right,
                            color: AppColors.faint, size: 20),
                      ],
                    ),
                    if (site.locationLabel.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Row(
                          children: [
                            const Icon(Icons.location_on_outlined,
                                size: 13, color: AppColors.muted),
                            const SizedBox(width: 2),
                            Expanded(
                              child: Text(
                                site.locationLabel,
                                style: const TextStyle(
                                    fontSize: 12, color: AppColors.muted),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                            child:
                                AppProgressBar(percent: p.percent)),
                        const SizedBox(width: 10),
                        Text(
                          p.percent == null
                              ? '—'
                              : '${p.percent!.round()}%',
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
            ],
          ),
          const SizedBox(height: 12),
          Container(
            padding:
                const EdgeInsets.symmetric(vertical: 10, horizontal: 8),
            decoration: BoxDecoration(
              color: AppColors.background,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                _stat(Icons.checklist, '${p.totalActivities}', 'Activities'),
                _vsep(),
                _stat(Icons.check_circle_outline,
                    '${p.completedActivities}', 'Completed'),
                _vsep(),
                _stat(Icons.home_work_outlined, '${p.totalRooms}', 'Rooms'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _vsep() => Container(
      width: 1, height: 24, color: AppColors.hairline,
      margin: const EdgeInsets.symmetric(horizontal: 4));

  Widget _stat(IconData icon, String value, String label) => Expanded(
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 15, color: AppColors.muted),
            const SizedBox(width: 6),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w800,
                        color: AppColors.ink)),
                Text(label,
                    style: const TextStyle(
                        fontSize: 10, color: AppColors.muted)),
              ],
            ),
          ],
        ),
      );
}
