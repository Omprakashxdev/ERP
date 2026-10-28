import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/models/models.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../../core/offline/offline_state.dart';
import '../../core/offline/offline_widgets.dart';

/// Reports tab — real data from GET /progress/summary (one rollup per
/// assigned site). Per-type exports land in a later brick.
final summaryProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  if (ref.watch(authControllerProvider) is! AuthSignedIn) return const [];
  final dio = ref.watch(dioProvider);
  return cachedFetch(
    ref: ref,
    cacheKey: 'summary',
    fetch: () => dio.get('/progress/summary').then((r) => r.data),
    parse: (data) => ((data['items'] as List?) ?? const [])
        .cast<Map<String, dynamic>>(),
  );
});

class ReportsScreen extends ConsumerWidget {
  const ReportsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(summaryProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const OfflineBanner(cacheKey: 'summary'),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 8, 16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Reports',
                            style: TextStyle(
                                fontSize: 26,
                                fontWeight: FontWeight.w800,
                                color: AppColors.ink)),
                        Text('Progress across your assigned sites',
                            style: TextStyle(
                                fontSize: 13, color: AppColors.muted)),
                      ],
                    ),
                  ),
                  IconButton(
                    onPressed: () => ref.invalidate(summaryProvider),
                    tooltip: 'Refresh',
                    icon: const Icon(Icons.refresh,
                        color: AppColors.muted),
                  ),
                ],
              ),
            ),
            Expanded(
              child: summary.when(
                loading: () =>
                    const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(
                  child: Text(
                    e is ApiException ? e.message : 'Failed to load.',
                    style: const TextStyle(color: AppColors.muted),
                  ),
                ),
                data: (items) => RefreshIndicator(
                  onRefresh: () async =>
                      ref.invalidate(summaryProvider),
                  child: items.isEmpty
                      ? ListView(
                          children: const [
                            SizedBox(height: 120),
                            Center(
                              child: Text('No assigned sites.',
                                  style:
                                      TextStyle(color: AppColors.muted)),
                            ),
                          ],
                        )
                      : ListView.separated(
                          padding:
                              const EdgeInsets.fromLTRB(16, 0, 16, 24),
                          itemCount: items.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 12),
                          itemBuilder: (_, i) {
                          final it = items[i];
                          final p = SiteProgress.fromJson(
                              it['progress'] as Map<String, dynamic>?);
                          return AppCard(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                Row(
                                  children: [
                                    const Icon(Icons.apartment_outlined,
                                        color: AppColors.blue, size: 20),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Text(
                                        '${it['siteName']}',
                                        style: const TextStyle(
                                            fontSize: 15,
                                            fontWeight:
                                                FontWeight.w700,
                                            color: AppColors.ink),
                                      ),
                                    ),
                                    Text(
                                      p.percent == null
                                          ? '—'
                                          : '${p.percent!.round()}%',
                                      style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight:
                                              FontWeight.w800,
                                          color: AppColors.ink),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 10),
                                AppProgressBar(percent: p.percent),
                                const SizedBox(height: 8),
                                Text(
                                  p.configured
                                      ? '${p.completedActivities}/${p.totalActivities} activities · ${p.configuredRooms} configured rooms'
                                      : 'Progress not configured',
                                  style: const TextStyle(
                                      fontSize: 12,
                                      color: AppColors.muted),
                                ),
                              ],
                            ),
                          );
                        },
                      ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
