import 'package:flutter/material.dart';

/// Static content catalogue: agents, weapons, grenades and maps.
///
/// Every id here is also known to the three.js engine (see
/// `assets/web/js/config.js`), which builds the matching 3D model. Adding an
/// entry on one side without the other will fall back to a default model.

@immutable
class AgentDef {
  const AgentDef({
    required this.id,
    required this.namePs,
    required this.nameEn,
    required this.bioPs,
    required this.bioEn,
    required this.skin,
    required this.outfit,
    required this.accent,
    required this.hair,
    required this.speed,
    required this.armour,
    required this.stealth,
    this.beard = false,
    this.glasses = false,
    this.female = false,
  });

  final String id;
  final String namePs;
  final String nameEn;
  final String bioPs;
  final String bioEn;

  /// Colours are passed straight through to the engine as hex ints.
  final int skin;
  final int outfit;
  final int accent;
  final int hair;

  final bool beard;
  final bool glasses;
  final bool female;

  /// 0..1 rating bars shown on the selection card.
  final double speed;
  final double armour;
  final double stealth;

  Map<String, dynamic> toJson() => {
        'id': id,
        'skin': skin,
        'outfit': outfit,
        'accent': accent,
        'hair': hair,
        'beard': beard,
        'glasses': glasses,
        'female': female,
        'speed': speed,
        'armour': armour,
      };
}

@immutable
class WeaponDef {
  const WeaponDef({
    required this.id,
    required this.namePs,
    required this.nameEn,
    required this.kind,
    required this.damage,
    required this.rpm,
    required this.magazine,
    required this.reserve,
    required this.spread,
    required this.range,
    required this.recoil,
    required this.reloadSeconds,
    this.scope = false,
    this.scopeZoom = 2.0,
    this.pellets = 1,
    this.automatic = true,
  });

  final String id;
  final String namePs;
  final String nameEn;
  final WeaponKind kind;

  final double damage;
  final int rpm;
  final int magazine;
  final int reserve;
  final double spread;
  final double range;
  final double recoil;
  final double reloadSeconds;
  final bool scope;
  final double scopeZoom;
  final int pellets;
  final bool automatic;

  /// Normalised bars for the UI.
  double get damageBar => (damage / 90).clamp(0.0, 1.0);
  double get rateBar => (rpm / 950).clamp(0.0, 1.0);
  double get accuracyBar => (1 - (spread / 0.09)).clamp(0.0, 1.0);
  double get rangeBar => (range / 140).clamp(0.0, 1.0);

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind.name,
        'damage': damage,
        'rpm': rpm,
        'magazine': magazine,
        'reserve': reserve,
        'spread': spread,
        'range': range,
        'recoil': recoil,
        'reloadSeconds': reloadSeconds,
        'scope': scope,
        'scopeZoom': scopeZoom,
        'pellets': pellets,
        'automatic': automatic,
      };
}

enum WeaponKind { rifle, smg, sniper, shotgun, pistol, lmg, marksman }

@immutable
class GrenadeDef {
  const GrenadeDef({
    required this.id,
    required this.namePs,
    required this.nameEn,
    required this.damage,
    required this.radius,
    required this.fuse,
    required this.count,
  });

  final String id;
  final String namePs;
  final String nameEn;
  final double damage;
  final double radius;
  final double fuse;
  final int count;

  Map<String, dynamic> toJson() => {
        'id': id,
        'damage': damage,
        'radius': radius,
        'fuse': fuse,
        'count': count,
      };
}

@immutable
class MapDef {
  const MapDef({
    required this.id,
    required this.namePs,
    required this.nameEn,
    required this.descPs,
    required this.descEn,
    required this.size,
  });

  final String id;
  final String namePs;
  final String nameEn;
  final String descPs;
  final String descEn;

  /// Playable square in metres.
  final int size;
}

class Catalog {
  const Catalog._();

