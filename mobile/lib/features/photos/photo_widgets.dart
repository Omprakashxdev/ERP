import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/api/api_client.dart';
import '../../core/models/models.dart';
import '../../core/offline/cache_db.dart';
import '../../core/offline/offline_state.dart';
import '../../core/offline/photo_files.dart';
import '../../core/offline/sync_providers.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/app_widgets.dart';
import 'photo_providers.dart';

/// Photo strip shown on site/flat/room/activity screens — real uploads
/// from the ERP photo API. Hidden entirely when there is nothing to show
/// and the user cannot update.
class PhotoSection extends ConsumerWidget {
  const PhotoSection({
    super.key,
    required this.target,
    required this.targetId,
    required this.canUpdate,
  });

  final PhotoTarget target;
  final String targetId;
  final bool canUpdate;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = (target: target, targetId: targetId);
    // Offline/error keeps the section alive — queued photos and the
    // Add Photo affordance must work without a server round-trip;
    // only the confirmed list is absent.
    final items =
        ref.watch(photosProvider(key)).valueOrNull ?? const <ProgressPhoto>[];
    final queued =
        ref.watch(photoOpsProvider(key)).valueOrNull ?? const <PhotoOp>[];
    {
      if (items.isEmpty && queued.isEmpty && !canUpdate) {
        return const SizedBox.shrink();
      }
      return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 20),
            Row(
              children: [
                const Expanded(
                  child: Text('Photos',
                      style: TextStyle(
                          fontSize: 17,
                          fontWeight: FontWeight.w800,
                          color: AppColors.ink)),
                ),
                if (canUpdate)
                  TextButton.icon(
                    onPressed: () => _openUpload(
                        context, ref, target, targetId),
                    icon: const Icon(Icons.add_a_photo_outlined, size: 16),
                    label: const Text('Add Photo'),
                    style: TextButton.styleFrom(
                        foregroundColor: AppColors.navy,
                        textStyle: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w700)),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            if (items.isEmpty && queued.isEmpty)
              const AppCard(
                child: Row(
                  children: [
                    Icon(Icons.photo_library_outlined,
                        color: AppColors.faint, size: 20),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text('No photos yet.',
                          style: TextStyle(color: AppColors.muted)),
                    ),
                  ],
                ),
              )
            else
              SizedBox(
                height: 76,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: queued.length + items.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 10),
                  itemBuilder: (_, i) => i < queued.length
                      ? _QueuedPhotoThumb(op: queued[i])
                      : _PhotoThumb(photo: items[i - queued.length]),
                ),
              ),
          ],
        );
    }
  }

  void _openUpload(BuildContext context, WidgetRef ref, PhotoTarget target,
      String targetId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => PhotoUploadSheet(target: target, targetId: targetId),
    ).then((uploaded) {
      if (uploaded == true) {
        ref.invalidate(
            photosProvider((target: target, targetId: targetId)));
      }
    });
  }
}

class _PhotoThumb extends ConsumerWidget {
  const _PhotoThumb({required this.photo});
  final ProgressPhoto photo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bytes = ref.watch(photoBytesProvider(photo.id));
    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => PhotoViewerPage(photo: photo)),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 76,
          height: 76,
          color: AppColors.hairline,
          child: bytes.when(
            loading: () => const Center(
                child: SizedBox(
                    width: 18,
                    height: 18,
                    child:
                        CircularProgressIndicator(strokeWidth: 2))),
            error: (_, __) => const Icon(Icons.broken_image_outlined,
                color: AppColors.faint),
            data: (b) =>
                Image.memory(b, fit: BoxFit.cover, gaplessPlayback: true),
          ),
        ),
      ),
    );
  }
}

