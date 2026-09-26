package com.daily.notes

import android.app.Application
import com.daily.notes.data.SettingsRepository
import kotlinx.coroutines.runBlocking

class NotesApp : Application() {

    lateinit var settings: SettingsRepository
        private set

    override fun onCreate() {
        super.onCreate()
        settings = SettingsRepository(this)
        // Small one-time write; safe to block briefly on startup.
        runBlocking { settings.ensureInitialized() }
    }
}
