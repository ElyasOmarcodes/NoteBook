
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
