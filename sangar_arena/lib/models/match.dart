import 'catalog.dart';

enum GameMode { tdm, dm }

enum MatchPhase { lobby, countdown, live, ended }

/// Everything the host picks when creating a group.
class MatchConfig {
  MatchConfig({
    required this.groupName,
    this.mapId = 'sangar_chowk',
    this.mode = GameMode.tdm,
    this.durationSeconds = 600,
    this.killLimit = 30,
    this.maxPlayers = 8,
    this.friendlyFire = false,
    this.respawnSeconds = 5,
  });

  String groupName;
  String mapId;
  GameMode mode;
  int durationSeconds;
  int killLimit;
  int maxPlayers;
  bool friendlyFire;
  int respawnSeconds;

  MapDef get map => Catalog.mapById(mapId);

  Map<String, dynamic> toJson() => {
        'groupName': groupName,
        'mapId': mapId,
        'mode': mode.name,
        'durationSeconds': durationSeconds,
        'killLimit': killLimit,
        'maxPlayers': maxPlayers,
        'friendlyFire': friendlyFire,
        'respawnSeconds': respawnSeconds,
      };

  static MatchConfig fromJson(Map<String, dynamic> j) => MatchConfig(
        groupName: (j['groupName'] ?? 'Sangar') as String,
        mapId: (j['mapId'] ?? 'sangar_chowk') as String,
        mode: GameMode.values.firstWhere(
          (m) => m.name == j['mode'],
          orElse: () => GameMode.tdm,
        ),
        durationSeconds: (j['durationSeconds'] ?? 600) as int,
        killLimit: (j['killLimit'] ?? 30) as int,
        maxPlayers: (j['maxPlayers'] ?? 8) as int,
        friendlyFire: (j['friendlyFire'] ?? false) as bool,
        respawnSeconds: (j['respawnSeconds'] ?? 5) as int,
      );

  MatchConfig copy() => MatchConfig.fromJson(toJson());
}

/// A player as tracked by the lobby and the scoreboard.
class PlayerInfo {
  PlayerInfo({
    required this.id,
    required this.name,
    required this.agentId,
    required this.primaryId,
    required this.secondaryId,
    required this.grenadeId,
    this.team = 0,
    this.isHost = false,
    this.ready = false,
    this.kills = 0,
    this.deaths = 0,
    this.assists = 0,
    this.shotsFired = 0,
    this.shotsHit = 0,
    this.ping = 0,
    this.connected = true,
  });

  final String id;
  String name;
  String agentId;
  String primaryId;
  String secondaryId;
  String grenadeId;
  int team;
  bool isHost;
  bool ready;
  int kills;
  int deaths;
  int assists;
  int shotsFired;
  int shotsHit;
  int ping;
  bool connected;

  int get score => kills * 100 + assists * 25;

  double get accuracy => shotsFired == 0 ? 0 : shotsHit / shotsFired;

  AgentDef get agent => Catalog.agentById(agentId);

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'agentId': agentId,
        'primaryId': primaryId,
        'secondaryId': secondaryId,
        'grenadeId': grenadeId,
        'team': team,
        'isHost': isHost,
        'ready': ready,
        'kills': kills,
        'deaths': deaths,
        'assists': assists,
        'shotsFired': shotsFired,
        'shotsHit': shotsHit,
        'ping': ping,
        'connected': connected,
      };

  static PlayerInfo fromJson(Map<String, dynamic> j) => PlayerInfo(
        id: j['id'] as String,
        name: (j['name'] ?? 'Player') as String,
        agentId: (j['agentId'] ?? 'zmarai') as String,
        primaryId: (j['primaryId'] ?? 'ak_sangar') as String,
        secondaryId: (j['secondaryId'] ?? 'pistol_teera') as String,
        grenadeId: (j['grenadeId'] ?? 'frag') as String,
        team: (j['team'] ?? 0) as int,
        isHost: (j['isHost'] ?? false) as bool,
        ready: (j['ready'] ?? false) as bool,
        kills: (j['kills'] ?? 0) as int,
        deaths: (j['deaths'] ?? 0) as int,
        assists: (j['assists'] ?? 0) as int,
        shotsFired: (j['shotsFired'] ?? 0) as int,
        shotsHit: (j['shotsHit'] ?? 0) as int,
        ping: (j['ping'] ?? 0) as int,
        connected: (j['connected'] ?? true) as bool,
      );

  void applyStats(Map<String, dynamic> j) {
    kills = (j['kills'] ?? kills) as int;
    deaths = (j['deaths'] ?? deaths) as int;
    assists = (j['assists'] ?? assists) as int;
    shotsFired = (j['shotsFired'] ?? shotsFired) as int;
    shotsHit = (j['shotsHit'] ?? shotsHit) as int;
  }
}

