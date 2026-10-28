import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:path_provider/path_provider.dart';

/// Minimal sink that captures the single Digest emitted when a
/// chunked SHA-256 conversion closes.
class _DigestCollector implements Sink<Digest> {
  Digest? digest;
  @override
  void add(Digest data) => digest = data;
  @override
  void close() {}
}

/// Raised when a picker file cannot be staged durably. The message is
/// user-safe — the sheet/queue surfaces it verbatim.
class PhotoStageException implements Exception {
  const PhotoStageException(this.message);
  final String message;
  @override
  String toString() => message;
}

/// Result of staging a picker file into durable app-private storage.
class StagedPhoto {
  const StagedPhoto({
    required this.filePath,
    required this.contentHash,
    required this.fileSize,
    required this.fileName,
    required this.mimeType,
  });

  final String filePath;
  final String contentHash;
  final int fileSize;
  final String fileName;
  final String mimeType;
}

/// Durable file staging for the offline photo queue.
///
/// Picker results live in a cache directory the OS may reclaim at any
/// time, so selected bytes are copied into an app-private directory
/// before a queue record is ever written:
///
///   1. copy source → `<queueDir>/<opId>.tmp` while streaming SHA-256
///   2. rename `.tmp` → `<opId>.<ext>` (atomic on the same filesystem)
///   3. re-stat and re-hash the final file to prove durability
///
/// A crash before step 3 leaves at most an orphan `.tmp`, which is
/// never mistaken for a staged photo — and no queue row exists either.
/// Filenames are generated from the operation id; user-controlled
/// names only inform the extension, so traversal is impossible.
class PhotoFileStore {
  PhotoFileStore({Directory? root})
      : _rootOverride = root;

  final Directory? _rootOverride;

  /// Per-photo cap — must equal the server's MAX_PHOTO_BYTES
  /// (src/lib/progress-photos.ts = 10 MB) so a staged photo can never be
  /// one the server will refuse. Camera output is ~1–4 MB after picker
  /// compression; anything larger is almost certainly not a field photo.
  static const maxFileBytes = 10 * 1024 * 1024;

  /// Total staged-bytes cap — protects the device from unbounded
  /// queue growth when connectivity is absent for a long shift.
  static const maxQueueBytes = 256 * 1024 * 1024;

  Future<Directory> _dir(String userId) async {
    final base = _rootOverride?.path ??
        (await getApplicationDocumentsDirectory()).path;
    final safeUser = userId.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
    return Directory('$base/queued_photos/$safeUser');
  }

  /// Used by the integrity checks to ensure a path belongs to the
  /// queue directory before reading or deleting it.
  Future<bool> isQueuePath(String path, String userId) async {
    final dir = await _dir(userId);
    final normalized = File(path).absolute.path;
    return normalized.startsWith('${dir.absolute.path}/');
  }

  /// Total bytes currently staged for [userId].
  Future<int> queuedBytes(String userId) async {
    final dir = await _dir(userId);
    if (!await dir.exists()) return 0;
    var total = 0;
    await for (final e in dir.list()) {
      if (e is File) total += await e.length();
    }
    return total;
  }

