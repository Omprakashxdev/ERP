import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:saec_progress/core/api/api_client.dart';
import 'package:saec_progress/core/models/models.dart';
import 'package:saec_progress/core/offline/cache_db.dart';
import 'package:saec_progress/core/offline/photo_files.dart';
import 'package:saec_progress/core/offline/photo_sync.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

var _dbCounter = 0;

Future<CacheStore> newStore() async {
  sqfliteFfiInit();
  final dir =
      await Directory.systemTemp.createTemp('photo_queue_db');
  final db = await CacheDb.open(
      factory: databaseFactoryFfi,
      path: '${dir.path}/t${_dbCounter++}.db');
  return CacheStore(db);
}

PhotoOp _op({
  String opId = 'op-1',
  String eventId = 'cev-1',
  String userId = 'u1',
  String siteId = 's1',
  PhotoTarget target = PhotoTarget.room,
  String targetId = 'r1',
  String filePath = '/tmp/q/op-1.jpg',
  String hash = 'h',
  String caption = '',
  PhotoOpState state = PhotoOpState.pending,
}) =>
    PhotoOp(
      opId: opId,
      clientEventId: eventId,
      userId: userId,
      siteId: siteId,
      targetType: target,
      targetId: targetId,
      filePath: filePath,
      contentHash: hash,
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: 10,
      caption: caption.isEmpty ? null : caption,
      createdAt: DateTime(2026, 1, 1),
      updatedAt: DateTime(2026, 1, 1),
      state: state,
    );

/// A PhotoFileStore whose root is a temp dir, with a submitted file
/// staged inside it matching the op's recorded hash/size.
class FixtureFiles {
  FixtureFiles(this.store, this.dir);
  final PhotoFileStore store;
  final Directory dir;

  /// Writes real bytes for [op] into the queue dir and returns an op
  /// whose path/hash/size match them.
  Future<PhotoOp> staged(PhotoOp op, List<int> bytes) async {
    final f = File('${dir.path}/queued_photos/u1/${op.opId}.jpg');
    await f.create(recursive: true);
    await f.writeAsBytes(bytes);
    return PhotoOp(
      opId: op.opId,
      clientEventId: op.clientEventId,
      userId: op.userId,
      siteId: op.siteId,
      targetType: op.targetType,
      targetId: op.targetId,
      filePath: f.path,
      contentHash: sha256.convert(bytes).toString(),
      fileName: 'photo.jpg',
      mimeType: 'image/jpeg',
      fileSize: bytes.length,
      createdAt: op.createdAt,
      updatedAt: op.updatedAt,
    );
  }
}

Future<FixtureFiles> fixtureFiles() async {
  final dir =
      await Directory.systemTemp.createTemp('photo_queue_test');
  return FixtureFiles(PhotoFileStore(root: dir), dir);
}