  static const List<AgentDef> agents = [
    AgentDef(
      id: 'zmarai',
      namePs: 'زمری',
      nameEn: 'Zmarai',
      bioPs: 'زوړ پوځي لارښود، په سنګرونو کې تکړه.',
      bioEn: 'Veteran squad leader, deadly from cover.',
      skin: 0xC79A72,
      outfit: 0x3A3F35,
      accent: 0x8E2F26,
      hair: 0x241A14,
      beard: true,
      speed: 0.72,
      armour: 0.80,
      stealth: 0.55,
    ),
    AgentDef(
      id: 'shahzad',
      namePs: 'شهزاد',
      nameEn: 'Shahzad',
      bioPs: 'چټک برید کوونکی، په نږدې جګړه کې خطرناک.',
      bioEn: 'Fast assaulter, dangerous up close.',
      skin: 0xD8AE86,
      outfit: 0xB4453B,
      accent: 0x2E3440,
      hair: 0xE0C88F,
      beard: true,
      glasses: true,
      speed: 0.92,
      armour: 0.55,
      stealth: 0.62,
    ),
    AgentDef(
      id: 'karwan',
      namePs: 'کاروان',
      nameEn: 'Karwan',
      bioPs: 'خاموش ښکاري — د لرې واټن نښه ویشتونکی.',
      bioEn: 'Silent hunter — long range marksman.',
      skin: 0xCFA37A,
      outfit: 0x15161A,
      accent: 0x9A1F23,
      hair: 0x1A1A1A,
      beard: true,
      glasses: true,
      speed: 0.66,
      armour: 0.62,
      stealth: 0.95,
    ),
    AgentDef(
      id: 'nazo',
      namePs: 'ناژو',
      nameEn: 'Nazo',
      bioPs: 'د استخباراتو افسره، تېزه او هوښیاره.',
      bioEn: 'Recon officer, quick and sharp.',
      skin: 0xE3BE9A,
      outfit: 0x5A3B2E,
      accent: 0x2F6F63,
      hair: 0x4A2B1C,
      glasses: true,
      female: true,
      speed: 0.88,
      armour: 0.50,
      stealth: 0.86,
    ),
    AgentDef(
      id: 'baaz',
      namePs: 'باز',
      nameEn: 'Baaz',
      bioPs: 'د بامونو څارونکی، په لوړو ځایونو کې ماهر.',
      bioEn: 'Rooftop spotter, master of high ground.',
      skin: 0xB98A64,
      outfit: 0x2B3B4A,
      accent: 0xD9A441,
      hair: 0x2A2118,
      speed: 0.80,
      armour: 0.66,
      stealth: 0.74,
    ),
    AgentDef(
      id: 'spinzar',
      namePs: 'سپین زر',
      nameEn: 'Spinzar',
      bioPs: 'دروند وسلوال، ډېر زغم لري.',
      bioEn: 'Heavy gunner, soaks up damage.',
      skin: 0xC08A5E,
      outfit: 0x4A4A3C,
      accent: 0x6E7B3F,
      hair: 0x3A2A1A,
      beard: true,
      speed: 0.58,
      armour: 0.98,
      stealth: 0.40,
    ),
  ];

