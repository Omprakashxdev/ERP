import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/motion/app_motion.dart';
import '../../core/theme/app_theme.dart';
import 'site_providers.dart';

/// Bearer-authenticated site cover thumbnail — same visual contract as
/// ImageThumb (rounded well, building icon fallback) but fetches bytes
/// through the authed client because covers are never served publicly.
class SiteCover extends ConsumerWidget {
  const SiteCover({
    super.key,
    required this.siteId,
    required this.coverKey,
    this.size = 56,
  });

  final String siteId;

  /// The site's `coverImagePath` — null means no cover (icon, no
  /// request). It doubles as the provider's cache key, so a replaced
  /// cover refetches instead of showing the old image.
  final String? coverKey;
  final double size;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: size,
        height: size,
        color: const Color(0xFFDDE4EC),
        child: coverKey == null
            ? const Icon(Icons.apartment, color: AppColors.faint, size: 26)
            : _covered(context, ref),
      ),
    );
  }

  Widget _covered(BuildContext context, WidgetRef ref) {
    final bytes = ref
        .watch(siteCoverBytesProvider((siteId: siteId, coverKey: coverKey!)));
    // CoverImage retains the last decoded frame, so a refresh (or a
    // cover replacement under a new key) crossfades instead of
    // blanking back to the placeholder.
    return CoverImage(
      bytes: bytes.valueOrNull,
      fit: BoxFit.cover,
      placeholder: const _CoverPlaceholder(),
    );
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder();
  @override
  Widget build(BuildContext context) =>
      const Icon(Icons.apartment, color: AppColors.faint, size: 26);
}