/// Full-screen viewer — pinch-zoomable image plus caption metadata.
class PhotoViewerPage extends ConsumerWidget {
  const PhotoViewerPage({super.key, required this.photo});
  final ProgressPhoto photo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final bytes = ref.watch(photoBytesProvider(photo.id));
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Photo'),
      ),
      body: Column(
        children: [
          Expanded(
            child: bytes.when(
              loading: () => const Center(
                  child: CircularProgressIndicator(color: Colors.white)),
              error: (e, _) => Center(
                  child: Text(
                      e is ApiException ? e.message : 'Failed to load photo.',
                      style: const TextStyle(color: Colors.white70))),
              data: (b) => InteractiveViewer(
                child: Center(child: Image.memory(b, gaplessPlayback: true)),
              ),
            ),
          ),
          if ((photo.caption ?? '').isNotEmpty ||
              (photo.uploadedBy ?? '').isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              color: Colors.black87,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if ((photo.caption ?? '').isNotEmpty)
                    Text(photo.caption!,
                        style: const TextStyle(
                            color: Colors.white, fontSize: 14)),
                  Text(
                    [
                      if ((photo.uploadedBy ?? '').isNotEmpty)
                        'by ${photo.uploadedBy}',
                      if (photo.uploadedAt != null)
                        photo.uploadedAt!.toLocal().toString().substring(0, 16),
                    ].join(' · '),
                    style: const TextStyle(
                        color: Colors.white60, fontSize: 12),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// Bottom sheet: pick camera/gallery → preview → optional caption →
/// upload with progress. One [clientEventId] per sheet session is reused
/// across retries so a lost response never creates a duplicate photo.
class PhotoUploadSheet extends ConsumerStatefulWidget {
  const PhotoUploadSheet(
      {super.key, required this.target, required this.targetId});

  final PhotoTarget target;
  final String targetId;

  @override
  ConsumerState<PhotoUploadSheet> createState() => _PhotoUploadSheetState();
}

class _PhotoUploadSheetState extends ConsumerState<PhotoUploadSheet> {
  XFile? _picked;
  Uint8List? _preview;
  final _caption = TextEditingController();
  bool _uploading = false;
  bool _savedOnDevice = false;
  double _progress = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _recoverLostPicker();
  }

  /// Android may kill the app while the camera is open — the result is
  /// then delivered via retrieveLostData instead of pickImage's return.
  Future<void> _recoverLostPicker() async {
    try {
      final lost = await ImagePicker().retrieveLostData();
      if (!mounted || _picked != null || lost.isEmpty) return;
      final file = lost.file;
      if (file == null) return;
      setState(() {
        _picked = file;
        _error = null;
      });
      _preview = await file.readAsBytes();
      if (mounted) setState(() {});
    } catch (_) {/* recovery is best-effort */}
  }

  @override
  void dispose() {
    _caption.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    try {
      final x = await ImagePicker()
          .pickImage(source: source, maxWidth: 2000, imageQuality: 85);
      if (x == null) return;
      setState(() {
        _picked = x;
        _error = null;
      });
      _preview = await x.readAsBytes();
      if (mounted) setState(() {});
    } catch (_) {
      setState(() => _error = 'Could not access the ${source == ImageSource.camera ? 'camera' : 'gallery'}.');
    }
  }

  /// Always stages + enqueues first (durable) — "Saved on device" is
  /// only shown once bytes and the queue row are safely persisted.
  /// When reachable, the upload runs immediately via the same engine
  /// path the reconnection drain uses.
  Future<void> _upload() async {
    final picked = _picked;
    if (picked == null || _uploading) return;
    setState(() {
      _uploading = true;
      _savedOnDevice = false;
      _progress = 0;
      _error = null;
    });
    try {
      final service = ref.read(syncServiceProvider);
      final op = await service.enqueuePhoto(
        sourcePath: picked.path,
        originalName: picked.name,
        target: widget.target,
        targetId: widget.targetId,
        caption:
            _caption.text.trim().isEmpty ? null : _caption.text.trim(),
      );
      if (!mounted) return;
      await service.uploadPhotoNow(op, onProgress: (sent, total) {
        if (total > 0 && mounted) {
          setState(() => _progress = sent / total);
        }
      });
      if (!mounted) return;
      final store = await ref.read(cacheStoreProvider.future);
      final settled = await store.photoOp(op.opId);
      if (!mounted) return;
      if (settled?.state == PhotoOpState.synced) {
        Navigator.of(context).pop(true);
      } else {
        // Queued durably — offline, failed or still waiting; the card
        // in the gallery carries the live state from here on.
        setState(() {
          _uploading = false;
          _savedOnDevice = true;
        });
      }
    } on PhotoStageException catch (e) {
      if (mounted) {
        setState(() {
          _uploading = false;
          _error = e.message;
        });
      }
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _uploading = false;
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.of(context).viewInsets.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 20, 20, 20 + bottom),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Add Photo',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: AppColors.ink)),
          const SizedBox(height: 14),
          if (_preview == null)
            Row(
              children: [
                Expanded(
                  child: _PickerTile(
                      icon: Icons.photo_camera_outlined,
                      label: 'Camera',
                      onTap: () => _pick(ImageSource.camera)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _PickerTile(
                      icon: Icons.photo_library_outlined,
                      label: 'Gallery',
                      onTap: () => _pick(ImageSource.gallery)),
                ),
              ],
            )
          else
            ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: Image.memory(_preview!,
                  height: 220, width: double.infinity, fit: BoxFit.cover),
            ),
          const SizedBox(height: 12),
          TextField(
            controller: _caption,
            enabled: !_uploading,
            decoration: const InputDecoration(
              hintText: 'Caption (optional)',
              prefixIcon:
                  Icon(Icons.notes_outlined, size: 20, color: AppColors.faint),
            ),
          ),
          if (_uploading) ...[
            const SizedBox(height: 14),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: _progress == 0 ? null : _progress,
                minHeight: 6,
                backgroundColor: AppColors.hairline,
                valueColor:
                    const AlwaysStoppedAnimation(AppColors.green),
              ),
            ),
          ],
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Text(_error!,
                  style:
                      const TextStyle(color: AppColors.redText, fontSize: 13)),
            ),
          if (_savedOnDevice)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.blueBg,
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Row(
                children: [
                  Icon(Icons.cloud_off_outlined,
                      size: 16, color: AppColors.blue),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Saved on device — will upload when you are back online.',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ink),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 16),
          if (_savedOnDevice)
            PrimaryButton(
              label: 'Done',
              icon: Icons.check,
              onPressed: () => Navigator.of(context).pop(true),
            )
          else
            PrimaryButton(
              label: _error != null ? 'Retry Upload' : 'Upload Photo',
              icon: _error != null
                  ? Icons.refresh
                  : Icons.cloud_upload_outlined,
              loading: _uploading,
              onPressed: _picked == null ? null : _upload,
            ),
        ],
      ),
    );
  }
}

