import 'dart:convert';

import 'package:sqflite/sqflite.dart';

import '../models/models.dart';

/// Durable local cache + mutation queue, backed by SQLite (sqflite).
///
/// Every row is namespaced by the authenticated ERP user id so one
/// employee's cached assignments or queued work is never visible to
/// another account on the same device. Tokens themselves never enter
/// this database — they stay in [TokenStore] (platform keystore).
///
/// Schema v2:
/// - cache_entries: write-through snapshots of mobile API responses.
/// - pending_ops: durable activity-update queue (one row per stable
///   eventId), carrying sync state PENDING/SYNCING/SYNCED/CONFLICT/FAILED.
/// - photo_ops: durable photo-upload queue keyed by a local operation
///   id, with a stable clientEventId used as the server idempotency key.
///   Tracks the staged file path, content hash and lifecycle
///   PENDING/UPLOADING/SYNCED/FAILED/BLOCKED.
/// - meta: small per-user key/value store (e.g. last successful sync).
class CacheDb {
  CacheDb._(this._db, this._factory, this._path);

  final Database _db;
  final DatabaseFactory _factory;
  final String _path;

  static const _dbName = 'saec_progress_cache.db';
  static const _version = 2;

  /// Opens (and migrates) the device database. [factory]/[path] are
  /// injectable so tests can run sqflite_common_ffi in-memory.
  static Future<CacheDb> open({
    DatabaseFactory? factory,
    String? path,
  }) async {
    final f = factory ?? databaseFactory;
    final p = path ?? await _defaultPath();
    final db = await f.openDatabase(
      p,
      options: OpenDatabaseOptions(
        version: _version,
        onCreate: _onCreate,
        onUpgrade: (db, oldV, newV) async {
          if (oldV < 2) await _createPhotoOps(db);
        },
      ),
    );
    return CacheDb._(db, f, p);
  }

  static Future<String> _defaultPath() async {
    final dir = await getDatabasesPath();
    return '$dir/$_dbName';
  }

  static Future<void> _onCreate(Database db, int version) async {
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
    await _createPhotoOps(db);
  }

  /// photo_ops — the durable offline photo queue. `client_event_id` is
  /// the server idempotency key and stays constant across retries; the
  /// primary `op_id` is the local row identity so a rejected attempt
  /// can be replaced without confusing which row is live. The
  /// (user_id, client_event_id) unique index prevents duplicate queue
  /// entries for the same intended upload.
  static Future<void> _createPhotoOps(Database db) async {
    await db.execute('''
      CREATE TABLE photo_ops (
        op_id TEXT PRIMARY KEY,
        client_event_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        site_id TEXT,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        caption TEXT,
        state TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        next_attempt_at INTEGER,
        last_error TEXT,
        server_photo_id TEXT
      )''');
    await db.execute(
        'CREATE UNIQUE INDEX idx_photo_ops_event ON photo_ops(user_id, client_event_id)');
    await db.execute(
        'CREATE INDEX idx_photo_ops_target ON photo_ops(user_id, target_type, target_id)');
  }

  Future<void> close() => _db.close();

  /// Deletes the whole database file — used only for complete teardown.
  Future<void> deleteAll() async {
    await _db.close();
    await _factory.deleteDatabase(_path);
  }
}

/// Snapshot of a cached API payload.
class CacheEntry {
  const CacheEntry({required this.payload, required this.cachedAt});

  /// Raw JSON body of the original API response.
  final String payload;
  final DateTime cachedAt;
}

/// Lifecycle of a queued activity update.
enum OpState { pending, syncing, synced, conflict, failed }

OpState opStateFrom(String raw) => switch (raw) {
      'SYNCING' => OpState.syncing,
      'SYNCED' => OpState.synced,
      'CONFLICT' => OpState.conflict,
      'FAILED' => OpState.failed,
      _ => OpState.pending,
    };

String opStateToDb(OpState s) => s.name.toUpperCase();

