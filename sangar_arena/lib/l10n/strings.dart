import 'package:flutter/widgets.dart';

/// Hand-rolled two-language dictionary (Pashto + English).
///
/// A full `intl`/ARB pipeline would need code generation at build time; the
/// game only ships two locales, so a plain map keeps the CI build simple and
/// keeps every string visible in one file for translators.
enum AppLang { ps, en }

class Strings {
  const Strings(this.lang);

  final AppLang lang;

  static Strings of(BuildContext context) => LocalizedApp.of(context).strings;

  bool get isPashto => lang == AppLang.ps;
  TextDirection get direction =>
      isPashto ? TextDirection.rtl : TextDirection.ltr;
  Locale get locale => Locale(isPashto ? 'ps' : 'en');

  String _(String ps, String en) => isPashto ? ps : en;

  // ---- app / shell -------------------------------------------------------
  String get appTitle => _('سنګر ډګر', 'Sangar Arena');
  String get tagline =>
      _('د وای‌فای پر مټ ځايي څو لوبغاړې ډګر', 'Wi-Fi LAN multiplayer arena');
  String get play => _('لوبه', 'Play');
  String get createGroup => _('ګروپ جوړول', 'Create group');
  String get joinGroup => _('ګروپ کې ګډون', 'Join group');
  String get training => _('تمرین', 'Training');
  String get settings => _('تنظیمات', 'Settings');
  String get characters => _('کرکټرونه', 'Characters');
  String get weapons => _('وسلې', 'Weapons');
  String get back => _('شاته', 'Back');
  String get next => _('بل', 'Next');
  String get save => _('خوندي کول', 'Save');
  String get cancel => _('لغوه', 'Cancel');
  String get close => _('بندول', 'Close');
  String get retry => _('بیا هڅه', 'Retry');
  String get done => _('سم دی', 'Done');
  String get loading => _('د بار کېدو په حال کې…', 'Loading…');

  // ---- home --------------------------------------------------------------
  String get quickPlay => _('چټکه لوبه', 'Quick play');
  String get soloRange => _('يوازې تمرین', 'Solo range');
  String get hotspotHint => _(
      'لومړی دې يو لوبغاړی خپل موبایل هاټسپاټ چالان کړي، نور ټول دې هماغه وای‌فای ته وصل شي.',
      'One player turns on their phone hotspot; everyone else joins that Wi-Fi.');
  String get profile => _('پېژندنه', 'Profile');
  String get playerName => _('د لوبغاړي نوم', 'Player name');

  // ---- lobby -------------------------------------------------------------
  String get groupName => _('د ګروپ نوم', 'Group name');
  String get mapLabel => _('نقشه', 'Map');
  String get matchLength => _('د میدان وخت', 'Match length');
  String get scoreLimit => _('د وژنو بریدلیک', 'Kill limit');
  String get maxPlayers => _('ډېر لوبغاړي', 'Max players');
  String get mode => _('ډول', 'Mode');
  String get modeTdm => _('ټیمي جګړه (TDM)', 'Team deathmatch');
  String get modeDm => _('ازاده جګړه (DM)', 'Free-for-all');
  String get host => _('کوربه', 'Host');
  String get searchGroups => _('ګروپونه لټول', 'Search groups');
  String get searching => _('لټون روان دی…', 'Searching…');
  String get noGroups => _(
      'هېڅ ګروپ ونه موندل شو. ډاډ ترلاسه کړئ چې ټول يو وای‌فای ته وصل ياست.',
      'No groups found. Make sure everyone is on the same Wi-Fi.');
  String get connect => _('وصل کېدل', 'Connect');
  String get connecting => _('وصل کېږي…', 'Connecting…');
  String get connected => _('وصل شو', 'Connected');
  String get disconnected => _('اړیکه پرې شوه', 'Disconnected');
  String get waitingForHost =>
      _('د کوربه د پیل انتظار…', 'Waiting for the host to start…');
  String get startMatch => _('میدان پیلول', 'Start match');
  String get leave => _('وتل', 'Leave');
  String get playersInLobby => _('لوبغاړي', 'Players');
  String get ready => _('چمتو', 'Ready');
  String get notReady => _('نا چمتو', 'Not ready');
  String get teamAlpha => _('الفا ټیم', 'Alpha');
  String get teamBravo => _('براوو ټیم', 'Bravo');
  String get manualJoin => _('لاسي وصل (IP)', 'Manual join (IP)');
  String get ipAddress => _('د کوربه IP پته', 'Host IP address');

