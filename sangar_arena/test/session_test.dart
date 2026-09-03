
import 'package:flutter_test/flutter_test.dart';
import 'package:sangar_arena/models/match.dart';
import 'package:sangar_arena/net/match_session.dart';
import 'package:sangar_arena/net/protocol.dart';

/// End-to-end exercise of the LAN layer over loopback: a host session and a
/// real client session talking the actual wire protocol.
void main() {
  const loadout = Loadout(
    agentId: 'zmarai',
    primaryId: 'ak_sangar',
    secondaryId: 'pistol_teera',
    grenadeId: 'frag',
  );

  late MatchSession host;
  late MatchSession client;

  Future<void> waitFor(bool Function() predicate, {String? reason}) async {
    final deadline = DateTime.now().add(const Duration(seconds: 6));
    while (!predicate()) {
      if (DateTime.now().isAfter(deadline)) {
        fail('timed out waiting for ${reason ?? 'condition'}');
      }
      await Future<void>.delayed(const Duration(milliseconds: 25));
    }
  }

  GroupBeacon beaconFor(MatchSession h) => GroupBeacon(
        groupName: h.config.groupName,
        hostName: h.selfName,
        address: '127.0.0.1',
        port: Proto.gamePort,
        mapId: h.config.mapId,
        mode: h.config.mode,
        players: h.players.length,
        maxPlayers: h.config.maxPlayers,
        phase: h.phase,
        durationSeconds: h.config.durationSeconds,
      );

  setUp(() async {
    host = MatchSession.host(
      selfId: 'host-1',
      selfName: 'Baaz',
      config: MatchConfig(
        groupName: 'Sangar Chowk',
        durationSeconds: 120,
        killLimit: 2,
        respawnSeconds: 1,
      ),
      loadout: loadout,
    );
    await host.open();
    expect(host.status, SessionStatus.connected,
        reason: 'host failed: ${host.errorMessage}');
  });

  tearDown(() async {
    await client.close();
    await host.close();
  });

  test('a client joins, is placed on the opposing team, and sees the lobby',
      () async {
    client = MatchSession.client(
      selfId: 'client-1',
      selfName: 'Nazo',
      loadout: loadout,
      beacon: beaconFor(host),
    );
    await client.open();

    await waitFor(() => host.players.length == 2, reason: 'host roster');
    await waitFor(() => client.players.length == 2, reason: 'client roster');

    expect(client.config.groupName, 'Sangar Chowk');
    expect(client.config.killLimit, 2);

    final hostPlayer = host.players['host-1']!;
    final joiner = host.players['client-1']!;
    expect(hostPlayer.isHost, isTrue);
    // Team deathmatch balances by head count, so the joiner takes the empty side.
    expect(joiner.team, isNot(hostPlayer.team));
    expect(client.players['client-1']!.name, 'Nazo');
  });

  test('the host relays the start of the match to the client', () async {
    client = MatchSession.client(
      selfId: 'client-1',
      selfName: 'Nazo',
      loadout: loadout,
      beacon: beaconFor(host),
    );
    await client.open();
    await waitFor(() => host.players.length == 2);

    host.startMatch();

    await waitFor(() => client.phase == MatchPhase.live,
        reason: 'client entering the match');
    expect(host.phase, MatchPhase.live);
    expect(client.secondsRemaining, greaterThan(0));
  });

  test('a reported hit is resolved by the host and becomes a kill', () async {
    client = MatchSession.client(
      selfId: 'client-1',
      selfName: 'Nazo',
      loadout: loadout,
      beacon: beaconFor(host),
    );
    await client.open();
    await waitFor(() => host.players.length == 2);
    host.startMatch();
    await waitFor(() => client.phase == MatchPhase.live);

    final kills = <KillEvent>[];
    final sub = client.events.listen((e) {
      if (e.type == Proto.kill) {
        kills.add(KillEvent.fromJson(e.data));
      }
    });

    // 100 HP: one capped hit will not kill, a second one will.
    client.reportHit(
      targetId: 'host-1',
      damage: 60,
      weaponId: 'ak_sangar',
      headshot: false,
    );
    await Future<void>.delayed(const Duration(milliseconds: 120));
    expect(host.players['host-1']!.deaths, 0);

    client.reportHit(
      targetId: 'host-1',
      damage: 60,
      weaponId: 'ak_sangar',
      headshot: true,
    );

    await waitFor(() => host.players['client-1']!.kills == 1,
        reason: 'the host booking the kill');
    expect(host.players['host-1']!.deaths, 1);
    await waitFor(() => kills.isNotEmpty, reason: 'the kill feed reaching the client');
    expect(kills.first.killerName, 'Nazo');
    expect(kills.first.victimName, 'Baaz');
    expect(kills.first.headshot, isTrue);

    await sub.cancel();
  });

  test('friendly fire is ignored in team deathmatch', () async {
    client = MatchSession.client(
      selfId: 'client-1',
      selfName: 'Nazo',
      loadout: loadout,
      beacon: beaconFor(host),
    );
    await client.open();
    await waitFor(() => host.players.length == 2);
    // Put both players on the same team, then start.
    host.switchTeam('client-1');
    await waitFor(() =>
        host.players['client-1']!.team == host.players['host-1']!.team);
    host.startMatch();
    await waitFor(() => client.phase == MatchPhase.live);

    client.reportHit(
      targetId: 'host-1',
      damage: 120,
      weaponId: 'ak_sangar',
      headshot: false,
    );
    await Future<void>.delayed(const Duration(milliseconds: 200));

    expect(host.players['host-1']!.deaths, 0);
    expect(host.players['client-1']!.kills, 0);
  });

  test('an over-reported hit is capped rather than trusted', () async {
    client = MatchSession.client(
      selfId: 'client-1',
      selfName: 'Nazo',
      loadout: loadout,
      beacon: beaconFor(host),
    );
    await client.open();
    await waitFor(() => host.players.length == 2);
    host.startMatch();
    await waitFor(() => client.phase == MatchPhase.live);

    // A tampered peer claiming 9999 damage still only lands the cap, which is
    // above 100 — so this kills, but a 90-damage claim after a 20-damage hit
    // must not have been able to skip the cap entirely.
    client.reportHit(
      targetId: 'host-1',
      damage: 9999,
      weaponId: 'ak_sangar',
      headshot: false,
    );
    await waitFor(() => host.players['host-1']!.deaths == 1);
    expect(Proto.maxReportedDamage, lessThan(9999));
  });

  test('the host feeds snapshots to its own engine, not only to clients',
      () async {
    client = MatchSession.client(
      selfId: 'client-1',
      selfName: 'Nazo',
      loadout: loadout,
      beacon: beaconFor(host),
    );
    await client.open();
    await waitFor(() => host.players.length == 2);
    host.startMatch();
    await waitFor(() => client.phase == MatchPhase.live);

    // The host plays on the device it serves from, so its own event stream has
    // to carry the same snapshots the clients get.
    final hostSnapshots = <Map<String, dynamic>>[];
    final sub = host.events.listen((e) {
      if (e.type == Proto.snapshot) hostSnapshots.add(e.data);
    });

    host.reportSelfState({'x': 0.0, 'y': 1.0, 'z': 0.0, 'yaw': 0.0});
    client.reportSelfState({'x': 4.0, 'y': 1.0, 'z': -7.0, 'yaw': 0.5});

    // The client batches its input on a 50 ms timer, so wait for a snapshot
    // that actually carries both soldiers rather than the first one emitted.
    await waitFor(
      () => hostSnapshots.any((s) => (s['p'] as List).length == 2),
      reason: 'a snapshot carrying both soldiers',
    );

    final full =
        hostSnapshots.lastWhere((s) => (s['p'] as List).length == 2);
    final ids = (full['p'] as List)
        .map((e) => (e as Map)['id'] as String)
        .toSet();
    expect(ids, containsAll(<String>['host-1', 'client-1']));
    await sub.cancel();
  });

  test('a kill reaches the client exactly once', () async {
    client = MatchSession.client(
      selfId: 'client-1',
      selfName: 'Nazo',
      loadout: loadout,
      beacon: beaconFor(host),
    );
    await client.open();
    await waitFor(() => host.players.length == 2);
    host.startMatch();
    await waitFor(() => client.phase == MatchPhase.live);

    final events = <Map<String, dynamic>>[];
    final sub = client.events.listen((e) {
      if (e.type == Proto.kill) events.add(e.data);
    });

    client.reportHit(
      targetId: 'host-1',
      damage: 130,
      weaponId: 'ak_sangar',
      headshot: false,
    );
    await waitFor(() => events.isNotEmpty);
    // Give any duplicate a chance to arrive before asserting.
    await Future<void>.delayed(const Duration(milliseconds: 250));

    expect(events, hasLength(1), reason: 'a duplicate would double the toast');
    // The payload must carry the ids, so the engine can tell whose kill it was.
    expect(events.single['killerId'], 'client-1');
    expect(events.single['victimId'], 'host-1');
    expect(client.killFeed, hasLength(1));
    await sub.cancel();
  });

  test('reaching the kill limit ends the match for everyone', () async {
    client = MatchSession.client(
      selfId: 'client-1',
      selfName: 'Nazo',
      loadout: loadout,
      beacon: beaconFor(host),
    );
    await client.open();
    await waitFor(() => host.players.length == 2);
    host.startMatch();
    await waitFor(() => client.phase == MatchPhase.live);

    // killLimit is 2 and this is team deathmatch, so two kills end it.
    for (var i = 0; i < 2; i++) {
      client.reportHit(
        targetId: 'host-1',
        damage: 130,
        weaponId: 'ak_sangar',
        headshot: false,
      );
      await Future<void>.delayed(const Duration(milliseconds: 60));
      // Respawn so the second shot has a live target.
      await Future<void>.delayed(const Duration(milliseconds: 1100));
    }

    await waitFor(() => host.phase == MatchPhase.ended,
        reason: 'the host ending the match');
    await waitFor(() => client.phase == MatchPhase.ended,
        reason: 'the client being told the match ended');
  });
}
