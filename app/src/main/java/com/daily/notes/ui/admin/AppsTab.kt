package com.daily.notes.ui.admin

import android.content.Context
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.Drawable
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.daily.notes.data.Defaults
import com.daily.notes.data.SettingsRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private data class AppInfo(
    val packageName: String,
    val label: String,
    val icon: ImageBitmap?,
    val isSocial: Boolean,
)

@Composable
fun AppsTab(settings: SettingsRepository) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val blocked by settings.blockedPackages.collectAsStateWithLifecycle(initialValue = emptySet())
    val appLockOn by settings.appLockEnabled.collectAsStateWithLifecycle(initialValue = true)

    var query by remember { mutableStateOf("") }

    val apps by produceState<List<AppInfo>?>(initialValue = null) {
        value = withContext(Dispatchers.IO) { loadApps(context) }
    }

    SectionCard(
        title = "App lock",
        subtitle = "Blocked apps ask for the code before they open. Social apps are blocked by default."
    ) {
        ToggleRow(
            title = "Lock blocked apps",
            description = if (appLockOn) "Blocked apps require the code." else "App locking is paused.",
            checked = appLockOn,
            onCheckedChange = { scope.launch { settings.setAppLockEnabled(it) } }
        )
    }

    SectionCard(title = "Apps (${blocked.size} locked)") {
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            label = { Text("Search apps") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))

        val list = apps
        if (list == null) {
            Box(modifier = Modifier.fillMaxWidth().height(120.dp), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else {
            val filtered = list.filter { it.label.contains(query, ignoreCase = true) }
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                filtered.forEach { app ->
                    AppRow(
                        app = app,
                        checked = app.packageName in blocked,
                        onToggle = { on ->
                            scope.launch {
                                if (on) settings.addBlocked(app.packageName)
                                else settings.removeBlocked(app.packageName)
                            }
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun AppRow(app: AppInfo, checked: Boolean, onToggle: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier.size(40.dp).clip(RoundedCornerShape(10.dp)),
            contentAlignment = Alignment.Center
        ) {
            if (app.icon != null) {
                Image(bitmap = app.icon, contentDescription = null, modifier = Modifier.size(40.dp))
            }
        }
        Spacer(Modifier.size(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(app.label, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
            Text(
                if (app.isSocial) "Social app" else app.packageName,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Switch(checked = checked, onCheckedChange = onToggle)
    }
}

private fun loadApps(context: Context): List<AppInfo> {
    val pm = context.packageManager
    val launchable = HashSet<String>()
    // Apps that show a launcher icon (what a child would actually open).
    pm.getInstalledApplications(0).forEach { info ->
        if (pm.getLaunchIntentForPackage(info.packageName) != null) {
            launchable.add(info.packageName)
        }
    }
    // Always include known social packages even if not currently installed-launchable.
    val packages = (launchable + Defaults.SOCIAL_PACKAGES)
        .filter { it != context.packageName }

    return packages.mapNotNull { pkg ->
        runCatching {
            val ai: ApplicationInfo = pm.getApplicationInfo(pkg, 0)
            AppInfo(
                packageName = pkg,
                label = pm.getApplicationLabel(ai).toString(),
                icon = pm.getApplicationIcon(ai).toImageBitmapSafe(),
                isSocial = pkg in Defaults.SOCIAL_PACKAGES
            )
        }.getOrNull()
    }.sortedWith(compareByDescending<AppInfo> { it.isSocial }.thenBy { it.label.lowercase() })
}

private fun Drawable.toImageBitmapSafe(size: Int = 96): ImageBitmap? = runCatching {
    val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bmp)
    setBounds(0, 0, canvas.width, canvas.height)
    draw(canvas)
    bmp.asImageBitmap()
}.getOrNull()