  // ---- settings tabs -----------------------------------------------------
  String get tabGeneral => _('عام', 'General');
  String get tabAudio => _('غږونه', 'Audio');
  String get tabGraphics => _('ګرافیک', 'Graphics');
  String get tabControls => _('کنټرولونه', 'Controls');
  String get tabCharacter => _('کرکټر', 'Character');
  String get tabWeapons => _('وسلې', 'Weapons');
  String get credits => _('مننه او منابع', 'Credits');
  String get creditsIntro => _(
      'د دې لوبې د اسلحو ټول ۳D موډلونه ریښتیني موډلونه دي، چې د CC BY 4.0 '
      'جواز لاندې د لاندې هنرمندانو له خوا جوړ شوي:',
      'Every weapon in this game is a real 3D model, licensed CC BY 4.0 and '
      'made by the artists below:');
  String get creditsModels => _(
      'AK-74 او Glock — Cransh · M16 — Luchador · SMG-90 — TORI106 · '
      'SCAR-H — TastyTony · Remington 870 — FinBass · M60 — Kingy · '
      'فراګ بم — hsevencg · د AWP او نورو موډلونو لپاره: FPS X (MIT)',
      'AK-74 and Glock by Cransh · M16 by Luchador · SMG-90 by TORI106 · '
      'SCAR-H by TastyTony · Remington 870 by FinBass · M60 by Kingy · '
      'Frag grenade by hsevencg · AWP and others via FPS X (MIT)');
  String get creditsEngine => _(
      'کرکټر: Mixamo · ایکنونه: Game Icons (CC BY 3.0) · انجن: three.js · لوبه: Flutter',
      'Character rig: Mixamo · Icons: Game Icons (CC BY 3.0) · '
      'Engine: three.js · Shell: Flutter');
  String get language => _('ژبه', 'Language');
  String get pashto => _('پښتو', 'Pashto');
  String get english => _('انګلیسي', 'English');
  String get masterVolume => _('عمومي غږ', 'Master volume');
  String get sfxVolume => _('د لوبې غږونه', 'Effects volume');
  String get musicVolume => _('موسیقي', 'Music');
  String get quality => _('کیفیت', 'Quality');
  String get qualityLow => _('ټیټ', 'Low');
  String get qualityMedium => _('منځنی', 'Medium');
  String get qualityHigh => _('لوړ', 'High');
  String get shadows => _('سیوري', 'Shadows');
  String get postFx => _('د انځور اغېزې', 'Post effects');
  String get showFps => _('د FPS ښودل', 'Show FPS');
  String get renderScale => _('د انځور کچه', 'Render scale');
  String get sensitivity => _('د کتنې حساسیت', 'Look sensitivity');
  String get adsSensitivity => _('د دوربین حساسیت', 'Scope sensitivity');
  String get invertY => _('د Y محور بدلون', 'Invert Y axis');
  String get autoFire => _('خپلکاره ډزې', 'Auto fire');
  String get leftHanded => _('کيڼ لاسی حالت', 'Left-handed layout');
  String get hudScale => _('د HUD کچه', 'HUD scale');
  String get resetDefaults => _('لومړني تنظیمات', 'Reset to defaults');

