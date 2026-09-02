import 'dart:async';
import 'dart:convert';
import 'dart:io';

import '../models/match.dart';
import 'protocol.dart';

/// Helpers for finding the device's address on the hotspot subnet and for
/// computing the right broadcast target.
class LanInfo {
  /// Returns the first non-loopback IPv4 address, preferring the ranges Android
  /// hands out for a phone hotspot (192.168.43.x on most devices, 192.168.x on
  /// routers, 10.x on tethering).
  static Future<InternetAddress?> localAddress() async {
    try {
      final interfaces = await NetworkInterface.list(
        includeLoopback: false,
        type: InternetAddressType.IPv4,
      );
      InternetAddress? fallback;
      for (final iface in interfaces) {
        for (final addr in iface.addresses) {
          if (addr.isLoopback) continue;
          fallback ??= addr;
          final ip = addr.address;
          if (ip.startsWith('192.168.') ||
              ip.startsWith('10.') ||
              ip.startsWith('172.')) {
            return addr;
          }
        }
      }
      return fallback;
    } on OSError {
      return null;
    } catch (_) {
      return null;
    }
  }

  /// `192.168.43.1` -> `192.168.43.255`. Falls back to the global broadcast.
  static InternetAddress broadcastFor(InternetAddress? local) {
    if (local == null) return InternetAddress('255.255.255.255');
    final parts = local.address.split('.');
    if (parts.length != 4) return InternetAddress('255.255.255.255');
    return InternetAddress('${parts[0]}.${parts[1]}.${parts[2]}.255');
  }
}

/// Broadcasts the host's group so nearby phones can list it without typing an
/// IP address.
class GroupAdvertiser {
  RawDatagramSocket? _socket;
  Timer? _timer;
  Map<String, dynamic> Function()? _payloadBuilder;
  InternetAddress? _broadcast;

  bool get isRunning => _socket != null;

  Future<void> start(Map<String, dynamic> Function() payloadBuilder) async {
    await stop();
    _payloadBuilder = payloadBuilder;
    final local = await LanInfo.localAddress();
    _broadcast = LanInfo.broadcastFor(local);
    _socket = await RawDatagramSocket.bind(InternetAddress.anyIPv4, 0);
    _socket!.broadcastEnabled = true;

    // Answer directed probes instantly so "search" feels immediate.
    _socket!.listen((event) {
      if (event != RawSocketEvent.read) return;
      final dg = _socket?.receive();
      if (dg == null) return;
      final text = utf8.decode(dg.data, allowMalformed: true);
      if (text == '${Proto.beaconMagic}:probe') {
        _sendTo(dg.address, dg.port);
      }
    });

    _timer = Timer.periodic(Proto.beaconInterval, (_) => _broadcastNow());
    _broadcastNow();
  }

  void _broadcastNow() {
    final b = _broadcast;
    if (b == null) return;
    _sendTo(b, Proto.discoveryPort);
    // Some Android builds drop subnet broadcasts; the global one usually lands.
    _sendTo(InternetAddress('255.255.255.255'), Proto.discoveryPort);
  }

  void _sendTo(InternetAddress address, int port) {
    final socket = _socket;
    final build = _payloadBuilder;
    if (socket == null || build == null) return;
    try {
      final body = '${Proto.beaconMagic}:${jsonEncode(build())}';
      socket.send(utf8.encode(body), address, port);
    } catch (_) {
      // A transient send failure just means one missed beacon.
    }
  }

  Future<void> stop() async {
    _timer?.cancel();
    _timer = null;
    _socket?.close();
    _socket = null;
  }
}

/// Client-side listener that keeps a live list of groups on the subnet.
class GroupBrowser {
  RawDatagramSocket? _socket;
  Timer? _sweep;
  final Map<String, GroupBeacon> _groups = {};
  final _controller = StreamController<List<GroupBeacon>>.broadcast();

  Stream<List<GroupBeacon>> get groups => _controller.stream;
  List<GroupBeacon> get current => _sorted();

  Future<void> start() async {
    await stop();
    _socket = await RawDatagramSocket.bind(
      InternetAddress.anyIPv4,
      Proto.discoveryPort,
      reuseAddress: true,
      reusePort: false,
    );
    _socket!.broadcastEnabled = true;
    _socket!.listen(_onEvent);
    _sweep = Timer.periodic(const Duration(seconds: 1), (_) => _expire());
    await probe();
  }

  /// Fires a directed probe so hosts answer immediately (the "search" button).
  Future<void> probe() async {
    final socket = _socket;
    if (socket == null) return;
    final local = await LanInfo.localAddress();
    final targets = <InternetAddress>[
      LanInfo.broadcastFor(local),
      InternetAddress('255.255.255.255'),
    ];
    for (final t in targets) {
      try {
        socket.send(
          utf8.encode('${Proto.beaconMagic}:probe'),
          t,
          Proto.discoveryPort,
        );
      } catch (_) {
        // Ignore: the periodic beacons will still find the host.
      }
    }
  }

  void _onEvent(RawSocketEvent event) {
    if (event != RawSocketEvent.read) return;
    final dg = _socket?.receive();
    if (dg == null) return;
    final text = utf8.decode(dg.data, allowMalformed: true);
    if (!text.startsWith('${Proto.beaconMagic}:')) return;
    final body = text.substring(Proto.beaconMagic.length + 1);
    if (body == 'probe') return;
    try {
      final json = jsonDecode(body) as Map<String, dynamic>;
      final beacon = GroupBeacon.fromJson(json, dg.address.address);
      _groups[beacon.key] = beacon;
      _controller.add(_sorted());
    } catch (_) {
      // Malformed beacon from an incompatible build — skip it.
    }
  }

  void _expire() {
    final now = DateTime.now();
    final before = _groups.length;
    _groups.removeWhere((_, g) => now.difference(g.seenAt) > Proto.beaconTtl);
    if (_groups.length != before) _controller.add(_sorted());
  }

  List<GroupBeacon> _sorted() {
    final list = _groups.values.toList()
      ..sort((a, b) => a.groupName.compareTo(b.groupName));
    return list;
  }

  Future<void> stop() async {
    _sweep?.cancel();
    _sweep = null;
    _socket?.close();
    _socket = null;
    _groups.clear();
  }

  Future<void> dispose() async {
    await stop();
    await _controller.close();
  }
}
