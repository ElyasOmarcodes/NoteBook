package com.daily.notes.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "notes_settings")

/**
 * Single source of truth for the controller's configuration, persisted with
 * Jetpack DataStore. Exposes reactive [Flow]s for the UI and suspend setters
 * for writes. Services that need a synchronous snapshot read the flows with
 * `first()`.
 */
class SettingsRepository(private val context: Context) {

    private object Keys {
        val INITIALIZED = booleanPreferencesKey("initialized")
        val MASTER_CODE = stringPreferencesKey("master_code")
        val UNLOCK_CODE = stringPreferencesKey("unlock_code")
        val WHITELIST = stringSetPreferencesKey("whitelist")
        val BLOCKED = stringSetPreferencesKey("blocked_packages")
        val CALL_FILTER = booleanPreferencesKey("call_filter_enabled")
        val APP_LOCK = booleanPreferencesKey("app_lock_enabled")
    }

    val masterCode: Flow<String> = context.dataStore.data.map { it[Keys.MASTER_CODE] ?: Defaults.MASTER_CODE }
    val unlockCode: Flow<String> = context.dataStore.data.map { it[Keys.UNLOCK_CODE] ?: Defaults.UNLOCK_CODE }
    val whitelist: Flow<Set<String>> = context.dataStore.data.map { it[Keys.WHITELIST] ?: emptySet() }
    val blockedPackages: Flow<Set<String>> = context.dataStore.data.map { it[Keys.BLOCKED] ?: Defaults.SOCIAL_PACKAGES }
    val callFilterEnabled: Flow<Boolean> = context.dataStore.data.map { it[Keys.CALL_FILTER] ?: true }
    val appLockEnabled: Flow<Boolean> = context.dataStore.data.map { it[Keys.APP_LOCK] ?: true }

    /** Writes the default configuration once, on first launch. */
    suspend fun ensureInitialized() {
        context.dataStore.edit { prefs ->
            if (prefs[Keys.INITIALIZED] != true) {
                prefs[Keys.INITIALIZED] = true
                prefs[Keys.MASTER_CODE] = Defaults.MASTER_CODE
                prefs[Keys.UNLOCK_CODE] = Defaults.UNLOCK_CODE
                prefs[Keys.CALL_FILTER] = true
                prefs[Keys.APP_LOCK] = true
                prefs[Keys.BLOCKED] = Defaults.SOCIAL_PACKAGES
                prefs[Keys.WHITELIST] = emptySet()
            }
        }
    }

    suspend fun setMasterCode(code: String) = context.dataStore.edit { it[Keys.MASTER_CODE] = code }
    suspend fun setUnlockCode(code: String) = context.dataStore.edit { it[Keys.UNLOCK_CODE] = code }
    suspend fun setCallFilterEnabled(enabled: Boolean) = context.dataStore.edit { it[Keys.CALL_FILTER] = enabled }
    suspend fun setAppLockEnabled(enabled: Boolean) = context.dataStore.edit { it[Keys.APP_LOCK] = enabled }

    /**
     * Stores a whitelist entry. The entry may be a bare number or the tagged
     * form "digits|name"; matching only ever looks at the number part.
     */
    suspend fun addNumber(entry: String) = context.dataStore.edit { prefs ->
        val trimmed = entry.trim()
        if (numberPart(trimmed).any { it.isDigit() }) {
            prefs[Keys.WHITELIST] = (prefs[Keys.WHITELIST] ?: emptySet()) + trimmed
        }
    }

    suspend fun removeNumber(number: String) = context.dataStore.edit { prefs ->
        prefs[Keys.WHITELIST] = (prefs[Keys.WHITELIST] ?: emptySet()) - number
    }

    suspend fun addBlocked(pkg: String) = context.dataStore.edit { prefs ->
        prefs[Keys.BLOCKED] = (prefs[Keys.BLOCKED] ?: emptySet()) + pkg
    }

    suspend fun removeBlocked(pkg: String) = context.dataStore.edit { prefs ->
        prefs[Keys.BLOCKED] = (prefs[Keys.BLOCKED] ?: emptySet()) - pkg
    }

    companion object {
        /** Reduces a phone number to digits only for tolerant comparison. */
        fun normalizeNumber(raw: String): String = raw.filter { it.isDigit() }

        /** The number portion of a stored entry ("digits|name" -> "digits"). */
        fun numberPart(entry: String): String = entry.substringBefore("|")

        /**
         * Returns true when [incoming] should be allowed. Matching is tolerant:
         * numbers match if their digit-only forms are equal or one ends with the
         * other (to bridge local vs. international formatting).
         */
        fun isAllowed(incoming: String, whitelist: Set<String>): Boolean {
            val n = normalizeNumber(incoming)
            if (n.isEmpty()) return false
            return whitelist.any { entry ->
                val e = normalizeNumber(numberPart(entry))
                e.isNotEmpty() && (e == n ||
                    (n.length >= 7 && e.endsWith(n)) ||
                    (e.length >= 7 && n.endsWith(e)))
            }
        }
    }
}
