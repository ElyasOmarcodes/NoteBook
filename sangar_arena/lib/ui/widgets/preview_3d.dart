import 'package:flutter/foundation.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

import '../../game/engine_server.dart';
import '../../theme/app_theme.dart';

/// A live 3D turntable of the exact model the match will use.
///
/// It points at the engine's own `preview.html`, served from the same
/// localhost server the game runs on, so what a player picks here is literally
/// the file that walks onto the map — there is no separate preview art to fall
/// out of step with the game.
class Preview3D extends StatefulWidget {
  const Preview3D({
    super.key,
    required this.kind,
    required this.id,
    this.height = 210,
  });

  /// `character` or `weapon`.
  final String kind;

  /// The catalogue id — an agent's `model`, or a weapon's `id`.
  final String id;

  final double height;

  @override
  State<Preview3D> createState() => _Preview3DState();
}

class _Preview3DState extends State<Preview3D> {
  InAppWebViewController? _controller;
  bool _serverReady = false;

  String get _url =>
      'http://localhost:${EngineServer.port}/preview.html'
      '?kind=${widget.kind}&id=${widget.id}';

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    try {
      await EngineServer.instance.ensureRunning();
    } catch (_) {
      return;
    }
    if (mounted) setState(() => _serverReady = true);
  }

  @override
  void didUpdateWidget(covariant Preview3D old) {
    super.didUpdateWidget(old);
    // Picking a different agent or weapon reloads the same view rather than
    // building a second WebView, which on Android is expensive.
    if (old.id != widget.id || old.kind != widget.kind) {
      _controller?.loadUrl(urlRequest: URLRequest(url: WebUri(_url)));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      height: widget.height,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withValues(alpha: 0.07)),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF161C25), Color(0xFF0D1219)],
        ),
      ),
      child: !_serverReady
          ? const Center(
              child: SizedBox(
                width: 22, height: 22,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: AppPalette.accent),
              ),
            )
          : InAppWebView(
              key: ValueKey('${widget.kind}:${widget.id}'),
              initialUrlRequest: URLRequest(url: WebUri(_url)),
              // Same reason as the game view: without a recognizer here the
              // gesture arena eats the drag and the turntable cannot be spun.
              gestureRecognizers: <Factory<OneSequenceGestureRecognizer>>{
                Factory<OneSequenceGestureRecognizer>(
                    () => EagerGestureRecognizer()),
              },
              initialSettings: InAppWebViewSettings(
                transparentBackground: true,
                supportZoom: false,
                javaScriptEnabled: true,
                useHybridComposition: true,
                hardwareAcceleration: true,
                disableContextMenu: true,
                overScrollMode: OverScrollMode.NEVER,
                disallowOverScroll: true,
                verticalScrollBarEnabled: false,
                horizontalScrollBarEnabled: false,
              ),
              onWebViewCreated: (c) => _controller = c,
            ),
    );
  }
}
