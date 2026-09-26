package com.daily.notes.receiver

import android.app.admin.DeviceAdminReceiver

/**
 * Enabling this device-admin lets the app resist casual uninstallation, so a
 * child cannot simply drag the icon to "Uninstall". It is deactivated from the
 * control panel before the app can be removed.
 */
class AdminReceiver : DeviceAdminReceiver()
