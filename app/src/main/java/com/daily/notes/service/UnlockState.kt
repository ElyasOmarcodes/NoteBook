package com.daily.notes.service

import android.os.SystemClock
import com.daily.notes.data.Defaults
import java.util.concurrent.ConcurrentHashMap

/**
 * In-memory record of which blocked packages are temporarily unlocked, so that
 * entering the correct code lets the app be used for a short grace period
 * instead of re-locking on every screen change.
 */
object UnlockState {
    private val allowedUntil = ConcurrentHashMap<String, Long>()

    fun allow(pkg: String, durationMs: Long = Defaults.UNLOCK_GRACE_MS) {
        allowedUntil[pkg] = SystemClock.elapsedRealtime() + durationMs
    }

    fun isAllowed(pkg: String): Boolean {
        val until = allowedUntil[pkg] ?: return false
        if (SystemClock.elapsedRealtime() > until) {
            allowedUntil.remove(pkg)
            return false
        }
        return true
    }

    fun clear(pkg: String) {
        allowedUntil.remove(pkg)
    }
}