/// Local thumbnail for a queued photo — visually distinct from
/// confirmed evidence: sync-state badge, never a status color.
class _QueuedPhotoThumb extends ConsumerWidget {
  const _QueuedPhotoThumb({required this.op});
  final PhotoOp op;

  (IconData, Color, String) get _badge => switch (op.state) {
        PhotoOpState.pending => (
            Icons.schedule, AppColors.blue, 'Pending upload'),
        PhotoOpState.uploading => (
            Icons.cloud_upload_outlined, AppColors.blue, 'Uploading'),
        PhotoOpState.failed => (
            Icons.error_outline, AppColors.purple, 'Upload failed'),
        PhotoOpState.blocked => (
            Icons.block, AppColors.purple, 'Blocked'),
        PhotoOpState.synced => (
            Icons.cloud_done_outlined, AppColors.blue, 'Uploaded'),
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (icon, color, label) = _badge;
    return GestureDetector(
      onTap: () => _openDetails(context),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: Container(
          width: 76,
          height: 76,
          color: AppColors.hairline,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.file(
                File(op.filePath),
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => const Icon(
                    Icons.broken_image_outlined,
                    color: AppColors.faint),
              ),
              Align(
                alignment: Alignment.bottomCenter,
                child: Container(
                  width: double.infinity,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
                  color: color.withValues(alpha: 0.85),
                  child: Row(
                    children: [
                      Icon(icon, size: 11, color: Colors.white),
                      const SizedBox(width: 3),
                      Expanded(
                        child: Text(
                          label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 8,
                              fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _openDetails(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => QueuedPhotoSheet(op: op),
    );
  }
}

/// Detail/action sheet for a queued photo — preview, caption, target,
/// live state, error details, and retry/discard where permitted.
class QueuedPhotoSheet extends ConsumerWidget {
  const QueuedPhotoSheet({super.key, required this.op});
  final PhotoOp op;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final (icon, color, label) = switch (op.state) {
      PhotoOpState.pending => (
          Icons.schedule, AppColors.blue, 'Pending upload'),
      PhotoOpState.uploading => (
          Icons.cloud_upload_outlined, AppColors.blue, 'Uploading'),
      PhotoOpState.failed => (
          Icons.error_outline, AppColors.purple, 'Upload failed'),
      PhotoOpState.blocked => (
          Icons.block, AppColors.purple,
          'Blocked — location unavailable or no access'),
      PhotoOpState.synced => (
          Icons.cloud_done_outlined, AppColors.blue, 'Uploaded'),
    };
    final actionable = op.state == PhotoOpState.failed ||
        op.state == PhotoOpState.blocked ||
        op.state == PhotoOpState.pending;
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 18, color: color),
              const SizedBox(width: 8),
              Expanded(
                child: Text(label,
                    style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppColors.ink)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.file(File(op.filePath),
                height: 180,
                width: double.infinity,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(
                    height: 120,
                    color: AppColors.hairline,
                    child: const Icon(Icons.broken_image_outlined,
                        color: AppColors.faint))),
          ),
          const SizedBox(height: 10),
          Text(
            [
              '${photoTargetToApi(op.targetType)} photo',
              if ((op.caption ?? '').isNotEmpty) '“${op.caption}”',
              _fmtSize(op.fileSize),
            ].join(' · '),
            style: const TextStyle(fontSize: 12, color: AppColors.muted),
          ),
          if (op.lastError != null)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(op.lastError!,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.redText)),
            ),
          const SizedBox(height: 16),
          Row(
            children: [
              const Spacer(),
              TextButton(
                onPressed: () {
                  ref.read(syncServiceProvider).discardPhoto(op);
                  Navigator.of(context).pop();
                },
                child: const Text('Discard'),
              ),
              if (actionable) ...[
                const SizedBox(width: 8),
                FilledButton.icon(
                  onPressed: () {
                    ref.read(syncServiceProvider).retryPhoto(op);
                    Navigator.of(context).pop();
                  },
                  icon: const Icon(Icons.refresh, size: 16),
                  label: const Text('Retry'),
                  style: FilledButton.styleFrom(
                      backgroundColor: AppColors.navy),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  String _fmtSize(int bytes) => bytes > 1024 * 1024
      ? '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB'
      : '${(bytes / 1024).round()} KB';
}

class _PickerTile extends StatelessWidget {
  const _PickerTile(
      {required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(vertical: 26),
      child: Column(
        children: [
          Icon(icon, size: 30, color: AppColors.navy),
          const SizedBox(height: 8),
          Text(label,
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: AppColors.ink)),
        ],
      ),
    );
  }
}