  // ---- character / weapons ----------------------------------------------
  String get selectAgent => _('خپل ګمارونکی وټاکئ', 'Select your agent');
  String get selectWeapon => _('وسله وټاکئ', 'Select a weapon');
  String get primaryWeapon => _('لومړنۍ وسله', 'Primary weapon');
  String get secondaryWeapon => _('دویمه وسله', 'Secondary weapon');
  String get grenade => _('ګرنېټ', 'Grenade');
  String get equipped => _('ټاکل شوې', 'Equipped');
  String get equip => _('ټاکل', 'Equip');
  String get damage => _('زیان', 'Damage');
  String get fireRate => _('د ډزو چټکتیا', 'Fire rate');
  String get accuracy => _('نښه ویشتنه', 'Accuracy');
  String get range => _('واټن', 'Range');
  String get magazine => _('خزانه', 'Magazine');
  String get hasScope => _('دوربین لري', 'Has scope');

  // ---- in game -----------------------------------------------------------
  String get health => _('روغتیا', 'Health');
  String get ammo => _('مرمۍ', 'Ammo');
  String get reload => _('ریلوډ', 'Reload');
  String get resupply => _('د مرمیو رسد', 'Resupply');
  String get pause => _('ودرول', 'Pause');
  String get resume => _('دوام', 'Resume');
  String get quitMatch => _('له میدانه وتل', 'Quit match');
  String get kills => _('وژنې', 'Kills');
  String get deaths => _('مړینې', 'Deaths');
  String get score => _('امتیاز', 'Score');
  String get ping => _('پینګ', 'Ping');
  String get matchEnds => _('میدان پای ته رسېږي', 'Match ends');
  String get respawningIn => _('بیا ژوندي کېږئ', 'Respawning in');
  String killedBy(String killer) =>
      _('$killer تاسو وویشتلئ', 'You were killed by $killer');
  String killToast(String killer, String victim) =>
      _('$killer، $victim وویشت', '$killer eliminated $victim');
  String get headshot => _('سرې ډز', 'Headshot');

  // ---- results -----------------------------------------------------------
  String get matchResults => _('د میدان پایلې', 'Match results');
  String get rank => _('درجه', 'Rank');
  String get player => _('لوبغاړی', 'Player');
  String get accuracyPct => _('دقت', 'Acc.');
  String get playAgain => _('بیا لوبه', 'Play again');
  String get backToMenu => _('کور پاڼې ته', 'Back to menu');
  String get victory => _('بریا', 'Victory');
  String get defeat => _('ماتې', 'Defeat');
  String get draw => _('مساوي', 'Draw');

  // ---- training ----------------------------------------------------------
  String get trainingIntro => _(
      'يوازې لوبه: نقشه وګورئ، حرکتونه او وسلې وازمویئ.',
      'Solo play: explore the map and try out movement and weapons.');
  String get withBots => _('له بوټانو سره', 'With bots');
  String get freeRoam => _('ازاد ګرځېدل', 'Free roam');
  String get botCount => _('د بوټانو شمېر', 'Bot count');

  // ---- errors ------------------------------------------------------------
  String get errNoWifi => _(
      'وای‌فای اړیکه ونه موندل شوه. هاټسپاټ يا وای‌فای چالان کړئ.',
      'No Wi-Fi connection found. Turn on the hotspot or Wi-Fi.');
  String get errHostFailed =>
      _('د ګروپ جوړول ناکام شول.', 'Could not create the group.');
  String get errJoinFailed =>
      _('وصل کېدل ناکام شول.', 'Could not connect to the group.');
  String get errNameRequired =>
      _('لطفاً يو نوم وليکئ.', 'Please enter a name.');

  String seconds(int s) => _('$s ثانیې', '${s}s');
  String minutes(int m) => _('$m دقیقې', '$m min');
}

/// Inherited holder so any widget can call `Strings.of(context)`.
class LocalizedApp extends InheritedWidget {
  const LocalizedApp({
    super.key,
    required this.strings,
    required super.child,
  });

  final Strings strings;

  static LocalizedApp of(BuildContext context) {
    final result =
        context.dependOnInheritedWidgetOfExactType<LocalizedApp>();
    assert(result != null, 'No LocalizedApp found in context');
    return result!;
  }

  @override
  bool updateShouldNotify(LocalizedApp oldWidget) =>
      oldWidget.strings.lang != strings.lang;
}
