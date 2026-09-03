import 'package:flutter_test/flutter_test.dart';
import 'package:sangar_arena/models/catalog.dart';
import 'package:sangar_arena/models/match.dart';

void main() {
  group('catalog', () {
    test('every agent and weapon id is unique', () {
      final agentIds = Catalog.agents.map((a) => a.id).toSet();
      expect(agentIds.length, Catalog.agents.length);

      final weaponIds = Catalog.weapons.map((w) => w.id).toSet();
      expect(weaponIds.length, Catalog.weapons.length);
    });

    test('lookups fall back instead of throwing on an unknown id', () {
      expect(Catalog.agentById('nope').id, Catalog.agents.first.id);
      expect(Catalog.weaponById('nope').id, Catalog.weapons.first.id);
      expect(Catalog.grenadeById('nope').id, Catalog.grenades.first.id);
      expect(Catalog.mapById('nope').id, Catalog.maps.first.id);
    });

    test('stat bars stay inside 0..1 for every weapon', () {
      for (final w in Catalog.weapons) {
        expect(w.damageBar, inInclusiveRange(0, 1), reason: w.id);
        expect(w.rateBar, inInclusiveRange(0, 1), reason: w.id);
        expect(w.accuracyBar, inInclusiveRange(0, 1), reason: w.id);
        expect(w.rangeBar, inInclusiveRange(0, 1), reason: w.id);
      }
    });

    test('the engine gets every field it builds a model from', () {
      final agent = Catalog.agents.first.toJson();
      for (final key in ['id', 'skin', 'outfit', 'accent', 'hair']) {
        expect(agent.containsKey(key), isTrue, reason: key);
      }
      final weapon = Catalog.weapons.first.toJson();
      for (final key in ['id', 'kind', 'damage', 'rpm', 'magazine', 'spread']) {
        expect(weapon.containsKey(key), isTrue, reason: key);
      }
    });
  });

  group('match config', () {
    test('round-trips through JSON', () {
      final config = MatchConfig(
        groupName: 'سنګر',
        mode: GameMode.dm,
        durationSeconds: 420,
        killLimit: 17,
        maxPlayers: 6,
        friendlyFire: true,
        respawnSeconds: 8,
      );
      final restored = MatchConfig.fromJson(config.toJson());
      expect(restored.groupName, config.groupName);
      expect(restored.mode, GameMode.dm);
      expect(restored.durationSeconds, 420);
      expect(restored.killLimit, 17);
      expect(restored.maxPlayers, 6);
      expect(restored.friendlyFire, isTrue);
      expect(restored.respawnSeconds, 8);
    });

    test('falls back to defaults on a partial payload', () {
      final restored = MatchConfig.fromJson(const {});
      expect(restored.mode, GameMode.tdm);
      expect(restored.durationSeconds, 600);
    });
  });

  group('player', () {
    test('score and accuracy derive from the raw counters', () {
      final p = PlayerInfo(
        id: 'a',
        name: 'Zmarai',
        agentId: 'zmarai',
        primaryId: 'ak_sangar',
        secondaryId: 'pistol_teera',
        grenadeId: 'frag',
        kills: 3,
        assists: 2,
        shotsFired: 40,
        shotsHit: 10,
      );
      expect(p.score, 3 * 100 + 2 * 25);
      expect(p.accuracy, closeTo(0.25, 1e-9));
    });

    test('accuracy is zero rather than NaN before the first shot', () {
      final p = PlayerInfo(
        id: 'a',
        name: 'x',
        agentId: 'zmarai',
        primaryId: 'ak_sangar',
        secondaryId: 'pistol_teera',
        grenadeId: 'frag',
      );
      expect(p.accuracy, 0);
    });
  });

  group('group beacon', () {
    test('parses a beacon payload and keeps the sender address', () {
      final beacon = GroupBeacon(
        groupName: 'Sangar Chowk',
        hostName: 'Baaz',
        address: '192.168.43.1',
        port: 45456,
        mapId: 'sangar_chowk',
        mode: GameMode.tdm,
        players: 3,
        maxPlayers: 8,
        phase: MatchPhase.lobby,
        durationSeconds: 600,
      );
      final restored =
          GroupBeacon.fromJson(beacon.toJson(), '192.168.43.1');
      expect(restored.groupName, 'Sangar Chowk');
      expect(restored.address, '192.168.43.1');
      expect(restored.isJoinable, isTrue);
    });

    test('a full lobby is not joinable', () {
      final beacon = GroupBeacon(
        groupName: 'g',
        hostName: 'h',
        address: '10.0.0.2',
        port: 45456,
        mapId: 'sangar_chowk',
        mode: GameMode.dm,
        players: 8,
        maxPlayers: 8,
        phase: MatchPhase.lobby,
        durationSeconds: 600,
      );
      expect(beacon.isFull, isTrue);
      expect(beacon.isJoinable, isFalse);
    });
  });
}
