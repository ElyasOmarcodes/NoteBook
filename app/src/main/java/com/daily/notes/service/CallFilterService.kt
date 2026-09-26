package com.daily.notes.service

import android.telecom.Call
import android.telecom.CallScreeningService
import com.daily.notes.NotesApp
import com.daily.notes.data.SettingsRepository
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

/**
 * Screens every incoming call. If call filtering is on and the caller's number
 * is not on the whitelist, the call is rejected before it ever rings.
 */
class CallFilterService : CallScreeningService() {

    override fun onScreenCall(callDetails: Call.Details) {
        if (callDetails.callDirection != Call.Details.DIRECTION_INCOMING) {
            respondToCall(callDetails, CallResponse.Builder().build())
            return
        }

        val settings = (application as NotesApp).settings
        val number = callDetails.handle?.schemeSpecificPart.orEmpty()

        val (filterOn, whitelist) = runBlocking {
            settings.callFilterEnabled.first() to settings.whitelist.first()
        }

        val allow = !filterOn || SettingsRepository.isAllowed(number, whitelist)

        val response = if (allow) {
            CallResponse.Builder().build()
        } else {
            CallResponse.Builder()
                .setDisallowCall(true)
                .setRejectCall(true)
                .setSkipCallLog(false)
                .setSkipNotification(true)
                .build()
        }
        respondToCall(callDetails, response)
    }
}
