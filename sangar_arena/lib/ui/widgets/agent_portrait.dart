import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../models/catalog.dart';

/// A painted bust of an agent, using the same colours the engine gives the 3D
/// model, so the lobby card and the soldier on the battlefield read as the
/// same character.
class AgentPortrait extends StatelessWidget {
  const AgentPortrait({
    super.key,
    required this.agent,
    this.size = 96,
    this.teamColor,
  });

  final AgentDef agent;
  final double size;
  final Color? teamColor;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _AgentPainter(agent, teamColor)),
    );
  }
}

class _AgentPainter extends CustomPainter {
  _AgentPainter(this.agent, this.teamColor);

  final AgentDef agent;
  final Color? teamColor;

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width, h = size.height;
    final skin = Color(0xFF000000 | agent.skin);
    final outfit = Color(0xFF000000 | agent.outfit);
    final accent = Color(0xFF000000 | agent.accent);
    final hair = Color(0xFF000000 | agent.hair);

    final cx = w / 2;

    // backdrop
    final bg = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          accent.withValues(alpha: 0.22),
          const Color(0x00000000),
        ],
      ).createShader(Rect.fromLTWH(0, 0, w, h));
    canvas.drawCircle(Offset(cx, h * 0.52), w * 0.46, bg);

    // shoulders / torso
    final torso = Path()
      ..moveTo(cx - w * 0.34, h)
      ..lineTo(cx - w * 0.30, h * 0.70)
      ..quadraticBezierTo(cx - w * 0.20, h * 0.60, cx - w * 0.12, h * 0.58)
      ..lineTo(cx + w * 0.12, h * 0.58)
      ..quadraticBezierTo(cx + w * 0.20, h * 0.60, cx + w * 0.30, h * 0.70)
      ..lineTo(cx + w * 0.34, h)
      ..close();
    canvas.drawPath(torso, Paint()..color = outfit);

    // plate carrier
    final carrier = Path()
      ..moveTo(cx - w * 0.19, h)
      ..lineTo(cx - w * 0.19, h * 0.66)
      ..lineTo(cx + w * 0.19, h * 0.66)
      ..lineTo(cx + w * 0.19, h)
      ..close();
    canvas.drawPath(carrier, Paint()..color = const Color(0xFF24262A));

    // team stripe
    canvas.drawRect(
      Rect.fromLTWH(cx - w * 0.19, h * 0.70, w * 0.38, h * 0.045),
      Paint()..color = teamColor ?? accent,
    );

    // neck
    canvas.drawRect(
      Rect.fromLTWH(cx - w * 0.065, h * 0.50, w * 0.13, h * 0.12),
      Paint()..color = skin.withValues(alpha: 0.92),
    );

    // head
    final headRect = Rect.fromCenter(
      center: Offset(cx, h * 0.38),
      width: w * 0.30,
      height: h * 0.34,
    );
    canvas.drawRRect(
      RRect.fromRectXY(headRect, w * 0.13, w * 0.13),
      Paint()..color = skin,
    );

    // hair / cap
    final hairPath = Path()
      ..addArc(
        Rect.fromCenter(
          center: Offset(cx, h * 0.345),
          width: w * 0.325,
          height: h * 0.30,
        ),
        math.pi,
        math.pi,
      )
      ..lineTo(cx + w * 0.163, h * 0.36)
      ..lineTo(cx - w * 0.163, h * 0.36)
      ..close();
    canvas.drawPath(hairPath, Paint()..color = hair);

    if (agent.female) {
      canvas.drawCircle(
        Offset(cx + w * 0.17, h * 0.40), w * 0.055, Paint()..color = hair);
      canvas.drawCircle(
        Offset(cx - w * 0.17, h * 0.40), w * 0.055, Paint()..color = hair);
    }

    if (agent.beard) {
      final beard = Path()
        ..moveTo(cx - w * 0.15, h * 0.40)
        ..quadraticBezierTo(cx, h * 0.58, cx + w * 0.15, h * 0.40)
        ..lineTo(cx + w * 0.15, h * 0.44)
        ..quadraticBezierTo(cx, h * 0.60, cx - w * 0.15, h * 0.44)
        ..close();
      canvas.drawPath(beard, Paint()..color = hair.withValues(alpha: 0.95));
    }

    if (agent.glasses) {
      final lens = Paint()..color = const Color(0xFF11151A);
      final bridge = Paint()
        ..color = const Color(0xFF3A3F46)
        ..strokeWidth = w * 0.016;
      canvas.drawCircle(Offset(cx - w * 0.072, h * 0.375), w * 0.052, lens);
      canvas.drawCircle(Offset(cx + w * 0.072, h * 0.375), w * 0.052, lens);
      canvas.drawLine(Offset(cx - w * 0.022, h * 0.375),
          Offset(cx + w * 0.022, h * 0.375), bridge);
    } else {
      final eye = Paint()..color = const Color(0xFF1B1B1B);
      canvas.drawOval(
        Rect.fromCenter(
            center: Offset(cx - w * 0.062, h * 0.375),
            width: w * 0.034,
            height: h * 0.022),
        eye,
      );
      canvas.drawOval(
        Rect.fromCenter(
            center: Offset(cx + w * 0.062, h * 0.375),
            width: w * 0.034,
            height: h * 0.022),
        eye,
      );
    }

    // helmet band in the accent colour
    canvas.drawRect(
      Rect.fromLTWH(cx - w * 0.163, h * 0.335, w * 0.326, h * 0.028),
      Paint()..color = accent,
    );
  }

  @override
  bool shouldRepaint(_AgentPainter old) =>
      old.agent.id != agent.id || old.teamColor != teamColor;
}
