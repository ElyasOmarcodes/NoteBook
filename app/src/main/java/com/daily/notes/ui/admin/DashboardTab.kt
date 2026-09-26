package com.daily.notes.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Accessibility
import androidx.compose.material.icons.filled.AdminPanelSettings
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Layers
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.daily.notes.data.SettingsRepository
import com.daily.notes.ui.theme.Blue600
import com.daily.notes.ui.theme.Blue700

@Composable
fun DashboardTab(settings: SettingsRepository, actions: AdminActions) {
    val whitelist by settings.whitelist.collectAsStateWithLifecycle(initialValue = emptySet())
    val blocked by settings.blockedPackages.collectAsStateWithLifecycle(initialValue = emptySet())

    val rk = actions.refreshKey.intValue
    val callRole = remember(rk) { actions.isCallRoleHeld() }
    val accessibility = remember(rk) { actions.isAccessibilityEnabled() }
    val overlay = remember(rk) { actions.hasOverlay() }
    val deviceAdmin = remember(rk) { actions.isDeviceAdmin() }

    val allReady = callRole && accessibility && overlay

    HeroCard(
        ready = allReady,
        numbers = whitelist.size,
        apps = blocked.size
    )

    SectionCard(
        title = "Setup",
        subtitle = "Grant these once so protection keeps working in the background."
    ) {
        PermissionRow(
            icon = Icons.Filled.Call,
            title = "Call screening",
            description = "Reject calls that aren't on the allow list.",
            granted = callRole,
            actionLabel = "Enable",
            onAction = actions.requestCallRole
        )
        PermissionRow(
            icon = Icons.Filled.Accessibility,
            title = "App lock service",
            description = "Detect and lock blocked apps when opened.",
            granted = accessibility,
            actionLabel = "Enable",
            onAction = actions.openAccessibility
        )
        PermissionRow(
            icon = Icons.Filled.Layers,
            title = "Display over apps",
            description = "Show the lock screen above other apps.",
            granted = overlay,
            actionLabel = "Enable",
            onAction = actions.requestOverlay
        )
        PermissionRow(
            icon = Icons.Filled.AdminPanelSettings,
            title = "Uninstall protection",
            description = "Stop the app from being removed easily.",
            granted = deviceAdmin,
            actionLabel = "Enable",
            onAction = actions.requestDeviceAdmin
        )
        PermissionRow(
            icon = Icons.Filled.Notifications,
            title = "Notifications",
            description = "Alerts when a new social app is secured.",
            granted = false,
            actionLabel = "Allow",
            onAction = actions.requestNotifications
        )
    }
}

@Composable
private fun HeroCard(ready: Boolean, numbers: Int, apps: Int) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(26.dp))
            .background(Brush.linearGradient(listOf(Blue600, Blue700)))
            .padding(22.dp)
    ) {
        Column {
            Text(
                if (ready) "Protection active" else "Finish setup",
                color = Color.White,
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(6.dp))
            Text(
                if (ready) "The device is being watched over." else "Grant the permissions below to start.",
                color = Color(0xFFDCE6FF)
            )
            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                StatChip(value = numbers.toString(), label = "Allowed numbers")
                StatChip(value = apps.toString(), label = "Locked apps")
            }
        }
    }
}

@Composable
private fun StatChip(value: String, label: String) {
    Column(
        modifier = Modifier
            .clip(RoundedCornerShape(16.dp))
            .background(Color(0x33FFFFFF))
            .padding(horizontal = 18.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.Start
    ) {
        Text(value, color = Color.White, fontSize = 22.sp, fontWeight = FontWeight.Bold)
        Text(label, color = Color(0xFFDCE6FF), fontSize = 12.sp)
    }
}
