import 'dart:async';
import 'dart:convert';

import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// Thin, typed wrapper over the WebView message channel.
///
/// Flutter -> JS goes through `window.SangarGame.command(...)`; JS -> Flutter
/// arrives on the `sangar` JavaScript handler. Outbound messages sent before
/// the page finishes loading are queued rather than dropped.
class GameBridge {
  GameBridge();

  InAppWebViewController? _controller;
  bool _pageReady = false;
  final List<String> _queue = [];
  final _incoming = StreamController<Map<String, dynamic>>.broadcast();

  /// Messages coming out of the engine.
  Stream<Map<String, dynamic>> get messages => _incoming.stream;

  /// True once the engine has reported that its world is built.
  bool engineReady = false;

  void attach(InAppWebViewController controller) {
    _controller = controller;
    controller.addJavaScriptHandler(
      handlerName: 'sangar',
      callback: (args) {
        if (args.isEmpty) return null;
        try {
          final msg = jsonDecode(args.first as String) as Map<String, dynamic>;
          if (msg['t'] == 'ready') engineReady = true;
          _incoming.add(msg);
        } catch (_) {
          // Ignore malformed frames rather than tearing down the channel.
        }
        return null;
      },
    );
  }

  /// Called when the page's DOM is up; flushes anything queued.
  void onPageLoaded() {
    _pageReady = true;
    for (final js in _queue) {
      _controller?.evaluateJavascript(source: js);
    }
    _queue.clear();
  }

  /// Boots the engine with the full match configuration.
  Future<void> start(Map<String, dynamic> config) async {
    final payload = jsonEncode(jsonEncode(config));
    _eval('window.SangarGame && window.SangarGame.start($payload);');
  }

  /// Sends a command to the running engine.
  void send(Map<String, dynamic> message) {
    final payload = jsonEncode(jsonEncode(message));
    _eval('window.SangarGame && window.SangarGame.command($payload);');
  }

  void resumeAudio() =>
      _eval('window.SangarGame && window.SangarGame.resumeAudio();');

  void stop() => _eval('window.SangarGame && window.SangarGame.stop();');

  void _eval(String js) {
    if (!_pageReady || _controller == null) {
      _queue.add(js);
      return;
    }
    _controller!.evaluateJavascript(source: js);
  }

  Future<void> dispose() async {
    await _incoming.close();
    _controller = null;
  }
}
