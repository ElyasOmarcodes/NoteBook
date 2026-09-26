package com.daily.notes.service

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import com.daily.notes.NotesApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach

/**
 * Watches which app is in the foreground. When a blocked package comes forward
 * and app-lock is enabled, it launches [LockActivity] over it demanding the
 * unlock code (unless the package is inside its temporary grace window).
 */
class AppLockService : AccessibilityService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    @Volatile private var lockEnabled: Boolean = true
    @Volatile private var blocked: Set<String> = emptySet()

    private var lastHandledPackage: String? = null

    override fun onServiceConnected() {
        super.onServiceConnected()
        val settings = (application as NotesApp).settings
        settings.appLockEnabled.onEach { lockEnabled = it }.launchIn(scope)
        settings.blockedPackages.onEach { blocked = it }.launchIn(scope)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null || event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return

        // Ignore our own UI and system UI to avoid loops.
        if (pkg == packageName || pkg == "com.android.systemui") {
            return
        }

        if (pkg != lastHandledPackage) {
            lastHandledPackage = pkg
        }

        if (!lockEnabled) return
        if (pkg !in blocked) return
        if (UnlockState.isAllowed(pkg)) return

        val intent = Intent(this, LockActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            putExtra(LockActivity.EXTRA_PACKAGE, pkg)
        }
        startActivity(intent)
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