  static const List<WeaponDef> weapons = [
    WeaponDef(
      id: 'ak_sangar',
      namePs: 'سنګر AK',
      nameEn: 'Sangar AK',
      kind: WeaponKind.rifle,
      damage: 34,
      rpm: 600,
      magazine: 30,
      reserve: 270,
      spread: 0.028,
      range: 90,
      recoil: 1.25,
      reloadSeconds: 2.4,
    ),
    WeaponDef(
      id: 'm4_kandak',
      namePs: 'کنډک M4',
      nameEn: 'Kandak M4',
      kind: WeaponKind.rifle,
      damage: 28,
      rpm: 780,
      magazine: 30,
      reserve: 270,
      spread: 0.020,
      range: 95,
      recoil: 0.95,
      reloadSeconds: 2.1,
      scope: true,
      scopeZoom: 2.2,
    ),
    WeaponDef(
      id: 'mp_toofan',
      namePs: 'طوفان MP',
      nameEn: 'Toofan MP',
      kind: WeaponKind.smg,
      damage: 21,
      rpm: 900,
      magazine: 32,
      reserve: 256,
      spread: 0.038,
      range: 45,
      recoil: 0.72,
      reloadSeconds: 1.8,
    ),
    WeaponDef(
      id: 'svd_hindukush',
      namePs: 'هندوکش SVD',
      nameEn: 'Hindukush SVD',
      kind: WeaponKind.sniper,
      damage: 88,
      rpm: 55,
      magazine: 10,
      reserve: 60,
      spread: 0.004,
      range: 140,
      recoil: 2.6,
      reloadSeconds: 2.9,
      scope: true,
      scopeZoom: 6.0,
      automatic: false,
    ),
    WeaponDef(
      id: 'dmr_shamshad',
      namePs: 'شمشاد DMR',
      nameEn: 'Shamshad DMR',
      kind: WeaponKind.marksman,
      damage: 52,
      rpm: 240,
      magazine: 20,
      reserve: 140,
      spread: 0.010,
      range: 120,
      recoil: 1.7,
      reloadSeconds: 2.5,
      scope: true,
      scopeZoom: 3.5,
      automatic: false,
    ),
    WeaponDef(
      id: 'sg_pekhawar',
      namePs: 'پېښور SG',
      nameEn: 'Pekhawar SG',
      kind: WeaponKind.shotgun,
      damage: 15,
      rpm: 75,
      magazine: 8,
      reserve: 48,
      spread: 0.075,
      range: 22,
      recoil: 2.2,
      reloadSeconds: 3.2,
      pellets: 8,
      automatic: false,
    ),
    WeaponDef(
      id: 'lmg_ghazi',
      namePs: 'غازي LMG',
      nameEn: 'Ghazi LMG',
      kind: WeaponKind.lmg,
      damage: 30,
      rpm: 700,
      magazine: 75,
      reserve: 300,
      spread: 0.044,
      range: 100,
      recoil: 1.5,
      reloadSeconds: 4.2,
    ),
    WeaponDef(
      id: 'pistol_teera',
      namePs: 'تیره پستول',
      nameEn: 'Teera Pistol',
      kind: WeaponKind.pistol,
      damage: 26,
      rpm: 420,
      magazine: 15,
      reserve: 90,
      spread: 0.030,
      range: 40,
      recoil: 0.8,
      reloadSeconds: 1.5,
      automatic: false,
    ),
  ];

  static const List<GrenadeDef> grenades = [
    GrenadeDef(
      id: 'frag',
      namePs: 'چاودېدونکی ګرنېټ',
      nameEn: 'Frag grenade',
      damage: 110,
      radius: 7.0,
      fuse: 3.0,
      count: 2,
    ),
    GrenadeDef(
      id: 'flash',
      namePs: 'رڼا ګرنېټ',
      nameEn: 'Flash grenade',
      damage: 0,
      radius: 12.0,
      fuse: 2.0,
      count: 2,
    ),
    GrenadeDef(
      id: 'smoke',
      namePs: 'لوګی ګرنېټ',
      nameEn: 'Smoke grenade',
      damage: 0,
      radius: 9.0,
      fuse: 1.5,
      count: 2,
    ),
  ];

  static const List<MapDef> maps = [
    MapDef(
      id: 'sangar_chowk',
      namePs: 'سنګر چوک',
      nameEn: 'Sangar Chowk',
      descPs: 'پراخه صنعتي سيمه، د تېلو ټانکونه، کانټینرونه او لوړ بامونه.',
      descEn: 'Sprawling refinery yard: oil tanks, containers and high roofs.',
      size: 220,
    ),
  ];

  static AgentDef agentById(String id) =>
      agents.firstWhere((a) => a.id == id, orElse: () => agents.first);

  static WeaponDef weaponById(String id) =>
      weapons.firstWhere((w) => w.id == id, orElse: () => weapons.first);

  static GrenadeDef grenadeById(String id) =>
      grenades.firstWhere((g) => g.id == id, orElse: () => grenades.first);

  static MapDef mapById(String id) =>
      maps.firstWhere((m) => m.id == id, orElse: () => maps.first);
}