void main() {
  group('CacheStore — photo_ops', () {
    test('photo ops are namespaced by user', () async {
      final s = await newStore();
      await s.enqueuePhotoOp(_op());
      expect(await s.outstandingPhotoOps('u2'), isEmpty);
      expect(await s.outstandingPhotoOps('u1'), hasLength(1));
    });

    test('duplicate clientEventId for one user is rejected', () async {
      final s = await newStore();
      await s.enqueuePhotoOp(_op());
      expect(() => s.enqueuePhotoOp(_op(opId: 'op-2')),
          throwsA(anything));
    });

    test('interrupted UPLOADING ops revert to PENDING on restart',
        () async {
      final s = await newStore();
      await s.enqueuePhotoOp(_op());
      await s.updatePhotoOp(
          _op().copy(state: PhotoOpState.uploading));
      await s.resetInterruptedUploads('u1');
      expect((await s.outstandingPhotoOps('u1')).single.state,
          PhotoOpState.pending);
    });
  });

  group('PhotoFileStore — staging', () {
    test('copies bytes durably with a generated safe name + sha256',
        () async {
      final fix = await fixtureFiles();
      final src = File('${fix.dir.path}/src.jpg');
      final bytes = utf8.encode('fake jpeg bytes');
      await src.writeAsBytes(bytes);
      final staged = await fix.store.stage(
          sourcePath: src.path,
          userId: 'u1',
          opId: 'op-abc',
          originalName: 'IMG_0001.jpg');
      final f = File(staged.filePath);
      expect(await f.exists(), isTrue);
      expect(staged.filePath.contains('op-abc'), isTrue);
      expect(staged.filePath.contains('IMG_0001'), isFalse);
      expect(staged.contentHash, sha256.convert(bytes).toString());
      expect(await fix.store.verify(
          staged.filePath, staged.contentHash, staged.fileSize, 'u1'),
          isNull);
    });

    test('rejects traversal/missing/empty sources', () async {
      final fix = await fixtureFiles();
      final empty = File('${fix.dir.path}/e.jpg');
      await empty.writeAsBytes(const []);
      expect(
          () => fix.store.stage(
              sourcePath: empty.path,
              userId: 'u1',
              opId: 'o',
              originalName: 'e.jpg'),
          throwsA(isA<PhotoStageException>()));
      expect(
          () => fix.store.stage(
              sourcePath: '${fix.dir.path}/nope.jpg',
              userId: 'u1',
              opId: 'o',
              originalName: 'nope.jpg'),
          throwsA(isA<PhotoStageException>()));
    });

    test('orphan .tmp files from interrupted copies are swept',
        () async {
      final fix = await fixtureFiles();
      final dir = Directory('${fix.dir.path}/queued_photos/u1');
      await dir.create(recursive: true);
      await File('${dir.path}/partial.tmp').writeAsBytes([1, 2]);
      await fix.store.sweepTempFiles('u1');
      expect(await File('${dir.path}/partial.tmp').exists(), isFalse);
    });

    test('JPEG bytes under a .png name are sniffed to image/jpeg',
        () async {
      final fix = await fixtureFiles();
      final src = File('${fix.dir.path}/scaled_shot.png');
      await src.writeAsBytes(
          const [0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3, 4, 5, 6, 7, 8]);
      final staged = await fix.store.stage(
          sourcePath: src.path,
          userId: 'u1',
          opId: 'op-jpg',
          originalName: 'scaled_shot.png');
      expect(staged.mimeType, 'image/jpeg');
      expect(staged.filePath, endsWith('.jpg'));
    });

    test('PNG and WebP magic bytes override the filename too',
        () async {
      final fix = await fixtureFiles();
      final png = File('${fix.dir.path}/p.jpg');
      await png.writeAsBytes(const [
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4]);
      final webp = File('${fix.dir.path}/w.jpg');
      await webp.writeAsBytes(const [
        0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
      final sp = await fix.store.stage(
          sourcePath: png.path,
          userId: 'u1',
          opId: 'op-png',
          originalName: 'p.jpg');
      final sw = await fix.store.stage(
          sourcePath: webp.path,
          userId: 'u1',
          opId: 'op-webp',
          originalName: 'w.jpg');
      expect(sp.mimeType, 'image/png');
      expect(sp.filePath, endsWith('.png'));
      expect(sw.mimeType, 'image/webp');
      expect(sw.filePath, endsWith('.webp'));
    });

    test('unrecognised bytes keep the filename-derived metadata',
        () async {
      final fix = await fixtureFiles();
      final src = File('${fix.dir.path}/raw.png');
      await src.writeAsBytes(utf8.encode('not a real image'));
      final staged = await fix.store.stage(
          sourcePath: src.path,
          userId: 'u1',
          opId: 'op-raw',
          originalName: 'raw.png');
      expect(staged.mimeType, 'image/png');
      expect(staged.filePath, endsWith('.png'));
    });

    test('sweepOrphans removes files no queue row references — '
        'crash between rename and commit', () async {
      final fix = await fixtureFiles();
      final dir = Directory('${fix.dir.path}/queued_photos/u1');
      await dir.create(recursive: true);
      final orphan = File('${dir.path}/op-orphan.jpg');
      await orphan.writeAsBytes([9, 9, 9]);
      final keep = File('${dir.path}/op-keep.jpg');
      await keep.writeAsBytes([1]);
      // Orphan from a crash 2h ago; a concurrent fresh file must survive.
      await orphan.setLastModified(
          DateTime.now().subtract(const Duration(hours: 2)));
      final swept = await fix.store.sweepOrphans(
          'u1', {keep.absolute.path},
          grace: const Duration(hours: 1));
      expect(swept, 1);
      expect(await orphan.exists(), isFalse);
      expect(await keep.exists(), isTrue);
    });

    test('sweepOrphans keeps fresh unreferenced files (grace period)',
        () async {
      final fix = await fixtureFiles();
      final dir = Directory('${fix.dir.path}/queued_photos/u1');
      await dir.create(recursive: true);
      final fresh = File('${dir.path}/op-fresh.jpg');
      await fresh.writeAsBytes([1]);
      final swept = await fix.store.sweepOrphans('u1', const {},
          grace: const Duration(hours: 1));
      expect(swept, 0);
      expect(await fresh.exists(), isTrue);
    });

    test('rejects a photo over the server 10 MB cap before queueing',
        () async {
      final fix = await fixtureFiles();
      final big = File('${fix.dir.path}/big.jpg');
      final raf = await big.open(mode: FileMode.write);
      await raf.truncate(PhotoFileStore.maxFileBytes + 1);
      await raf.close();
      try {
        await fix.store.stage(
            sourcePath: big.path,
            userId: 'u1',
            opId: 'op-big',
            originalName: 'big.jpg');
        fail('expected PhotoStageException');
      } on PhotoStageException catch (e) {
        expect(e.message, contains('10 MB'));
      }
      // Nothing staged — a rejected photo must not leave queue debris.
      final dir = Directory('${fix.dir.path}/queued_photos/u1');
      expect(await dir.exists(), isFalse);
    });

    test('accepts a photo at exactly the 10 MB boundary', () async {
      final fix = await fixtureFiles();
      final edge = File('${fix.dir.path}/edge.jpg');
      final raf = await edge.open(mode: FileMode.write);
      await raf.truncate(PhotoFileStore.maxFileBytes);
      await raf.close();
      final staged = await fix.store.stage(
          sourcePath: edge.path,
          userId: 'u1',
          opId: 'op-edge',
          originalName: 'edge.jpg');
      expect(staged.fileSize, PhotoFileStore.maxFileBytes);
    });
  });

  group('PhotoSyncEngine', () {
    test('success persists confirmation before deleting the file',
        () async {
      final s = await newStore();
      final fix = await fixtureFiles();
      final op = await fix.staged(_op(), utf8.encode('payload'));
      await s.enqueuePhotoOp(op);
      var submitted = 0;
      final engine = PhotoSyncEngine(
        store: s,
        files: fix.store,
        submit: (o, p) async {
          submitted++;
          expect(o.clientEventId, 'cev-1');
          return const PhotoSubmitResult(
              serverPhotoId: 'srv-1', alreadyUploaded: false);
        },
      );
      await engine.drain('u1');
      expect(submitted, 1);
      final back = await s.photoOp('op-1');
      expect(back!.state, PhotoOpState.synced);
      expect(back.serverPhotoId, 'srv-1');
      expect(await File(op.filePath).exists(), isFalse);
    });

    test('network failure keeps PENDING with backoff; same eventId '
        'and file preserved', () async {
      final s = await newStore();
      final fix = await fixtureFiles();
      final op = await fix.staged(_op(), utf8.encode('payload'));
      await s.enqueuePhotoOp(op);
      final engine = PhotoSyncEngine(
        store: s,
        files: fix.store,
        submit: (o, p) async =>
            throw const ApiException('NETWORK', 'Cannot reach the ERP server.'),
      );
      await engine.drain('u1');
      final back = await s.photoOp('op-1');
      expect(back!.state, PhotoOpState.pending);
      expect(back.attempts, 1);
      expect(back.nextAttemptAt, isNotNull);
      expect(back.clientEventId, 'cev-1');
      expect(await File(op.filePath).exists(), isTrue);
    });

    test('403 blocks the op and the rest of that site\'s queue — '
        'files preserved', () async {
      final s = await newStore();
      final fix = await fixtureFiles();
      final a = await fix.staged(_op(), utf8.encode('a'));
      final b = await fix.staged(
          _op(opId: 'op-2', eventId: 'cev-2'), utf8.encode('b'));
      await s.enqueuePhotoOp(a);
      await s.enqueuePhotoOp(b);
      final engine = PhotoSyncEngine(
        store: s,
        files: fix.store,
        submit: (o, p) async =>
            throw const ApiException('FORBIDDEN', 'No access', status: 403),
      );
      await engine.drain('u1');
      final backA = await s.photoOp('op-1');
      final backB = await s.photoOp('op-2');
      expect(backA!.state, PhotoOpState.blocked);
      expect(backB!.state, PhotoOpState.blocked);
      expect(await File(a.filePath).exists(), isTrue);
      expect(await File(b.filePath).exists(), isTrue);
    });

    test('404 blocks like a revocation — backend hides the site id '
        'from unassigned users', () async {
      final s = await newStore();
      final fix = await fixtureFiles();
      final a = await fix.staged(_op(), utf8.encode('a'));
      final b = await fix.staged(
          _op(opId: 'op-2', eventId: 'cev-2'), utf8.encode('b'));
      await s.enqueuePhotoOp(a);
      await s.enqueuePhotoOp(b);
      final engine = PhotoSyncEngine(
        store: s,
        files: fix.store,
        submit: (o, p) async =>
            throw const ApiException('NOT_FOUND', 'Site not found.',
                status: 404),
      );
      await engine.drain('u1');
      final backA = await s.photoOp('op-1');
      final backB = await s.photoOp('op-2');
      expect(backA!.state, PhotoOpState.blocked);
      expect(backB!.state, PhotoOpState.blocked);
      expect(backA.lastError,
          contains('unavailable or you no longer have access'));
      expect(await File(a.filePath).exists(), isTrue);
      expect(await File(b.filePath).exists(), isTrue);
    });

    test('409/other 4xx fails permanently, keeps file, no resubmission',
        () async {
      final s = await newStore();
      final fix = await fixtureFiles();
      final op = await fix.staged(_op(), utf8.encode('payload'));
      await s.enqueuePhotoOp(op);
      var submitted = 0;
      final engine = PhotoSyncEngine(
        store: s,
        files: fix.store,
        submit: (o, p) async {
          submitted++;
          throw const ApiException(
              'EVENT_CONFLICT', 'conflict', status: 409);
        },
      );
      await engine.drain('u1');
      await engine.drain('u1'); // failed ops are never resubmitted
      expect(submitted, 1);
      final back = await s.photoOp('op-1');
      expect(back!.state, PhotoOpState.failed);
      expect(await File(op.filePath).exists(), isTrue);
    });

    test('missing local file fails without submitting', () async {
      final s = await newStore();
      final fix = await fixtureFiles();
      final dir = Directory('${fix.dir.path}/queued_photos/u1');
      await dir.create(recursive: true);
      final op = _op(filePath: '${dir.path}/op-1.jpg');
      await s.enqueuePhotoOp(op); // file never written
      var submitted = 0;
      final engine = PhotoSyncEngine(
        store: s,
        files: fix.store,
        submit: (o, p) async {
          submitted++;
          return const PhotoSubmitResult(
              serverPhotoId: 'x', alreadyUploaded: false);
        },
      );
      await engine.drain('u1');
      expect(submitted, 0);
      final back = await s.photoOp('op-1');
      expect(back!.state, PhotoOpState.failed);
      expect(back.lastError, contains('removed'));
    });

    test('idempotent replay — same clientEventId resubmitted after '
        'lost response, alreadyUploaded counts as synced', () async {
      final s = await newStore();
      final fix = await fixtureFiles();
      final op = await fix.staged(_op(), utf8.encode('payload'));
      await s.enqueuePhotoOp(op);
      var submissions = 0;
      final engine = PhotoSyncEngine(
        store: s,
        files: fix.store,
        submit: (o, p) async {
          submissions++;
          if (submissions == 1) {
            // Simulate crash-after-land: mark was never reached.
            await s.updatePhotoOp(
                op.copy(state: PhotoOpState.uploading));
            throw const ApiException('NETWORK', 'lost response');
          }
          return const PhotoSubmitResult(
              serverPhotoId: 'srv-9', alreadyUploaded: true);
        },
      );
      await engine.drain('u1'); // fails; op goes back to PENDING
      // Simulate the backoff window elapsing — the idempotent retry
      // must reuse the SAME clientEventId.
      final parked = await s.photoOp('op-1');
      await s.updatePhotoOp(parked!.copy(clearNextAttempt: true));
      await engine.drain('u1');
      expect(submissions, 2);
      final back = await s.photoOp('op-1');
      expect(back!.state, PhotoOpState.synced);
      expect(back.serverPhotoId, 'srv-9');
    });

    test('crash after server commit but before local confirmation — '
        'replay is deduped server-side, never duplicated', () async {
      final s = await newStore();
      final fix = await fixtureFiles();
      final op = await fix.staged(_op(), utf8.encode('payload'));
      await s.enqueuePhotoOp(op);
      var submissions = 0;
      final engine = PhotoSyncEngine(
        store: s,
        files: fix.store,
        submit: (o, p) async {
          submissions++;
          if (submissions == 1) {
            // Server committed, then the process died before _mark
            // persisted the confirmation — a non-Api exception escapes
            // the engine so the row stays UPLOADING.
            throw StateError('process killed after server commit');
          }
          // Server dedupes on the same clientEventId.
          return const PhotoSubmitResult(
              serverPhotoId: 'srv-5', alreadyUploaded: true);
        },
      );
      await expectLater(engine.drain('u1'), throwsA(isA<StateError>()));
      final stuck = await s.photoOp('op-1');
      expect(stuck!.state, PhotoOpState.uploading);
      await engine.drain('u1'); // reset → retry with same eventId
      expect(submissions, 2);
      final back = await s.photoOp('op-1');
      expect(back!.state, PhotoOpState.synced);
      expect(back.serverPhotoId, 'srv-5');
      expect(await File(op.filePath).exists(), isFalse);
    });

    test('op staged above the server cap fails permanently without '
        'submitting — file kept as evidence', () async {
      final s = await newStore();
      final fix = await fixtureFiles();
      // A photo staged under the old 25 MB cap: real 11 MB file whose
      // recorded op size exceeds the server limit.
      final dir = Directory('${fix.dir.path}/queued_photos/u1');
      await dir.create(recursive: true);
      final f = File('${dir.path}/op-1.jpg');
      final raf = await f.open(mode: FileMode.write);
      await raf.truncate(PhotoFileStore.maxFileBytes + 1);
      await raf.close();
      final op = PhotoOp(
        opId: 'op-1',
        clientEventId: 'cev-1',
        userId: 'u1',
        siteId: 's1',
        targetType: PhotoTarget.room,
        targetId: 'r1',
        filePath: f.path,
        contentHash: sha256.convert(await f.readAsBytes()).toString(),
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        fileSize: PhotoFileStore.maxFileBytes + 1,
        createdAt: DateTime(2026, 1, 1),
        updatedAt: DateTime(2026, 1, 1),
        state: PhotoOpState.pending,
      );
      await s.enqueuePhotoOp(op);
      var submitted = 0;
      final engine = PhotoSyncEngine(
        store: s,
        files: fix.store,
        submit: (o, p) async {
          submitted++;
          return const PhotoSubmitResult(
              serverPhotoId: 'x', alreadyUploaded: false);
        },
      );
      await engine.drain('u1');
      expect(submitted, 0); // never wastes a doomed upload attempt
      final back = await s.photoOp('op-1');
      expect(back!.state, PhotoOpState.failed);
      expect(back.lastError, contains('10 MB'));
      expect(await f.exists(), isTrue); // evidence preserved
    });
  });

  group('CacheDb — migrations', () {
    test('v1 → v2 upgrade preserves pending ops and adds photo_ops',
        () async {
      sqfliteFfiInit();
      final dir =
          await Directory.systemTemp.createTemp('photo_queue_mig');
      final path = '${dir.path}/mig.db';
      // Create a v1 database: base tables only, one pending update row.
      final v1 = await databaseFactoryFfi.openDatabase(path,
          options: OpenDatabaseOptions(version: 1, onCreate: (db, _) async {
        await db.execute('''
          CREATE TABLE cache_entries (
            user_id TEXT NOT NULL,
            cache_key TEXT NOT NULL,
            payload TEXT NOT NULL,
            cached_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, cache_key)
          )''');
        await db.execute('''
          CREATE TABLE pending_ops (
            event_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            activity_id TEXT NOT NULL,
            room_id TEXT,
            site_id TEXT,
            status TEXT NOT NULL,
            note TEXT,
            expected_revision INTEGER NOT NULL,
            state TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            next_attempt_at INTEGER,
            last_error TEXT,
            detail_json TEXT
          )''');
        await db.execute(
            'CREATE INDEX idx_pending_user ON pending_ops(user_id, state)');
        await db.execute('''
          CREATE TABLE meta (
            user_id TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
          )''');
        await db.insert('pending_ops', {
          'event_id': 'ev-1',
          'user_id': 'u1',
          'activity_id': 'a1',
          'site_id': 's1',
          'status': 'IN_PROGRESS',
          'expected_revision': 0,
          'state': 'PENDING',
          'created_at': 1,
          'updated_at': 1,
        });
      }));
      await v1.close();

      final store = CacheStore(
          await CacheDb.open(factory: databaseFactoryFfi, path: path));
      // Old rows survive; the new photo queue table exists.
      final ops = await store.outstandingOps('u1');
      expect(ops, hasLength(1));
      await store.enqueuePhotoOp(_op());
      expect(await store.outstandingPhotoOps('u1'), hasLength(1));
    });
  });
}