/// A group advertised on the LAN, as seen by a client browsing for games.
class GroupBeacon {
  GroupBeacon({
    required this.groupName,
    required this.hostName,
    required this.address,
    required this.port,
    required this.mapId,
    required this.mode,
    required this.players,
    required this.maxPlayers,
    required this.phase,
    required this.durationSeconds,
    DateTime? seenAt,
  }) : seenAt = seenAt ?? DateTime.now();

  final String groupName;
  final String hostName;
  final String address;
  final int port;
  final String mapId;
  final GameMode mode;
  final int players;
  final int maxPlayers;
  final MatchPhase phase;
  final int durationSeconds;
  DateTime seenAt;

  bool get isFull => players >= maxPlayers;
  bool get isJoinable => phase != MatchPhase.ended && !isFull;
  String get key => '$address:$port';

  Map<String, dynamic> toJson() => {
        'groupName': groupName,
        'hostName': hostName,
        'port': port,
        'mapId': mapId,
        'mode': mode.name,
        'players': players,
        'maxPlayers': maxPlayers,
        'phase': phase.name,
        'durationSeconds': durationSeconds,
      };

  static GroupBeacon fromJson(Map<String, dynamic> j, String address) =>
      GroupBeacon(
        groupName: (j['groupName'] ?? 'Sangar') as String,
        hostName: (j['hostName'] ?? '-') as String,
        address: address,
        port: (j['port'] ?? 45456) as int,
        mapId: (j['mapId'] ?? 'sangar_chowk') as String,
        mode: GameMode.values
            .firstWhere((m) => m.name == j['mode'], orElse: () => GameMode.tdm),
        players: (j['players'] ?? 0) as int,
        maxPlayers: (j['maxPlayers'] ?? 8) as int,
        phase: MatchPhase.values.firstWhere((p) => p.name == j['phase'],
            orElse: () => MatchPhase.lobby),
        durationSeconds: (j['durationSeconds'] ?? 600) as int,
      );
}

/// One line of the kill feed / toast strip.
class KillEvent {
  KillEvent({
    required this.killerName,
    required this.victimName,
    required this.weaponId,
    this.headshot = false,
    this.killerTeam = 0,
    this.victimTeam = 1,
    DateTime? at,
  }) : at = at ?? DateTime.now();

  final String killerName;
  final String victimName;
  final String weaponId;
  final bool headshot;
  final int killerTeam;
  final int victimTeam;
  final DateTime at;

  Map<String, dynamic> toJson() => {
        'killerName': killerName,
        'victimName': victimName,
        'weaponId': weaponId,
        'headshot': headshot,
        'killerTeam': killerTeam,
        'victimTeam': victimTeam,
      };

  static KillEvent fromJson(Map<String, dynamic> j) => KillEvent(
        killerName: (j['killerName'] ?? '?') as String,
        victimName: (j['victimName'] ?? '?') as String,
        weaponId: (j['weaponId'] ?? '') as String,
        headshot: (j['headshot'] ?? false) as bool,
        killerTeam: (j['killerTeam'] ?? 0) as int,
        victimTeam: (j['victimTeam'] ?? 1) as int,
      );
}
