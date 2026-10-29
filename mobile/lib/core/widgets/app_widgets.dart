import 'package:flutter/material.dart';

import '../models/models.dart';
import '../motion/app_motion.dart';
import '../theme/app_theme.dart';

/// White rounded card used everywhere in the reference design.
class AppCard extends StatelessWidget {
  const AppCard({super.key, required this.child, this.padding, this.onTap});

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: BorderRadius.circular(AppRadius.card),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F0F2230),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      padding: padding ?? const EdgeInsets.all(16),
      child: child,
    );
    if (onTap == null) return card;
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadius.card),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadius.card),
        onTap: onTap,
        child: card,
      ),
    );
  }
}

/// Linear progress bar — 6px, rounded, grey track.
class AppProgressBar extends StatelessWidget {
  const AppProgressBar({super.key, this.percent, this.color = AppColors.green});

  /// 0–100, null renders an empty track ("not configured").
  final double? percent;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final target = percent == null ? 0.0 : percent!.clamp(0, 100) / 100;
    return ClipRRect(
      borderRadius: BorderRadius.circular(99),
      child: SizedBox(
        height: 6,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Container(color: AppColors.hairline),
            if (percent != null)
              AnimatedFraction(
                value: target,
                builder: (context, v) => FractionallySizedBox(
                  widthFactor: v,
                  alignment: Alignment.centerLeft,
                  child: Container(color: color),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// One legend entry of the segmented distribution bar.
class StatusSlice {
  const StatusSlice({
    required this.label,
    required this.count,
    required this.color,
  });
  final String label;
  final int count;
  final Color color;

  double fractionOf(int total) => total == 0 ? 0 : count / total;
}

/// Multi-segment distribution bar (Yet-to-start / In-progress / Completed /
/// On-hold in the reference; renders whatever real counts it's given).
class SegmentedStatusBar extends StatelessWidget {
  const SegmentedStatusBar({super.key, required this.slices});

  final List<StatusSlice> slices;

  int get total => slices.fold(0, (s, e) => s + e.count);

  @override
  Widget build(BuildContext context) {
    final t = total;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(
          label: t == 0
              ? 'No activity progress recorded yet'
              : 'Progress distribution: ${slices.map((s) => '${s.label} ${(100 * s.count / t).round()} percent').join(', ')}',
          child: ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: SizedBox(
              height: 10,
              width: double.infinity,
              child: t == 0
                  ? Container(color: AppColors.hairline)
                  : LayoutBuilder(
                      builder: (context, c) => Row(
                        children: [
                          for (final s in slices)
                            if (s.count > 0)
                              AnimatedFraction(
                                value: s.fractionOf(t),
                                builder: (context, v) => Container(
                                  width: v * c.maxWidth,
                                  color: s.color,
                                ),
                              ),
                        ],
                      ),
                    ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 16,
          runSpacing: 8,
          children: [
            for (final s in slices)
              _Legend(slice: s, total: t),
          ],
        ),
      ],
    );
  }
}

class _Legend extends StatelessWidget {
  const _Legend({required this.slice, required this.total});
  final StatusSlice slice;
  final int total;

  @override
  Widget build(BuildContext context) {
    final pct =
        total == 0 ? 0 : (100 * slice.count / total).round();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration:
                  BoxDecoration(color: slice.color, shape: BoxShape.circle),
            ),
            const SizedBox(width: 6),
            Text(slice.label,
                style: const TextStyle(fontSize: 12, color: AppColors.muted)),
          ],
        ),
        Padding(
          padding: const EdgeInsets.only(left: 14),
          child: Text(
            '$pct% (${slice.count})',
            style: const TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700, color: AppColors.ink),
          ),
        ),
      ],
    );
  }
}

/// Circular ring gauge ("68%") used on block/flat cards.
class ProgressRing extends StatelessWidget {
  const ProgressRing({super.key, this.percent, this.size = 44});

  final double? percent;
  final double size;

