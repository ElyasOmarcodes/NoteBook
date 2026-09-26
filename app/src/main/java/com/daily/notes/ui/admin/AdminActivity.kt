package com.daily.notes.ui.admin

import android.app.role.RoleManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.mutableIntStateOf
import com.daily.notes.NotesApp
import com.daily.notes.receiver.AdminReceiver
import com.daily.notes.service.AppLockService
import com.daily.notes.ui.theme.NotesTheme

/**
 * The hidden control panel. Reachable only from the decoy screen after the
 * master code is entered. Hosts all configuration and the runtime permission
 * requests the controller needs.
 */
class AdminActivity : ComponentActivity() {

    private val refreshKey = mutableIntStateOf(0)

    private val callRoleLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { bump() }
    private val overlayLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { bump() }
    private val deviceAdminLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { bump() }
    private val notifLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { bump() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val settings = (application as NotesApp).settings

        val actions = AdminActions(
            refreshKey = refreshKey,
            isCallRoleHeld = { isCallRoleHeld() },
            requestCallRole = { requestCallRole() },
            isAccessibilityEnabled = { isAccessibilityEnabled() },
            openAccessibility = { openAccessibilitySettings() },
            hasOverlay = { Settings.canDrawOverlays(this) },
            requestOverlay = { requestOverlay() },
            isDeviceAdmin = { isDeviceAdminActive() },
            requestDeviceAdmin = { requestDeviceAdmin() },
            requestNotifications = { requestNotifications() },
        )

        setContent {
            NotesTheme {
                AdminScreen(settings = settings, actions = actions, onExit = { finish() })
            }
        }
    }

    override fun onResume() {
        super.onResume()
        bump()
    }

    private fun bump() { refreshKey.intValue += 1 }

    // ---- Call screening role ----
    private fun roleManager() = getSystemService(RoleManager::class.java)

    private fun isCallRoleHeld(): Boolean =
        roleManager()?.isRoleHeld(RoleManager.ROLE_CALL_SCREENING) == true

    private fun requestCallRole() {
        val rm = roleManager() ?: return
        if (rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
            callRoleLauncher.launch(rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING))
        }
    }

    // ---- Accessibility ----
    private fun isAccessibilityEnabled(): Boolean {
        val expected = ComponentName(this, AppLockService::class.java).flattenToString()
        val enabled = Settings.Secure.getString(
            contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return false
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    private fun openAccessibilitySettings() {
        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
    }

    // ---- Overlay ----
    private fun requestOverlay() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName")
        )
        overlayLauncher.launch(intent)
    }

    // ---- Device admin ----
    private fun deviceAdminComponent() = ComponentName(this, AdminReceiver::class.java)

    private fun isDeviceAdminActive(): Boolean {
        val dpm = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isAdminActive(deviceAdminComponent())
    }

    private fun requestDeviceAdmin() {
        val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
            putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, deviceAdminComponent())
            putExtra(
                DevicePolicyManager.EXTRA_ADD_EXPLANATION,
                getString(com.daily.notes.R.string.device_admin_description)
            )
        }
        deviceAdminLauncher.launch(intent)
    }

    // ---- Notifications ----
    private fun requestNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notifLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