  static const _exts = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'heic': 'image/heic',
    'gif': 'image/gif',
  };

  static String mimeFor(String fileName) {
    final dot = fileName.lastIndexOf('.');
    final ext =
        dot >= 0 ? fileName.substring(dot + 1).toLowerCase() : 'jpg';
    return _exts[ext] ?? 'image/jpeg';
  }

  /// Detects the real image format from magic bytes. Returns the canonical
  /// extension, or null when the bytes match none of the server-accepted
  /// formats (JPEG/PNG/WebP). Used to fix up picker output, which may carry
  /// an extension that disagrees with the actual bytes (e.g. a re-encoded
  /// JPEG still named `.png`).
  static Future<String?> sniffImageExt(File f) async {
    final raf = await f.open();
    try {
      final head = await raf.read(12);
      if (head.length >= 3 &&
          head[0] == 0xFF &&
          head[1] == 0xD8 &&
          head[2] == 0xFF) {
        return 'jpg';
      }
      if (head.length >= 8 &&
          head[0] == 0x89 &&
          head[1] == 0x50 &&
          head[2] == 0x4E &&
          head[3] == 0x47 &&
          head[4] == 0x0D &&
          head[5] == 0x0A &&
          head[6] == 0x1A &&
          head[7] == 0x0A) {
        return 'png';
      }
      if (head.length >= 12 &&
          head[0] == 0x52 && // R
          head[1] == 0x49 && // I
          head[2] == 0x46 && // F
          head[3] == 0x46 && // F
          head[8] == 0x57 && // W
          head[9] == 0x45 && // E
          head[10] == 0x42 && // B
          head[11] == 0x50) { // P
        return 'webp';
      }
      return null;
    } finally {
      await raf.close();
    }
  }

  /// Copies [sourcePath] into durable storage under a generated name.
  /// Throws [PhotoStageException] for every recoverable failure —
  /// nothing partial is ever reported as staged.
  Future<StagedPhoto> stage({
    required String sourcePath,
    required String userId,
    required String opId,
    required String originalName,
  }) async {
    final source = File(sourcePath);
    if (!await source.exists()) {
      throw const PhotoStageException('The selected photo is no longer '
          'available — pick it again.');
    }
    final length = await source.length();
    if (length <= 0) {
      throw const PhotoStageException('The selected photo is empty.');
    }
    if (length > maxFileBytes) {
      throw PhotoStageException(
          'Photo is larger than ${maxFileBytes ~/ (1024 * 1024)} MB — '
          'pick a smaller image.');
    }
    if (await queuedBytes(userId) + length > maxQueueBytes) {
      throw const PhotoStageException('Photo queue storage is full — '
          'sync or discard pending photos first.');
    }

    final dir = await _dir(userId);
    await dir.create(recursive: true);
    final safeOp = opId.replaceAll(RegExp(r'[^A-Za-z0-9_-]'), '_');
    final dot = originalName.lastIndexOf('.');
    final ext =
        dot >= 0 ? originalName.substring(dot + 1).toLowerCase() : 'jpg';
    // Magic bytes win over the filename — the picker can hand back a
    // re-encoded JPEG still named `.png`.
    final sniffed = await sniffImageExt(source);
    final safeExt = sniffed ?? (_exts.containsKey(ext) ? ext : 'jpg');
    final tmp = File('${dir.path}/$safeOp.tmp');
    final dest = File('${dir.path}/$safeOp.$safeExt');

    final digest = await _copyHashed(source, tmp);
    try {
      await tmp.rename(dest.path);
    } on FileSystemException {
      await _quietDelete(tmp);
      throw const PhotoStageException(
          'Could not save the photo on this device.');
    }

    // Prove the renamed bytes are durable before anyone may enqueue.
    final back = await _hashFile(dest);
    final backLen = await dest.length();
    if (back != digest || backLen != length) {
      await _quietDelete(dest);
      throw const PhotoStageException(
          'Photo verification failed — please try again.');
    }
    return StagedPhoto(
      filePath: dest.path,
      contentHash: digest,
      fileSize: length,
      fileName: originalName.isEmpty ? '$safeOp.$safeExt' : originalName,
      mimeType: _exts[safeExt]!,
    );
  }

  /// Streams source → dest computing SHA-256 in the same pass; on any
  /// failure the partial temp file is removed and a
  /// [PhotoStageException] (storage-aware) is thrown.
  Future<String> _copyHashed(File source, File dest) async {
    final sink = dest.openWrite();
    final out = _DigestCollector();
    final hasher = sha256.startChunkedConversion(out);
    try {
      await for (final chunk in source.openRead()) {
        hasher.add(chunk);
        sink.add(chunk);
      }
      hasher.close();
      await sink.flush();
      await sink.close();
      if (out.digest == null) {
        throw const PhotoStageException(
            'Could not save the photo on this device.');
      }
    } on FileSystemException catch (e) {
      await _quietClose(sink);
      await _quietDelete(dest);
      final msg = e.message.toLowerCase();
      throw PhotoStageException(
          msg.contains('no space') || e.osError?.errorCode == 28
              ? 'Not enough storage space on this device.'
              : 'Could not save the photo on this device.');
    } catch (_) {
      await _quietClose(sink);
      await _quietDelete(dest);
      throw const PhotoStageException(
          'Could not save the photo on this device.');
    }
    return out.digest!.toString();
  }

  Future<String> _hashFile(File f) async =>
      (await sha256.bind(f.openRead()).first).toString();

  /// Verifies a queued file still exists and matches the recorded
  /// hash+size. Returns null on success, else a user-safe reason —
  /// a corrupted or missing file must never upload as valid evidence.
  Future<String?> verify(String path, String expectedHash,
      int expectedSize, String userId) async {
    if (!await isQueuePath(path, userId)) {
      return 'Photo file is outside the app storage area.';
    }
    final f = File(path);
    if (!await f.exists()) {
      return 'The photo file was removed from this device.';
    }
    if (await f.length() != expectedSize) {
      return 'The photo file changed — please re-add it.';
    }
    if (await _hashFile(f) != expectedHash) {
      return 'The photo file changed — please re-add it.';
    }
    return null;
  }

  /// Deletes a staged file — only invoked after the server confirmation
  /// is durably stored, or on a deliberate user discard.
  Future<void> delete(String path, String userId) async {
    if (await isQueuePath(path, userId)) {
      await _quietDelete(File(path));
    }
  }

  /// Removes orphan `.tmp` files from interrupted staging — called on
  /// startup so a previous crash's partial copy never lingers.
  Future<void> sweepTempFiles(String userId) async {
    final dir = await _dir(userId);
    if (!await dir.exists()) return;
    await for (final e in dir.list()) {
      if (e is File && e.path.endsWith('.tmp')) {
        await _quietDelete(e);
      }
    }
  }

  /// Lists the real paths of every staged file in [userId]'s queue
  /// directory — used to decide which files queue rows still reference.
  Future<Set<String>> listStagedPaths(String userId) async {
    final dir = await _dir(userId);
    final out = <String>{};
    if (!await dir.exists()) return out;
    await for (final e in dir.list()) {
      if (e is File && !e.path.endsWith('.tmp')) {
        out.add(e.absolute.path);
      }
    }
    return out;
  }

  /// Sweeps staged files that no queue row references — the crash window
  /// where the atomic rename completed but the SQLite insert did not.
  /// Files younger than [grace] are kept so a concurrent/just-staged file
  /// is never swept out from under an in-flight enqueue.
  Future<int> sweepOrphans(
    String userId,
    Set<String> keepPaths, {
    Duration grace = const Duration(hours: 1),
  }) async {
    final dir = await _dir(userId);
    if (!await dir.exists()) return 0;
    final cutoff = DateTime.now().subtract(grace);
    var swept = 0;
    await for (final e in dir.list()) {
      if (e is! File || e.path.endsWith('.tmp')) continue;
      if (keepPaths.contains(e.absolute.path)) continue;
      try {
        if (await e.lastModified().then((m) => m.isAfter(cutoff))) continue;
        await e.delete();
        swept++;
      } catch (_) {/* best-effort cleanup */}
    }
    return swept;
  }

  Future<void> _quietDelete(File f) async {
    try {
      if (await f.exists()) await f.delete();
    } catch (_) {/* best-effort cleanup */}
  }

  Future<void> _quietClose(IOSink sink) async {
    try {
      await sink.close();
    } catch (_) {/* already broken */}
  }
}
