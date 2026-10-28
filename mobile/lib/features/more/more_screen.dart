import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/env.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/offline/sync_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';

/// More tab — profile + sign out (session revocation via /auth/logout).
class MoreScreen extends ConsumerStatefulWidget {
  const MoreScreen({super.key});

  @override
  ConsumerState<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends ConsumerState<MoreScreen> {
  bool _refreshing = false;

  /// Explicit refresh of every read surface + a queue drain — the
  /// visible "make sure I have the latest ERP data" action.
  Future<void> _refreshNow(WidgetRef ref) async {
    setState(() => _refreshing = true);
    try {
      refreshAllReads(ref);
      await ref.read(syncServiceProvider).syncNow();
    } finally {
      if (mounted) setState(() => _refreshing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final user = auth is AuthSignedIn ? auth.user : null;
    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(4, 0, 4, 16),
              child: Text('More',
                  style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: AppColors.ink)),
            ),
            AppCard(
              child: Row(
                children: [
                  InitialsAvatar(
                      initials: user?.initials ?? '?', size: 52),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(user?.displayName ?? '',
                            style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w800,
                                color: AppColors.ink)),
                        Text(user?.email ?? '',
                            style: const TextStyle(
                                fontSize: 12,
                                color: AppColors.muted)),
                        const SizedBox(height: 4),
                        const StatusChip(
                            kind: StatusKind.completed,
                            label: 'Field staff'),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            AppCard(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Connection',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink)),
                  const SizedBox(height: 6),
                  Text(
                    Env.apiBaseUrl,
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.muted),
                  ),
                  if (Env.isDev)
                    const Text(
                      'Development backend (emulator loopback)',
                      style: TextStyle(
                          fontSize: 11, color: AppColors.faint),
                    ),
                  const SizedBox(height: 10),
                  OutlinedButton.icon(
                    onPressed: _refreshing ? null : () => _refreshNow(ref),
                    icon: const Icon(Icons.refresh, size: 18),
                    label: Text(_refreshing
                        ? 'Refreshing…'
                        : 'Refresh data now'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            PrimaryButton(
              label: 'Sign Out',
              icon: Icons.logout,
              onPressed: () => _confirmSignOut(context, ref),
            ),
          ],
        ),
      ),
    );
  }

  /// Unsynced work is never silently discarded — signing out keeps it
  /// durable under this user's namespace, but the user must hear that
  /// explicitly before leaving the account.
  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final pending =
        await ref.read(unsyncedCountProvider.future).catchError((_) => 0);
    if (!context.mounted) return;
    var proceed = true;
    if (pending > 0) {
      proceed = await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: const Text('Unsynced work on this device'),
              content: Text('$pending update${pending == 1 ? '' : 's'} '
                  'or photo${pending == 1 ? '' : 's'} have not synced '
                  'yet. Signing out keeps them safely under your '
                  'account — they will upload next time you sign in '
                  'and go online.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.of(ctx).pop(false),
                    child: const Text('Stay signed in')),
                FilledButton(
                    onPressed: () => Navigator.of(ctx).pop(true),
                    child: const Text('Sign out')),
              ],
            ),
          ) ??
          false;
    }
    if (proceed) {
      await ref.read(authControllerProvider.notifier).logout();
    }
  }
}