/// One durable, user-attributed activity-status mutation. `eventId`
/// doubles as the primary key — the operation is written
/// transactionally before the UI may claim "Saved on device".
class PendingOp {
  const PendingOp({
    required this.eventId,
    required this.userId,
    required this.activityId,
    required this.status,
    required this.expectedRevision,
    required this.createdAt,
    required this.updatedAt,
    this.roomId,
    this.siteId,
    this.note,
    this.state = OpState.pending,
    this.attempts = 0,
    this.nextAttemptAt,
    this.lastError,
    this.detail,
  });

  final String eventId;
  final String userId;
  final String activityId;
  final String? roomId;
  final String? siteId;
  final ActivityStatus status;
  final String? note;
  final int expectedRevision;
  final OpState state;
  final int attempts;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? nextAttemptAt;
  final String? lastError;

  /// Server-supplied state captured on a 409 (e.g. currentStatus /
  /// currentRevision) or a failure reason — preserved for the
  /// review/retry/discard UI.
  final Map<String, dynamic>? detail;

  PendingOp copy({
    OpState? state,
    int? attempts,
    int? expectedRevision,
    String? eventId,
    DateTime? updatedAt,
    DateTime? nextAttemptAt,
    bool clearNextAttempt = false,
    String? lastError,
    bool clearError = false,
    Map<String, dynamic>? detail,
    bool clearDetail = false,
  }) =>
      PendingOp(
        eventId: eventId ?? this.eventId,
        userId: userId,
        activityId: activityId,
        roomId: roomId,
        siteId: siteId,
        status: status,
        note: note,
        expectedRevision: expectedRevision ?? this.expectedRevision,
        state: state ?? this.state,
        attempts: attempts ?? this.attempts,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        nextAttemptAt:
            clearNextAttempt ? null : (nextAttemptAt ?? this.nextAttemptAt),
        lastError: clearError ? null : (lastError ?? this.lastError),
        detail: clearDetail ? null : (detail ?? this.detail),
      );

  factory PendingOp.fromRow(Map<String, Object?> r) => PendingOp(
        eventId: r['event_id'] as String,
        userId: r['user_id'] as String,
        activityId: r['activity_id'] as String,
        roomId: r['room_id'] as String?,
        siteId: r['site_id'] as String?,
        status: activityStatusFrom(r['status'] as String),
        note: r['note'] as String?,
        expectedRevision: (r['expected_revision'] as num).toInt(),
        state: opStateFrom(r['state'] as String),
        attempts: (r['attempts'] as num).toInt(),
        createdAt:
            DateTime.fromMillisecondsSinceEpoch(r['created_at'] as int),
        updatedAt:
            DateTime.fromMillisecondsSinceEpoch(r['updated_at'] as int),
        nextAttemptAt: r['next_attempt_at'] == null
            ? null
            : DateTime.fromMillisecondsSinceEpoch(
                r['next_attempt_at'] as int),
        lastError: r['last_error'] as String?,
        detail: r['detail_json'] == null
            ? null
            : (jsonDecode(r['detail_json'] as String)
                as Map<String, dynamic>),
      );

  Map<String, Object?> toRow() => {
        'event_id': eventId,
        'user_id': userId,
        'activity_id': activityId,
        'room_id': roomId,
        'site_id': siteId,
        'status': activityStatusToApi(status) ??
            (throw ArgumentError.value(
                status, 'status', 'Cannot queue an unknown status')),
        'note': note,
        'expected_revision': expectedRevision,
        'state': opStateToDb(state),
        'attempts': attempts,
        'created_at': createdAt.millisecondsSinceEpoch,
        'updated_at': updatedAt.millisecondsSinceEpoch,
        'next_attempt_at': nextAttemptAt?.millisecondsSinceEpoch,
        'last_error': lastError,
        'detail_json': detail == null ? null : jsonEncode(detail),
      };
}

/// Lifecycle of a queued photo upload.
enum PhotoOpState { pending, uploading, synced, failed, blocked }

