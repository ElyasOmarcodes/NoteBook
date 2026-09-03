import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// Serves the bundled three.js engine over `http://localhost` for the WebView.
///
/// The engine is written as ES modules, and Chromium refuses to load a module
/// graph from a `file://` origin — every `import` is blocked as a cross-origin
/// request. Serving the same Flutter assets from a loopback HTTP server gives
/// the page a real origin, so modules, workers and fetch all behave normally.
///
/// The server is a process-wide singleton: it is started on the first match and
/// left running, because tearing it down and rebinding the port between matches
/// races with the WebView's own teardown.
class EngineServer {
  EngineServer._();

  static final EngineServer instance = EngineServer._();

  /// Well outside the range Android hands to ordinary apps, and clear of the
  /// game's own LAN ports (45455 / 45456).
  static const int port = 45099;

  InAppLocalhostServer? _server;
  bool _starting = false;

  String get indexUrl => 'http://localhost:$port/index.html';

  Future<void> ensureRunning() async {
    if (_server?.isRunning() ?? false) return;
    if (_starting) return;
    _starting = true;
    try {
      _server ??= InAppLocalhostServer(
        port: port,
        documentRoot: 'assets/web',
        directoryIndex: 'index.html',
      );
      if (!_server!.isRunning()) {
        await _server!.start();
      }
    } finally {
      _starting = false;
    }
  }
}
