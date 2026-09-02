/// Wire protocol shared by the host and every client.
///
/// The transport is a plain WebSocket carrying newline-free JSON objects, each
/// with a `t` (type) field. Everything is intentionally small and flat so the
/// same message can be forwarded straight into the three.js engine without a
/// second translation layer.
class Proto {
  const Proto._();

  /// UDP port the host beacons on, and clients listen on.
  static const int discoveryPort = 45455;

  /// TCP port the host's WebSocket server binds to.
  static const int gamePort = 45456;

  /// Magic prefix so we ignore unrelated broadcast traffic on the subnet.
  static const String beaconMagic = 'SANGAR1';

  /// How often the host re-broadcasts its beacon.
  static const Duration beaconInterval = Duration(milliseconds: 1200);

  /// A discovered group disappears from the browser after this long silent.
  static const Duration beaconTtl = Duration(seconds: 5);

  /// Client -> host movement/aim updates.
  static const Duration inputInterval = Duration(milliseconds: 50);

  /// Host -> everyone world snapshots.
  static const Duration snapshotInterval = Duration(milliseconds: 50);

  static const Duration pingInterval = Duration(seconds: 3);
  static const Duration clientTimeout = Duration(seconds: 12);

  // ---- message types -----------------------------------------------------
  // client -> host
  static const String hello = 'hello';
  static const String loadout = 'loadout';
  static const String ready = 'ready';
  static const String state = 'state';
  static const String hit = 'hit';
  static const String grenade = 'nade';
  static const String pong = 'pong';
  static const String chat = 'chat';
  static const String leave = 'leave';

  // host -> client
  static const String welcome = 'welcome';
  static const String lobby = 'lobby';
  static const String start = 'start';
  static const String snapshot = 'snap';
  static const String kill = 'kill';
  static const String damage = 'dmg';
  static const String respawn = 'respawn';
  static const String matchEnd = 'end';
  static const String ping = 'ping';
  static const String kicked = 'kicked';

  /// Sanity ceiling applied to every client-reported hit so a tampered or
  /// buggy peer cannot one-shot the lobby.
  static const double maxReportedDamage = 130.0;
}