PhotoOpState photoOpStateFrom(String raw) => switch (raw) {
      'UPLOADING' => PhotoOpState.uploading,
      'SYNCED' => PhotoOpState.synced,
      'FAILED' => PhotoOpState.failed,
      'BLOCKED' => PhotoOpState.blocked,
      _ => PhotoOpState.pending,
    };

String photoOpStateToDb(PhotoOpState s) => s.name.toUpperCase();

/// One durable, user-attributed photo upload. The op row is written in
/// the same transaction that confirms the staged file exists, so a
/// crash can never leave an apparently-valid pending photo whose bytes
/// were not durably saved. `clientEventId` is the server idempotency
/// key and is preserved verbatim across retries.
class PhotoOp {
  const PhotoOp({
    required this.opId,
    required this.clientEventId,
    required this.userId,
    required this.targetType,
    required this.targetId,
    required this.filePath,
    required this.contentHash,
    required this.fileName,
    required this.mimeType,
    required this.fileSize,
    required this.createdAt,
    required this.updatedAt,
    this.siteId,
    this.caption,
    this.state = PhotoOpState.pending,
    this.attempts = 0,
    this.nextAttemptAt,
    this.lastError,
    this.serverPhotoId,
  });

  final String opId;
  final String clientEventId;
  final String userId;
  final String? siteId;
  final PhotoTarget targetType;
  final String targetId;

  /// App-private absolute path — generated name only, never user input.
  final String filePath;
  final String contentHash;
  final String fileName;
  final String mimeType;
  final int fileSize;
  final String? caption;
  final PhotoOpState state;
  final int attempts;
  final DateTime createdAt;
  final DateTime updatedAt;
  final DateTime? nextAttemptAt;
  final String? lastError;
  final String? serverPhotoId;

  PhotoOp copy({
    PhotoOpState? state,
    int? attempts,
    DateTime? updatedAt,
    DateTime? nextAttemptAt,
    bool clearNextAttempt = false,
    String? lastError,
    bool clearError = false,
    String? serverPhotoId,
  }) =>
      PhotoOp(
        opId: opId,
        clientEventId: clientEventId,
        userId: userId,
        siteId: siteId,
        targetType: targetType,
        targetId: targetId,
        filePath: filePath,
        contentHash: contentHash,
        fileName: fileName,
        mimeType: mimeType,
        fileSize: fileSize,
        caption: caption,
        state: state ?? this.state,
        attempts: attempts ?? this.attempts,
        createdAt: createdAt,
        updatedAt: updatedAt ?? this.updatedAt,
        nextAttemptAt:
            clearNextAttempt ? null : (nextAttemptAt ?? this.nextAttemptAt),
        lastError: clearError ? null : (lastError ?? this.lastError),
        serverPhotoId: serverPhotoId ?? this.serverPhotoId,
      );

  factory PhotoOp.fromRow(Map<String, Object?> r) => PhotoOp(
        opId: r['op_id'] as String,
        clientEventId: r['client_event_id'] as String,
        userId: r['user_id'] as String,
        siteId: r['site_id'] as String?,
        targetType: photoTargetFrom(r['target_type'] as String),
        targetId: r['target_id'] as String,
        filePath: r['file_path'] as String,
        contentHash: r['content_hash'] as String,
        fileName: r['file_name'] as String,
        mimeType: r['mime_type'] as String,
        fileSize: (r['file_size'] as num).toInt(),
        caption: r['caption'] as String?,
        state: photoOpStateFrom(r['state'] as String),
        attempts: (r['attempts'] as num).toInt(),
        createdAt:
            DateTime.fromMillisecondsSinceEpoch(r['created_at'] as int),
        updatedAt:
            DateTime.fromMillisecondsSinceEpoch(r['updated_at'] as int),
        nextAttemptAt: r['next_attempt_at'] == null
            ? null
            : DateTime.fromMillisecondsSinceEpoch(
                r['next_attempt_at'] as int),
        lastError: r['last_error'] as String?,
        serverPhotoId: r['server_photo_id'] as String?,
      );

