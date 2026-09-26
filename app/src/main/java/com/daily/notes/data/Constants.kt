package com.daily.notes.data

/**
 * Default configuration for the controller.
 *
 * The two codes below are the initial values written on first launch. They can
 * be changed at any time from the hidden control panel.
 */
object Defaults {
    /** Secret code typed on the decoy screen to open the hidden control panel. */
    const val MASTER_CODE = "1379"

    /** Code required to temporarily open a blocked (locked) app. */
    const val UNLOCK_CODE = "2468"

    /** How long (ms) a blocked app stays open after the correct code is entered. */
    const val UNLOCK_GRACE_MS = 60_000L

    /**
     * Social / messaging apps that are secured automatically when installed.
     * These are pre-loaded into the blocked list on first launch and any newly
     * installed app from this list is locked automatically.
     */
    val SOCIAL_PACKAGES: Set<String> = setOf(
        "com.whatsapp",                 // WhatsApp
        "com.whatsapp.w4b",             // WhatsApp Business
        "com.facebook.katana",          // Facebook
        "com.facebook.lite",            // Facebook Lite
        "com.facebook.orca",            // Messenger
        "com.instagram.android",        // Instagram
        "com.instagram.lite",           // Instagram Lite
        "org.telegram.messenger",       // Telegram
        "com.snapchat.android",         // Snapchat
        "com.zhiliaoapp.musically",     // TikTok
        "com.ss.android.ugc.trill",     // TikTok (alt)
        "com.twitter.android",          // X / Twitter
        "com.google.android.youtube",   // YouTube
        "com.imo.android.imoim",        // imo
        "com.viber.voip",               // Viber
        "com.discord",                  // Discord
        "com.reddit.frontpage"          // Reddit
    )
}