  @override
  Widget build(BuildContext context) {
    final p = percent;
    return SizedBox(
      width: size,
      height: size,
      child: AnimatedFraction(
        value: p == null ? 0 : p.clamp(0, 100) / 100,
        builder: (context, v) => Stack(
          alignment: Alignment.center,
          children: [
            CircularProgressIndicator(
              value: v,
              strokeWidth: 5,
              backgroundColor: AppColors.hairline,
              valueColor: const AlwaysStoppedAnimation(AppColors.green),
              strokeCap: StrokeCap.round,
            ),
            Text(
              p == null ? '—' : '${(v * 100).round()}%',
              style: TextStyle(
                fontSize: size * 0.26,
                fontWeight: FontWeight.w700,
                color: AppColors.ink,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Activity/site status pill.
enum StatusKind { yetToStart, inProgress, completed, onHold, neutral }

/// Centralized semantic status styling — every status surface (chips,
/// pickers, bars, legends) must derive colors/icons/labels from here so
/// statuses never diverge across screens.
class StatusTheme {
  const StatusTheme({
    required this.bg,
    required this.fg,
    required this.solid,
    required this.icon,
    required this.label,
  });

  final Color bg;
  final Color fg;
  final Color solid;
  final IconData icon;
  final String label;
}

StatusTheme statusThemeOfKind(StatusKind kind) => switch (kind) {
      StatusKind.completed => const StatusTheme(
          bg: AppColors.greenBg,
          fg: AppColors.greenText,
          solid: AppColors.green,
          icon: Icons.check_circle,
          label: 'Completed'),
      StatusKind.inProgress => const StatusTheme(
          bg: AppColors.amberBg,
          fg: AppColors.amberText,
          solid: AppColors.amber,
          icon: Icons.timelapse,
          label: 'In Progress'),
      StatusKind.onHold => const StatusTheme(
          bg: AppColors.redBg,
          fg: AppColors.redText,
          solid: AppColors.red,
          icon: Icons.pause_circle,
          label: 'On Hold'),
      StatusKind.yetToStart => const StatusTheme(
          bg: Color(0xFFF1F5F9),
          fg: Color(0xFF64748B),
          solid: Color(0xFF94A3B8),
          icon: Icons.radio_button_unchecked,
          label: 'Yet to start'),
      StatusKind.neutral => const StatusTheme(
          bg: Color(0xFFF1F5F9),
          fg: Color(0xFF64748B),
          solid: Color(0xFF94A3B8),
          icon: Icons.circle_outlined,
          label: '—'),
    };

StatusKind statusKindOf(ActivityStatus s) => switch (s) {
      ActivityStatus.completed => StatusKind.completed,
      ActivityStatus.inProgress => StatusKind.inProgress,
      ActivityStatus.onHold => StatusKind.onHold,
      ActivityStatus.notStarted => StatusKind.yetToStart,
      ActivityStatus.unknown => StatusKind.neutral,
    };

StatusTheme statusThemeOf(ActivityStatus s) =>
    statusThemeOfKind(statusKindOf(s));

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.kind, required this.label});

  factory StatusChip.activity(ActivityStatus status) => StatusChip(
      kind: statusKindOf(status), label: activityStatusLabel(status));

  final StatusKind kind;
  final String label;

  @override
  Widget build(BuildContext context) {
    final t = statusThemeOfKind(kind);
    final (bg, fg, icon) = (t.bg, t.fg, t.icon);
    final d = AppMotion.reduced(context) ? Duration.zero : AppMotion.fast;
    return AnimatedContainer(
      duration: d,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(99)),
      child: AnimatedSwitcher(
        duration: d,
        child: Row(
          key: ValueKey('$kind|$label'),
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: fg),
            const SizedBox(width: 5),
            Text(
              label,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: fg),
            ),
          ],
        ),
      ),
    );
  }
}

/// Tinted icon tile + big number (Blocks / Total Flats / Overall chips).
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.bg,
    required this.value,
    required this.label,
  });

  final IconData icon;
  final Color iconColor;
  final Color bg;
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: iconColor),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink),
                ),
                FittedBox(
                  fit: BoxFit.scaleDown,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    label,
                    maxLines: 1,
                    style: const TextStyle(
                        fontSize: 11, color: AppColors.muted),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Initials avatar (OD in the mock).
class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar({super.key, required this.initials, this.size = 40});

  final String initials;
  final double size;

  @override
  Widget build(BuildContext context) {
    return CircleAvatar(
      radius: size / 2,
      backgroundColor: AppColors.navy,
      child: Text(
        initials,
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: size * 0.36,
        ),
      ),
    );
  }
}

/// Square image well — real photo when a URL exists, neutral building
/// placeholder otherwise (never a fabricated photo).
class ImageThumb extends StatelessWidget {
  const ImageThumb({super.key, this.size = 56, this.url});

  final double size;
  final String? url;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Container(
        width: size,
        height: size,
        color: const Color(0xFFDDE4EC),
        child: url == null
            ? const Icon(Icons.apartment, color: AppColors.faint, size: 26)
            : Image.network(url!, fit: BoxFit.cover),
      ),
    );
  }
}

/// Dark navy primary button ("Update Progress", "Sign in").
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({
    super.key,
    required this.label,
    this.icon,
    this.onPressed,
    this.loading = false,
  });

  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton.icon(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.navy,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.navy.withValues(alpha: 0.6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle:
              const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        ),
        onPressed: loading ? null : onPressed,
        icon: AnimatedSwitcher(
          duration: AppMotion.reduced(context)
              ? Duration.zero
              : AppMotion.fast,
          child: loading
              ? const SizedBox(
                  key: ValueKey('loading'),
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : Icon(icon ?? Icons.arrow_forward,
                  key: const ValueKey('icon'), size: 18),
        ),
        label: Text(label),
      ),
    );
  }
}
