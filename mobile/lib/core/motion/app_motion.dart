import 'dart:typed_data';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_theme.dart';

/// Central motion contract for the app.
///
/// - Every animation honours Android's "Remove animations" accessibility
///   setting via [MediaQuery.disableAnimations] — motion collapses to
///   instant state changes rather than animating.
/// - Durations stay inside the 150–280 ms band; curves are standard
///   Material decelerate/accelerate pairs. No loops, bounce, blur or
///   shader effects.
class AppMotion {
  AppMotion._();

  static const fast = Duration(milliseconds: 150);
  static const med = Duration(milliseconds: 200);
  static const slow = Duration(milliseconds: 280);

  static bool reduced(BuildContext context) =>
      MediaQuery.of(context).disableAnimations;
}

/// go_router `navigatorContainerBuilder` — keeps every branch Navigator
/// mounted (preserving per-tab stacks and scroll state, exactly like
/// `indexedStack`) while crossfading between the outgoing and incoming
/// branch instead of a hard cut. Under reduced motion it behaves as a
/// plain IndexedStack.
class BranchFadeStack extends StatefulWidget {
  const BranchFadeStack({
    super.key,
    required this.currentIndex,
    required this.children,
  });

  final int currentIndex;
  final List<Widget> children;

  @override
  State<BranchFadeStack> createState() => _BranchFadeStackState();
}

class _BranchFadeStackState extends State<BranchFadeStack>
    with SingleTickerProviderStateMixin {
  late int _current = widget.currentIndex;
  int? _outgoing;
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: AppMotion.med,
    value: 1,
  );

  @override
  void didUpdateWidget(BranchFadeStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.currentIndex == _current) return;
    _outgoing = _current;
    _current = widget.currentIndex;
    if (AppMotion.reduced(context)) {
      _ctrl.value = 1;
      _outgoing = null;
    } else {
      _ctrl.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        final animating = _ctrl.isAnimating;
        final outOpacity =
            animating ? 1.0 - _ctrl.value.clamp(0.0, 1.0) : 0.0;
        return Stack(
          fit: StackFit.expand,
          children: [
            for (var i = 0; i < widget.children.length; i++)
              Offstage(
                offstage: !(i == _current || (i == _outgoing && animating)),
                child: IgnorePointer(
                  ignoring: i != _current || animating,
                  child: ExcludeFocus(
                    excluding: i != _current,
                    child: Opacity(
                      opacity:
                          i == _outgoing ? outOpacity : _ctrl.value,
                      child: TickerMode(
                        enabled: i == _current || animating,
                        child: widget.children[i],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Shared-axis-X style page transition for pushed hierarchy routes —
/// subtle right-to-left slide + fade in, mirrored on the way back.
/// Instant when the platform requests reduced motion.
CustomTransitionPage<T> slideFadePage<T>({
  required Widget child,
  required GoRouterState state,
}) {
  return CustomTransitionPage<T>(
    key: state.pageKey,
    child: child,
    transitionDuration: AppMotion.slow,
    reverseTransitionDuration: AppMotion.med,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      if (AppMotion.reduced(context)) return child;
      final inCurve = CurvedAnimation(
        parent: animation,
        curve: const Cubic(0.05, 0.7, 0.1, 1.0),
      );
      final outCurve = CurvedAnimation(
        parent: secondaryAnimation,
        curve: Curves.easeInCubic,
      );
      return SlideTransition(
        position: Tween(begin: const Offset(-0.03, 0), end: Offset.zero)
            .animate(outCurve),
        child: SlideTransition(
          position: Tween(begin: const Offset(0.05, 0), end: Offset.zero)
              .animate(inCurve),
          child: FadeTransition(opacity: inCurve, child: child),
        ),
      );
    },
  );
}

/// Gentle 900 ms breathing pulse used by skeleton blocks; static under
/// reduced motion.
class _Pulse extends StatefulWidget {
  const _Pulse({required this.child});
  final Widget child;

  @override
  State<_Pulse> createState() => _PulseState();
}

class _PulseState extends State<_Pulse> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && !AppMotion.reduced(context)) {
        _ctrl.repeat(reverse: true);
      } else {
        _ctrl.value = 0.5;
      }
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: Tween(begin: 0.35, end: 0.7).animate(_ctrl),
        child: widget.child,
      );
}

/// Rounded grey placeholder block.
class SkeletonBox extends StatelessWidget {
  const SkeletonBox({
    super.key,
    this.width,
    this.height = 14,
    this.radius = 8,
  });
  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) => _Pulse(
        child: Container(
          width: width,
          height: height,
          decoration: BoxDecoration(
            color: AppColors.hairline,
            borderRadius: BorderRadius.circular(radius),
          ),
        ),
      );
}

/// Card-shaped skeleton matching the app's rounded-card language.
class SkeletonCard extends StatelessWidget {
  const SkeletonCard({super.key, this.height = 96, this.lines = 0});
  final double height;
  final int lines;

  @override
  Widget build(BuildContext context) {
    return AppCardShell(
      child: lines == 0
          ? SkeletonBox(height: height, radius: 10)
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < lines; i++) ...[
                  if (i > 0) const SizedBox(height: 10),
                  SkeletonBox(
                    width: i == 0 ? 160 : null,
                    height: i == 0 ? 16 : 12,
                  ),
                ],
              ],
            ),
    );
  }
}

