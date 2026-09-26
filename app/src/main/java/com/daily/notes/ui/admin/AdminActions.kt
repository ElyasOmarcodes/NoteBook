package com.daily.notes.ui.admin

import androidx.compose.runtime.MutableIntState

/**
 * Bundle of system-level actions and status checks the control panel calls.
 * [refreshKey] changes whenever the activity resumes, so composables that read
 * it re-evaluate the status lambdas after the user returns from a settings
 * screen.
 */
class AdminActions(
    val refreshKey: MutableIntState,
    val isCallRoleHeld: () -> Boolean,
    val requestCallRole: () -> Unit,
    val isAccessibilityEnabled: () -> Boolean,
    val openAccessibility: () -> Unit,
    val hasOverlay: () -> Boolean,
    val requestOverlay: () -> Unit,
    val isDeviceAdmin: () -> Boolean,
    val requestDeviceAdmin: () -> Unit,
    val requestNotifications: () -> Unit,
)
