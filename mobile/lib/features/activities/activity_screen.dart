import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/motion/app_motion.dart';
import '../../core/offline/cache_db.dart';
import '../../core/offline/offline_widgets.dart';
import '../../core/offline/sync_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import '../hierarchy/hierarchy_providers.dart';
import '../hierarchy/hierarchy_screens.dart' show HierarchyCrumbs;
import '../photos/photo_providers.dart';
import '../photos/photo_widgets.dart';
import '../reports/reports_screen.dart' show summaryProvider;
import '../sites/site_providers.dart';
import 'activity_providers.dart';

/// Route payload for the activity detail screen.
typedef ActivityDetailArgs = ({
  RoomActivity activity,
  String roomId,
  bool canUpdate,
  HierarchyContext context_,
});

/// Activity detail — read-only status/history for viewers; for
/// `canUpdate` users, a status picker + optional note + Save Progress.
///
/// Concurrency contract: one stable eventId per intended change (regen
/// only when the target status changes or a save completes), a 409 STALE
/// surfaces the server's authoritative status and forces re-review, and
/// the save button is inert while a request is in flight.
class ActivityDetailScreen extends ConsumerStatefulWidget {
  const ActivityDetailScreen({super.key, required this.args});
  final ActivityDetailArgs args;

  @override
  ConsumerState<ActivityDetailScreen> createState() =>
      _ActivityDetailScreenState();
}

