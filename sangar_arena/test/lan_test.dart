import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sangar_arena/net/lan.dart';

void main() {
  group('broadcast address', () {
    test('derives the subnet broadcast from a hotspot address', () {
      final b = LanInfo.broadcastFor(InternetAddress('192.168.43.17'));
      expect(b.address, '192.168.43.255');
    });

    test('falls back to the global broadcast when there is no address', () {
      expect(LanInfo.broadcastFor(null).address, '255.255.255.255');
    });
  });
}
