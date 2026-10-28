import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_theme.dart';
import 'site_providers.dart';

/// Bearer-authenticated site cover thumbnail — same visual contract as
/// ImageThumb (rounded well, building icon fallback) but fetches bytes
/// through the authed client because covers are never served publicly.
class SiteCover extends ConsumerWidget {
  const SiteCover({
    super.key,
    required this.siteId,
    required this.hasCover,
    this.size = 56,
  });

  final String siteId;

  /// From `coverUrl` — skip the request entirely when the site has none.
  final bool hasCover;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: size,
        height: size,
        color: const Color(0xFFDDE4EC),
        child: !hasCover
            ? const Icon(Icons.apartment, color: AppColors.faint, size: 26)
            : _covered(context, ref),
      ),
    );
  }

  Widget _covered(BuildContext context, WidgetRef ref) {
    final bytes = ref.watch(siteCoverBytesProvider(siteId));
    return bytes.when(
      data: (b) => b == null
          ? const Icon(Icons.apartment, color: AppColors.faint, size: 26)
          : Image.memory(
              b,
              fit: BoxFit.cover,
              gaplessPlayback: true,
              // Stored bytes could be unreadable — fall back to the icon
              // rather than leaving an unexplained empty well.
              errorBuilder: (_, __, ___) => const Icon(
                  Icons.apartment, color: AppColors.faint, size: 26),
            ),
      loading: () => const Center(
        child: SizedBox(
          width: 16,
          height: 16,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
      ),
      error: (_, __) =>
          const Icon(Icons.apartment, color: AppColors.faint, size: 26),
    );
  }
}