class _ActivityDetailScreenState
    extends ConsumerState<ActivityDetailScreen> {
  late ActivityStatus _current = widget.args.activity.status;
  late int _revision = widget.args.activity.revision;
  late ActivityStatus _selected = _current;
  final _note = TextEditingController();
  String? _eventId;
  bool _saving = false;
  String? _conflict;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _pick(ActivityStatus s) {
    setState(() {
      _selected = s;
      _conflict = null;
      // A new intended change gets a fresh operation id.
      _eventId = null;
    });
  }

  void _refreshRelated() {
    final ctx = widget.args.context_;
    ref.invalidate(roomDetailProvider(widget.args.roomId));
    ref.invalidate(activityHistoryProvider(widget.args.activity.id));
    if (ctx.siteId != null) {
      ref.invalidate(siteDetailProvider(ctx.siteId!));
    }
    ref.invalidate(assignedSitesProvider);
    ref.invalidate(summaryProvider);
    // Progress rollups changed at every ancestor level — family
    // invalidation refetches whichever levels are still watched.
    ref.invalidate(flatRoomsProvider);
    ref.invalidate(floorFlatsProvider);
    ref.invalidate(wingFloorsProvider);
  }

  Future<void> _refresh() async {
    _refreshRelated();
    final a = widget.args.activity;
    ref.invalidate(
        photosProvider((target: PhotoTarget.activity, targetId: a.id)));
    ref.invalidate(photoOpsProvider(
        (target: PhotoTarget.activity, targetId: a.id)));
    ref.invalidate(roomDetailProvider(widget.args.roomId));
    await ref.read(roomDetailProvider(widget.args.roomId).future);
  }

  Future<void> _save() async {
    if (_saving) return;
    final note = _note.text.trim();
    if (_selected == _current && note.isEmpty) return;
    setState(() {
      _saving = true;
      _conflict = null;
    });
    final eventId = _eventId ??=
        ref.read(activityUpdaterProvider).newEventId();
    try {
      final res = await ref.read(activityUpdaterProvider).updateStatus(
            activityId: widget.args.activity.id,
            status: _selected,
            expectedRevision: _revision,
            eventId: eventId,
            note: note.isEmpty ? null : note,
          );
      if (!mounted) return;
      setState(() {
        _saving = false;
        _current = res.status;
        _revision = res.revision;
        _selected = res.status;
        _eventId = null;
        _note.clear();
      });
      _refreshRelated();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(res.alreadyApplied
            ? 'Already saved — progress confirmed.'
            : 'Progress saved.'),
        behavior: SnackBarBehavior.floating,
      ));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _saving = false);
      if (e.code == 'NETWORK') {
        // Server unreachable — persist the intended update durably
        // before claiming anything. "Saved on device" only shows
        // after the queue row exists.
        await ref.read(syncServiceProvider).enqueue(
              activityId: widget.args.activity.id,
              status: _selected,
              expectedRevision: _revision,
              note: note.isEmpty ? null : note,
              roomId: widget.args.roomId,
              siteId: widget.args.context_.siteId,
              eventId: eventId,
            );
        if (!mounted) return;
        setState(() {
          _eventId = null;
          _note.clear();
        });
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text(
              'Saved on device — will sync when you are back online.'),
          behavior: SnackBarBehavior.floating,
        ));
        return;
      }
      if (e.status == 409) {
        // Someone else wrote first — surface their confirmed state and
        // make the user review before re-submitting. Never clobber.
        final cur = e.details;
        final curStatus = activityStatusFrom(
            cur?['currentStatus'] as String? ?? cur?['status'] as String?);
        setState(() {
          _conflict = curStatus == ActivityStatus.unknown
              ? 'This activity was just changed by someone else. '
                  'Please review the latest status before saving.'
              : 'This activity was just changed by someone else — it is '
                  'now "${activityStatusLabel(curStatus)}". '
                  'Review and save again if your change still applies.';
          if (curStatus != ActivityStatus.unknown) {
            _current = curStatus;
            _selected = curStatus;
          }
          final rev = (cur?['currentRevision'] as num?)?.toInt();
          if (rev != null) _revision = rev;
        });
        _refreshRelated();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.message),
          behavior: SnackBarBehavior.floating,
        ));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.args.activity;
    final ctx = widget.args.context_;
    final canEdit = widget.args.canUpdate;
    final dirty = _selected != _current || _note.text.trim().isNotEmpty;
    final ops =
        ref.watch(activityOpsProvider(a.id)).valueOrNull ?? const <PendingOp>[];
    // Reconcile the header with the freshest room snapshot — a synced
    // queue or another engineer's change must update the confirmed
    // status without clobbering an in-progress local selection.
    final freshRoom =
        ref.watch(roomDetailProvider(widget.args.roomId)).valueOrNull;
    if (freshRoom != null) {
      final fresh = freshRoom.activities
          .where((x) => x.id == a.id)
          .firstOrNull;
      if (fresh != null && fresh.revision != _revision) {
        final keep = _selected == _current; // picker untouched
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) return;
          setState(() {
            _current = fresh.status;
            _revision = fresh.revision;
            if (keep) _selected = fresh.status;
          });
        });
      }
    }
    final pendingOps = ops
        .where((o) =>
            o.state == OpState.pending || o.state == OpState.syncing)
        .toList();
    final conflictOps =
        ops.where((o) => o.state == OpState.conflict).toList();
    final failedOps =
        ops.where((o) => o.state == OpState.failed).toList();
    return Scaffold(
      appBar: AppBar(
        leading: const BackButton(),
        title: Text(a.name,
            overflow: TextOverflow.ellipsis,
            style:
                const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const OfflineBanner(),
          if (ctx.crumbs.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: HierarchyCrumbs(context_: ctx, current: a.name),
            ),
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(a.name,
                          style: const TextStyle(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: AppColors.ink)),
                    ),
                    StatusChip.activity(_current),
                  ],
                ),
                if ((a.description ?? '').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text(a.description!,
                        style: const TextStyle(
                            fontSize: 13, color: AppColors.muted)),
                  ),
                if (a.updatedAt != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Text('Last updated ${_ago(a.updatedAt!)}',
                        style: const TextStyle(
                            fontSize: 11, color: AppColors.faint)),
                  ),
                if (pendingOps.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: [
                        for (final o in pendingOps)
                          PendingSyncChip(op: o),
                      ],
                    ),
                  ),
              ],
            ),
          ),
          for (final o in conflictOps)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: ConflictCard(op: o),
            ),
          for (final o in failedOps)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: _FailedOpCard(op: o),
            ),
          const SizedBox(height: 20),
          if (canEdit) ...[
            const Text('Update status',
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w800,
                    color: AppColors.ink)),
            const SizedBox(height: 10),
            for (final s in const [
              ActivityStatus.notStarted,
              ActivityStatus.inProgress,
              ActivityStatus.completed,
              ActivityStatus.onHold,
            ])
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _StatusOption(
                  status: s,
                  selected: _selected == s,
                  onTap: _saving ? null : () => _pick(s),
                ),
              ),
            const SizedBox(height: 6),
            TextField(
              controller: _note,
              enabled: !_saving,
              maxLines: 3,
              minLines: 2,
              maxLength: 500,
              onChanged: (_) => setState(() {}),
              decoration: const InputDecoration(
                hintText: 'Progress note (optional)',
                alignLabelWithHint: true,
              ),
            ),
            if (_conflict != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: AppCard(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Icon(Icons.warning_amber_rounded,
                          color: AppColors.amberText, size: 20),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(_conflict!,
                            style: const TextStyle(
                                fontSize: 13, color: AppColors.ink)),
                      ),
                    ],
                  ),
                ),
              ),
            PrimaryButton(
              label: 'Save Progress',
              icon: Icons.check,
              loading: _saving,
              onPressed: dirty ? _save : null,
            ),
          ] else
            const AppCard(
              child: Row(
                children: [
                  Icon(Icons.visibility_outlined,
                      color: AppColors.faint, size: 18),
                  SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      'You have view-only access to this site.',
                      style: TextStyle(fontSize: 13, color: AppColors.muted),
                    ),
                  ),
                ],
              ),
            ),
          PhotoSection(
            target: PhotoTarget.activity,
            targetId: a.id,
            canUpdate: canEdit,
          ),
          const SizedBox(height: 20),
          const Text('History',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink)),
          const SizedBox(height: 10),
          _HistoryList(activityId: a.id),
          const SizedBox(height: 24),
        ],
      ),
      ),
    );
  }
}

