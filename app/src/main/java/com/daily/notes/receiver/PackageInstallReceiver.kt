package com.daily.notes.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.daily.notes.NotesApp
import com.daily.notes.data.Defaults
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * When a new app is installed, if it is one of the known social/messaging
 * packages it is added to the blocked list automatically, so it is locked the
 * first time the child opens it.
 */
class PackageInstallReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_PACKAGE_ADDED) return
        if (intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return

        val pkg = intent.data?.schemeSpecificPart ?: return
        if (pkg !in Defaults.SOCIAL_PACKAGES) return

        val settings = (context.applicationContext as NotesApp).settings
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                settings.addBlocked(pkg)
            } finally {
                pending.finish()
            }
        }
    }
}