/// Stacked list skeleton for initial loads.
class ListSkeleton extends StatelessWidget {
  const ListSkeleton({super.key, this.count = 3, this.cardHeight = 110});
  final int count;
  final double cardHeight;

  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: count,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, __) => SkeletonCard(height: cardHeight),
      );
}

/// The AppCard visual shell without tap handling — skeletons must not
/// be interactive.
class AppCardShell extends StatelessWidget {
  const AppCardShell({super.key, required this.child, this.padding});
  final Widget child;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) => Container(
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
}

/// Crossfading image for authenticated cover bytes.
///
/// Holds the last successfully decoded frame while a replacement is
/// being fetched, so a cover swap never blanks to a placeholder —
/// it fades old → new once the new bytes arrive. Also fades the
/// placeholder → first image.
class CoverImage extends StatefulWidget {
  const CoverImage({
    super.key,
    required this.bytes,
    this.fit = BoxFit.cover,
    this.placeholder,
    this.filterQuality = FilterQuality.low,
    this.resetKey,
  });

  final Uint8List? bytes;
  final BoxFit fit;
  final Widget? placeholder;
  final FilterQuality filterQuality;

  /// When this changes the retained frame is dropped — e.g. pass the
  /// site id so switching sites never shows the previous site's photo
  /// while the new one loads.
  final Object? resetKey;

  @override
  State<CoverImage> createState() => _CoverImageState();
}

class _CoverImageState extends State<CoverImage> {
  Uint8List? _shown;

  @override
  void initState() {
    super.initState();
    _shown = widget.bytes;
  }

  @override
  void didUpdateWidget(CoverImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.resetKey != oldWidget.resetKey) {
      _shown = widget.bytes;
    } else if (widget.bytes != null && widget.bytes != _shown) {
      _shown = widget.bytes;
    }
  }

  @override
  Widget build(BuildContext context) {
    final b = _shown;
    if (b == null) {
      return widget.placeholder ?? const SizedBox.shrink();
    }
    final duration = AppMotion.reduced(context)
        ? Duration.zero
        : const Duration(milliseconds: 300);
    return AnimatedSwitcher(
      duration: duration,
      child: Image.memory(
        b,
        key: ValueKey(b.hashCode),
        fit: widget.fit,
        filterQuality: widget.filterQuality,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) =>
            widget.placeholder ?? const SizedBox.shrink(),
      ),
    );
  }
}

/// Animated numeric/duration tween helper for progress fills — animates
/// only when the value changes (no entrance replay on remount).
class AnimatedFraction extends StatefulWidget {
  const AnimatedFraction({super.key, required this.value, required this.builder});
  final double value;
  final Widget Function(BuildContext context, double value) builder;

  @override
  State<AnimatedFraction> createState() => _AnimatedFractionState();
}

class _AnimatedFractionState extends State<AnimatedFraction>
    with SingleTickerProviderStateMixin {
  late double _from = widget.value;
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: AppMotion.slow,
    value: 1,
  );

  @override
  void didUpdateWidget(AnimatedFraction oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value == oldWidget.value) return;
    _from = oldWidget.value;
    if (AppMotion.reduced(context)) {
      _ctrl.value = 1;
      _from = widget.value;
    } else {
      _ctrl.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) => widget.builder(
        context,
        lerpDouble(_from, widget.value, _ctrl.value)!,
      ),
    );
  }
}