  Map<String, Object?> toRow() => {
        'op_id': opId,
        'client_event_id': clientEventId,
        'user_id': userId,
        'site_id': siteId,
        'target_type': photoTargetToApi(targetType),
        'target_id': targetId,
        'file_path': filePath,
        'content_hash': contentHash,
        'file_name': fileName,
        'mime_type': mimeType,
        'file_size': fileSize,
        'caption': caption,
        'state': photoOpStateToDb(state),
        'attempts': attempts,
        'created_at': createdAt.millisecondsSinceEpoch,
        'updated_at': updatedAt.millisecondsSinceEpoch,
        'next_attempt_at': nextAttemptAt?.millisecondsSinceEpoch,
        'last_error': lastError,
        'server_photo_id': serverPhotoId,
      };
}

/// CRUD facade over [CacheDb]. All operations are parameterized and
/// user-scoped; nothing here trusts client-supplied SQL.
class CacheStore {
  const CacheStore(this._db);
  final CacheDb _db;

  // ---- generic response cache -------------------------------------

  Future<void> putEntry(
      String userId, String key, String payload, DateTime now) {
    return _db._db.insert(
      'cache_entries',
      {
        'user_id': userId,
        'cache_key': key,
        'payload': payload,
        'cached_at': now.millisecondsSinceEpoch,
      },
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<CacheEntry?> getEntry(String userId, String key) async {
    final rows = await _db._db.query('cache_entries',
        where: 'user_id = ? AND cache_key = ?',
        whereArgs: [userId, key],
        limit: 1);
    if (rows.isEmpty) return null;
    final r = rows.first;
    return CacheEntry(
      payload: r['payload'] as String,
      cachedAt:
          DateTime.fromMillisecondsSinceEpoch(r['cached_at'] as int),
    );
  }

  Future<void> clearEntries(String userId) => _db._db.delete(
      'cache_entries',
      where: 'user_id = ?',
      whereArgs: [userId]);

  // ---- meta --------------------------------------------------------

  Future<void> setMeta(String userId, String key, String value) =>
      _db._db.insert(
        'meta',
        {'user_id': userId, 'key': key, 'value': value},
        conflictAlgorithm: ConflictAlgorithm.replace,
      );

  Future<String?> getMeta(String userId, String key) async {
    final rows = await _db._db.query('meta',
        where: 'user_id = ? AND key = ?',
        whereArgs: [userId, key],
        limit: 1);
    return rows.isEmpty ? null : rows.first['value'] as String;
  }

  // ---- pending ops -------------------------------------------------

  /// Inserts the operation inside a transaction so "Saved on device"
  /// is only shown after the row is durable.
  Future<void> enqueue(PendingOp op) => _db._db.transaction((txn) async {
        await txn.insert('pending_ops', op.toRow(),
            conflictAlgorithm: ConflictAlgorithm.abort);
      });

  Future<void> updateOp(PendingOp op) => _db._db.update(
        'pending_ops',
        op.toRow(),
        where: 'event_id = ?',
        whereArgs: [op.eventId],
      );

  /// Atomically replaces a parked op with a fresh operation (new
  /// eventId) — used by user-approved conflict resolution, where the
  /// reviewed re-submit is a new attempt and must not recycle the
  /// rejected attempt's idempotency key.
  Future<void> replaceOp(String oldEventId, PendingOp next) =>
      _db._db.transaction((txn) async {
        await txn.delete('pending_ops',
            where: 'event_id = ?', whereArgs: [oldEventId]);
        await txn.insert('pending_ops', next.toRow(),
            conflictAlgorithm: ConflictAlgorithm.abort);
      });

  Future<void> deleteOp(String eventId) => _db._db.delete('pending_ops',
      where: 'event_id = ?', whereArgs: [eventId]);

  Future<PendingOp?> op(String eventId) async {
    final rows = await _db._db.query('pending_ops',
        where: 'event_id = ?', whereArgs: [eventId], limit: 1);
    return rows.isEmpty ? null : PendingOp.fromRow(rows.first);
  }

  /// Ops that still need attention — excludes fully resolved SYNCED
  /// rows. Ordered by creation so per-activity chains replay in the
  /// order the employee intended.
  Future<List<PendingOp>> outstandingOps(String userId) async {
    final rows = await _db._db.query('pending_ops',
        where: 'user_id = ? AND state != ?',
        whereArgs: [userId, 'SYNCED'],
        orderBy: 'created_at ASC');
    return rows.map(PendingOp.fromRow).toList();
  }

  Future<List<PendingOp>> opsForActivity(
      String userId, String activityId) async {
    final rows = await _db._db.query('pending_ops',
        where: 'user_id = ? AND activity_id = ? AND state != ?',
        whereArgs: [userId, activityId, 'SYNCED'],
        orderBy: 'created_at ASC');
    return rows.map(PendingOp.fromRow).toList();
  }

  /// Crash/restart recovery: anything left SYNCING was in-flight when
  /// the process died — its fate is unknown, so it reverts to PENDING
  /// and the idempotent eventId retry settles it.
  Future<void> resetInterrupted(String userId) => _db._db.update(
        'pending_ops',
        {'state': 'PENDING', 'updated_at': DateTime.now().millisecondsSinceEpoch},
        where: 'user_id = ? AND state = ?',
        whereArgs: [userId, 'SYNCING'],
      );

  // ---- photo ops ---------------------------------------------------

  /// Inserts the photo operation inside a transaction — callers stage
  /// the file first, so the row is only written after bytes exist.
  Future<void> enqueuePhotoOp(PhotoOp op) => _db._db.transaction((txn) async {
        await txn.insert('photo_ops', op.toRow(),
            conflictAlgorithm: ConflictAlgorithm.abort);
      });

  Future<void> updatePhotoOp(PhotoOp op) => _db._db.update(
        'photo_ops',
        op.toRow(),
        where: 'op_id = ?',
        whereArgs: [op.opId],
      );

  Future<void> deletePhotoOp(String opId) => _db._db.delete('photo_ops',
      where: 'op_id = ?', whereArgs: [opId]);

  Future<PhotoOp?> photoOp(String opId) async {
    final rows = await _db._db.query('photo_ops',
        where: 'op_id = ?', whereArgs: [opId], limit: 1);
    return rows.isEmpty ? null : PhotoOp.fromRow(rows.first);
  }

  /// Photo ops for one gallery target — newest first for display.
  Future<List<PhotoOp>> photoOpsForTarget(
      String userId, PhotoTarget targetType, String targetId) async {
    final rows = await _db._db.query('photo_ops',
        where: 'user_id = ? AND target_type = ? AND target_id = ?',
        whereArgs: [userId, photoTargetToApi(targetType), targetId],
        orderBy: 'created_at DESC');
    return rows.map(PhotoOp.fromRow).toList();
  }

  /// Ops that still need attention — SYNCED rows are resolved history.
  /// Ordered oldest-first so uploads replay in capture order.
  Future<List<PhotoOp>> outstandingPhotoOps(String userId) async {
    final rows = await _db._db.query('photo_ops',
        where: 'user_id = ? AND state != ?',
        whereArgs: [userId, 'SYNCED'],
        orderBy: 'created_at ASC');
    return rows.map(PhotoOp.fromRow).toList();
  }

  /// Crash/restart recovery for uploads: UPLOADING rows whose fate is
  /// unknown revert to PENDING — the unchanged clientEventId lets the
  /// server dedupe a request that actually landed.
  Future<void> resetInterruptedUploads(String userId) => _db._db.update(
        'photo_ops',
        {'state': 'PENDING', 'updated_at': DateTime.now().millisecondsSinceEpoch},
        where: 'user_id = ? AND state = ?',
        whereArgs: [userId, 'UPLOADING'],
      );
}