class _StatusOption extends StatelessWidget {
  const _StatusOption(
      {required this.status, required this.selected, this.onTap});

  final ActivityStatus status;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final t = statusThemeOf(status);
    return Material(
      color: AppColors.card,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: AnimatedContainer(
          duration: AppMotion.reduced(context)
              ? Duration.zero
              : AppMotion.fast,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? t.bg : AppColors.card,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
                color: selected ? t.solid : AppColors.hairline,
                width: selected ? 1.6 : 1),
          ),
          child: Row(
            children: [
              Icon(t.icon, size: 20, color: t.fg),
              const SizedBox(width: 10),
              Expanded(
                child: Text(t.label,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: selected ? t.fg : AppColors.ink)),
              ),
              AnimatedSwitcher(
                duration: AppMotion.reduced(context)
                    ? Duration.zero
                    : AppMotion.fast,
                child: selected
                    ? Icon(Icons.check_circle,
                        key: const ValueKey('on'),
                        size: 18,
                        color: t.solid)
                    : const SizedBox(
                        key: ValueKey('off'), width: 18, height: 18),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HistoryList extends ConsumerWidget {
  const _HistoryList({required this.activityId});
  final String activityId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final history = ref.watch(activityHistoryProvider(activityId));
    return history.when(
      loading: () => const SkeletonCard(lines: 3),
      error: (_, __) => const SizedBox.shrink(),
      data: (items) {
        if (items.isEmpty) {
          return const AppCard(
            child: Text('No updates recorded yet.',
                style: TextStyle(color: AppColors.muted)),
          );
        }
        return Column(
          children: [
            for (final h in items) ...[
              AppCard(
                padding: const EdgeInsets.all(12),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(statusThemeOf(h.newStatus).icon,
                        size: 18, color: statusThemeOf(h.newStatus).fg),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${activityStatusLabel(h.previousStatus)} → ${activityStatusLabel(h.newStatus)}',
                            style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: AppColors.ink),
                          ),
                          if ((h.note ?? '').isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 3),
                              child: Text(h.note!,
                                  style: const TextStyle(
                                      fontSize: 12, color: AppColors.muted)),
                            ),
                          Padding(
                            padding: const EdgeInsets.only(top: 3),
                            child: Text(
                              '${h.changedBy}${h.createdAt != null ? ' · ${_ago(h.createdAt!)}' : ''}',
                              style: const TextStyle(
                                  fontSize: 11, color: AppColors.faint),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 8),
            ],
          ],
        );
      },
    );
  }
}

/// Permanently-failed queued update — shows the reason and offers
/// Discard (the ERP rejected it, so resubmitting unchanged would just
/// fail again; the employee can re-enter the change deliberately).
class _FailedOpCard extends ConsumerWidget {
  const _FailedOpCard({required this.op});
  final PendingOp op;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.redBg,
        borderRadius: BorderRadius.circular(AppRadius.card),
        border: Border.all(color: AppColors.red.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Update failed to sync: ${activityStatusLabel(op.status)}'
            '${(op.note ?? '').isNotEmpty ? ' — note preserved' : ''}',
            style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: AppColors.ink),
          ),
          if (op.lastError != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(op.lastError!,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.muted)),
            ),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: () =>
                  ref.read(syncServiceProvider).discard(op),
              child: const Text('Discard'),
            ),
          ),
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
